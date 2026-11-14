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

protocol NativeJingleXMPPConnecting: NativeXMPPConnecting {
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void,
             onJingle: @escaping @Sendable (NativeJingleRequest) -> Void,
             onJingleSender: @escaping @Sendable (any NativeJingleSending) -> Void) async throws
}

public struct NativeXMPPConnection: NativeXMPPConnecting, NativeJingleXMPPConnecting {
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

private final class NativeGroupOperation {
    var stream: NativeMUCStream
    let callback: @Sendable (NativeGroupEvent) -> Void
    var continuation: CheckedContinuation<Void, Error>?
    var deadline: DispatchWorkItem?
    let token: UUID
    init(stream: NativeMUCStream, token: UUID, continuation: CheckedContinuation<Void, Error>, callback: @escaping @Sendable (NativeGroupEvent) -> Void) {
        self.stream = stream; self.token = token; self.continuation = continuation; self.callback = callback
    }
}

private final class NativeSessionClosure {
    let socket: URLSessionWebSocketTask
    private let session: URLSession
    private let error: Error
    private var continuation: CheckedContinuation<Void, Error>?
    init(socket: URLSessionWebSocketTask, session: URLSession, error: Error, continuation: CheckedContinuation<Void, Error>) {
        self.socket = socket; self.session = session; self.error = error; self.continuation = continuation
    }
    func complete() {
        guard let continuation = continuation else { return }
        self.continuation = nil
        socket.cancel(with: .normalClosure, reason: nil)
        session.invalidateAndCancel()
        continuation.resume(throwing: error)
    }
}

private final class SessionOperation: NSObject, URLSessionWebSocketDelegate, NativeArchiveSending, NativeGroupManaging, NativeMessageChanging, NativeGroupMessageChanging, NativeChatInteracting, NativeJingleSending, @unchecked Sendable {
    private let configuration: ServerConfiguration
    private let ownerJID: String
    private var boundJID: String?
    private var archive: (query: NativeArchiveQuery, token: UUID, continuation: CheckedContinuation<NativeArchivePage, Error>, deadline: DispatchWorkItem)?
    private var groups: [String: NativeGroupOperation] = [:]
    private var management: [String: (command: NativeGroupCommand, target: String, continuation: CheckedContinuation<NativeGroupReply, Error>, deadline: DispatchWorkItem)] = [:]
    private var invitationObserver: (@Sendable (NativeGroupInvitationEvent) -> Void)?
    private var earlyInvitations: [NativeGroupInvitationEvent] = []
    private let queue = DispatchQueue(label: "nl.teletyptel.native.session")
    private var onConnected: (@Sendable (String) -> Void)?
    private var session: URLSession?
    private var closing: NativeSessionClosure?
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
        ownerJID = account.jid
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

    func changeMessage(to peer: String, change: NativeMessageChange, identifier: String) async throws {
        try Task.checkCancellation()
        let frame = try NativeMessageActionCodec.encode(to: peer, change: change, identifier: identifier)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async { self.enqueueMessage(frame, continuation: continuation) }
        }
    }

