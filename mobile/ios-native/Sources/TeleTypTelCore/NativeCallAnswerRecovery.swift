import Foundation

@MainActor
protocol NativeCallReservationServing {
    func accept(invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String) async throws -> NativeCallReservation
}

struct NativeCallReservation: Equatable {
    let callerJID: String
    let recipientJID: String
}

extension NativePushRegistryClient: NativeCallReservationServing {}

@MainActor
final class NativeCallAnswerRecovery {
    enum Phase: Equatable { case idle, proving, reserving, proceeding, awaitingJingle, failed }
    private(set) var phase = Phase.idle
    private var generation = UUID()
    private let now: () -> TimeInterval
    private let waitForProof: () async throws -> Void

    init(now: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 },
         waitForProof: @escaping () async throws -> Void = { try await Task.sleep(nanoseconds: 150_000_000) }) {
        self.now = now; self.waitForProof = waitForProof
    }

    func cancel() { generation = UUID(); phase = .failed }

    func recover(invitation: NativeCallInvitation, registration: NativePushRegistration, proposal: NativeCallIntent,
                 owner: String, fullJID: String, sender: any NativeCallIntentSending,
                 registry: any NativeCallReservationServing,
                 validateContext: @escaping () throws -> Void = {},
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
            try validateContext()
            phase = .proving
            try await sender.proveCallResource(invitation: invitation, registration: registration)
            try valid(attempt, invitation: invitation)
            try validateContext()
            phase = .reserving
            reservationAttempted = true
            var accepted: NativeCallReservation?
            for retry in 0..<12 {
                try valid(attempt, invitation: invitation); try validateContext()
                do { accepted = try await registry.accept(invitation: invitation, registration: registration, fullJID: fullJID); break }
                catch NativePushRegistryFailure.proofPending {
                    guard retry < 11 else { throw NativeJingleFailure.timedOut }
                    try await waitForProof()
                }
            }
            guard let reservation = accepted else { throw NativeJingleFailure.rejected }
            try valid(attempt, invitation: invitation)
            try validateContext()
            guard reservation.callerJID == proposal.peer, reservation.recipientJID == fullJID else { throw NativeJingleFailure.rejected }
            phase = .proceeding
            try await sender.sendCallIntent(action: .proceed, peer: proposal.peer, sid: invitation.sid, media: nil)
            try valid(attempt, invitation: invitation)
            try validateContext()
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
