import Foundation

public protocol NativeXMPPConnecting {
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws
}

public extension NativeXMPPConnecting {
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws {
        try await run(account: account, onConnected: onConnected, onRoster: onRoster)
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws {
        onRoster(.unavailable)
        try await run(account: account, onConnected: onConnected)
    }
}

public struct NativeXMPPConnection: NativeXMPPConnecting {
    public init() {}

    public func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
                    onRoster: @escaping @Sendable (NativeRosterState) -> Void,
                    onChat: @escaping @Sendable (NativeChatEvent) -> Void,
                    onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws {
        let operation = SessionOperation(account: account, onConnected: onConnected, onRoster: onRoster,
                                         onChat: onChat, onSender: onSender)
        try await withTaskCancellationHandler(operation: {
            try await operation.run()
        }, onCancel: { operation.cancel() })
    }

    public func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        let operation = SessionOperation(account: account, onConnected: onConnected)
        try await withTaskCancellationHandler(operation: {
            try await operation.run()
        }, onCancel: { operation.cancel() })
    }

    public func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
                    onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws {
        let operation = SessionOperation(account: account, onConnected: onConnected, onRoster: onRoster)
        try await withTaskCancellationHandler(operation: {
            try await operation.run()
        }, onCancel: { operation.cancel() })
    }
}

private final class SessionOperation: NSObject, URLSessionWebSocketDelegate, NativeChatSending, @unchecked Sendable {
    private let configuration: ServerConfiguration
    private let queue = DispatchQueue(label: "nl.teletyptel.native.session")
    private var onConnected: (@Sendable (String) -> Void)?
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var continuation: CheckedContinuation<Void, Error>?
    private var deadline: DispatchWorkItem?
    private var heartbeat: DispatchWorkItem?
    private var rosterDeadline: DispatchWorkItem?
    private var onRoster: (@Sendable (NativeRosterState) -> Void)?
    private var onChat: (@Sendable (NativeChatEvent) -> Void)?
    private var onSender: (@Sendable (any NativeChatSending) -> Void)?
    private var pendingMessages: [UUID: CheckedContinuation<Void, Error>] = [:]
    private var messageDeadlines: [UUID: DispatchWorkItem] = [:]
    private var stream: XMPPSessionStream
    private var cancelled = false
    private var completed = false

    init(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
         onRoster: (@Sendable (NativeRosterState) -> Void)? = nil,
         onChat: (@Sendable (NativeChatEvent) -> Void)? = nil,
         onSender: (@Sendable (any NativeChatSending) -> Void)? = nil) {
        configuration = account.configuration
        stream = XMPPSessionStream(account: account, loadRoster: onRoster != nil)
        self.onConnected = onConnected
        self.onRoster = onRoster
        self.onChat = onChat
        self.onSender = onSender
    }

    func sendMessage(to jid: String, body: String, identifier: String) async throws {
        try Task.checkCancellation()
        let frame = try NativeChatCodec.encode(to: jid, body: body, identifier: identifier)
        let token = UUID()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard !self.completed, self.stream.phase == .online, let socket = self.socket else {
                    continuation.resume(throwing: NativeChatFailure.disconnected)
                    return
                }
                guard self.pendingMessages.count < 8 else {
                    continuation.resume(throwing: NativeChatFailure.busy)
                    return
                }
                self.pendingMessages[token] = continuation
                let deadline = DispatchWorkItem { [weak self] in self?.completeMessage(token, error: ConnectionFailure.timeout) }
                self.messageDeadlines[token] = deadline
                self.queue.asyncAfter(deadline: .now() + 8, execute: deadline)
                socket.send(.string(frame)) { error in
                    self.queue.async { self.completeMessage(token, error: error) }
                }
            }
        }
    }

    private func completeMessage(_ token: UUID, error: Error?) {
        messageDeadlines.removeValue(forKey: token)?.cancel()
        guard let continuation = pendingMessages.removeValue(forKey: token) else { return }
        if let error = error { continuation.resume(throwing: error) }
        else { continuation.resume() }
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
        onRoster = nil
        onChat = nil
        onSender = nil
        for token in Array(pendingMessages.keys) { completeMessage(token, error: error) }
        rosterDeadline?.cancel()
        rosterDeadline = nil
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
                            self.onSender?(self)
                            self.onSender = nil
                            self.scheduleHeartbeat()
                        }
                        if output.heartbeatAcknowledged {
                            self.deadline?.cancel()
                            self.deadline = nil
                            self.scheduleHeartbeat()
                        }
                        if let roster = output.roster {
                            self.rosterDeadline?.cancel()
                            self.rosterDeadline = nil
                            self.onRoster?(roster)
                            if roster == .loading {
                                let deadline = DispatchWorkItem { [weak self] in
                                    guard let self = self, !self.completed,
                                          let state = self.stream.rosterTimedOut() else { return }
                                    self.onRoster?(state)
                                }
                                self.rosterDeadline = deadline
                                self.queue.asyncAfter(deadline: .now() + 10, execute: deadline)
                            }
                        }
                        if let chat = output.chat { self.onChat?(chat) }
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
