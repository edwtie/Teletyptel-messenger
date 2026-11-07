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
                    onSender: @escaping @Sendable (any NativeChatSending) -> Void,
                    onJingle: @escaping @Sendable (NativeJingleRequest) -> Void,
                    onJingleSender: @escaping @Sendable (any NativeJingleSending) -> Void) async throws {
        let operation = SessionOperation(account: account, onConnected: onConnected, onRoster: onRoster,
                                         onChat: onChat, onSender: onSender, onJingle: onJingle,
                                         onJingleSender: onJingleSender)
        try await withTaskCancellationHandler(operation: {
            try await operation.run()
        }, onCancel: { operation.cancel() })
    }

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

private final class SessionOperation: NSObject, URLSessionWebSocketDelegate, NativeChatSending, NativeJingleSending, @unchecked Sendable {
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
    private var onJingle: (@Sendable (NativeJingleRequest) -> Void)?
    private var onJingleSender: (@Sendable (any NativeJingleSending) -> Void)?
    private var jingle: NativeJingleTransport?
    private var jingleDeadline: DispatchWorkItem?
    private var pendingJingle: [String: CheckedContinuation<Void, Error>] = [:]
    private var jingleDeadlines: [String: DispatchWorkItem] = [:]
    private var stream: XMPPSessionStream
    private var cancelled = false
    private var completed = false

    init(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
         onRoster: (@Sendable (NativeRosterState) -> Void)? = nil,
         onChat: (@Sendable (NativeChatEvent) -> Void)? = nil,
         onSender: (@Sendable (any NativeChatSending) -> Void)? = nil,
         onJingle: (@Sendable (NativeJingleRequest) -> Void)? = nil,
         onJingleSender: (@Sendable (any NativeJingleSending) -> Void)? = nil) {
        configuration = account.configuration
        stream = XMPPSessionStream(account: account, loadRoster: onRoster != nil)
        self.onConnected = onConnected
        self.onRoster = onRoster
        self.onChat = onChat
        self.onSender = onSender
        self.onJingle = onJingle
        self.onJingleSender = onJingleSender
    }

