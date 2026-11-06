import Foundation

public struct NativeXMPPConnection {
    public init() {}

    public func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        let operation = SessionOperation(account: account, onConnected: onConnected)
        try await withTaskCancellationHandler(operation: {
            try await operation.run()
        }, onCancel: { operation.cancel() })
    }
}

private final class SessionOperation: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    private let configuration: ServerConfiguration
    private let queue = DispatchQueue(label: "nl.teletyptel.native.session")
    private var onConnected: (@Sendable (String) -> Void)?
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var continuation: CheckedContinuation<Void, Error>?
    private var deadline: DispatchWorkItem?
    private var heartbeat: DispatchWorkItem?
    private var stream: XMPPSessionStream
    private var cancelled = false
    private var completed = false

    init(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) {
        configuration = account.configuration
        stream = XMPPSessionStream(account: account)
        self.onConnected = onConnected
    }

    func run() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                self.continuation = continuation
                if self.cancelled { self.finish(CancellationError()); return }
                let settings = URLSessionConfiguration.ephemeral
                settings.httpCookieStorage = nil
                settings.httpShouldSetCookies = false
                settings.urlCredentialStorage = nil
                settings.urlCache = nil
                settings.timeoutIntervalForRequest = 10
                let session = URLSession(configuration: settings, delegate: self, delegateQueue: nil)
                let socket = session.webSocketTask(with: self.configuration.webSocket, protocols: ["xmpp"])
                socket.maximumMessageSize = 65536
                self.session = session
                self.socket = socket
                self.setDeadline(ConnectionFailure.timeout)
                socket.resume()
            }
        }
    }

    func cancel() {
        queue.async {
            self.cancelled = true
            if self.continuation != nil { self.finish(CancellationError()) }
        }
    }

    private func setDeadline(_ error: Error) {
        deadline?.cancel()
        let deadline = DispatchWorkItem { self.finish(error) }
        self.deadline = deadline
        queue.asyncAfter(deadline: .now() + 10, execute: deadline)
    }

    private func scheduleHeartbeat() {
        heartbeat?.cancel()
        let heartbeat = DispatchWorkItem {
            guard !self.completed else { return }
            do {
                let frame = try self.stream.heartbeat()
                self.setDeadline(XMPPSessionFailure.heartbeatTimeout)
                self.send([frame]) {}
            } catch { self.finish(error) }
        }
        self.heartbeat = heartbeat
        queue.asyncAfter(deadline: .now() + 25, execute: heartbeat)
    }

    private func finish(_ error: Error) {
        guard !completed, let continuation = continuation else { return }
        completed = true
        self.continuation = nil
        onConnected = nil
        deadline?.cancel()
        deadline = nil
        heartbeat?.cancel()
        heartbeat = nil
        stream.close()
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
        continuation.resume(throwing: error)
    }

    private func send(_ frames: [String], completion: @escaping () -> Void) {
        guard !completed, let socket = socket else { return }
        guard let frame = frames.first else { completion(); return }
        socket.send(.string(frame)) { error in
            self.queue.async {
                guard !self.completed else { return }
                if let error = error { self.finish(error) }
                else { self.send(Array(frames.dropFirst()), completion: completion) }
            }
        }
    }

    private func receive() {
        guard !completed, let socket = socket else { return }
        socket.receive { result in
            self.queue.async {
                guard !self.completed else { return }
                do {
                    guard case .string(let frame) = try result.get() else { throw ConnectionFailure.invalidResponse }
                    let output = try self.stream.receive(frame)
                    self.send(output.frames) {
                        if let jid = output.connectedJID {
                            self.deadline?.cancel()
                            self.deadline = nil
                            self.onConnected?(jid)
                            self.onConnected = nil
                            self.scheduleHeartbeat()
                        }
                        if output.heartbeatAcknowledged {
                            self.deadline?.cancel()
                            self.deadline = nil
                            self.scheduleHeartbeat()
                        }
                        self.receive()
                    }
                } catch { self.finish(error) }
            }
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        queue.async {
            guard !self.completed else { return }
            guard `protocol` == "xmpp" else { self.finish(ConnectionFailure.protocolMismatch); return }
            self.send([self.stream.opening]) { self.receive() }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        queue.async { self.finish(error ?? ConnectionFailure.offline) }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        queue.async { self.finish(ConnectionFailure.offline) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
        queue.async { self.finish(ConnectionFailure.redirectRejected) }
    }
}
