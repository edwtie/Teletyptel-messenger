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
    private let waitForRenewal: () async throws -> Void
    private var connection: Task<Void, Never>?
    private var renewal: Task<Void, Never>?
    private var activeBootstrap: NativeCallBootstrapGrant?
    private var activeDeadline: TimeInterval?
    private var sender: (any NativeCallRecoverySending)?
    private var bound: String?
    private var proposal: NativeCallIntent?
    private var requests: [NativeJingleRequest] = []
    private var expectedPeer: String?
    private var failed = false
    private var stopped = false
    private var endRequested = false
    private var authorizedPeer: String?
    private var authorizedResource: String?
    var receiveJingle: ((NativeJingleRequest, any NativeJingleSending) -> Void)?
    var remoteEnded: (() -> Void)?

    init(invitation: NativeCallInvitation, registration: NativePushRegistration, registry: any NativeWarmCallRegistryServing,
         now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 },
         waitForRenewal: @escaping () async throws -> Void = { try await Task.sleep(nanoseconds: 8_000_000_000) }) {
        self.invitation = invitation; self.registration = registration; self.registry = registry
        self.now = now; self.waitForRenewal = waitForRenewal; recovery = NativeCallAnswerRecovery(now: now)
    }

    func prepare(account: NativeAuthenticatedAccount, connector: any NativeCallXMPPConnecting = NativeXMPPConnection(),
                 validatePeer: @escaping (String) throws -> Void = { _ in },
                 validateContext: @escaping () throws -> Void) async throws -> NativeWarmCallOffer {
        try await prepare(owner: account.jid, connect: { connected, sender, intent, jingle in
            try await connector.runCall(account: account, onConnected: connected, onSender: sender, onIntent: intent, onJingle: jingle)
        }, validatePeer: validatePeer, validateContext: validateContext)
    }

    func prepare(bootstrap: NativeCallBootstrapGrant, connector: any NativeBootstrapXMPPConnecting = NativeXMPPConnection(),
                 validateContext: @escaping () throws -> Void) async throws -> NativeWarmCallOffer {
        guard bootstrap.callID == invitation.id, bootstrap.sid == invitation.sid, bootstrap.media == invitation.media,
              bootstrap.expiresAt > now(), bootstrap.expiresAt <= invitation.expiresAt,
              connection == nil, !stopped else { throw NativeJingleFailure.invalidRequest }
        authorizedPeer = bootstrap.peer; authorizedResource = bootstrap.owner + "/" + bootstrap.resource
        activeBootstrap = bootstrap; activeDeadline = bootstrap.expiresAt
        let offer = try await prepare(owner: bootstrap.owner, connect: { connected, sender, intent, jingle in
            try await connector.runCall(bootstrap: bootstrap, onConnected: connected, onSender: sender, onIntent: intent, onJingle: jingle)
        }, validatePeer: { peer in guard peer == bootstrap.peer else { throw NativeJingleFailure.rejected } }, validateContext: {
            try validateContext()
            guard bootstrap.expiresAt > self.now() else { throw NativeJingleFailure.timedOut }
        })
        renewal = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    guard let wait = self?.waitForRenewal else { return }
                    try await wait()
                    guard let self = self, !self.stopped, !self.failed else { return }
                    try await self.renewLease(bootstrap: bootstrap, sender: offer.sender, validate: validateContext)
                } catch {
                    guard let self = self, !self.stopped else { return }
                    self.failConnection(); self.endServerCall(); self.connection?.cancel()
                    return
                }
            }
        }
        return offer
    }

    private typealias Connect = (@escaping @Sendable (String) -> Void,
        @escaping @Sendable (any NativeCallRecoverySending) -> Void,
        @escaping @Sendable (NativeCallIntent) -> Void, @escaping @Sendable (NativeJingleRequest) -> Void) async throws -> Void

    private func prepare(owner: String, connect: @escaping Connect,
                         validatePeer: @escaping (String) throws -> Void,
                         validateContext: @escaping () throws -> Void) async throws -> NativeWarmCallOffer {
        guard connection == nil, !stopped else { throw NativeJingleFailure.staleBinding }
        let deadline = min(invitation.expiresAt, now() + 12)
        connection = Task { [weak self] in
            do {
                try await connect({ [weak self] jid in
                    Task { @MainActor in
                        guard let self = self, !self.stopped else { return }
                        guard NativeJingleTransport.fullJID(jid), NativeChatCodec.bareJID(jid) == owner,
                              self.authorizedResource == nil || self.authorizedResource == jid else { self.failed = true; return }
                        self.bound = jid
                    }
                }, { [weak self] sender in
                    Task { @MainActor in guard self?.stopped == false else { return }; self?.sender = sender }
                }, { [weak self] intent in
                    Task { @MainActor in self?.receive(intent, owner: owner) }
                }, { [weak self] request in
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
                owner: owner, fullJID: bound, sender: sender, registry: registry,
                requireAnswerAuthorization: authorizedResource != nil,
                validateContext: { try validateContext(); try validatePeer(proposal.peer) },
                abandonReservation: { [weak self] in self?.endServerCall() })
            if let bootstrap = activeBootstrap { try await renewLease(bootstrap: bootstrap, sender: sender, validate: validateContext) }
            while requests.isEmpty { try await pause(deadline, validate: validateContext) }
            try current(deadline, validate: validateContext)
            guard requests.filter({ $0.action == "session-initiate" }).count == 1, let request = requests.first,
                  request.action == "session-initiate", request.peer == expectedPeer,
                  request.sid == invitation.sid else { throw NativeJingleFailure.invalidRequest }
            _ = try NativeJingleMedia.decode(request.jingleElement(), sid: invitation.sid, action: request.action, profile: invitation.media)
            requests.removeFirst()
            return NativeWarmCallOffer(request: request, sender: sender)
        } catch { cancel(); endServerCall(); throw error }
    }

    private func receive(_ intent: NativeCallIntent, owner: String) {
        guard !stopped, !failed, intent.sid == invitation.sid,
              authorizedPeer == nil || intent.peer == authorizedPeer,
              NativeChatCodec.bareJID(intent.peer) != owner else { return }
        if intent.action == .propose {
            guard intent.media == invitation.media, proposal == nil || proposal?.peer == intent.peer else { failConnection(); return }
            proposal = intent
        } else if [.retract, .reject, .finish].contains(intent.action),
                  intent.peer == proposal?.peer || intent.action == .retract && intent.peer == proposal.flatMap({ NativeChatCodec.bareJID($0.peer) }) {
            failed = true; remoteEnded?()
        }
    }

    private func receive(_ request: NativeJingleRequest) {
        guard !stopped, !failed, request.sid == invitation.sid, request.peer == proposal?.peer else { return }
        if let route = receiveJingle, let sender = sender { route(request, sender) }
        else if requests.count < 4 { requests.append(request) }
        else { failConnection() }
    }

    func activateRouting() {
        guard let sender = sender, let route = receiveJingle else { return }
        let pending = requests; requests.removeAll()
        for request in pending { route(request, sender) }
    }

    private func failConnection() { guard !stopped, !failed else { return }; failed = true; remoteEnded?() }
    private func renewLease(bootstrap: NativeCallBootstrapGrant, sender: any NativeCallRecoverySending,
                            validate: () throws -> Void) async throws {
        guard let registry = registry as? any NativeActiveCallRegistryServing else { throw NativeJingleFailure.rejected }
        try current(activeDeadline ?? 0, validate: validate)
        try await sender.keepCallAlive()
        var lease: NativeCallActiveLease?
        for retry in 0..<12 {
            try current(activeDeadline ?? 0, validate: validate)
            do { lease = try await registry.lease(invitation: invitation, registration: registration, bootstrap: bootstrap); break }
            catch NativePushRegistryFailure.proofPending {
                guard retry < 11 else { throw NativeJingleFailure.timedOut }
                try await Task.sleep(nanoseconds: 150_000_000)
            }
        }
        guard let lease = lease, bootstrap.matches(lease), lease.expiresAt > (activeDeadline ?? 0),
              lease.expiresAt <= now() + 25, lease.expiresAt <= registration.expiresAt else { throw NativeJingleFailure.rejected }
        try current(activeDeadline ?? 0, validate: validate)
        try await sender.authorizeActiveCallLease(lease)
        try current(activeDeadline ?? 0, validate: validate)
        activeDeadline = lease.expiresAt
    }
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
        renewal?.cancel(); renewal = nil; activeBootstrap = nil; activeDeadline = nil
        connection?.cancel(); connection = nil; sender = nil; requests.removeAll()
    }
    func endServerCall() {
        guard !endRequested else { return }; endRequested = true
        let registry = registry, invitation = invitation, registration = registration
        Task { try? await registry.end(invitation: invitation, registration: registration) }
    }
}