    func interact(to peer: String, interaction: NativeChatInteraction, identifier: String) async throws {
        try Task.checkCancellation()
        let frame = try NativeInteractionCodec.encode(to: peer, interaction: interaction, identifier: identifier)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async { self.enqueueMessage(frame, continuation: continuation) }
        }
    }

    func retractGroupMessage(room: String, target: String, identifier: String) async throws {
        try Task.checkCancellation()
        let frame = try NativeMessageActionCodec.encode(to: room, change: .retract(target: target), identifier: identifier, group: true)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard self.groups[room]?.stream.snapshot.supportsRetraction == true,
                      self.groups[room]?.stream.snapshot.canSpeak == true else {
                    continuation.resume(throwing: NativeGroupFailure.denied); return
                }
                self.enqueueMessage(frame, continuation: continuation)
            }
        }
    }

    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        try await enterGroup(room: room, nickname: nickname, creating: false, onEvent: onEvent)
    }

    func createGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        try await enterGroup(room: room, nickname: nickname, creating: true, onEvent: onEvent)
        do {
            guard case .configuration(var configuration) = try await manageGroup(.configuration(room)),
                  configuration.fields["muc#roomconfig_membersonly"] != nil,
                  configuration.fields["muc#roomconfig_publicroom"] != nil else { throw NativeGroupFailure.unavailable }
            configuration.membersOnly = true; configuration.publicRoom = false; configuration.persistent = true
            _ = try await manageGroup(.configure(room, configuration))
            try Task.checkCancellation()
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                queue.async {
                    if !self.completed, let entry = self.groups[room] {
                        entry.stream.confirmCreation(); entry.callback(.snapshot(entry.stream.snapshot))
                    }
                    continuation.resume()
                }
            }
        } catch { await leaveGroup(room: room); throw error }
    }

    private func enterGroup(room: String, nickname: String, creating: Bool, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        try Task.checkCancellation()
        let token = UUID()
        let cancellation = NativeArchiveCancellation()
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                queue.async {
                    guard !cancellation.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                    guard !self.completed, self.stream.phase == .online, let bound = self.boundJID else {
                        continuation.resume(throwing: NativeGroupFailure.disconnected); return
                    }
                    guard self.groups[room] == nil, self.groups.count < 8 else { continuation.resume(throwing: NativeGroupFailure.limit); return }
                    do {
                        let stream = try NativeMUCStream(room: room, nickname: nickname, boundJID: bound, creating: creating)
                        let entry = NativeGroupOperation(stream: stream, token: token, continuation: continuation, callback: onEvent)
                        let deadline = DispatchWorkItem { [weak self] in
                            self?.endGroup(room: room, token: token, error: NativeGroupFailure.timedOut, sendLeave: true)
                        }
                        entry.deadline = deadline
                        self.groups[room] = entry
                        self.queue.asyncAfter(deadline: .now() + 15, execute: deadline)
                        self.send([stream.request]) {}
                    } catch { continuation.resume(throwing: error) }
                }
            }
        }, onCancel: {
            cancellation.cancel()
            self.queue.async { self.endGroup(room: room, token: token, error: CancellationError(), sendLeave: true) }
        })
    }

    func manageGroup(_ command: NativeGroupCommand) async throws -> NativeGroupReply {
        try Task.checkCancellation()
        let identifier = "muc-manage-" + UUID().uuidString
        let cancellation = NativeArchiveCancellation()
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                queue.async {
                    guard !cancellation.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                    guard !self.completed, self.stream.phase == .online, self.management.count < 4 else {
                        continuation.resume(throwing: NativeGroupFailure.disconnected); return
                    }
                    do {
                        let target = try NativeGroupManagementCodec.target(command, account: self.ownerJID)
                        let frame = try NativeGroupManagementCodec.request(command, account: self.ownerJID, identifier: identifier)
                        let deadline = DispatchWorkItem { [weak self] in self?.finishManagement(identifier, result: .failure(NativeGroupFailure.timedOut)) }
                        self.management[identifier] = (command, target, continuation, deadline)
                        self.queue.asyncAfter(deadline: .now() + 10, execute: deadline)
                        self.send([frame]) {}
                    } catch { continuation.resume(throwing: error) }
                }
            }
        }, onCancel: { cancellation.cancel(); self.queue.async { self.finishManagement(identifier, result: .failure(CancellationError())) } })
    }

    private func finishManagement(_ identifier: String, result: Result<NativeGroupReply, Error>) {
        guard let pending = management.removeValue(forKey: identifier) else { return }
        pending.deadline.cancel(); pending.continuation.resume(with: result)
    }

    private func receiveManagement(_ frame: String) {
        guard !management.isEmpty, let root = try? ProbeXML.parse(frame), root.name == "iq", root.namespace == "jabber:client",
              let identifier = root.attributes["id"], let pending = management[identifier], root.attributes["from"] == pending.target,
              ["result", "error"].contains(root.attributes["type"] ?? ""),
              root.attributes["to"] == nil || root.attributes["to"] == ownerJID || root.attributes["to"] == boundJID else { return }
        do { finishManagement(identifier, result: .success(try NativeGroupManagementCodec.decode(root, command: pending.command, account: ownerJID))) }
        catch { finishManagement(identifier, result: .failure(error)) }
    }

    func setGroupSubject(room: String, subject: String) async throws {
        guard NativeInvitationCodec.isRoom(room, owner: ownerJID), subject.utf8.count <= 512 else { throw NativeGroupFailure.invalidRoom }
        try Task.checkCancellation()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard self.groups[room]?.stream.canSpeak == true else { continuation.resume(throwing: NativeGroupFailure.denied); return }
                self.enqueueMessage("<message xmlns='jabber:client' type='groupchat' to='\(NativeMUCStream.escape(room))' id='\(UUID().uuidString)'><subject>\(NativeMUCStream.escape(subject))</subject></message>", continuation: continuation)
            }
        }
    }

    func observeGroupInvitations(_ observer: @escaping @Sendable (NativeGroupInvitationEvent) -> Void) async {
        let cancellation = NativeArchiveCancellation()
        await withTaskCancellationHandler(operation: {
            await withCheckedContinuation { continuation in
                queue.async {
                    if !cancellation.isCancelled, !self.completed, self.stream.phase == .online {
                        self.invitationObserver = observer
                        let buffered = self.earlyInvitations; self.earlyInvitations.removeAll()
                        for event in buffered { observer(event) }
                    }
                    continuation.resume()
                }
            }
        }, onCancel: { cancellation.cancel() })
    }

    func inviteToGroup(room: String, peer: String, identifier: String) async throws {
        try Task.checkCancellation()
        let cancellation = NativeArchiveCancellation()
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                queue.async {
                    guard !cancellation.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                    guard !self.completed, self.groups[room]?.stream.canSpeak == true else {
                        continuation.resume(throwing: NativeGroupFailure.disconnected); return
                    }
                    do {
                        self.enqueueMessage(try NativeInvitationCodec.invite(room: room, peer: peer, owner: self.ownerJID,
                            identifier: identifier), continuation: continuation)
                    } catch { continuation.resume(throwing: error) }
                }
            }
        }, onCancel: { cancellation.cancel() })
    }

    func declineGroupInvitation(_ invitation: NativeGroupInvitation) async throws {
        try Task.checkCancellation()
        let frame = try NativeInvitationCodec.decline(invitation, owner: ownerJID)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async { self.enqueueMessage(frame, continuation: continuation) }
        }
    }

    private func receiveInvitation(_ frame: String) {
        guard let boundJID = boundJID, let root = try? ProbeXML.parse(frame),
              let event = NativeInvitationCodec.decode(root, owner: ownerJID, boundJID: boundJID) else { return }
        if let observer = invitationObserver { observer(event) }
        else if earlyInvitations.count < 16 { earlyInvitations.append(event) }
    }

    func sendGroup(room: String, body: String, identifier: String) async throws {
        try Task.checkCancellation()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                guard !self.completed, let group = self.groups[room], group.stream.phase == .joined else {
                    continuation.resume(throwing: NativeGroupFailure.disconnected); return
                }
                do { self.enqueueMessage(try group.stream.message(body: body, identifier: identifier), continuation: continuation) }
                catch { continuation.resume(throwing: error) }
            }
        }
    }

    func leaveGroup(room: String) async {
        await withCheckedContinuation { continuation in
            queue.async {
                if let token = self.groups[room]?.token { self.endGroup(room: room, token: token, error: nil, sendLeave: true) }
                continuation.resume()
            }
        }
    }

    private func endGroup(room: String, token: UUID, error: Error?, sendLeave: Bool) {
        guard let entry = groups[room], entry.token == token else { return }
        groups.removeValue(forKey: room)
        entry.deadline?.cancel()
        entry.continuation?.resume(throwing: error ?? CancellationError())
        entry.continuation = nil
        entry.callback(.ended(error == nil ? nil : (error as? NativeGroupFailure ?? .disconnected)))
        if sendLeave, entry.stream.phase != .checking, !completed { send([entry.stream.leave]) {} }
    }

    private func receiveGroups(_ frame: String) {
        guard !groups.isEmpty, let root = try? ProbeXML.parse(frame) else { return }
        for room in Array(groups.keys) {
            guard let entry = groups[room] else { continue }
            let output = entry.stream.receive(root)
            for event in output.events {
                if case .ended(let reason) = event {
                    endGroup(room: room, token: entry.token, error: reason ?? .unavailable, sendLeave: false)
                } else { entry.callback(event) }
            }
            if entry.stream.phase == .joined {
                entry.deadline?.cancel(); entry.deadline = nil
                entry.continuation?.resume(); entry.continuation = nil
            }
            if !output.frames.isEmpty { send(output.frames) {} }
        }
    }

    func fetchArchive(peer: String, before: String?) async throws -> NativeArchivePage {
        try Task.checkCancellation()
        let cancellation = NativeArchiveCancellation()
        let token = UUID()
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                queue.async {
                    guard !cancellation.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                    guard !self.completed, self.stream.phase == .online, let boundJID = self.boundJID else {
                        continuation.resume(throwing: NativeChatFailure.disconnected)
                        return
                    }
                    guard self.archive == nil else { continuation.resume(throwing: NativeArchiveFailure.busy); return }
                    do {
                        let query = try NativeArchiveQuery(owner: self.ownerJID, boundJID: boundJID, peer: peer, before: before)
                        let deadline = DispatchWorkItem { [weak self] in
                            self?.completeArchive(token, result: .failure(ConnectionFailure.timeout))
                        }
                        self.archive = (query, token, continuation, deadline)
                        self.queue.asyncAfter(deadline: .now() + 15, execute: deadline)
                        self.send([query.request]) {}
                    } catch { continuation.resume(throwing: error) }
                }
            }
        }, onCancel: {
            cancellation.cancel()
            self.queue.async { self.completeArchive(token, result: .failure(CancellationError())) }
        })
    }

    private func receiveArchive(_ frame: String) {
        guard var pending = archive else { return }
        do {
            if let page = try pending.query.consume(frame) {
                completeArchive(pending.token, result: .success(page))
            } else { archive?.query = pending.query }
        } catch { completeArchive(pending.token, result: .failure(error)) }
    }

    private func completeArchive(_ token: UUID, result: Result<NativeArchivePage, Error>) {
        guard let pending = archive, pending.token == token else { return }
        archive = nil
        pending.deadline.cancel()
        pending.continuation.resume(with: result)
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
        let graceful = cancelled && stream.phase == .online
        completed = true
        self.continuation = nil
        onConnected = nil
        onRoster = nil
        onChat = nil
        onSender = nil
        onJingle = nil
        onJingleSender = nil
        if let token = archive?.token { completeArchive(token, result: .failure(error)) }
        invitationObserver = nil
        earlyInvitations.removeAll()
        for identifier in Array(management.keys) { finishManagement(identifier, result: .failure(error)) }
        for (room, entry) in Array(groups) { endGroup(room: room, token: entry.token, error: NativeGroupFailure.disconnected, sendLeave: false) }
        boundJID = nil
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
        if graceful, let socket = socket, let session = session {
            closing = NativeSessionClosure(socket: socket, session: session, error: error, continuation: continuation)
            self.socket = nil; self.session = nil
            queue.asyncAfter(deadline: .now() + 2) { self.completeClosure() }
            socket.send(.string("<close xmlns='urn:ietf:params:xml:ns:xmpp-framing'/>")) { error in
                if error != nil { self.queue.async { self.completeClosure() } }
            }
            return
        }
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
        continuation.resume(throwing: error)
    }

    private func completeClosure() {
        let operation = closing
        closing = nil
        operation?.complete()
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
                guard !self.completed else {
                    switch result {
                    case .failure: self.completeClosure()
                    case .success(.string(let frame)):
                        if let root = try? ProbeXML.parse(frame), root.name == "close", root.namespace == "urn:ietf:params:xml:ns:xmpp-framing" { self.completeClosure() }
                    default: break
                    }
                    return
                }
                do {
                    guard case .string(let frame) = try result.get() else { throw ConnectionFailure.invalidResponse }
                    let output = try self.stream.receive(frame)
                    if self.stream.phase == .online { self.receiveArchive(frame); self.receiveGroups(frame); self.receiveInvitation(frame); self.receiveManagement(frame) }
                    self.send(output.frames) {
                        if let jid = output.connectedJID {
                            self.boundJID = jid
                            self.jingle = NativeJingleTransport(owner: jid,
                                acceptIncomingInitiates: self.onJingle != nil)
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
        queue.async { self.completeClosure(); self.finish(error ?? ConnectionFailure.offline) }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        queue.async { self.completeClosure(); self.finish(ConnectionFailure.offline) }
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
