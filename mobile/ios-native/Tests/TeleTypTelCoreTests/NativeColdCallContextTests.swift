import XCTest
@testable import TeleTypTelCore

@MainActor
private final class ColdPushStore: NativePushStoring {
    var value: NativePushRecord?
    func load() throws -> NativePushRecord? { value }
    func save(_ record: NativePushRecord) throws { value = record }
    func remove() throws { value = nil }
}

@MainActor
private final class ColdPushDriver: NativePushRegistering {
    var pushCallActive = false
    var registrations = 0
    func startPushRegistration(tokenChanged: @escaping (Data?) -> Void) -> Bool { registrations += 1; return true }
    func stopPushRegistration() {}
    func confirmPushRevocation() {}
}

@MainActor
final class NativeColdCallContextTests: XCTestCase {
    private func authorization(owner: String = "bob@localhost", domain: String = "localhost", expires: TimeInterval = 180,
                               credential: String = "tcd1." + String(repeating: "a", count: 200)) -> NativeCallRecoveryAuthorization {
        NativeCallRecoveryAuthorization(version: 1, credential: credential, owner: owner, domain: domain,
            issuer: "fixture", environment: "production", expiresAt: expires)
    }
    private func record() -> NativePushRecord {
        NativePushRecord(scope: NativePushScope(origin: "https://example.invalid", accountID: "fictional-account"),
            deviceID: UUID(), consented: true, pendingRevocation: false, generation: String(repeating: "a", count: 32),
            expiresAt: 200, controlCredential: "not-used-for-bootstrap", recovery: authorization())
    }

    func testRestoreIsCallOnlyAndDoesNotReuseControlCredential() throws {
        let saved = record(), context = try NativeColdCallContext.restore(saved, now: 100)
        XCTAssertEqual(context.configuration.webSocket.absoluteString, "wss://example.invalid/xmpp-websocket")
        XCTAssertEqual(context.scope, saved.scope)
        XCTAssertEqual(context.registration.deviceID, saved.deviceID)
        XCTAssertNil(context.registration.controlCredential)
        XCTAssertEqual(String(reflecting: context), "NativeColdCallContext(redacted)")
        XCTAssertEqual(String(reflecting: context.authorization), "NativeCallRecoveryAuthorization(redacted)")
        let decoded = try JSONDecoder().decode(NativePushRecord.self, from: JSONEncoder().encode(saved))
        XCTAssertNoThrow(try NativeColdCallContext.restore(decoded, now: 100))
    }

    func testMissingAuthorizationRevokedConsentGenerationAndExpiredRecordsAreRejected() throws {
        var cases: [NativePushRecord] = []
        var changed = record(); changed.consented = false; cases.append(changed)
        changed = record(); changed.pendingRevocation = true; cases.append(changed)
        changed = record(); changed.recovery = nil; cases.append(changed)
        changed = record(); changed.generation = "wrong"; cases.append(changed)
        changed = record(); changed.expiresAt = 99; cases.append(changed)
        changed = record(); changed.recovery = authorization(expires: 100); cases.append(changed)
        changed = record(); changed.recovery = authorization(owner: "alice@foreign.test"); cases.append(changed)
        changed = record(); changed.recovery = authorization(credential: "ordinary-password"); cases.append(changed)
        for value in cases { XCTAssertThrowsError(try NativeColdCallContext.restore(value, now: 100)) }
        XCTAssertThrowsError(try NativeColdCallContext.restore(record(), now: .nan))
    }

    func testRestoringConsentDoesNotRegisterBeforeAppDelegateHasInstalledCallKit() throws {
        let store = ColdPushStore(), driver = ColdPushDriver(); store.value = record()
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver, now: { 100 })
        XCTAssertNotNil(model.restoreColdRegistration())
        XCTAssertEqual(driver.registrations, 0)
        XCTAssertNotNil(model.coldCallContext())
        XCTAssertNil(model.restoreColdRegistration())
        model.logout()
        XCTAssertNil(model.coldCallContext())
        XCTAssertNil(store.value?.recovery)
        XCTAssertEqual(store.value?.pendingRevocation, true)
    }

    func testDisabledBuildDoesNotRestoreAndInvalidationClearsRecovery() throws {
        let store = ColdPushStore(), driver = ColdPushDriver(); store.value = record()
        let disabled = NativePushRegistrationModel(enabled: false, store: store, driver: driver, now: { 100 })
        XCTAssertNil(disabled.restoreColdRegistration())
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver, now: { 100 })
        XCTAssertNotNil(model.restoreColdRegistration())
        model.restoredTokenChanged(nil)
        XCTAssertNil(model.coldCallContext())
        XCTAssertFalse(model.consented)
    }

    func testForegroundLoginReattachesRestoredRegistrationWithoutRevokingIt() async throws {
        struct ReadyRegistry: NativePushRegistryServing {
            func backgroundAnswerReady() async throws -> Bool { true }
            func register(deviceID: UUID, token: Data, consented: Bool) async throws -> NativePushRegistration {
                XCTFail("No new token was supplied")
                throw NativePushRegistryFailure.rejected
            }
            func revoke(deviceID: UUID) async throws { XCTFail("The account did not change") }
        }
        let store = ColdPushStore(), driver = ColdPushDriver(), saved = record()
        store.value = saved
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver, now: { 100 })
        XCTAssertNotNil(model.restoreColdRegistration())
        await model.connect(ReadyRegistry(), scope: saved.scope)
        model.setForeground(false)
        XCTAssertEqual(model.coldCallContext()?.registration.deviceID, saved.deviceID)
        XCTAssertTrue(model.consented)
        XCTAssertEqual(store.value?.pendingRevocation, false)
        XCTAssertEqual(driver.registrations, 0)
    }

    func testClientRejectsOtherDeviceBeforeAnyNetworkRequest() async throws {
        let context = try NativeColdCallContext.restore(record(), now: 100)
        let client = NativeCallRecoveryClient(context: context, now: { 100 })
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "call-1", expiresAt: 140, media: .total, now: 100))
        let wrong = NativePushRegistration(deviceID: UUID(), generation: context.registration.generation, expiresAt: 200, controlCredential: nil)
        do { _ = try await client.bootstrap(invitation: invitation, registration: wrong); XCTFail("Wrong device accepted") }
        catch { XCTAssertEqual(error as? NativePushRegistryFailure, .rejected) }
    }
}
