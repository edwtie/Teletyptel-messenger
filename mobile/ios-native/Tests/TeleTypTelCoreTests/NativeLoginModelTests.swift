import XCTest
@testable import TeleTypTelCore

private actor LoginFixture: ServerChecking, NativeAccountAuthenticating, NativeXMPPConnecting {
    private struct Run {
        let account: NativeAuthenticatedAccount
        let ready: @Sendable (String) -> Void
        let roster: @Sendable (NativeRosterState) -> Void
        var continuation: CheckedContinuation<Void, Error>?
    }

    private var events: [String] = []
    private var runs: [UUID: Run] = [:]
    private var identifiers: [UUID] = []
    private var cancelled = Set<UUID>()
    private var pendingAuthentication: CheckedContinuation<NativeAuthenticatedAccount, Error>?
    private var pendingAccount: NativeAuthenticatedAccount?
    let accountError: NativeAccountFailure?
    let probeError: ConnectionFailure?
    let holdAuthentication: Bool
    let wrongAccount: Bool

    init(accountError: NativeAccountFailure? = nil, probeError: ConnectionFailure? = nil,
         holdAuthentication: Bool = false, wrongAccount: Bool = false) {
        self.accountError = accountError
        self.probeError = probeError
        self.holdAuthentication = holdAuthentication
        self.wrongAccount = wrongAccount
    }

    func history() -> [String] { events }
    func runCount() -> Int { identifiers.count }
    func cancellationCount() -> Int { cancelled.count }
    func hasPendingAuthentication() -> Bool { pendingAuthentication != nil }

    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport {
        events.append("probe")
        if let probeError = probeError { throw probeError }
        return ProbeReport(mechanisms: ["PLAIN"])
    }

    func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        events.append("account")
        if let accountError = accountError { throw accountError }
        let account = NativeAuthenticatedAccount(configuration: configuration,
                                                 jid: wrongAccount ? "wrong@localhost" : jid, password: password)
        if holdAuthentication {
            pendingAccount = account
            return try await withCheckedThrowingContinuation { pendingAuthentication = $0 }
        }
        return account
    }

    func releaseAuthentication() {
        if let account = pendingAccount { pendingAuthentication?.resume(returning: account) }
        pendingAccount = nil
        pendingAuthentication = nil
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        try await run(account: account, onConnected: onConnected, onRoster: { _ in })
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws {
        let identifier = UUID()
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                events.append("xmpp")
                identifiers.append(identifier)
                runs[identifier] = Run(account: account, ready: onConnected, roster: onRoster, continuation: continuation)
                if cancelled.contains(identifier) { finish(identifier, error: CancellationError()) }
            }
        }, onCancel: {
            Task { await self.cancel(identifier) }
        })
    }

    func ready(_ index: Int, jid: String? = nil) {
        guard identifiers.indices.contains(index), let run = runs[identifiers[index]] else { return }
        run.ready(jid ?? run.account.jid + "/fixture")
    }

    func fail(_ index: Int, error: Error) {
        guard identifiers.indices.contains(index) else { return }
        finish(identifiers[index], error: error)
    }

    func roster(_ index: Int, state: NativeRosterState) {
        guard identifiers.indices.contains(index), let run = runs[identifiers[index]] else { return }
        run.roster(state)
    }

    private func cancel(_ identifier: UUID) {
        cancelled.insert(identifier)
        finish(identifier, error: CancellationError())
    }

    private func finish(_ identifier: UUID, error: Error) {
        let continuation = runs[identifier]?.continuation
        runs[identifier]?.continuation = nil
        continuation?.resume(throwing: error)
    }
}

final class NativeLoginModelTests: XCTestCase {
    private let contacts: NativeRosterState = .ready([
        NativeContact(jid: "peer@localhost", name: "Testcontact", groups: [], subscription: "both")
    ])

    @MainActor
    func testRosterClearsOnLogoutSuspendAndFailureAndRejectsLateUpdates() async {
        for action in ["logout", "suspend", "failure"] {
            let fixture = LoginFixture()
            let model = model(fixture)
            start(model)
            await eventually { await fixture.runCount() == 1 }
            await fixture.ready(0)
            await fixture.roster(0, state: contacts)
            await eventually { model.isConnected && model.roster == self.contacts }
            if action == "logout" { model.disconnect() }
            else if action == "suspend" { model.suspend() }
            else {
                await fixture.fail(0, error: XMPPSessionFailure.heartbeatTimeout)
                await eventually { !model.isConnected }
            }
            XCTAssertEqual(model.roster, .idle)
            await fixture.roster(0, state: contacts)
            try? await Task.sleep(nanoseconds: 20_000_000)
            XCTAssertEqual(model.roster, .idle)
        }
    }

