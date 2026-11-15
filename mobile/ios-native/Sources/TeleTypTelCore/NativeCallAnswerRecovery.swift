import Foundation

@MainActor
protocol NativeCallReservationServing {
    func accept(invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String) async throws
}

extension NativePushRegistryClient: NativeCallReservationServing {}

@MainActor
final class NativeCallAnswerRecovery {
    enum Phase: Equatable { case idle, proving, reserving, proceeding, awaitingJingle, failed }
    private(set) var phase = Phase.idle
    private var generation = UUID()
    private let now: () -> TimeInterval

    init(now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) { self.now = now }

    func cancel() { generation = UUID(); phase = .failed }

    func recover(invitation: NativeCallInvitation, registration: NativePushRegistration, proposal: NativeCallIntent,
                 owner: String, fullJID: String, sender: any NativeCallIntentSending,
                 registry: any NativeCallReservationServing,
                 abandonReservation: @escaping () async -> Void) async throws -> String {
        guard phase == .idle, proposal.action == .propose, proposal.sid == invitation.sid,
              proposal.media == invitation.media, NativeJingleTransport.fullJID(proposal.peer),
              NativeChatCodec.bareJID(proposal.peer) != owner, NativeChatCodec.bareJID(owner) == owner,
              NativeJingleTransport.fullJID(fullJID), NativeChatCodec.bareJID(fullJID) == owner,
              registration.expiresAt.isFinite, registration.expiresAt > now() else { throw NativeJingleFailure.invalidRequest }
        let attempt = generation
        var reservationAttempted = false
        do {
            try valid(attempt, invitation: invitation)
            phase = .proving
            try await sender.proveCallResource(invitation: invitation, registration: registration)
            try valid(attempt, invitation: invitation)
            phase = .reserving
            reservationAttempted = true
            try await registry.accept(invitation: invitation, registration: registration, fullJID: fullJID)
            try valid(attempt, invitation: invitation)
            phase = .proceeding
            try await sender.sendCallIntent(action: .proceed, peer: proposal.peer, sid: invitation.sid, media: nil)
            try valid(attempt, invitation: invitation)
            phase = .awaitingJingle
            return proposal.peer
        } catch {
            if reservationAttempted { await abandonReservation() }
            phase = .failed
            throw error
        }
    }

    private func valid(_ attempt: UUID, invitation: NativeCallInvitation) throws {
        try Task.checkCancellation()
        guard generation == attempt else { throw NativeJingleFailure.staleBinding }
        let current = now()
        guard current.isFinite, invitation.expiresAt > current, invitation.expiresAt <= current + 60 else { throw NativeJingleFailure.timedOut }
    }
}
