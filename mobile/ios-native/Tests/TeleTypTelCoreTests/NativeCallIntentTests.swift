import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeCallIntentTests: XCTestCase {
    private let owner = "bob@example.test"
    private let bound = "bob@example.test/awakened"
    private func received(_ frame: String) -> String {
        frame.replacingOccurrences(of: "<message ", with: "<message from='alice@example.test/caller' ")
    }

    func testEveryMediaProfileIsPreservedWithoutSDPOrCredentials() throws {
        for profile in NativeCallMedia.allCases {
            let frame = try NativeCallIntent.frame(action: .propose, peer: owner, sid: "session_1", media: profile)
            let proposal = try XCTUnwrap(NativeCallIntent.decode(received(frame), owner: owner, bound: bound))
            XCTAssertEqual(proposal.media, profile)
            XCTAssertEqual(proposal.peer, "alice@example.test/caller")
            XCTAssertEqual(proposal.sid, "session_1")
            XCTAssertFalse(frame.contains("sdp")); XCTAssertFalse(frame.contains("password"))
            XCTAssertEqual(String(reflecting: proposal), "NativeCallIntent(redacted)")
        }
    }

    func testProceedUsesNewFullResourceAndDoesNotAcceptMediaDowngrades() throws {
        let frame = try NativeCallIntent.frame(action: .proceed, peer: "bob@example.test/awakened", sid: "session_1")
        let parsed = try XCTUnwrap(NativeCallIntent.decode(received(frame), owner: owner, bound: bound))
        XCTAssertEqual(parsed.action, .proceed); XCTAssertNil(parsed.media)
        XCTAssertThrowsError(try NativeCallIntent.frame(action: .proceed, peer: owner, sid: "session_1"))
        XCTAssertThrowsError(try NativeCallIntent.frame(action: .propose, peer: bound, sid: "session_1", media: .audio))
        XCTAssertThrowsError(try NativeCallIntent.frame(action: .proceed, peer: bound, sid: "session_1", media: .audio))
    }

    func testRetractionReachesBareRecipientBeforeAnyResourceIsSelected() throws {
        let frame = try NativeCallIntent.frame(action: .retract, peer: owner, sid: "session_1")
        XCTAssertTrue(frame.contains("to='bob@example.test'"))
        XCTAssertEqual(NativeCallIntent.decode(received(frame), owner: owner, bound: bound)?.action, .retract)
        XCTAssertThrowsError(try NativeCallIntent.frame(action: .retract, peer: owner, sid: "session_1", media: .audio))
    }

    func testArchiveCarbonsWrongRecipientDuplicateMediaAndForgedStanzasAreNotLiveCalls() throws {
        let frame = received(try NativeCallIntent.frame(action: .propose, peer: owner, sid: "session_1", media: .total))
        for invalid in [frame.replacingOccurrences(of: "</message>", with: "<delay xmlns='urn:xmpp:delay' stamp='2026-11-15T00:00:00Z'/></message>"),
            frame.replacingOccurrences(of: "to='bob@example.test'", with: "to='charlie@example.test'"),
            frame.replacingOccurrences(of: "from='alice@example.test/caller'", with: "from='alice@example.test'"),
            frame.replacingOccurrences(of: "type='chat'", with: "type='groupchat'"),
            frame.replacingOccurrences(of: "</propose>", with: "<description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/></propose>"),
            frame.replacingOccurrences(of: "</message>", with: "<received xmlns='urn:xmpp:carbons:2'/></message>"),
            frame.replacingOccurrences(of: "<description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/>", with: ""),
            frame.replacingOccurrences(of: "<store xmlns='urn:xmpp:hints'/>", with: ""),
            frame.replacingOccurrences(of: "id='session_1'", with: "id='session 1'"), String(repeating: "x", count: 8193)] {
            XCTAssertNil(NativeCallIntent.decode(invalid, owner: owner, bound: bound))
        }
    }

    func testLiveEjabberdArchiveMarkerIsNotConfusedWithAnArchivedOrDelayedCall() throws {
        let frame = received(try NativeCallIntent.frame(action: .propose, peer: owner, sid: "session_1", media: .audioRtt))
            .replacingOccurrences(of: "<propose", with: "<archived xmlns='urn:xmpp:mam:tmp' by='\(owner)' id='1794759990133214'/><stanza-id xmlns='urn:xmpp:sid:0' by='\(owner)' id='1794759990133214'/><propose")
        XCTAssertEqual(NativeCallIntent.decode(frame, owner: owner, bound: bound)?.media, .audioRtt)
        for invalid in [
            frame.replacingOccurrences(of: "</message>", with: "<delay xmlns='urn:xmpp:delay' stamp='2026-11-15T00:00:00Z'/></message>"),
            frame.replacingOccurrences(of: "by='\(owner)'", with: "by='other@example.test'"),
            frame.replacingOccurrences(of: "id='1794759990133214'/><stanza-id", with: "id=''/><stanza-id"),
            "<message xmlns='jabber:client' from='\(owner)' to='\(bound)'><result xmlns='urn:xmpp:mam:2'><forwarded xmlns='urn:xmpp:forward:0'>\(frame)</forwarded></result></message>",
            frame.replacingOccurrences(of: "</message>", with: "<received xmlns='urn:xmpp:carbons:2'/></message>")
        ] { XCTAssertNil(NativeCallIntent.decode(invalid, owner: owner, bound: bound)) }
    }

    func testPolicyAndHandoffAreSentOnlyToOwnServerWithBoundedMetadata() throws {
        let policy = try NativeCallIntent.preferences(owner: owner, identifier: "policy-1", enabled: true, dnd: true, muted: ["alice@example.test"])
        XCTAssertTrue(policy.contains("to='example.test'")); XCTAssertTrue(policy.contains("dnd='true'"))
        XCTAssertThrowsError(try NativeCallIntent.preferences(owner: owner, identifier: "policy-1", enabled: true, dnd: false, muted: ["alice@external.test"]))
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "session_1", expiresAt: 145, media: .total, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: "NOT-FOR-XMPP")
        let proof = try NativeCallIntent.handoff(owner: owner, identifier: "proof-1", invitation: invitation, registration: registration)
        XCTAssertTrue(proof.contains("to='example.test'")); XCTAssertFalse(proof.contains("NOT-FOR-XMPP"))
        XCTAssertTrue(proof.contains(invitation.id.uuidString.lowercased()))
    }
}

