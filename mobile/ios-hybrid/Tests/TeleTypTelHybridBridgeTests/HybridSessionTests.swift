import Foundation
import XCTest
import WebKit
#if os(macOS)
import AppKit
#endif
@testable import TeleTypTelCore
@testable import TeleTypTelHybridBridge

private final class SecondFactorFixture: NativeSecondFactorSession {
    let account: NativeAuthenticatedAccount
    init(account: NativeAuthenticatedAccount) { self.account = account }
    func cancel() {}
    func verify(code: String) async throws -> NativeAuthenticatedAccount {
        guard code == "123456" else { throw NativeSecondFactorFailure.invalidCode }
        return account
    }
}

actor SessionFixture: ServerChecking, NativeAccountChallenging, NativeXMPPConnecting, NativeChatInteracting, NativeMessageChanging, NativeGroupManaging {
    private let probeFailure: ConnectionFailure?
    private let accountFailure: NativeAccountFailure?
    private let holdAuthentication: Bool
    private let secondFactor: Bool
    private var authentication: CheckedContinuation<NativeAuthenticatedAccount, Error>?
    private var heldAccount: NativeAuthenticatedAccount?
    private(set) var connections = 0
    private var rosterObservers: [@Sendable (NativeRosterState) -> Void] = []
    private var chatObservers: [@Sendable (NativeChatEvent) -> Void] = []
    private(set) var sentBodies: [String] = []
    private(set) var interactions: [NativeChatInteraction] = []
    var rejectSends = false
    private var groupObservers: [String: @Sendable (NativeGroupEvent) -> Void] = [:]
    private(set) var groupBodies: [String] = []
    private(set) var groupInvites: [String] = []
    private(set) var groupRoles: [String] = []
    private var groupAffiliation = "none"
    private(set) var configurationSaves: [NativeRoomConfiguration] = []
    private(set) var affiliationSaves: [String] = []

    func setGroupAffiliation(_ value: String, room: String? = nil) {
        groupAffiliation = value
        if let room = room {
            var snapshot = NativeGroupSnapshot(room: room, nickname: "Fixture", participants: ["Fixture", "Peer"], canSpeak: true)
            snapshot.ownRole = "moderator"; snapshot.ownAffiliation = value
            groupObservers[room]?(.snapshot(snapshot))
        }
    }

    init(probeFailure: ConnectionFailure? = nil, accountFailure: NativeAccountFailure? = nil, holdAuthentication: Bool = false,
         secondFactor: Bool = false) {
        self.probeFailure = probeFailure
        self.accountFailure = accountFailure
        self.holdAuthentication = holdAuthentication
        self.secondFactor = secondFactor
    }

    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport {
        if let probeFailure = probeFailure { throw probeFailure }
        return ProbeReport(mechanisms: ["PLAIN"])
    }

    func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        if let accountFailure = accountFailure { throw accountFailure }
        let account = NativeAuthenticatedAccount(configuration: configuration, jid: jid, password: password)
        if holdAuthentication {
            heldAccount = account
            return try await withCheckedThrowingContinuation { authentication = $0 }
        }
        return account
    }

    func begin(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAccountLoginStep {
        let account = try await login(configuration: configuration, jid: jid, password: password)
        return secondFactor ? .challenge(SecondFactorFixture(account: account)) : .authenticated(account)
    }

    func hasPendingAuthentication() -> Bool { authentication != nil }

    func releaseAuthentication() {
        if let account = heldAccount {
            authentication?.resume(returning: account)
            authentication = nil
            heldAccount = nil
        }
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        connections += 1
        onConnected(account.jid + "/native-private-resource")
        try await Task.sleep(nanoseconds: 60_000_000_000)
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void) async throws {
        rosterObservers.append(onRoster)
        onRoster(.ready([]))
        try await run(account: account, onConnected: onConnected)
    }

    func emitRoster(_ value: NativeRosterState, run: Int? = nil) {
        let index = run ?? (rosterObservers.count - 1)
        if rosterObservers.indices.contains(index) { rosterObservers[index](value) }
    }

    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void,
             onRoster: @escaping @Sendable (NativeRosterState) -> Void,
             onChat: @escaping @Sendable (NativeChatEvent) -> Void,
             onSender: @escaping @Sendable (any NativeChatSending) -> Void) async throws {
        chatObservers.append(onChat)
        onSender(self)
        try await run(account: account, onConnected: onConnected, onRoster: onRoster)
    }

    func emitChat(_ value: NativeChatEvent) { chatObservers.last?(value) }

    func sendMessage(to jid: String, body: String, identifier: String) async throws {
        if rejectSends { throw NativeChatFailure.disconnected }
        sentBodies.append(body)
    }

    func interact(to peer: String, interaction: NativeChatInteraction, identifier: String) async throws {
        interactions.append(interaction)
    }

    func changeMessage(to peer: String, change: NativeMessageChange, identifier: String) async throws {}

    func joinGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        groupObservers[room] = onEvent
        var snapshot = NativeGroupSnapshot(room: room, nickname: nickname, participants: [nickname, "Peer"], canSpeak: true)
        snapshot.ownRole = "moderator"
        snapshot.ownAffiliation = groupAffiliation
        onEvent(.snapshot(snapshot))
    }
    func createGroup(room: String, nickname: String, onEvent: @escaping @Sendable (NativeGroupEvent) -> Void) async throws {
        try await joinGroup(room: room, nickname: nickname, onEvent: onEvent)
    }
    func sendGroup(room: String, body: String, identifier: String) async throws { groupBodies.append(body) }
    func leaveGroup(room: String) async { groupObservers[room]?(.ended(nil)) }
    func observeGroupInvitations(_ observer: @escaping @Sendable (NativeGroupInvitationEvent) -> Void) async {}
    func inviteToGroup(room: String, peer: String, identifier: String) async throws { groupInvites.append(peer) }
    func declineGroupInvitation(_ invitation: NativeGroupInvitation) async throws {}
    func setGroupSubject(room: String, subject: String) async throws { groupObservers[room]?(.subject(subject)) }
    func manageGroup(_ command: NativeGroupCommand) async throws -> NativeGroupReply {
        if case .configuration = command {
            return .configuration(NativeRoomConfiguration(name: "Familie", description: "Besloten", membersOnly: true, moderated: false,
                publicRoom: false, persistent: true, allowInvites: true, fields: ["FORM_TYPE": ["http://jabber.org/protocol/muc#roomconfig"],
                    "muc#roomconfig_roomname": ["Familie"], "muc#roomconfig_membersonly": ["1"], "custom-server-field": ["preserve-me"]]))
        }
        if case .configure(_, let form) = command { configurationSaves.append(form) }
        if case .members = command { return .members(["member@localhost"]) }
        if case .affiliation(_, let peer, let affiliation) = command { affiliationSaves.append(peer + ":" + affiliation) }
        if case .role(_, let nickname, let role) = command { groupRoles.append(nickname + ":" + role) }
        return .confirmed
    }
}