    func bindCall(peer: String, sid: String) async throws -> UUID {
        try Task.checkCancellation()
        let binding: UUID = try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.completed, self.stream.phase == .online, self.onJingle != nil else {
                    continuation.resume(throwing: NativeJingleFailure.disconnected)
                    return
                }
                do {
                    guard let id = try self.jingle?.bind(peer: peer, sid: sid) else { throw NativeJingleFailure.disconnected }
                    continuation.resume(returning: id)
                } catch { continuation.resume(throwing: error) }
            }
        }
        if Task.isCancelled {
            await unbindCall(binding)
            throw CancellationError()
        }
        return binding
    }

    func exchangeJingle(binding: UUID, xml: String) async throws {
        try Task.checkCancellation()
        let identifier = "jingle-" + UUID().uuidString
        let cancellation = JingleCancellation()
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                queue.async {
                    guard !cancellation.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                    guard !self.completed, self.stream.phase == .online, let socket = self.socket else {
                        continuation.resume(throwing: NativeJingleFailure.disconnected)
                        return
                    }
                    do {
                        guard let request = try self.jingle?.prepare(binding: binding, xml: xml, identifier: identifier) else {
                            throw NativeJingleFailure.disconnected
                        }
                        self.pendingJingle[identifier] = continuation
                        let deadline = DispatchWorkItem { [weak self] in
                            self?.completeJingle(identifier, error: NativeJingleFailure.timedOut)
                        }
                        self.jingleDeadlines[identifier] = deadline
                        self.queue.asyncAfter(deadline: .now() + 8, execute: deadline)
                        socket.send(.string(request.frame)) { error in
                            if let error = error { self.queue.async { self.completeJingle(identifier, error: error) } }
                        }
                    } catch { continuation.resume(throwing: error) }
                }
            }
        }, onCancel: {
            cancellation.cancel()
            self.queue.async { self.completeJingle(identifier, error: CancellationError()) }
        })
    }

    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws {
        try Task.checkCancellation()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                do {
                    guard !self.completed, self.stream.phase == .online else { throw NativeJingleFailure.disconnected }
                    guard self.pendingMessages.count < 8 else { throw NativeJingleFailure.busy }
                    guard let frame = try self.jingle?.reply(request, rejection: rejection, now: ProcessInfo.processInfo.systemUptime) else {
                        throw NativeJingleFailure.disconnected
                    }
                    self.enqueueMessage(frame, continuation: continuation)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    func unbindCall(_ binding: UUID) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                let identifiers = self.jingle?.unbind(binding) ?? []
                for identifier in identifiers { self.completeJingle(identifier, error: NativeJingleFailure.staleBinding) }
                continuation.resume()
            }
        }
    }

    private func completeJingle(_ identifier: String, error: Error?) {
        jingle?.cancel(identifier)
        jingleDeadlines.removeValue(forKey: identifier)?.cancel()
        guard let continuation = pendingJingle.removeValue(forKey: identifier) else { return }
        if let error = error { continuation.resume(throwing: error) }
        else { continuation.resume() }
    }

    private func scheduleJingleDeadline() {
        jingleDeadline?.cancel()
        jingleDeadline = nil
        guard jingle?.hasIncoming == true else { return }
        let deadline = DispatchWorkItem { [weak self] in
            guard let self = self, !self.completed else { return }
            let frames = self.jingle?.expire(now: ProcessInfo.processInfo.systemUptime) ?? []
            self.send(frames) { self.scheduleJingleDeadline() }
        }
        jingleDeadline = deadline
        queue.asyncAfter(deadline: .now() + 1, execute: deadline)
    }

    func sendMessage(to jid: String, body: String, identifier: String) async throws {
        try Task.checkCancellation()
        let frame = try NativeChatCodec.encode(to: jid, body: body, identifier: identifier)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async { self.enqueueMessage(frame, continuation: continuation) }
        }
    }

    private func enqueueMessage(_ frame: String, continuation: CheckedContinuation<Void, Error>) {
        let token = UUID()
        guard !completed, stream.phase == .online, let socket = socket else {
            continuation.resume(throwing: NativeChatFailure.disconnected)
            return
        }
        guard pendingMessages.count < 8 else {
            continuation.resume(throwing: NativeChatFailure.busy)
            return
        }
        pendingMessages[token] = continuation
        let deadline = DispatchWorkItem { [weak self] in self?.completeMessage(token, error: ConnectionFailure.timeout) }
        messageDeadlines[token] = deadline
        queue.asyncAfter(deadline: .now() + 8, execute: deadline)
        socket.send(.string(frame)) { error in
            self.queue.async { self.completeMessage(token, error: error) }
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
        onJingle = nil
        onJingleSender = nil
        for identifier in Array(pendingJingle.keys) { completeJingle(identifier, error: error) }
        jingleDeadline?.cancel()
        jingleDeadline = nil
        jingle = nil
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
                            self.jingle = NativeJingleTransport(owner: jid)
                            self.deadline?.cancel()
                            self.deadline = nil
                            self.onConnected?(jid)
                            self.onConnected = nil
                            self.onSender?(self)
                            self.onSender = nil
                            self.onJingleSender?(self)
                            self.onJingleSender = nil
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
                        if let xml = output.unhandledIQ, let update = self.jingle?.receive(xml, now: ProcessInfo.processInfo.systemUptime) {
                            if let identifier = update.completed { self.completeJingle(identifier, error: update.failure) }
                            if let request = update.request {
                                self.onJingle?(request)
                                self.scheduleJingleDeadline()
                            }
                            self.send(update.frames) { self.receive() }
                        } else { self.receive() }
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

private final class JingleCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false

    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }

    func cancel() {
        lock.lock()
        cancelled = true
        lock.unlock()
    }
}
