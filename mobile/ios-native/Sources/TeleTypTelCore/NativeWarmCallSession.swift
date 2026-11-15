import Foundation

@MainActor
protocol NativeWarmCallRegistryServing: NativeCallReservationServing {
    func end(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws
}
extension NativePushRegistryClient: NativeWarmCallRegistryServing {}

struct NativeWarmCallLease: CustomStringConvertible, CustomDebugStringConvertible {
    let account: NativeAuthenticatedAccount
    let authorization: UUID
    var description: String { "NativeWarmCallLease(redacted)" }
    var debugDescription: String { description }
}

struct NativeWarmCallOffer {
    let request: NativeJingleRequest
    let sender: any NativeCallRecoverySending
}

@MainActor
final class NativeWarmCallSession {
    private let invitation: NativeCallInvitation
    private let registration: NativePushRegistration
    private let registry: any NativeWarmCallRegistryServing
    private let recovery: NativeCallAnswerRecovery
    private let now: () -> TimeInterval
    private var connection: Task<Void, Never>?
    private var sender: (any NativeCallRecoverySending)?
    private var bound: String?
    private var proposal: NativeCallIntent?
    private var requests: [NativeJingleRequest] = []
    private var expectedPeer: String?
    private var failed = false
    private var stopped = false
    private var endRequested = false
    var receiveJingle: ((NativeJingleRequest, any NativeJingleSending) -> Void)?
    var remoteEnded: (() -> Void)?

    init(invitation: NativeCallInvitation, registration: NativePushRegistration, registry: any NativeWarmCallRegistryServing,
         now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
        self.invitation = invitation; self.registration = registration; self.registry = registry
        self.now = now; recovery = NativeCallAnswerRecovery(now: now)
    }

    func prepare(account: NativeAuthenticatedAccount, connector: any NativeCallXMPPConnecting = NativeXMPPConnection(),
                 validatePeer: @escaping (String) throws -> Void = { _ in },
                 validateContext: @escaping () throws -> Void) async throws -> NativeWarmCallOffer {
        guard connection == nil, !stopped else { throw NativeJingleFailure.staleBinding }
        let deadline = min(invitation.expiresAt, now() + 12)
        connection = Task { [weak self] in
            do {
                try await connector.runCall(account: account, onConnected: { [weak self] jid in
                    Task { @MainActor in
                        guard let self = self, !self.stopped else { return }
                        guard NativeJingleTransport.fullJID(jid), NativeChatCodec.bareJID(jid) == account.jid else { self.failed = true; return }
                        self.bound = jid
                    }
                }, onSender: { [weak self] sender in
                    Task { @MainActor in guard self?.stopped == false else { return }; self?.sender = sender }
                }, onIntent: { [weak self] intent in
                    Task { @MainActor in self?.receive(intent, owner: account.jid) }
                }, onJingle: { [weak self] request in
                    Task { @MainActor in self?.receive(request) }
                })
                self?.failConnection()
            } catch { self?.failConnection() }
        }
        do {
            while bound == nil || sender == nil || proposal == nil { try await pause(deadline, validate: validateContext) }
            try current(deadline, validate: validateContext)
            guard let bound = bound, let sender = sender, let proposal = proposal else { throw NativeJingleFailure.disconnected }
            try validatePeer(proposal.peer)
            _ = try await sender.bindCall(peer: proposal.peer, sid: invitation.sid)
            try current(deadline, validate: validateContext)
            expectedPeer = try await recovery.recover(invitation: invitation, registration: registration, proposal: proposal,
                owner: account.jid, fullJID: bound, sender: sender, registry: registry,
                validateContext: { try validateContext(); try validatePeer(proposal.peer) },
                abandonReservation: { [weak self] in self?.endServerCall() })
            while requests.isEmpty { try await pause(deadline, validate: validateContext) }
            try current(deadline, validate: validateContext)
            guard requests.count == 1, let request = requests.first,
                  request.action == "session-initiate", request.peer == expectedPeer,
                  request.sid == invitation.sid else { throw NativeJingleFailure.invalidRequest }
            _ = try NativeJingleMedia.decode(request.jingleElement(), sid: invitation.sid, action: request.action, profile: invitation.media)
            requests.removeAll()
            return NativeWarmCallOffer(request: request, sender: sender)
        } catch { cancel(); endServerCall(); throw error }
    }

    private func receive(_ intent: NativeCallIntent, owner: String) {
        guard !stopped, intent.sid == invitation.sid,
              NativeChatCodec.bareJID(intent.peer) != owner else { return }
        if intent.action == .propose {
            guard intent.media == invitation.media, proposal == nil || proposal?.peer == intent.peer else { failed = true; return }
            proposal = intent
        } else if intent.peer == proposal?.peer, [.retract, .reject, .finish].contains(intent.action) {
            failed = true; remoteEnded?()
        }
    }

    private func receive(_ request: NativeJingleRequest) {
        guard !stopped, request.sid == invitation.sid, request.peer == proposal?.peer else { return }
        if let route = receiveJingle, let sender = sender { route(request, sender) }
        else if requests.count < 4 { requests.append(request) }
        else { failed = true }
    }

    func activateRouting() {
        guard let sender = sender, let route = receiveJingle else { return }
        let pending = requests; requests.removeAll()
        for request in pending { route(request, sender) }
    }

    private func failConnection() { guard !stopped else { return }; failed = true; remoteEnded?() }
    private func current(_ deadline: TimeInterval, validate: () throws -> Void) throws {
        try Task.checkCancellation(); try validate()
        guard !stopped, !failed else { throw NativeJingleFailure.disconnected }
        guard now().isFinite, now() < deadline else { throw NativeJingleFailure.timedOut }
    }
    private func pause(_ deadline: TimeInterval, validate: () throws -> Void) async throws {
        try current(deadline, validate: validate)
        try await Task.sleep(nanoseconds: 25_000_000)
    }
    func cancel() {
        guard !stopped else { return }
        stopped = true; recovery.cancel(); receiveJingle = nil; remoteEnded = nil
        connection?.cancel(); connection = nil; sender = nil; requests.removeAll()
    }
    func endServerCall() {
        guard !endRequested else { return }; endRequested = true
        let registry = registry, invitation = invitation, registration = registration
        Task { try? await registry.end(invitation: invitation, registration: registration) }
    }
}
