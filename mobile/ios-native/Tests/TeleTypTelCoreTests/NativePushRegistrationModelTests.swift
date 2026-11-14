import Foundation
import XCTest
@testable import TeleTypTelCore

@MainActor
private final class PushStoreFixture: NativePushStoring {
    var value: NativePushRecord?
    var reads = 0
    var failWrites = false
    func load() throws -> NativePushRecord? { reads += 1; return value }
    func save(_ record: NativePushRecord) throws {
        if failWrites { throw NativePushRegistryFailure.unavailable }
        value = record
    }
    func remove() throws { value = nil }
}

@MainActor
private final class PushDriverFixture: NativePushRegistering {
    var pushCallActive = false
    var starts = 0, stops = 0, confirmations = 0
    var changed: ((Data?) -> Void)?
    func startPushRegistration(tokenChanged: @escaping (Data?) -> Void) -> Bool {
        starts += 1; changed = tokenChanged; return true
    }
    func stopPushRegistration() { stops += 1; changed = nil }
    func confirmPushRevocation() { confirmations += 1 }
}

@MainActor
private final class PushRegistryFixture: NativePushRegistryServing {
    var ready = true, failRevoke = false
    var requests: [String] = []
    var delayed = false
    var pending: CheckedContinuation<NativePushRegistration, Error>?
    var lastDevice: UUID?
    func backgroundAnswerReady() async throws -> Bool { requests.append("ready"); return ready }
    func register(deviceID: UUID, token: Data, consented: Bool) async throws -> NativePushRegistration {
        requests.append("register"); lastDevice = deviceID
        if delayed { return try await withCheckedThrowingContinuation { pending = $0 } }
        return reply(deviceID)
    }
    func reply(_ identifier: UUID) -> NativePushRegistration {
        NativePushRegistration(deviceID: identifier, generation: String(repeating: "a", count: 32),
            expiresAt: Date().timeIntervalSince1970 + 86400, controlCredential: "fictitious-scoped-control-not-a-chat-password")
    }
    func revoke(deviceID: UUID) async throws {
        requests.append("revoke")
        if failRevoke { throw NativePushRegistryFailure.unavailable }
    }
}

@MainActor
final class NativePushRegistrationModelTests: XCTestCase {
    private let scope = NativePushScope(origin: "https://example.invalid", accountID: "fiction")
    private func settle(_ predicate: () -> Bool) async {
        for _ in 0..<100 { if predicate() { return }; await Task.yield() }
        XCTAssertTrue(predicate())
    }

    func testDisabledTargetAndUnavailableRecoveryNeverRegisterOrReadCredentials() async {
        let store = PushStoreFixture(), driver = PushDriverFixture(), client = PushRegistryFixture()
        let disabled = NativePushRegistrationModel(enabled: false, store: store, driver: driver)
        await disabled.connect(client, scope: scope); await disabled.enable(consented: true)
        XCTAssertEqual(store.reads, 0); XCTAssertTrue(client.requests.isEmpty); XCTAssertEqual(driver.starts, 0)
        client.ready = false
        let unavailable = NativePushRegistrationModel(enabled: true, store: store, driver: driver)
        await unavailable.connect(client, scope: scope); await unavailable.enable(consented: true)
        XCTAssertFalse(unavailable.available); XCTAssertEqual(driver.starts, 0); XCTAssertNil(store.value)
    }

    func testExplicitConsentPrecedesTokenRegistrationAndStateIsRedacted() async throws {
        let store = PushStoreFixture(), driver = PushDriverFixture(), client = PushRegistryFixture()
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver)
        await model.connect(client, scope: scope); await model.enable(consented: false)
        XCTAssertEqual(driver.starts, 0); XCTAssertNil(store.value)
        await model.enable(consented: true)
        XCTAssertEqual(driver.starts, 1); XCTAssertEqual(store.value?.pendingRevocation, true)
        XCTAssertEqual(client.requests, ["ready"])
        driver.changed?(Data(repeating: 42, count: 32))
        await settle { !model.busy && client.requests.contains("register") }
        let saved = try XCTUnwrap(store.value)
        XCTAssertEqual(saved.scope, scope); XCTAssertTrue(saved.consented); XCTAssertFalse(saved.pendingRevocation)
        XCTAssertNotNil(saved.controlCredential)
        XCTAssertEqual(String(reflecting: saved), "NativePushRecord(redacted)")
        XCTAssertFalse(String(data: try JSONEncoder().encode(saved), encoding: .utf8)!.contains("2a2a2a2a"))
    }

    func testRevocationWaitsForRegistrationAndLateReplyCannotRestoreConsent() async throws {
        let store = PushStoreFixture(), driver = PushDriverFixture(), client = PushRegistryFixture()
        client.delayed = true
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver)
        await model.connect(client, scope: scope); await model.enable(consented: true)
        driver.changed?(Data(repeating: 42, count: 32))
        await settle { client.pending != nil }
        let revoke = Task { await model.disable() }
        await settle { !model.consented }
        XCTAssertEqual(store.value?.pendingRevocation, true); XCTAssertNil(store.value?.controlCredential)
        XCTAssertFalse(client.requests.contains("revoke"))
        client.pending?.resume(returning: client.reply(try XCTUnwrap(client.lastDevice))); client.pending = nil
        await revoke.value
        XCTAssertEqual(client.requests, ["ready", "register", "revoke"])
        XCTAssertNil(store.value); XCTAssertFalse(model.consented); XCTAssertEqual(driver.confirmations, 1)
    }

    func testLogoutAndOfflineRevocationSurviveRelaunchAndCannotMoveToAnotherAccount() async {
        let store = PushStoreFixture(), driver = PushDriverFixture(), client = PushRegistryFixture()
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver)
        await model.connect(client, scope: scope); await model.enable(consented: true)
        model.logout()
        XCTAssertEqual(store.value?.consented, false); XCTAssertEqual(store.value?.pendingRevocation, true)
        let other = NativePushRegistrationModel(enabled: true, store: store, driver: driver)
        let before = client.requests
        await other.connect(client, scope: NativePushScope(origin: scope.origin, accountID: "other"))
        XCTAssertFalse(other.available); XCTAssertEqual(client.requests, before)
        client.failRevoke = true
        await other.connect(client, scope: scope)
        XCTAssertEqual(store.value?.pendingRevocation, true); XCTAssertFalse(other.available)
        client.failRevoke = false
        await other.connect(client, scope: scope)
        XCTAssertNil(store.value); XCTAssertTrue(other.available); XCTAssertFalse(other.consented)
    }

    func testStorageFailureNeverEnablesPushAndTokenRenewalWaitsForCallAndForeground() async {
        let store = PushStoreFixture(), driver = PushDriverFixture(), client = PushRegistryFixture()
        let model = NativePushRegistrationModel(enabled: true, store: store, driver: driver)
        await model.connect(client, scope: scope)
        store.failWrites = true
        await model.enable(consented: true)
        XCTAssertEqual(driver.starts, 0); XCTAssertFalse(model.consented)
        store.failWrites = false
        await model.connect(client, scope: scope); await model.enable(consented: true)
        driver.pushCallActive = true
        driver.changed?(Data(repeating: 42, count: 32))
        XCTAssertFalse(client.requests.contains("register"))
        model.setForeground(false); driver.pushCallActive = false; model.flushToken()
        XCTAssertFalse(client.requests.contains("register"))
        model.setForeground(true)
        await settle { !model.busy && client.requests.contains("register") }
        XCTAssertTrue(model.consented)
    }
}