@MainActor
private final class CallRecoveryFixture: NativeCallIntentSending, NativeCallReservationServing {
    var operations: [String] = []
    var prove: (() throws -> Void)?
    var reserve: (() throws -> Void)?
    var proceed: (() throws -> Void)?
    func observeCallIntents(_ observer: @escaping @Sendable (NativeCallIntent) -> Void) async {}
    func setCallPreferences(enabled: Bool, dnd: Bool, muted: Set<String>) async throws {}
    func proveCallResource(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws { operations.append("proof"); try prove?() }
    var reservedCaller = "alice@example.test/caller"
    func accept(invitation: NativeCallInvitation, registration: NativePushRegistration, fullJID: String) async throws -> NativeCallReservation {
        operations.append("reserve"); try reserve?()
        return NativeCallReservation(callerJID: reservedCaller, recipientJID: fullJID)
    }
    func sendCallIntent(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia?) async throws {
        XCTAssertEqual(action, .proceed); XCTAssertEqual(peer, "alice@example.test/caller"); XCTAssertNil(media)
        operations.append("proceed"); try proceed?()
    }
}

@MainActor
final class NativeCallAnswerRecoveryTests: XCTestCase {
    func testProofReservationProceedOrderNeverClaimsConnectedMedia() async throws {
        let fixture = CallRecoveryFixture(), recovery = NativeCallAnswerRecovery(now: { 100 })
        let peer = try await recover(recovery, fixture: fixture)
        XCTAssertEqual(peer, "alice@example.test/caller")
        XCTAssertEqual(fixture.operations, ["proof", "reserve", "proceed"])
        XCTAssertEqual(recovery.phase, .awaitingJingle)
    }

    func testFailureAtEveryAwaitStopsProceedingAndCompensatesUncertainReservation() async throws {
        for stage in ["proof", "reserve", "proceed"] {
            let fixture = CallRecoveryFixture(), recovery = NativeCallAnswerRecovery(now: { 100 })
            let failure = { throw NativeJingleFailure.rejected }
            if stage == "proof" { fixture.prove = failure }
            if stage == "reserve" { fixture.reserve = failure }
            if stage == "proceed" { fixture.proceed = failure }
            do { _ = try await recover(recovery, fixture: fixture); XCTFail("Must fail") } catch {}
            XCTAssertEqual(recovery.phase, .failed)
            XCTAssertEqual(fixture.operations.last, stage == "proof" ? "proof" : "abandon")
            if stage != "proceed" { XCTAssertFalse(fixture.operations.contains("proceed")) }
        }
    }

