import Foundation

struct NativeCallIntentLease: CustomStringConvertible, CustomDebugStringConvertible {
    let sender: any NativeCallRecoverySending
    let owner: String
    let epoch: UUID
    var description: String { "NativeCallIntentLease(redacted)" }
    var debugDescription: String { description }
}

@MainActor
final class NativeOutgoingCallIntent {
    private let owner: String
    private let peer: String
    let sid: String
    let profile: NativeCallMedia
    private let now: () -> TimeInterval
    private var sender: (any NativeCallIntentSending)?
    private var proposed = false
    private var stopped = false
    private var failed = false
    private(set) var selectedPeer: String?
    var remoteEnded: (() -> Void)?

    init(owner: String, peer: String, sid: String, profile: NativeCallMedia,
         now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) throws {
        guard NativeChatCodec.bareJID(owner) == owner, NativeChatCodec.bareJID(peer) == peer,
              owner != peer, NativeJingleTransport.validSID(sid) else { throw NativeJingleFailure.invalidRequest }
        self.owner = owner; self.peer = peer; self.sid = sid; self.profile = profile; self.now = now
    }

    func prepare(sender: any NativeCallIntentSending, validate: @escaping () throws -> Void) async throws -> String {
        guard !proposed, !stopped else { throw NativeJingleFailure.staleBinding }
        self.sender = sender
        let deadline = now() + 45
        do {
            try check(deadline, validate: validate)
            proposed = true
            try await sender.sendCallIntent(action: .propose, peer: peer, sid: sid, media: profile)
            while selectedPeer == nil {
                try check(deadline, validate: validate)
                try await Task.sleep(nanoseconds: 25_000_000)
            }
            try check(deadline, validate: validate)
            guard let selectedPeer = selectedPeer else { throw NativeJingleFailure.rejected }
            return selectedPeer
        } catch { cancel(); throw error }
    }

    func receive(_ intent: NativeCallIntent) {
        guard proposed, !stopped, !failed, intent.sid == sid, NativeChatCodec.bareJID(intent.peer) == peer else { return }
        if intent.action == .proceed, NativeJingleTransport.fullJID(intent.peer), intent.media == nil {
            if selectedPeer == nil { selectedPeer = intent.peer }
        } else if [.reject, .retract, .finish].contains(intent.action), selectedPeer == nil || selectedPeer == intent.peer {
            failed = true; remoteEnded?()
        }
    }

    private func check(_ deadline: TimeInterval, validate: () throws -> Void) throws {
        try Task.checkCancellation(); try validate()
        guard !stopped, !failed else { throw NativeJingleFailure.rejected }
        guard now().isFinite, now() < deadline else { throw NativeJingleFailure.timedOut }
    }

    func cancel() {
        guard !stopped else { return }; stopped = true; remoteEnded = nil
        guard proposed, let sender = sender else { return }
        let action: NativeCallIntentAction = selectedPeer == nil ? .retract : .finish
        let destination = selectedPeer ?? peer, sid = sid
        Task { try? await sender.sendCallIntent(action: action, peer: destination, sid: sid, media: nil) }
    }
}

@MainActor
final class NativeIncomingCallIntent {
    let proposal: NativeCallIntent
    private let sender: any NativeCallRecoverySending
    private let now: () -> TimeInterval
    private let expires: TimeInterval
    private var binding: UUID?
    private var attempted = false
    private var stopped = false
    private var failed = false
    private var requests: [NativeJingleRequest] = []
    private(set) var proceeding = false
    var remoteEnded: (() -> Void)?

    init(proposal: NativeCallIntent, sender: any NativeCallRecoverySending,
         now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) throws {
        guard proposal.action == .propose, proposal.media != nil, NativeJingleTransport.fullJID(proposal.peer),
              NativeJingleTransport.validSID(proposal.sid), now().isFinite else { throw NativeJingleFailure.invalidRequest }
        self.proposal = proposal; self.sender = sender; self.now = now; expires = now() + 45
    }

    func prepare(validate: @escaping () throws -> Void) async throws -> NativeJingleRequest {
        guard !attempted, !stopped else { throw NativeJingleFailure.staleBinding }
        attempted = true
        let deadline = min(expires, now() + 12)
        do {
            try check(deadline, validate: validate)
            let created = try await sender.bindCall(peer: proposal.peer, sid: proposal.sid)
            do { try check(deadline, validate: validate) }
            catch { await sender.unbindCall(created); throw error }
            binding = created
            proceeding = true
            try await sender.sendCallIntent(action: .proceed, peer: proposal.peer, sid: proposal.sid, media: nil)
            while requests.isEmpty {
                try check(deadline, validate: validate)
                try await Task.sleep(nanoseconds: 25_000_000)
            }
            try check(deadline, validate: validate)
            guard requests.filter({ $0.action == "session-initiate" }).count == 1,
                  let request = requests.first, request.action == "session-initiate",
                  let profile = proposal.media else { throw NativeJingleFailure.invalidRequest }
            _ = try NativeJingleMedia.decode(request.jingleElement(), sid: proposal.sid, action: request.action, profile: profile)
            requests.removeFirst()
            return request
        } catch { cancel(); throw error }
    }

    func receive(_ request: NativeJingleRequest) async {
        guard !stopped, !failed, proceeding, request.binding == binding,
              request.peer == proposal.peer, request.sid == proposal.sid else {
            try? await sender.replyJingle(request, rejection: .unexpectedRequest); return
        }
        guard requests.count < 4 else { failed = true; remoteEnded?(); return }
        requests.append(request)
    }

    func receive(_ intent: NativeCallIntent) {
        guard !stopped, !failed, intent.sid == proposal.sid,
              intent.peer == proposal.peer || intent.action == .retract && intent.peer == NativeChatCodec.bareJID(proposal.peer),
              [.retract, .finish, .reject].contains(intent.action) else { return }
        failed = true; remoteEnded?()
    }

    func drainRequests() -> [NativeJingleRequest] {
        let pending = requests; requests.removeAll(); return pending
    }

    private func check(_ deadline: TimeInterval, validate: () throws -> Void) throws {
        try Task.checkCancellation(); try validate()
        guard !stopped, !failed else { throw NativeJingleFailure.rejected }
        guard now().isFinite, now() < deadline else { throw NativeJingleFailure.timedOut }
    }

    func cancel() {
        guard !stopped else { return }; stopped = true; remoteEnded = nil
        let sender = sender, proposal = proposal, binding = binding
        let action: NativeCallIntentAction = proceeding ? .finish : .reject
        Task {
            try? await sender.sendCallIntent(action: action, peer: proposal.peer, sid: proposal.sid, media: nil)
            if let binding = binding { await sender.unbindCall(binding) }
        }
    }
}
