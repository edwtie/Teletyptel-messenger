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

private actor SessionFixture: ServerChecking, NativeAccountChallenging, NativeXMPPConnecting {
    private let probeFailure: ConnectionFailure?
    private let accountFailure: NativeAccountFailure?
    private let holdAuthentication: Bool
    private let secondFactor: Bool
    private var authentication: CheckedContinuation<NativeAuthenticatedAccount, Error>?
    private var heldAccount: NativeAuthenticatedAccount?
    private(set) var connections = 0

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
        onConnected("fixture@localhost/native-private-resource")
        try await Task.sleep(nanoseconds: 60_000_000_000)
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

private func encoded(_ command: String, _ arguments: [String: String] = [:], id: UUID = UUID()) -> Data {
    try! JSONSerialization.data(withJSONObject: ["version": 1, "id": id.uuidString, "command": command, "arguments": arguments])
}

@MainActor
final class HybridSessionTests: XCTestCase {
    private let document = URL(string: "capacitor://localhost/chat.html")!

    private func makeSession(_ fixture: SessionFixture, logout: @escaping () -> Void = {}) throws -> (NativeLoginModel, HybridSession) {
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        let configuration = try ServerConfiguration(address: "https://fixture.invalid", domain: "localhost")
        return (model, HybridSession(model: model, configuration: configuration, nativeLogout: logout))
    }

    private func command(_ session: HybridSession, _ command: String, _ arguments: [String: String] = [:]) throws -> HybridReply {
        try session.handle(encoded(command, arguments), document: document, mainFrame: true)
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
        XCTAssertFalse(reply.snapshot.chatAvailable)
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
        let (model, session) = try makeSession(fixture)
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
        await eventually {
            (try? await webView.evaluateJavaScript("document.getElementById('hybridConnected')?.hidden === false")) as? Bool == true
        }
        let password = try await webView.evaluateJavaScript("document.getElementById('dialogPasswordInput').value") as? String
        XCTAssertEqual(password, "")
        let blocked = try await webView.evaluateJavaScript("(() => { try { new WebSocket('wss://other.invalid'); return false; } catch { return true; } })()") as? Bool
        XCTAssertEqual(blocked, true)
        bridge.detach()
        XCTAssertTrue(model.isConnected)
        let connections = await fixture.connections
        XCTAssertEqual(connections, 1)
    }
}
