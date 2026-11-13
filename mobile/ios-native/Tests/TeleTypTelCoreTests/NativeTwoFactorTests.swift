import Foundation
import XCTest
@testable import TeleTypTelCore

private final class TwoFactorHTTPFixture: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, String, [String: String]))?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let handler = try XCTUnwrap(Self.handler)
            let (status, body, headers) = try handler(request)
            let response = try XCTUnwrap(HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                headerFields: headers.merging(["Content-Type": "application/json"]) { current, _ in current }))
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class NativeTwoFactorHTTPTests: XCTestCase {
    override func tearDown() { TwoFactorHTTPFixture.handler = nil }

    private func configuration() throws -> ServerConfiguration {
        try ServerConfiguration(address: "https://example.invalid", domain: "localhost")
    }

    private func client() -> NativeTwoFactorAccountClient {
        NativeTwoFactorAccountClient(settings: {
            let settings = URLSessionConfiguration.ephemeral
            settings.protocolClasses = [TwoFactorHTTPFixture.self]
            return settings
        })
    }

    private let challenge = #"{"ok":true,"twoFactorRequired":true,"accountId":"fictional-account","method":"authenticator"}"#
    private let account = #"{"ok":true,"account":{"jid":"fixture@localhost","password":"fictional-password"}}"#

    private func begin(_ client: NativeTwoFactorAccountClient) async throws -> any NativeSecondFactorSession {
        let result = try await client.begin(configuration: configuration(), jid: "fixture@localhost", password: "fictional-password")
        guard case .challenge(let session) = result else { throw NativeAccountFailure.invalidResponse }
        return session
    }

    func testChallengeUsesSamePrivateCookieSessionAndThenReturnsExpectedAccount() async throws {
        var requests = 0
        let challenge = challenge
        let account = account
        TwoFactorHTTPFixture.handler = { request in
            requests += 1
            XCTAssertEqual(request.url?.path, "/api/account.php")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://example.invalid")
            if requests == 1 {
                XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
                return (200, challenge, ["Set-Cookie": "PHPSESSID=fictional-session; Path=/; Secure; HttpOnly"])
            }
            XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")?.contains("PHPSESSID=fictional-session") == true)
            return (200, account, [:])
        }
        let session = try await begin(client())
        XCTAssertEqual(requests, 1)
        let result = try await session.verify(code: "123456")
        XCTAssertEqual(result.jid, "fixture@localhost")
        XCTAssertEqual(requests, 2)
        do { _ = try await session.verify(code: "123456"); XCTFail("Challenge reused") } catch {}
        XCTAssertEqual(requests, 2)
    }

    func testInvalidCodeCanRetryWithoutCredentialsBeingReleased() async throws {
        var requests = 0
        let challenge = challenge
        let account = account
        TwoFactorHTTPFixture.handler = { _ in
            requests += 1
            if requests == 1 { return (200, challenge, [:]) }
            if requests == 2 { return (400, #"{"ok":false,"error":"invalid_verification_code"}"#, [:]) }
            return (200, account, [:])
        }
        let session = try await begin(client())
        do { _ = try await session.verify(code: "000000"); XCTFail("Invalid code accepted") }
        catch { XCTAssertTrue(error is NativeSecondFactorFailure) }
        let restored = try await session.verify(code: "123456")
        XCTAssertEqual(restored.jid, "fixture@localhost")
    }

    func testCancelAndMalformedCodeCannotMakeVerificationRequests() async throws {
        var requests = 0
        let challenge = challenge
        TwoFactorHTTPFixture.handler = { _ in requests += 1; return (200, challenge, [:]) }
        let session = try await begin(client())
        for code in ["", "12345", "１２３４５６", "123 45"] {
            do { _ = try await session.verify(code: code); XCTFail("Malformed code accepted") } catch {}
        }
        session.cancel()
        do { _ = try await session.verify(code: "123456"); XCTFail("Cancelled session reused") } catch {}
        XCTAssertEqual(requests, 1)
    }

    func testVerificationCannotSwitchAccountOrDropSecondFactor() async throws {
        for reply in [#"{"ok":true,"account":{"jid":"other@localhost","password":"secret"}}"#,
                      #"{"ok":true,"twoFactorRequired":true,"account":{"jid":"fixture@localhost","password":"secret"}}"#] {
            var requests = 0
            let challenge = challenge
            TwoFactorHTTPFixture.handler = { _ in
                requests += 1
                return (200, requests == 1 ? challenge : reply, [:])
            }
            let session = try await begin(client())
            do { _ = try await session.verify(code: "123456"); XCTFail("Invalid response accepted") } catch {}
            do { _ = try await session.verify(code: "123456"); XCTFail("Failed session reused") } catch {}
            XCTAssertEqual(requests, 2)
        }
    }

    func testFiveWrongCodesEndChallengeAndUnsupportedMethodFailsClosed() async throws {
        var requests = 0
        let challenge = challenge
        TwoFactorHTTPFixture.handler = { _ in
            requests += 1
            return requests == 1 ? (200, challenge, [:]) : (400, #"{"ok":false,"error":"invalid_verification_code"}"#, [:])
        }
        let session = try await begin(client())
        for _ in 0..<6 {
            do { _ = try await session.verify(code: "000000"); XCTFail("Wrong code accepted") } catch {}
        }
        XCTAssertEqual(requests, 6)
        TwoFactorHTTPFixture.handler = { _ in
            (200, #"{"ok":true,"twoFactorRequired":true,"accountId":"fiction","method":"email_code"}"#, [:])
        }
        do { _ = try await begin(client()); XCTFail("Unsupported method accepted") }
        catch { XCTAssertEqual(error as? NativeAccountFailure, .twoFactorRequired) }
    }
}

private final class SecondFactorSessionFixture: NativeSecondFactorSession {
    let account: NativeAuthenticatedAccount
    init(account: NativeAuthenticatedAccount) { self.account = account }
    func verify(code: String) async throws -> NativeAuthenticatedAccount {
        guard code == "123456" else { throw NativeSecondFactorFailure.invalidCode }
        return account
    }
    func cancel() {}
}

private actor TwoFactorLoginFixture: ServerChecking, NativeAccountChallenging, NativeXMPPConnecting {
    private var runs = 0
    let wrongAccount: Bool
    init(wrongAccount: Bool = false) { self.wrongAccount = wrongAccount }
    func runCount() -> Int { runs }
    func check(_ configuration: ServerConfiguration) async throws -> ProbeReport { ProbeReport(mechanisms: ["PLAIN"]) }
    func login(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAuthenticatedAccount {
        throw NativeAccountFailure.twoFactorRequired
    }
    func begin(configuration: ServerConfiguration, jid: String, password: String) async throws -> NativeAccountLoginStep {
        .challenge(SecondFactorSessionFixture(account: NativeAuthenticatedAccount(configuration: configuration,
            jid: wrongAccount ? "other@localhost" : jid, password: password)))
    }
    func run(account: NativeAuthenticatedAccount, onConnected: @escaping @Sendable (String) -> Void) async throws {
        runs += 1
        onConnected(account.jid + "/fixture")
        while !Task.isCancelled { try await Task.sleep(nanoseconds: 60_000_000_000) }
    }
}

@MainActor
final class NativeTwoFactorModelTests: XCTestCase {
    private func ready(wrongAccount: Bool = false) async -> (NativeLoginModel, TwoFactorLoginFixture) {
        let fixture = TwoFactorLoginFixture(wrongAccount: wrongAccount)
        let model = NativeLoginModel(checker: fixture, authenticator: fixture, connection: fixture)
        model.login(address: "https://example.invalid", domain: "localhost", jid: "fixture@localhost", password: "fictional-password")
        await eventually { model.isAwaitingSecondFactor }
        return (model, fixture)
    }
    private func eventually(_ predicate: () async -> Bool) async {
        for _ in 0..<500 {
            if await predicate() { return }
            await Task.yield()
        }
        XCTFail("Expected login phase not reached")
    }
    func testNoXMPPBeforeCodeAndInvalidCodeKeepsChallenge() async {
        let (model, fixture) = await ready()
        defer { model.disconnect() }
        let before = await fixture.runCount()
        XCTAssertEqual(before, 0)
        XCTAssertFalse(model.canSend)
        model.verifySecondFactor(code: "000000")
        await eventually { model.isAwaitingSecondFactor && model.twoFactorError != nil }
        model.verifySecondFactor(code: "123456")
        await eventually { model.isConnected }
        let after = await fixture.runCount()
        XCTAssertEqual(after, 1)
        XCTAssertFalse(model.isSecondFactorPending)
    }
    func testWrongAccountAfterVerificationCannotConnect() async {
        let (model, fixture) = await ready(wrongAccount: true)
        defer { model.disconnect() }
        model.verifySecondFactor(code: "123456")
        await eventually { model.phase == .failed(.account(.invalidResponse)) }
        let runs = await fixture.runCount()
        XCTAssertEqual(runs, 0)
    }
    func testBackgroundOrLogoutInvalidatesPendingChallenge() async {
        for logout in [false, true] {
            let (model, fixture) = await ready()
            if logout { model.disconnect() } else { model.beginBackground(); model.suspend() }
            model.verifySecondFactor(code: "123456")
            let runs = await fixture.runCount()
            XCTAssertEqual(runs, 0)
            XCTAssertFalse(model.isSecondFactorPending)
            XCTAssertFalse(model.isConnected)
            model.disconnect()
        }
    }
}