    func testExpiryAndCancelledGenerationCannotProceedAfterProof() async throws {
        for cancelled in [false, true] {
            var current: TimeInterval = 100
            let fixture = CallRecoveryFixture(), recovery = NativeCallAnswerRecovery(now: { current })
            fixture.prove = { if cancelled { recovery.cancel() } else { current = 145 } }
            do { _ = try await recover(recovery, fixture: fixture); XCTFail("Must fail") } catch {}
            XCTAssertEqual(fixture.operations, ["proof"])
        }
    }

    func testDifferentSessionProfileAndOwnerAreRejectedBeforeAnySideEffects() async throws {
        for proposal in [NativeCallIntent(action: .propose, sid: "other", peer: "alice@example.test/caller", media: .total),
                         NativeCallIntent(action: .propose, sid: "session_1", peer: "alice@example.test/caller", media: .audio),
                         NativeCallIntent(action: .propose, sid: "session_1", peer: "bob@example.test/other", media: .total)] {
            let fixture = CallRecoveryFixture(), recovery = NativeCallAnswerRecovery(now: { 100 })
            do { _ = try await recover(recovery, fixture: fixture, proposal: proposal); XCTFail("Must fail") } catch {}
            XCTAssertTrue(fixture.operations.isEmpty)
        }
    }

    func testCancellationAfterReservationAbandonsInsteadOfProceeding() async throws {
        let fixture = CallRecoveryFixture(), recovery = NativeCallAnswerRecovery(now: { 100 })
        fixture.reserve = { recovery.cancel() }
        do { _ = try await recover(recovery, fixture: fixture); XCTFail("Must fail") } catch {}
        XCTAssertEqual(fixture.operations, ["proof", "reserve", "abandon"])
        XCTAssertEqual(recovery.phase, .failed)
    }

    func testUnconfirmedProposalPeerCannotReplaceAuthoritativeCaller() async throws {
        let fixture = CallRecoveryFixture(), recovery = NativeCallAnswerRecovery(now: { 100 })
        fixture.reservedCaller = "charlie@example.test/other"
        do { _ = try await recover(recovery, fixture: fixture); XCTFail("Must fail") } catch {}
        XCTAssertEqual(fixture.operations, ["proof", "reserve", "abandon"])
    }

    func testOnlyPendingProofIsRetriedAndRetryBudgetIsBounded() async throws {
        for exhausted in [false, true] {
            var pauses = 0
            let fixture = CallRecoveryFixture()
            let recovery = NativeCallAnswerRecovery(now: { 100 }, waitForProof: { pauses += 1 })
            fixture.reserve = {
                if exhausted || pauses < 2 { throw NativePushRegistryFailure.proofPending }
            }
            do {
                _ = try await recover(recovery, fixture: fixture)
                XCTAssertFalse(exhausted)
                XCTAssertEqual(pauses, 2)
                XCTAssertEqual(fixture.operations.last, "proceed")
            } catch {
                XCTAssertTrue(exhausted)
                XCTAssertEqual(pauses, 11)
                XCTAssertEqual(fixture.operations.filter { $0 == "reserve" }.count, 12)
                XCTAssertEqual(fixture.operations.last, "abandon")
            }
        }
    }

    func testCancellingDuringProofRetryPreventsProceed() async throws {
        let fixture = CallRecoveryFixture()
        var recovery: NativeCallAnswerRecovery!
        recovery = NativeCallAnswerRecovery(now: { 100 }, waitForProof: { recovery.cancel() })
        fixture.reserve = { throw NativePushRegistryFailure.proofPending }
        do { _ = try await recover(recovery, fixture: fixture); XCTFail("Must fail") } catch {}
        XCTAssertEqual(fixture.operations, ["proof", "reserve", "abandon"])
    }

    private func recover(_ recovery: NativeCallAnswerRecovery, fixture: CallRecoveryFixture, proposal: NativeCallIntent? = nil) async throws -> String {
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "session_1", expiresAt: 145, media: .total, now: 100))
        let registration = NativePushRegistration(deviceID: UUID(), generation: String(repeating: "a", count: 32), expiresAt: 200, controlCredential: nil)
        return try await recovery.recover(invitation: invitation, registration: registration,
            proposal: proposal ?? NativeCallIntent(action: .propose, sid: "session_1", peer: "alice@example.test/caller", media: .total),
            owner: "bob@example.test", fullJID: "bob@example.test/awakened", sender: fixture, registry: fixture,
            abandonReservation: { fixture.operations.append("abandon") })
    }
}
