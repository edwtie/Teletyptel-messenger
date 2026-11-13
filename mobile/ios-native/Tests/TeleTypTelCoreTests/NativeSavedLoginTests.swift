import XCTest
@testable import TeleTypTelCore

@MainActor
private final class LoginVaultFixture: NativeLoginVault {
    var value: NativeSavedLogin?
    var saves = 0
    var loads = 0
    var removals = 0
    var fail = false
    var hold = false
    var pending: CheckedContinuation<NativeSavedLogin, Error>?
    var containsLogin: Bool { value != nil }
    var automaticRestoreAllowed = false

    func save(_ login: NativeSavedLogin) async throws {
        if fail { throw NativeAccountFailure.rejected }
        saves += 1
        value = login
        automaticRestoreAllowed = true
    }

    func load() async throws -> NativeSavedLogin {
        loads += 1
        if hold { return try await withCheckedThrowingContinuation { pending = $0 } }
        guard !fail, let value = value else { throw NativeAccountFailure.rejected }
        return value
    }

    func remove() throws {
        automaticRestoreAllowed = false
        if fail { throw NativeAccountFailure.rejected }
        removals += 1
        value = nil
    }

    func cancel() {}
}

@MainActor
final class NativeSavedLoginTests: XCTestCase {
    private func credential() throws -> NativeSavedLogin {
        try NativeSavedLogin(address: "https://example.invalid", domain: "localhost",
                             jid: "fiction@localhost", password: "fictional-secret")
    }

    private func prepare(_ model: NativeSavedLoginModel, consented: Bool = true) {
        model.prepare(address: "https://example.invalid", domain: "localhost",
                      jid: "fiction@localhost", password: "fictional-secret", consented: consented)
    }

    private func settle(_ model: NativeSavedLoginModel) async {
        for _ in 0..<500 {
            if !model.isWorking { return }
            await Task.yield()
        }
        XCTFail("Saved-login task did not finish")
    }

    func testPayloadRoundTripValidationAndRedaction() throws {
        let source = try credential()
        let restored = try NativeSavedLogin.decode(JSONEncoder().encode(source))
        XCTAssertEqual(restored.jid, source.jid)
        XCTAssertEqual(restored.password, source.password)
        XCTAssertEqual(String(describing: source), "NativeSavedLogin(redacted)")
        XCTAssertEqual(String(reflecting: source), "NativeSavedLogin(redacted)")
        for address in ["http://example.invalid", "https://example.invalid/other", "https://other:secret@example.invalid"] {
            XCTAssertThrowsError(try NativeSavedLogin(address: address, domain: "localhost", jid: source.jid, password: source.password))
        }
        XCTAssertThrowsError(try NativeSavedLogin.decode(Data(repeating: 32, count: 8193)))
        let invalid = Data(#"{"address":"https://example.invalid","domain":"localhost","jid":"wrong@other.invalid","password":"secret"}"#.utf8)
        XCTAssertThrowsError(try NativeSavedLogin.decode(invalid))
    }

    func testNoSaveWithoutConsentOrBeforeConfirmedXMPPLogin() async {
        let vault = LoginVaultFixture()
        let model = NativeSavedLoginModel(vault: vault)
        prepare(model, consented: false)
        model.connected(jid: "fiction@localhost")
        await settle(model)
        XCTAssertEqual(vault.saves, 0)
        prepare(model)
        XCTAssertEqual(vault.saves, 0)
        model.connected(jid: "wrong@localhost")
        await settle(model)
        XCTAssertEqual(vault.saves, 0)
    }

    func testConfirmedMatchingLoginSavesOnce() async {
        let vault = LoginVaultFixture()
        let model = NativeSavedLoginModel(vault: vault)
        prepare(model)
        model.connected(jid: "fiction@localhost")
        await settle(model)
        model.connected(jid: "fiction@localhost")
        XCTAssertEqual(vault.saves, 1)
        XCTAssertTrue(model.hasSavedLogin)
        XCTAssertTrue(model.canRestoreAutomatically)
    }

    func testCancelledLoginCannotSaveCandidate() async {
        let vault = LoginVaultFixture()
        let model = NativeSavedLoginModel(vault: vault)
        prepare(model)
        model.cancel()
        model.connected(jid: "fiction@localhost")
        await settle(model)
        XCTAssertEqual(vault.saves, 0)
    }

    func testUnlockHasNoImplicitNetworkAndReturnsOnlyAfterVaultSuccess() async throws {
        let vault = LoginVaultFixture()
        vault.value = try credential()
        let model = NativeSavedLoginModel(vault: vault)
        XCTAssertEqual(vault.loads, 0)
        var returned: String?
        model.unlock { returned = $0.jid }
        await settle(model)
        XCTAssertEqual(returned, "fiction@localhost")
        XCTAssertEqual(vault.loads, 1)
        vault.fail = true
        returned = nil
        model.unlock { returned = $0.jid }
        await settle(model)
        XCTAssertNil(returned)
        XCTAssertNotNil(model.notice)
    }

    func testForgetPreventsLateUnlockAndDeletesSavedLogin() async throws {
        let vault = LoginVaultFixture()
        let value = try credential()
        vault.value = value
        vault.hold = true
        let model = NativeSavedLoginModel(vault: vault)
        var returned = false
        model.unlock { _ in returned = true }
        for _ in 0..<500 {
            if vault.pending != nil { break }
            await Task.yield()
        }
        XCTAssertNotNil(vault.pending)
        model.forget()
        vault.pending?.resume(returning: value)
        vault.pending = nil
        for _ in 0..<20 { await Task.yield() }
        XCTAssertFalse(returned)
        XCTAssertFalse(model.hasSavedLogin)
        XCTAssertNil(vault.value)
        XCTAssertEqual(vault.removals, 1)
    }

    func testSaveAndDeleteFailuresAreVisibleAndDoNotClaimSuccess() async throws {
        let vault = LoginVaultFixture()
        vault.fail = true
        let model = NativeSavedLoginModel(vault: vault)
        prepare(model)
        model.connected(jid: "fiction@localhost")
        await settle(model)
        XCTAssertFalse(model.hasSavedLogin)
        XCTAssertNotNil(model.notice)
        vault.fail = false
        vault.value = try credential()
        let stored = NativeSavedLoginModel(vault: vault)
        vault.fail = true
        stored.forget()
        XCTAssertTrue(stored.hasSavedLogin)
        XCTAssertFalse(stored.canRestoreAutomatically)
        XCTAssertNotNil(stored.notice)
    }

    func testExistingKeychainItemAloneCannotAuthorizeAutomaticLogin() throws {
        let vault = LoginVaultFixture()
        vault.value = try credential()
        let model = NativeSavedLoginModel(vault: vault)
        XCTAssertTrue(model.hasSavedLogin)
        XCTAssertFalse(model.canRestoreAutomatically)
        XCTAssertEqual(vault.loads, 0)
    }
}