    @MainActor
    func testRosterOfPreviousAccountCannotReplaceNewAccount() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0)
        await fixture.roster(0, state: contacts)
        await eventually { model.roster == self.contacts }
        start(model, jid: "second@localhost")
        XCTAssertEqual(model.roster, .idle)
        await eventually { await fixture.runCount() == 2 }
        await fixture.ready(1)
        await fixture.roster(1, state: .ready([]))
        await eventually { model.roster == .ready([]) }
        await fixture.roster(0, state: contacts)
        try? await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(model.roster, .ready([]))
        model.disconnect()
    }

    @MainActor
    private func model(_ fixture: LoginFixture) -> NativeLoginModel {
        NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
    }

    @MainActor
    private func start(_ model: NativeLoginModel, jid: String = "fixture@localhost") {
        model.login(address: "https://example.invalid", domain: "localhost", jid: jid, password: "fake-only")
    }

    @MainActor
    private func eventually(_ condition: @escaping @MainActor () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<200 {
            if await condition() { return }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Condition was not reached", file: file, line: line)
    }

    @MainActor
    func testLoginRequiresProbeThenAccountThenConfirmedXmpp() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        XCTAssertEqual(model.phase, .connecting)
        XCTAssertFalse(model.isConnected)
        let events = await fixture.history()
        XCTAssertEqual(events, ["probe", "account", "xmpp"])
        await fixture.ready(0)
        await eventually { model.phase == .connected("fixture@localhost") }
        model.disconnect()
        XCTAssertEqual(model.phase, .signedOut)
        await eventually { await fixture.cancellationCount() == 1 }
    }

    @MainActor
    func testFailedProbeNeverSendsCredentials() async {
        let fixture = LoginFixture(probeError: .certificate)
        let model = model(fixture)
        start(model)
        await eventually { model.phase == .failed(.connection(.certificate)) }
        let events = await fixture.history()
        XCTAssertEqual(events, ["probe"])
    }

    @MainActor
    func testTwoFactorAndRejectedAccountNeverStartXmpp() async {
        for error in [NativeAccountFailure.twoFactorRequired, .invalidCredentials, .rejected] {
            let fixture = LoginFixture(accountError: error)
            let model = model(fixture)
            start(model)
            await eventually { model.phase == .failed(.account(error)) }
            let events = await fixture.history()
            XCTAssertEqual(events, ["probe", "account"])
        }
    }

    @MainActor
    func testInvalidConfigurationOrCredentialsDoNotStartNetwork() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        model.login(address: "http://example.invalid", domain: "localhost", jid: "fixture@localhost", password: "fake")
        XCTAssertEqual(model.phase, .failed(.connection(.configuration)))
        model.login(address: "https://example.invalid", domain: "localhost", jid: "fixture@other", password: "fake")
        XCTAssertEqual(model.phase, .failed(.account(.invalidCredentials)))
        let events = await fixture.history()
        XCTAssertTrue(events.isEmpty)
    }

    @MainActor
    func testResetDuringLoginIgnoresLateAccountResponse() async {
        let fixture = LoginFixture(holdAuthentication: true)
        let model = model(fixture)
        start(model)
        await eventually { await fixture.hasPendingAuthentication() }
        model.reset()
        await fixture.releaseAuthentication()
        await Task.yield()
        XCTAssertEqual(model.phase, .idle)
        let events = await fixture.history()
        XCTAssertEqual(events, ["probe", "account"])
    }

    @MainActor
    func testAccountSwitchRejectsOldConnectionCallbacks() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        start(model, jid: "second@localhost")
        await eventually { await fixture.runCount() == 2 }
        await fixture.ready(0)
        await fixture.ready(1)
        await eventually { model.phase == .connected("second@localhost") }
        await fixture.ready(0)
        await Task.yield()
        XCTAssertEqual(model.phase, .connected("second@localhost"))
        model.disconnect()
    }

    @MainActor
    func testDisconnectAndSuspendCannotBeReversedByLateReady() async {
        for suspend in [false, true] {
            let fixture = LoginFixture()
            let model = model(fixture)
            start(model)
            await eventually { await fixture.runCount() == 1 }
            await fixture.ready(0)
            await eventually { model.isConnected }
            if suspend { model.suspend() } else { model.disconnect() }
            await fixture.ready(0)
            await Task.yield()
            XCTAssertEqual(model.phase, suspend ? .suspended : .signedOut)
            await eventually { await fixture.cancellationCount() == 1 }
        }
    }

    @MainActor
    func testConnectionLossClearsOnlineAndRejectsLateReady() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0)
        await eventually { model.isConnected }
        await fixture.fail(0, error: XMPPSessionFailure.heartbeatTimeout)
        await eventually { model.phase == .failed(.xmpp(.heartbeatTimeout)) }
        await fixture.ready(0)
        await Task.yield()
        XCTAssertFalse(model.isConnected)
    }

    @MainActor
    func testWrongBackendAccountAndWrongBoundJidAreRejected() async {
        let wrong = LoginFixture(wrongAccount: true)
        let wrongModel = model(wrong)
        start(wrongModel)
        await eventually { wrongModel.phase == .failed(.account(.invalidResponse)) }
        let count = await wrong.runCount()
        XCTAssertEqual(count, 0)
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0, jid: "wrong@localhost/resource")
        await eventually { model.phase == .failed(.connection(.invalidResponse)) }
        await eventually { await fixture.cancellationCount() == 1 }
    }
}