final class HybridProtocolTests: XCTestCase {
    func testOnlyExactBundledMainFrameIsTrusted() {
        XCTAssertTrue(HybridDocumentPolicy.permits(URL(string: "capacitor://localhost/chat.html"), mainFrame: true))
        for address in ["https://localhost/chat.html", "https://dev.teletyptel.nl/chat.html", "file:///chat.html",
                        "capacitor://other/chat.html", "capacitor://localhost:80/chat.html", "capacitor://user@localhost/chat.html",
                        "capacitor://localhost/chat.html?server=other", "capacitor://localhost/chat.html#login",
                        "capacitor://localhost/%63hat.html", "capacitor://localhost/admin/index.html"] {
            XCTAssertFalse(HybridDocumentPolicy.permits(URL(string: address), mainFrame: true), address)
        }
        XCTAssertFalse(HybridDocumentPolicy.permits(URL(string: "capacitor://localhost/chat.html"), mainFrame: false))
        XCTAssertFalse(HybridDocumentPolicy.permits(nil, mainFrame: true))
    }

    func testStrictProtocolAndCredentialRedaction() throws {
        let request = try HybridRequest.decode(encoded("session.login", ["jid": "fixture@localhost", "password": "fixture-private-password"]))
        XCTAssertEqual(request.command, "session.login")
        XCTAssertEqual(String(describing: request), "HybridRequest(redacted)")
        XCTAssertEqual(String(reflecting: request), "HybridRequest(redacted)")
        let invalidBodies: [[String: Any]] = [
            ["version": true, "id": UUID().uuidString, "command": "session.snapshot", "arguments": [:]],
            ["version": 2, "id": UUID().uuidString, "command": "session.snapshot", "arguments": [:]],
            ["version": 1, "id": "not-a-uuid", "command": "session.snapshot", "arguments": [:]],
            ["version": 1, "id": UUID().uuidString, "command": "session.snapshot", "arguments": [:], "server": "https://other.invalid"]
        ]
        for body in invalidBodies {
            XCTAssertThrowsError(try HybridRequest.decode(JSONSerialization.data(withJSONObject: body)))
        }
        for (command, arguments) in [
            ("session.login", ["jid": "fixture@localhost", "password": "secret", "server": "https://other.invalid"]),
            ("session.login", ["jid": "fixture@localhost", "password": ""]),
            ("session.login", ["jid": "fixture@localhost", "password": String(repeating: "x", count: 1025)]),
            ("session.verifySecondFactor", ["code": "１２３４５６"]),
            ("session.verifySecondFactor", ["code": "12345"]),
            ("session.snapshot", ["extra": "value"]), ("media.start", [:])
        ] {
            XCTAssertThrowsError(try HybridRequest.decode(encoded(command, arguments)))
        }
        XCTAssertThrowsError(try HybridRequest.decode(Data(repeating: 32, count: 8193)))
    }
}

