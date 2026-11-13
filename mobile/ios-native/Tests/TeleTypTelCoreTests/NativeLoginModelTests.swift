import XCTest
@testable import TeleTypTelCore

private actor LoginFixture: ServerChecking, NativeAccountAuthenticating, NativeXMPPConnecting, NativeArchiveSending {
    private struct Run {
        let account: NativeAuthenticatedAccount
        let ready: @Sendable (String) -> Void
        let roster: @Sendable (NativeRosterState) -> Void
        let chat: @Sendable (NativeChatEvent) -> Void
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
    let holdSends: Bool
    private var sentBodies: [String] = []
    private var archiveRequests = 0
    private var pendingArchives: [(CheckedContinuation<NativeArchivePage, Error>, NativeArchivePage)] = []
    private let holdArchive: Bool
    private let wrongArchiveOwner: Bool

    init(accountError: NativeAccountFailure? = nil, probeError: ConnectionFailure? = nil,
         holdAuthentication: Bool = false, wrongAccount: Bool = false, holdSends: Bool = false,
         holdArchive: Bool = false, wrongArchiveOwner: Bool = false) {
        self.accountError = accountError
        self.probeError = probeError
        self.holdAuthentication = holdAuthentication
        self.wrongAccount = wrongAccount
        self.holdSends = holdSends
        self.holdArchive = holdArchive
        self.wrongArchiveOwner = wrongArchiveOwner
    }

    func history() -> [String] { events }
    func runCount() -> Int { identifiers.count }
    func cancellationCount() -> Int { cancelled.count }
    func hasPendingAuthentication() -> Bool { pendingAuthentication != nil }
    func sentMessages() -> [String] { sentBodies }
    func archiveRequestCount() -> Int { archiveRequests }

    func fetchArchive(peer: String, before: String?) async throws -> NativeArchivePage {
        archiveRequests += 1
        let owner = wrongArchiveOwner ? "other@localhost" : runs[identifiers.last!]?.account.jid ?? "invalid@localhost"
        let text = NativeArchivedText(archiveID: "historical", identifier: "historical", peer: peer,
            body: "Eerder opgeslagen tekst", date: Date(timeIntervalSince1970: 1793528430), outgoing: false)
        let page = NativeArchivePage(owner: owner, peer: peer, messages: [text], first: "historical", hasEarlier: false)
        if holdArchive { return try await withCheckedThrowingContinuation { pendingArchives.append(($0, page)) } }
        return page
    }

    func releaseArchives() {
        let replies = pendingArchives
        pendingArchives.removeAll()
        for (continuation, page) in replies { continuation.resume(returning: page) }
    }

    func sendMessage(to jid: String, body: String, identifier: String) async throws {
        sentBodies.append(body)
        if holdSends { try await Task.sleep(nanoseconds: 60_000_000_000) }
    }

    func message(_ index: Int, event: NativeChatEvent) {
        guard identifiers.indices.contains(index), let run = runs[identifiers[index]] else { return }
        run.chat(event)
    }

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
        try await run(account: account, onConnected: onConnected, onRoster: onRoster, onChat: { _ in }, onSender: { _ in })
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws {
        let identifier = UUID()
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                events.append("xmpp")
                identifiers.append(identifier)
                runs[identifier] = Run(account: account, ready: onConnected, roster: onRoster, chat: onChat, continuation: continuation)
                onSender(self)
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
        NativeContact(jid: "peer@localhost", name: "Testcontact", groups: [], subscription: "both", presence: .online)
    ])

    @MainActor
    func testHistoryReloadsAfterFreshLoginDeduplicatesAndDoesNotSendArchivedText() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0)
        await fixture.roster(0, state: contacts)
        await eventually { model.canSend && model.roster == self.contacts }
        model.loadHistory(for: "stranger@localhost")
        let before = await fixture.archiveRequestCount()
        XCTAssertEqual(before, 0)
        model.loadHistory(for: "peer@localhost")
        await eventually { model.historyStates["peer@localhost"] == .ready }
        XCTAssertEqual(model.chat.messages.count, 1)
        model.setDraft("Mijn concept", peer: "peer@localhost")
        model.loadHistory(for: "peer@localhost", refresh: true)
        await eventually { model.historyStates["peer@localhost"] == .ready }
        XCTAssertEqual(model.chat.messages.count, 1)
        XCTAssertEqual(model.chat.drafts["peer@localhost"], "Mijn concept")
        let sent = await fixture.sentMessages()
        XCTAssertTrue(sent.isEmpty)
        model.disconnect()
        XCTAssertTrue(model.chat.messages.isEmpty)
        XCTAssertTrue(model.historyStates.isEmpty)
        start(model)
        await eventually { await fixture.runCount() == 2 }
        await fixture.ready(1)
        await fixture.roster(1, state: contacts)
        await eventually { model.canSend && model.roster == self.contacts }
        model.loadHistory(for: "peer@localhost")
        await eventually { model.historyStates["peer@localhost"] == .ready }
        XCTAssertEqual(model.chat.messages.first?.body, "Eerder opgeslagen tekst")
        model.disconnect()
    }

    @MainActor
    func testForeignArchiveOwnerAndLateHistoryAfterLogoutAreRejected() async {
        let foreign = LoginFixture(wrongArchiveOwner: true)
        let first = model(foreign)
        start(first)
        await eventually { await foreign.runCount() == 1 }
        await foreign.ready(0)
        await foreign.roster(0, state: contacts)
        await eventually { first.canSend && first.roster == self.contacts }
        first.loadHistory(for: "peer@localhost")
        await eventually { first.historyStates["peer@localhost"] == .failed }
        XCTAssertTrue(first.chat.messages.isEmpty)
        XCTAssertTrue(first.isConnected)
        first.disconnect()

        let delayed = LoginFixture(holdArchive: true)
        let second = model(delayed)
        start(second)
        await eventually { await delayed.runCount() == 1 }
        await delayed.ready(0)
        await delayed.roster(0, state: contacts)
        await eventually { second.canSend && second.roster == self.contacts }
        second.loadHistory(for: "peer@localhost")
        await eventually { await delayed.archiveRequestCount() == 1 }
        second.disconnect()
        await delayed.releaseArchives()
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(second.chat.messages.isEmpty)
        XCTAssertTrue(second.historyStates.isEmpty)
        XCTAssertEqual(second.phase, .signedOut)
    }

    @MainActor
    func testChatSendReceiveAndResumePreserveDraftWithoutResending() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0)
        await fixture.message(0, event: .message(peer: "peer@localhost", identifier: "early", body: "Hoi"))
        await fixture.roster(0, state: contacts)
        await eventually { model.canSend && model.chat.messages.count == 1 }
        model.setDraft("Hallo 👋", peer: "peer@localhost")
        model.sendDraft(to: "peer@localhost")
        await eventually { model.chat.messages.last?.state == .submitted }
        XCTAssertNil(model.chat.drafts["peer@localhost"])
        model.setDraft("Nog niet verzonden", peer: "peer@localhost")
        model.beginBackground()
        XCTAssertFalse(model.canSend)
        model.sendDraft(to: "peer@localhost")
        XCTAssertEqual(model.chat.drafts["peer@localhost"], "Nog niet verzonden")
        model.suspend()
        model.resume()
        await eventually { await fixture.runCount() == 2 }
        await fixture.ready(1)
        await fixture.roster(1, state: contacts)
        await eventually { model.canSend }
        XCTAssertEqual(model.chat.messages.count, 2)
        XCTAssertEqual(model.chat.drafts["peer@localhost"], "Nog niet verzonden")
        let events = await fixture.history()
        XCTAssertEqual(events, ["probe", "account", "xmpp", "probe", "xmpp"])
        let sent = await fixture.sentMessages()
        XCTAssertEqual(sent, ["Hallo 👋"])
        model.disconnect()
        model.resume()
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertTrue(model.chat.messages.isEmpty)
        XCTAssertTrue(model.chat.drafts.isEmpty)
    }

    @MainActor
    func testInterruptedSendIsUncertainAndLateMessagesAreIgnored() async {
        let fixture = LoginFixture(holdSends: true)
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0)
        await fixture.roster(0, state: contacts)
        await eventually { model.canSend && model.roster == self.contacts }
        model.setDraft("Behoud deze tekst", peer: "peer@localhost")
        model.sendDraft(to: "peer@localhost")
        await eventually { await fixture.sentMessages().count == 1 }
        model.suspend()
        XCTAssertEqual(model.chat.messages.first?.state, .uncertain)
        XCTAssertEqual(model.chat.messages.first?.body, "Behoud deze tekst")
        await fixture.message(0, event: .message(peer: "peer@localhost", identifier: "late", body: "Oude sessie"))
        try? await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(model.chat.messages.count, 1)
        model.resume()
        await eventually { await fixture.runCount() == 2 }
        await fixture.ready(1)
        await fixture.roster(1, state: contacts)
        await eventually { model.canSend }
        XCTAssertEqual(model.chat.messages.first?.state, .uncertain)
        let sent = await fixture.sentMessages()
        XCTAssertEqual(sent.count, 1)
        model.disconnect()
    }

    @MainActor
    func testUnknownSendersAndPreviousAccountCannotInjectChat() async {
        let fixture = LoginFixture()
        let model = model(fixture)
        start(model)
        await eventually { await fixture.runCount() == 1 }
        await fixture.ready(0)
        await fixture.roster(0, state: contacts)
        await eventually { model.canSend && model.roster == self.contacts }
        await fixture.message(0, event: .message(peer: "unknown@localhost", identifier: "spam", body: "Onbekend"))
        try? await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertTrue(model.chat.messages.isEmpty)
        start(model, jid: "second@localhost")
        await eventually { await fixture.runCount() == 2 }
        await fixture.ready(1)
        await fixture.roster(1, state: contacts)
        await eventually { model.canSend }
        await fixture.message(0, event: .message(peer: "peer@localhost", identifier: "old", body: "Ander account"))
        try? await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertTrue(model.chat.messages.isEmpty)
        model.disconnect()
    }

    @MainActor
    func testOversizedDraftLeavesPreviousTextAndExplainsLimit() {
        let fixture = LoginFixture()
        let model = model(fixture)
        model.setDraft("Bewaren", peer: "peer@localhost")
        model.setDraft(String(repeating: "a", count: 8193), peer: "peer@localhost")
        XCTAssertEqual(model.chat.drafts["peer@localhost"], "Bewaren")
        XCTAssertNotNil(model.chatError)
    }

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
