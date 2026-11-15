import XCTest
@testable import TeleTypTelCore

private actor CallRoutingFixture: ServerChecking, NativeAccountAuthenticating, NativeJingleXMPPConnecting, NativeChatSending, NativeCallRecoverySending {
    var observer: (@Sendable (NativeCallIntent) -> Void)?
    var policies: [(Bool, Bool, Set<String>)] = []
    var pendingPolicies: [CheckedContinuation<Void, Error>] = []
    var intents: [NativeCallIntent] = []
    let supported: Bool
    init(supported: Bool = true) { self.supported = supported }
    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport { ProbeReport(mechanisms: ["PLAIN"]) }
    func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        NativeAuthenticatedAccount(configuration: configuration, jid: jid, password: password)
    }
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        try await run(account: account, onConnected: onConnected, onRoster: { _ in }, onChat: { _ in }, onSender: { _ in }, onJingle: { _ in }, onJingleSender: { _ in })
    }
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void, onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void, onJingle: @escaping @Sendable (NativeJingleRequest) -> Void,
             onJingleSender: @escaping @Sendable (any NativeJingleSending) -> Void) async throws {
        onSender(self); onJingleSender(self); onConnected(account.jid + "/fixture"); onRoster(.ready([]))
        while true { try await Task.sleep(nanoseconds: 100_000_000) }
    }
    func sendMessage(to jid: String, body: String, identifier: String) async throws {}
    func observeCallIntents(_ observer: @escaping @Sendable (NativeCallIntent) -> Void) async { self.observer = observer }
    func emit(_ intent: NativeCallIntent) { observer?(intent) }
    func isWaitingAndObserving() -> Bool { observer != nil && pendingPolicies.count == 1 }
    func sendCallIntent(action: NativeCallIntentAction, peer: String, sid: String, media: NativeCallMedia?) async throws {
        intents.append(NativeCallIntent(action: action, sid: sid, peer: peer, media: media))
    }
    func setCallPreferences(enabled: Bool, dnd: Bool, muted: Set<String>) async throws {
        if !supported { throw NativeCallPolicyFailure.unsupported }
        policies.append((enabled, dnd, muted))
        try await withCheckedThrowingContinuation { pendingPolicies.append($0) }
    }
    func acknowledge() { if !pendingPolicies.isEmpty { pendingPolicies.removeFirst().resume() } }
    func proveCallResource(invitation: NativeCallInvitation, registration: NativePushRegistration) async throws {}
    func bindCall(peer: String, sid: String) async throws -> UUID { UUID() }
    func exchangeJingle(binding: UUID, xml: String) async throws {}
    func replyJingle(_ request: NativeJingleRequest, rejection: NativeJingleRejection?) async throws {}
    func unbindCall(_ binding: UUID) async {}
}

@MainActor
final class NativeCallRoutingTests: XCTestCase {
    private func settle(_ condition: () async -> Bool) async {
        for _ in 0..<500 { if await condition() { return }; try? await Task.sleep(nanoseconds: 2_000_000) }
        XCTFail("Native call route did not settle")
    }
    private func login(_ fixture: CallRoutingFixture) -> NativeLoginModel {
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        model.login(address: "https://example.invalid", domain: "localhost", jid: "me@localhost", password: "fictional-test-only")
        return model
    }

    func testAuthenticatedPrivacyAckEnablesBarePeerAndMuteImmediatelyClosesRoute() async throws {
        let fixture = CallRoutingFixture(), model = login(fixture)
        defer { model.disconnect() }
        await settle { await fixture.pendingPolicies.count == 1 }
        XCTAssertNil(model.callIntentLease(for: "alice@localhost"))
        XCTAssertFalse(model.permitsLegacyCall(to: "alice@localhost"))
        await fixture.acknowledge()
        await settle { model.callPolicyState == .ready }
        let lease = try XCTUnwrap(model.callIntentLease(for: "alice@localhost"))
        XCTAssertTrue(model.permitsCallIntent(lease, peer: "alice@localhost"))
        XCTAssertFalse(model.permitsLegacyCall(to: "alice@localhost"))
        XCTAssertTrue(model.permitsLegacyCall(to: "remote@elsewhere.test"))
        model.setMuted("alice@localhost", muted: true)
        XCTAssertFalse(model.permitsCallIntent(lease, peer: "alice@localhost"))
        XCTAssertNil(model.callIntentLease(for: "alice@localhost"))
        await settle { await fixture.pendingPolicies.count == 1 }
        let policy = await fixture.policies.last
        XCTAssertEqual(policy?.2, ["alice@localhost"])
        await fixture.acknowledge()
        await settle { model.callPolicyState == .ready }
        XCTAssertFalse(model.permitsCallIntent(lease, peer: "alice@localhost"))
        model.disconnect()
        XCTAssertFalse(model.permitsCallIntent(lease, peer: "alice@localhost"))
    }

    func testIncomingIntentsWaitForPolicyAndMutedCallsAreRejectedLocally() async {
        let fixture = CallRoutingFixture(), model = login(fixture)
        defer { model.disconnect() }
        var delivered: [NativeCallIntent] = []
        model.onCallIntent = { intent, _ in delivered.append(intent) }
        await settle { await fixture.isWaitingAndObserving() }
        let proposal = NativeCallIntent(action: .propose, sid: "one", peer: "alice@localhost/phone", media: .total)
        await fixture.emit(proposal)
        try? await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertTrue(delivered.isEmpty)
        await fixture.acknowledge()
        await settle { delivered == [proposal] }
        model.setMuted("alice@localhost", muted: true)
        await settle { await fixture.pendingPolicies.count == 1 }
        await fixture.emit(NativeCallIntent(action: .propose, sid: "two", peer: proposal.peer, media: .total))
        await settle { await fixture.intents.contains { $0.sid == "two" && $0.action == .reject } }
        XCTAssertEqual(delivered.count, 1)
        await fixture.acknowledge()
        await settle { model.callPolicyState == .ready }
    }

    func testExplicitUnsupportedServerRetainsForegroundLegacyOnly() async {
        let fixture = CallRoutingFixture(supported: false), model = login(fixture)
        defer { model.disconnect() }
        await settle { model.callPolicyState == .unsupported }
        XCTAssertNil(model.callIntentLease(for: "alice@localhost"))
        XCTAssertTrue(model.permitsLegacyCall(to: "alice@localhost"))
        model.setMuted("alice@localhost", muted: true)
        XCTAssertFalse(model.permitsLegacyCall(to: "alice@localhost"))
    }
}