func encoded(_ command: String, _ arguments: [String: String] = [:], id: UUID = UUID(), epoch: String? = nil) -> Data {
    var value: [String: Any] = ["version": 1, "id": id.uuidString, "command": command, "arguments": arguments]
    if let epoch = epoch { value["epoch"] = epoch }
    return try! JSONSerialization.data(withJSONObject: value)
}

@MainActor
final class HybridSessionTests: XCTestCase {
    private let document = URL(string: "capacitor://localhost/chat.html")!

    private func makeSession(_ fixture: SessionFixture, logout: @escaping () -> Void = {}, calls: (any HybridCallPort)? = nil) throws -> (NativeLoginModel, HybridSession) {
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let configuration = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        return (model, HybridSession(model: model, configuration: configuration, nativeLogout: logout, calls: calls))
    }

    private func command(_ session: HybridSession, _ command: String, _ arguments: [String: String] = [:]) throws -> HybridReply {
        try session.handle(encoded(command, arguments, epoch: session.snapshot().epoch), document: document, mainFrame: true)
    }

    private func eventually(attempts: Int = 200, _ predicate: () async -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        for _ in 0..<attempts {
            if await predicate() { return }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
        XCTFail("Expected isolated native state was not reached", file: file, line: line)
    }

    func testNativeLoginIsTheOnlyConnectionAndNeverExposesCredentials() async throws {
        let fixture = SessionFixture()
        var logoutCount = 0
        let (model, session) = try makeSession(fixture, logout: { logoutCount += 1 })
        var states: [HybridSnapshot] = []
        session.onStateChange = { states.append($0) }
        XCTAssertEqual(try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-private-password"]).snapshot.phase, "checking")
        XCTAssertThrowsError(try command(session, "session.login", ["jid": "fixture@localhost", "password": "other"])) {
            XCTAssertEqual($0 as? HybridFailure, .sessionBusy)
        }
        await eventually { model.isConnected }
        let connectionCount = await fixture.connections
        XCTAssertEqual(connectionCount, 1)
        let reply = try command(session, "session.snapshot")
        XCTAssertEqual(reply.snapshot.phase, "connected")
        XCTAssertTrue(reply.snapshot.chatAvailable)
        XCTAssertFalse(reply.snapshot.callsAvailable)
        let serialized = String(decoding: try JSONEncoder().encode(reply), as: UTF8.self)
        for secret in ["fixture@localhost", "fixture-private-password", "native-private-resource", "cookie", "token"] {
            XCTAssertFalse(serialized.contains(secret))
        }
        XCTAssertEqual(try command(session, "session.logout").snapshot.phase, "signedOut")
        XCTAssertEqual(logoutCount, 1)
        XCTAssertThrowsError(try command(session, "session.logout"))
        XCTAssertEqual(logoutCount, 1)
        await Task.yield()
        XCTAssertEqual(states.last?.phase, "signedOut")
        XCTAssertEqual(states.map(\.sequence), states.map(\.sequence).sorted())
        XCTAssertEqual(Set(states.map(\.sequence)).count, states.count)
    }

    func testCancelRejectsLateAuthenticationWithoutConnecting() async throws {
        let fixture = SessionFixture(holdAuthentication: true)
        let (model, session) = try makeSession(fixture)
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { await fixture.hasPendingAuthentication() }
        XCTAssertEqual(try command(session, "session.cancel").snapshot.phase, "idle")
        await fixture.releaseAuthentication()
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(model.phase, .idle)
        let connectionCount = await fixture.connections
        XCTAssertEqual(connectionCount, 0)
    }

    func testCertificateAndCredentialErrorsAreSafeCodes() async throws {
        for fixture in [SessionFixture(probeFailure: .certificate), SessionFixture(accountFailure: .invalidCredentials)] {
            let (model, session) = try makeSession(fixture)
            _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
            await eventually { if case .failed = model.phase { return true }; return false }
            let state = try command(session, "session.snapshot").snapshot
            XCTAssertEqual(state.phase, "failed")
            XCTAssertTrue(["certificate", "invalidCredentials"].contains(state.errorCode ?? ""))
            model.disconnect()
        }
    }

    func testSecondFactorUsesTheSameNativeSessionAndReportsInvalidCodes() async throws {
        let fixture = SessionFixture(secondFactor: true)
        let (model, session) = try makeSession(fixture)
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { model.isAwaitingSecondFactor }
        _ = try command(session, "session.verifySecondFactor", ["code": "000000"])
        await eventually { model.isAwaitingSecondFactor && model.twoFactorError != nil }
        XCTAssertEqual(try command(session, "session.snapshot").snapshot.errorCode, "invalidSecondFactor")
        XCTAssertThrowsError(try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"]))
        _ = try command(session, "session.verifySecondFactor", ["code": "123456"])
        await eventually { model.isConnected }
        let connectionCount = await fixture.connections
        XCTAssertEqual(connectionCount, 1)
        XCTAssertNil(try command(session, "session.snapshot").snapshot.errorCode)
        model.disconnect()
    }

    func testReplayUntrustedFramesAndUnsupportedCommandsDoNotChangeSession() throws {
        let (_, session) = try makeSession(SessionFixture())
        let request = encoded("session.snapshot")
        _ = try session.handle(request, document: document, mainFrame: true)
        XCTAssertThrowsError(try session.handle(request, document: document, mainFrame: true)) {
            XCTAssertEqual($0 as? HybridFailure, .replayedRequest)
        }
        XCTAssertThrowsError(try session.handle(encoded("session.login", ["jid": "fixture@localhost", "password": "secret"]), document: document, mainFrame: false))
        XCTAssertThrowsError(try command(session, "session.verifySecondFactor", ["code": "123456"]))
        XCTAssertThrowsError(try command(session, "calls.start"))
        XCTAssertEqual(session.snapshot().phase, "idle")
    }

    func testForegroundAfterInterruptedFirstLoginReturnsToFormWithoutReusingCredentials() async throws {
        let fixture = SessionFixture(holdAuthentication: true)
        let (model, session) = try makeSession(fixture)
        var opened = false
        session.nativeSettings = { opened = true }
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { await fixture.hasPendingAuthentication() }
        model.beginBackground()
        model.suspend()
        XCTAssertThrowsError(try command(session, "app.openSettings"))
        model.resume()
        XCTAssertEqual(session.snapshot().phase, "idle")
        _ = try command(session, "app.openSettings")
        XCTAssertTrue(opened)
        await fixture.releaseAuthentication()
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(model.phase, .idle)
        let connections = await fixture.connections
        XCTAssertEqual(connections, 0)
    }

    func testSuspendedNativeSessionCannotBeReplacedByWebLogin() async throws {
        let (model, session) = try makeSession(SessionFixture())
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "secret"])
        await eventually { model.isConnected }
        model.suspend()
        XCTAssertThrowsError(try command(session, "session.login", ["jid": "fixture@localhost", "password": "secret"]))
        XCTAssertEqual(session.snapshot().phase, "suspended")
        model.disconnect()
    }

    func testAdvancedSettingsAreNativeOnlyAndUnavailableUnlessConfigured() throws {
        let fixture = SessionFixture()
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let configuration = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        let disabled = HybridSession(model: model, configuration: configuration, nativeLogout: {})
        XCTAssertFalse(disabled.snapshot().settingsAvailable)
        XCTAssertThrowsError(try command(disabled, "app.openSettings")) {
            XCTAssertEqual($0 as? HybridFailure, .unavailable)
        }
        var openings = 0
        let enabled = HybridSession(model: model, configuration: configuration, nativeLogout: {}, nativeSettings: { openings += 1 })
        XCTAssertTrue(enabled.snapshot().settingsAvailable)
        _ = try command(enabled, "app.openSettings")
        XCTAssertEqual(openings, 1)
        XCTAssertEqual(model.phase, .idle)
        XCTAssertThrowsError(try command(enabled, "app.openSettings", ["address": "https://other.invalid"]))
        let replacement = try ServerConfiguration(address: "https://new.invalid", domain: "test.invalid")
        let previousEpoch = enabled.snapshot().epoch
        try enabled.changeServer(replacement)
        XCTAssertEqual(enabled.configuration, replacement)
        XCTAssertNotEqual(enabled.snapshot().epoch, previousEpoch)
        XCTAssertEqual(model.phase, .idle)
    }

    func testRosterAndPresenceUpdatesAreMinimalAndClearedDuringBackgroundAndLogout() async throws {
        let fixture = SessionFixture()
        let (model, session) = try makeSession(fixture)
        var events: [HybridSnapshot] = []
        session.onStateChange = { events.append($0) }
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { model.isConnected }
        var peer = NativeContact(jid: "peer@localhost", name: "Fictieve Gebruiker", groups: ["private-group"], subscription: "both",
                                 presence: .online, callEndpoint: "peer@localhost/private-call-endpoint")
        let own = NativeContact(jid: "fixture@localhost", name: "Own account", groups: [], subscription: "both")
        await fixture.emitRoster(.ready([own, peer]))
        await eventually { events.last?.roster.contacts.count == 1 }
        XCTAssertEqual(session.snapshot().roster.contacts.first?.presence, "online")
        let previousSequence = events.last!.sequence
        peer.presence = .away
        await fixture.emitRoster(.ready([own, peer]))
        await eventually { events.last?.roster.contacts.first?.presence == "away" }
        XCTAssertGreaterThan(events.last!.sequence, previousSequence)
        let serialized = String(decoding: try JSONEncoder().encode(session.snapshot()), as: UTF8.self)
        for hidden in ["fixture@localhost", "private-group", "private-call-endpoint", "subscription", "callEndpoint"] {
            XCTAssertFalse(serialized.contains(hidden))
        }
        XCTAssertNil(model.visibleConversation)
        model.beginBackground()
        await eventually { events.last?.roster.status == "hidden" }
        XCTAssertTrue(session.snapshot().roster.contacts.isEmpty)
        _ = try command(session, "session.logout")
        await fixture.emitRoster(.ready([peer]))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(session.snapshot().phase, "signedOut")
        XCTAssertTrue(session.snapshot().roster.contacts.isEmpty)
    }

    func testLateRosterFromThePreviousAccountCannotEnterANewSession() async throws {
        let fixture = SessionFixture()
        let (model, session) = try makeSession(fixture)
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { model.isConnected }
        _ = try command(session, "session.logout")
        _ = try command(session, "session.login", ["jid": "second@localhost", "password": "second-fixture-password"])
        await eventually { model.isConnected }
        let peer = NativeContact(jid: "old-peer@localhost", name: "Previous account contact", groups: [], subscription: "both")
        await fixture.emitRoster(.ready([peer]), run: 0)
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(session.snapshot().roster.contacts.isEmpty)
        model.disconnect()
    }

    func testInvalidOrOversizedRosterIsNotForwardedToWebKit() async throws {
        let fixture = SessionFixture()
        let (model, session) = try makeSession(fixture)
        _ = try command(session, "session.login", ["jid": "fixture@localhost", "password": "fixture-password"])
        await eventually { model.isConnected }
        let invalid = NativeContact(jid: "peer@localhost/resource", name: "Fixture", groups: [], subscription: "both")
        await fixture.emitRoster(.ready([invalid]))
        await eventually { session.snapshot().roster.status == "unavailable" }
        let contacts = (0..<101).map { NativeContact(jid: "peer\($0)@localhost", name: "Fixture", groups: [], subscription: "both") }
        await fixture.emitRoster(.ready(contacts))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertTrue(session.snapshot().roster.contacts.isEmpty)
        let peer = NativeContact(jid: "peer@localhost", name: "Fixture", groups: [], subscription: "both")
        await fixture.emitRoster(.ready([peer, peer]))
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(session.snapshot().roster.status, "unavailable")
        model.disconnect()
    }

    func testBundledWebKitLoginActuallyReachesNativeAndSurvivesPresentationDetach() async throws {
        guard let path = ProcessInfo.processInfo.environment["TELETYPTEL_HYBRID_CONTENT"] else {
            throw XCTSkip("Generate pinned content on the disposable macOS runner to exercise WebKit.")
        }
        #if os(macOS)
        _ = NSApplication.shared
        #endif
        let content = try HybridContent(data: Data(contentsOf: URL(fileURLWithPath: path)))
        let fixture = SessionFixture()
        let calls = CallFixture()
        let (model, session) = try makeSession(fixture, calls: calls)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(HybridContentHandler(content: content), forURLScheme: "capacitor")
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let navigation = HybridNavigationPolicy()
        webView.navigationDelegate = navigation
        webView.uiDelegate = navigation
        let bridge = HybridWebKitBridge(session: session)
        try bridge.attach(to: webView)
        defer { bridge.detach(); webView.stopLoading(); model.disconnect() }
        webView.load(URLRequest(url: document))
        await eventually(attempts: 2000) {
            (try? await webView.evaluateJavaScript("document.getElementById('accountDialog')?.hidden === false")) as? Bool == true
        }
        let activeTag = try await webView.evaluateJavaScript("document.activeElement.tagName") as? String
        XCTAssertEqual(activeTag, "BODY")
        _ = try await webView.evaluateJavaScript("document.getElementById('dialogJidInput').value='fixture@localhost'; document.getElementById('dialogPasswordInput').value='fixture-password'; document.getElementById('dialogPasswordInput').dispatchEvent(new Event('input')); document.getElementById('dialogConnectButton').click();")
        await eventually { model.isConnected }
        let peer = NativeContact(jid: "peer@localhost", name: "WebKit Fixture", groups: ["hidden-group"], subscription: "both", presence: .online)
        await fixture.emitRoster(.ready([peer]))
        await eventually {
            (try? await webView.evaluateJavaScript("document.querySelectorAll('#conversationItems .conversation-item').length")) as? Int == 1
        }
        _ = try await webView.evaluateJavaScript("document.querySelector('#conversationItems .conversation-item').click()")
        let contactTitle = try await webView.evaluateJavaScript("document.getElementById('hybridContactTitle').textContent") as? String
        XCTAssertEqual(contactTitle, "WebKit Fixture")
        XCTAssertNil(model.visibleConversation)
        await eventually {
            (try? await webView.evaluateJavaScript("document.getElementById('hybridConnected')?.hidden === false")) as? Bool == true
        }
        let password = try await webView.evaluateJavaScript("document.getElementById('dialogPasswordInput').value") as? String
        XCTAssertEqual(password, "")
        await eventually { session.snapshot().conversation?.peer == "peer@localhost" }
        _ = try await webView.evaluateJavaScript("document.getElementById('hybridMessageInput').textContent='Via echte WKWebView'; document.getElementById('hybridMessageInput').dispatchEvent(new Event('input')); document.getElementById('hybridComposer').dispatchEvent(new Event('submit', {cancelable:true}));")
        await eventually { model.chat.messages.first?.state == .submitted }
        let bodies = await fixture.sentBodies
        XCTAssertEqual(bodies, ["Via echte WKWebView"])
        await eventually {
            (try? await webView.evaluateJavaScript("document.querySelectorAll('#hybridMessages .message.self').length")) as? Int == 1
        }
        _ = try await webView.evaluateJavaScript("document.getElementById('hybridStartTotal').click()")
        await eventually { calls.starts == 1 }
        await eventually {
            (try? await webView.evaluateJavaScript("document.getElementById('hybridCallPanel').hidden === false && document.getElementById('hybridConversation').hidden")) as? Bool == true
        }
        _ = try await webView.evaluateJavaScript("document.getElementById('hybridOwnRtt').value='Live WK RTT'; document.getElementById('hybridOwnRtt').dispatchEvent(new Event('input'))")
        await eventually { calls.state.ownText == "Live WK RTT" }
        XCTAssertEqual(model.chat.messages.count, 1)
        _ = try await webView.evaluateJavaScript("document.getElementById('hybridEndCall').click()")
        await eventually { calls.state.phase == "idle" }
        XCTAssertEqual(calls.actions, ["rtt", "end"])
        let blocked = try await webView.evaluateJavaScript("(() => { try { new WebSocket('wss://other.invalid'); return false; } catch { return true; } })()") as? Bool
        XCTAssertEqual(blocked, true)
        bridge.detach()
        XCTAssertTrue(model.isConnected)
        let connections = await fixture.connections
        XCTAssertEqual(connections, 1)
    }
}
