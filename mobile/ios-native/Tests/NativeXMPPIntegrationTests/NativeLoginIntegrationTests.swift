import Foundation
import XCTest
@testable import TeleTypTelCore

final class NativeLoginIntegrationTests: XCTestCase {
    private struct Fixture: Decodable {
        let accountPort: Int
        let username: String
        let password: String
    }

    private func fixture() throws -> Fixture {
        guard let file = ProcessInfo.processInfo.environment["TELETYPTEL_EJABBERD_FIXTURE"] else {
            throw XCTSkip("Opt-in HTTPS account contract and real ejabberd test")
        }
        guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
              ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"] == "github-hosted" else {
            throw ConnectionFailure.configuration
        }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        guard (1024...65535).contains(fixture.accountPort), fixture.username.hasPrefix("native-test-"),
              !fixture.password.isEmpty else { throw ConnectionFailure.configuration }
        return fixture
    }

    @MainActor
    private func start(_ model: NativeLoginModel, _ scenario: String) throws -> String {
        let fixture = try fixture()
        let jid = (scenario == "success" ? fixture.username : scenario + "-" + fixture.username) + "@localhost"
        model.login(address: "https://localhost:\(fixture.accountPort)", domain: "localhost", jid: jid, password: fixture.password)
        return jid
    }

    @MainActor
    private func eventually(_ condition: @escaping @MainActor () async throws -> Bool,
                            file: StaticString = #filePath, line: UInt = #line) async throws {
        for _ in 0..<300 {
            if try await condition() { return }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTFail("Native login did not reach the expected phase", file: file, line: line)
    }

    @MainActor
    func testAccountHTTPThenRealXMPPAndDisconnect() async throws {
        let model = NativeLoginModel()
        defer { model.disconnect() }
        let jid = try start(model, "success")
        try await eventually { model.phase == .connected(jid) }
        XCTAssertTrue(model.isConnected)
        let contact = NativeContact(jid: "fixture-peer@localhost", name: "Fictief testcontact",
                                    groups: ["Testcontacten"], subscription: "both")
        try await eventually { model.roster == .ready([contact]) }
        model.disconnect()
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertEqual(model.roster, .idle)
        XCTAssertFalse(model.isConnected)
    }

    @MainActor
    private func rejects(_ scenario: String, as failure: NativeLoginFailure) async throws {
        let model = NativeLoginModel()
        defer { model.disconnect() }
        _ = try start(model, scenario)
        try await eventually { model.phase == .failed(failure) }
        XCTAssertFalse(model.isConnected)
    }

    @MainActor
    func testRejectedHTTPAccountDoesNotConnect() async throws {
        try await rejects("rejected", as: .account(.invalidCredentials))
    }

    @MainActor
    func testTwoFactorHTTPChallengeDoesNotConnect() async throws {
        try await rejects("twofactor", as: .account(.twoFactorRequired))
    }

    @MainActor
    func testDifferentHTTPAccountDoesNotConnect() async throws {
        try await rejects("mismatch", as: .account(.invalidResponse))
    }

    @MainActor
    func testHTTPRedirectIsNotFollowed() async throws {
        try await rejects("redirect", as: .connection(.redirectRejected))
    }

    @MainActor
    func testHTTPAcceptanceDoesNotOverrideXMPPRejection() async throws {
        try await rejects("xmpp-rejected", as: .xmpp(.authenticationRejected))
    }

    @MainActor
    func testCancellationDuringHTTPDoesNotRestoreLogin() async throws {
        let model = NativeLoginModel()
        defer { model.disconnect() }
        _ = try start(model, "delayed")
        try await eventually { model.phase == .authenticating }
        let fixture = try fixture()
        let statusURL = try XCTUnwrap(URL(string: "https://localhost:\(fixture.accountPort)/test-status"))
        struct Status: Decodable { let delayedReceived: Bool }
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        try await eventually {
            let (data, response) = try await session.data(for: URLRequest(url: statusURL, timeoutInterval: 2))
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            return try JSONDecoder().decode(Status.self, from: data).delayedReceived
        }
        XCTAssertEqual(model.phase, .authenticating)
        model.disconnect()
        try await Task.sleep(nanoseconds: 2_500_000_000)
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertFalse(model.isConnected)
    }
}
