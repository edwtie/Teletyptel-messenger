import XCTest
@testable import TeleTypTelCore

@MainActor
private final class CallPolicySender: NativeCallIntentSending {
    var writes: [(Bool, Bool, Set<String>)] = []
    var replies: [CheckedContinuation<Void, Error>] = []
    func observeCallIntents(_ observer: @escaping @Sendable (NativeCallIntent) -> Void) async {}
    func sendCallIntent(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia?) async throws {}
    func proveCallResource(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws {}
    func setCallPreferences(enabled: Bool, dnd: Bool, muted: Set<String>) async throws {
        writes.append((enabled, dnd, muted))
        try await withCheckedThrowingContinuation { replies.append($0) }
    }
    func reply(_ error: Error? = nil) {
        guard !replies.isEmpty else { return }
        let pending = replies.removeFirst()
        if let error = error { pending.resume(throwing: error) } else { pending.resume() }
    }
}

@MainActor
final class NativeCallPolicyTests: XCTestCase {
    private func settle(_ condition: () -> Bool) async {
        for _ in 0..<500 { if condition() { return }; try? await Task.sleep(nanoseconds: 1_000_000) }
        XCTFail("Call policy did not settle")
    }

    func testPolicyUsesUnionAndDisablesInsteadOfTruncatingPrivacy() {
        var preferences = NativeChatPreferences()
        preferences.blockedPeers = ["blocked@localhost", "remote@elsewhere.test"]
        preferences.mutedPeers = ["muted@localhost", "blocked@localhost"]
        let value = NativeCallPolicySnapshot(owner: "me@localhost", preferences: preferences)
        XCTAssertTrue(value.enabled)
        XCTAssertFalse(value.dnd)
        XCTAssertEqual(value.muted, ["blocked@localhost", "muted@localhost"])
        preferences.mutedPeers = Set((0..<256).map { "muted\($0)@localhost" })
        let overflow = NativeCallPolicySnapshot(owner: "me@localhost", preferences: preferences)
        XCTAssertFalse(overflow.enabled)
        XCTAssertTrue(overflow.dnd)
        XCTAssertTrue(overflow.muted.isEmpty)
        XCTAssertFalse(String(reflecting: value).contains("blocked@"))
    }

    func testWritesAreSerialAndLatestPrivacyMustBeAcknowledged() async {
        let sender = CallPolicySender(), policy = NativeCallPolicySync()
        var preferences = NativeChatPreferences()
        policy.configure(sender: sender, owner: "me@localhost", session: UUID(), preferences: preferences)
        await settle { sender.replies.count == 1 }
        XCTAssertFalse(policy.usable)
        preferences.mutedPeers.insert("alice@localhost")
        policy.update(owner: "me@localhost", preferences: preferences)
        XCTAssertEqual(sender.writes.count, 1)
        sender.reply()
        await settle { sender.writes.count == 2 }
        XCTAssertEqual(policy.state, .synchronizing)
        XCTAssertFalse(policy.usable)
        XCTAssertEqual(sender.writes[1].2, ["alice@localhost"])
        sender.reply()
        await settle { policy.state == .ready }
        XCTAssertTrue(policy.usable)
        XCTAssertEqual(policy.applied?.muted, ["alice@localhost"])
        policy.reset()
    }

    func testRevertingWhileAWriteIsPendingCannotReuseOldAcknowledgement() async {
        let sender = CallPolicySender(), policy = NativeCallPolicySync()
        let baseline = NativeChatPreferences()
        policy.configure(sender: sender, owner: "me@localhost", session: UUID(), preferences: baseline)
        await settle { sender.replies.count == 1 }; sender.reply()
        await settle { policy.usable }
        var privateMode = baseline; privateMode.doNotDisturb = true
        policy.update(owner: "me@localhost", preferences: privateMode)
        await settle { sender.writes.count == 2 }
        policy.update(owner: "me@localhost", preferences: baseline)
        XCTAssertFalse(policy.usable)
        sender.reply()
        await settle { sender.writes.count == 3 }
        XCTAssertFalse(policy.usable)
        sender.reply()
        await settle { policy.usable }
        policy.reset()
    }

    func testOnlyInitialExplicitUnsupportedAllowsLegacyAndNeverAfterSuccess() async {
        for initialError in [NativeCallPolicyFailure.unsupported, .rejected, .timedOut] {
            let sender = CallPolicySender(), policy = NativeCallPolicySync()
            let session = UUID()
            policy.configure(sender: sender, owner: "me@localhost", session: session, preferences: NativeChatPreferences())
            await settle { sender.replies.count == 1 }; sender.reply(initialError)
            await settle { policy.state != .synchronizing }
            XCTAssertEqual(policy.state, initialError == .unsupported ? .unsupported : .failed)
            XCTAssertFalse(policy.usable)
            policy.reset()
        }
        let sender = CallPolicySender(), policy = NativeCallPolicySync()
        policy.configure(sender: sender, owner: "me@localhost", session: UUID(), preferences: NativeChatPreferences())
        await settle { sender.replies.count == 1 }; sender.reply()
        await settle { policy.usable }
        var changed = NativeChatPreferences(); changed.doNotDisturb = true
        policy.update(owner: "me@localhost", preferences: changed)
        await settle { sender.replies.count == 1 }; sender.reply(NativeCallPolicyFailure.unsupported)
        await settle { policy.state == .failed }
        XCTAssertFalse(policy.usable)
        policy.reset()
    }

    func testLateReplyCannotReopenLoggedOutOrNewAccountPolicy() async {
        let first = CallPolicySender(), second = CallPolicySender(), policy = NativeCallPolicySync()
        policy.configure(sender: first, owner: "first@localhost", session: UUID(), preferences: NativeChatPreferences())
        await settle { first.replies.count == 1 }
        policy.reset()
        policy.configure(sender: second, owner: "second@localhost", session: UUID(), preferences: NativeChatPreferences())
        await settle { second.replies.count == 1 }
        first.reply()
        try? await Task.sleep(nanoseconds: 10_000_000)
        XCTAssertEqual(policy.state, .synchronizing)
        XCTAssertFalse(policy.usable)
        second.reply()
        await settle { policy.usable }
        policy.reset()
    }

    func testControlReplyRequiresExactServerIdentityAndEmptyResult() throws {
        func decode(_ attributes: String, _ body: String = "") throws -> Result<Void, NativeCallPolicyFailure>? {
            NativeCallControlReply.decode(try ProbeXML.parse("<iq xmlns='jabber:client' \(attributes)>\(body)</iq>"),
                identifier: "policy-1", owner: "me@localhost", bound: "me@localhost/phone")
        }
        if case .success? = try decode("type='result' id='policy-1' from='localhost' to='me@localhost/phone'") {} else { XCTFail("Valid server ACK rejected") }
        XCTAssertNil(try decode("type='result' id='policy-1' from='attacker@localhost/phone'"))
        XCTAssertNil(try decode("type='result' id='wrong' from='localhost'"))
        XCTAssertNil(try decode("type='result' id='policy-1' from='localhost'", "<preferences xmlns='urn:teletyptel:call-recovery:1'/>"))
        let error = "<error type='cancel'><service-unavailable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error>"
        if case .failure(.unsupported)? = try decode("type='error' id='policy-1' from='localhost'", error) {} else { XCTFail("Explicit unsupported not recognized") }
        XCTAssertNil(try decode("type='error' id='policy-1' from='attacker@localhost/phone'", error))
    }
}
