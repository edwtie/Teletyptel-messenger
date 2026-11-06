import Foundation

public struct XMPPAvailabilityClient: ServerChecking {
    public init() {}

    public func check(_ configuration: ServerConfiguration) async throws -> ProbeReport {
        let operation = ProbeOperation(configuration: configuration)
        return try await withTaskCancellationHandler(operation: {
            try await operation.run()
        }, onCancel: {
            operation.cancel()
        })
    }
}

private final class ProbeOperation: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    private let configuration: ServerConfiguration
    private let queue = DispatchQueue(label: "nl.teletyptel.native.probe")
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var continuation: CheckedContinuation<ProbeReport, Error>?
    private var deadline: DispatchWorkItem?
    private var stream = XMPPProbeStream()
    private var cancelled = false
    private var completed = false

    init(configuration: ServerConfiguration) { self.configuration = configuration }

    func run() async throws -> ProbeReport {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                self.continuation = continuation
                if self.cancelled { self.finish(.failure(CancellationError())); return }
                let settings = URLSessionConfiguration.ephemeral
                settings.httpCookieStorage = nil
                settings.httpShouldSetCookies = false
                settings.urlCredentialStorage = nil
                settings.urlCache = nil
                settings.timeoutIntervalForRequest = 8
                settings.timeoutIntervalForResource = 8
                let session = URLSession(configuration: settings, delegate: self, delegateQueue: nil)
                let socket = session.webSocketTask(with: self.configuration.webSocket, protocols: ["xmpp"])
                socket.maximumMessageSize = 65536
                self.session = session
                self.socket = socket
                let deadline = DispatchWorkItem { self.finish(.failure(ConnectionFailure.timeout)) }
                self.deadline = deadline
                self.queue.asyncAfter(deadline: .now() + 8, execute: deadline)
                socket.resume()
            }
        }
    }

    func cancel() {
        queue.async {
            self.cancelled = true
            if self.continuation != nil { self.finish(.failure(CancellationError())) }
        }
    }

    private func finish(_ result: Result<ProbeReport, Error>) {
        guard !completed, let continuation = continuation else { return }
        completed = true
        self.continuation = nil
        deadline?.cancel()
        deadline = nil
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
        continuation.resume(with: result)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        queue.async {
            guard !self.completed else { return }
            guard `protocol` == "xmpp" else { self.finish(.failure(ConnectionFailure.protocolMismatch)); return }
            webSocketTask.send(.string(XMPPProbeStream.opening(for: self.configuration))) { error in
                self.queue.async {
                    if let error = error { self.finish(.failure(error)) }
                    else { self.receive() }
                }
            }
        }
    }

    private func receive() {
        guard !completed, let socket = socket else { return }
        socket.receive { result in
            self.queue.async {
                guard !self.completed else { return }
                do {
                    guard case .string(let message) = try result.get() else { throw ConnectionFailure.invalidResponse }
                    if let report = try self.stream.receive(message) { self.finish(.success(report)) }
                    else { self.receive() }
                } catch { self.finish(.failure(error)) }
            }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        queue.async { self.finish(.failure(error ?? ConnectionFailure.offline)) }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        queue.async { self.finish(.failure(ConnectionFailure.offline)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
        queue.async { self.finish(.failure(ConnectionFailure.redirectRejected)) }
    }
}
