import Foundation
import XCTest
@testable import TeleTypTelCore

private final class NativeServiceHTTPFixture: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, [String: Any], [String: String]))?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, body, headers) = try XCTUnwrap(Self.handler)(request)
            let response = try XCTUnwrap(HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers))
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            let data = try JSONSerialization.data(withJSONObject: body)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}

    static func body(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while true {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count >= 0, data.count + count <= 32768 else { throw NativeAccountFailure.invalidResponse }
                if count == 0 { break }
                data.append(contentsOf: buffer.prefix(count))
            }
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}

@MainActor
private final class NativeProviderProofFixture: NativeProviderSigning {
    var requests = 0
    var nonce: String?
    func signIn(provider: NativeIdentityProvider, clientID: String, nonce: String) async throws -> String {
        requests += 1
        self.nonce = nonce
        XCTAssertEqual(clientID, "fictional-client")
        return provider == .google ? "fictional-code" : "fictional.jwt.token"
    }
    func cancel() {}
}

@MainActor
final class NativeServicesTests: XCTestCase {
    private let csrf = String(repeating: "a", count: 64)
    private let cookie = ["Set-Cookie": "PHPSESSID=fictional-session; Path=/; Secure; HttpOnly"]
    private func configuration() throws -> ServerConfiguration { try ServerConfiguration(address: "https://example.invalid", domain: "localhost") }
    private func settings() -> URLSessionConfiguration {
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [NativeServiceHTTPFixture.self]
        return settings
    }
    override func tearDown() { NativeServiceHTTPFixture.handler = nil }

    func testPublicAvatarLookupUsesAuthenticatedSameOriginAndRejectsOtherRoutes() async throws {
        let configuration = try ServerConfiguration(address: "https://example.invalid", domain: "localhost")
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [NativeServiceHTTPFixture.self]
        let session = NativeAccountWebSession(configuration: configuration, cookie: "PHPSESSID=fictional-session", settings: settings)
        var requests = 0
        NativeServiceHTTPFixture.handler = { request in
            requests += 1
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.host, "example.invalid")
            XCTAssertEqual(request.url?.path, "/api/account.php")
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems, [URLQueryItem(name: "lookupJid", value: "peer@localhost")])
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fictional-session")
            return (200, ["ok": true], [:])
        }
        _ = try await session.request(.account, lookupJID: "peer@localhost")
        do { _ = try await session.request(.google, lookupJID: "peer@localhost"); XCTFail("Foreign route accepted") } catch { }
        do { _ = try await session.request(.account, accountID: "fiction", lookupJID: "peer@localhost"); XCTFail("Ambiguous query accepted") } catch { }
        do { _ = try await session.request(.account, lookupJID: "peer@localhost/resource"); XCTFail("Resource accepted") } catch { }
        do { _ = try await session.request(.account, body: Data("{}".utf8), lookupJID: "peer@localhost"); XCTFail("Write accepted") } catch { }
        XCTAssertEqual(requests, 1)
        await session.close()
    }

    private func preferences(mode: String = "automatic", target: String = "en") -> NativeTranslationPreferences {
        var result = NativeTranslationPreferences()
        result.mode = mode
        result.targetLanguage = target
        result.automaticConsent = mode == "automatic"
        return result
    }
    private func settingsReply(mode: String = "automatic", accountID: String = "fiction") throws -> [String: Any] {
        let prefs = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences(mode: mode)))
        return ["ok": true, "accountId": accountID, "csrfToken": csrf, "available": true, "preferences": prefs]
    }
    private func eventually(_ condition: () -> Bool) async throws {
        for _ in 0..<300 {
            if condition() { return }
            try await Task.sleep(nanoseconds: 5_000_000)
        }
        XCTFail("Native service task did not finish")
    }

    func testProviderFlowsBindChallengeCookieAndAccountBeforeReturningCredentials() async throws {
        for provider in [NativeIdentityProvider.google, .facebook] {
            let signer = NativeProviderProofFixture()
            let nonce = String(repeating: "a", count: 64)
            let cookie = cookie
            var requests = 0
            NativeServiceHTTPFixture.handler = { request in
                requests += 1
                if request.httpMethod == "GET" {
                    XCTAssertEqual(request.url?.path, "/api/account.php")
                    XCTAssertTrue(request.url?.query?.contains("accountId=fiction") == true)
                    return (200, ["ok": true, "account": ["accountId": "fiction", "jid": "fixture@localhost", "password": "fictional-password"]], [:])
                }
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-TeleTypTel-Native"), provider.rawValue)
                let body = try NativeServiceHTTPFixture.body(request)
                if body["action"] as? String == "begin" {
                    XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
                    return (200, ["ok": true, "challenge": nonce, provider == .google ? "serverClientId" : "appId": "fictional-client"], cookie)
                }
                XCTAssertEqual(body["challenge"] as? String, nonce)
                XCTAssertEqual(body[provider == .google ? "code" : "token"] as? String,
                               provider == .google ? "fictional-code" : "fictional.jwt.token")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fictional-session")
                return (200, ["ok": true, "accountId": "fiction"], cookie)
            }
            let client = NativeSocialAccountClient(settings: settings)
            let step = try await client.login(configuration: configuration(), provider: provider, signer: signer)
            guard case .authenticated(let account) = step else { return XCTFail("Expected authenticated result") }
            XCTAssertEqual(account.jid, "fixture@localhost")
            XCTAssertNotNil(account.webSession)
            XCTAssertEqual(signer.requests, 1)
            XCTAssertEqual(requests, 3)
            await account.webSession?.close()
        }
    }

    func testProviderAccountMismatchIsRejected() async throws {
        let cookie = cookie
        NativeServiceHTTPFixture.handler = { request in
            if request.httpMethod == "GET" {
                return (200, ["ok": true, "account": ["accountId": "other", "jid": "other@localhost", "password": "fiction"]], [:])
            }
            let body = try NativeServiceHTTPFixture.body(request)
            if body["action"] as? String == "begin" {
                return (200, ["ok": true, "challenge": String(repeating: "a", count: 64), "serverClientId": "fictional-client"], cookie)
            }
            return (200, ["ok": true, "accountId": "fiction"], cookie)
        }
        do {
            _ = try await NativeSocialAccountClient(settings: settings).login(configuration: configuration(), provider: .google, signer: NativeProviderProofFixture())
            XCTFail("Foreign account accepted")
        } catch { XCTAssertEqual(error as? NativeAccountFailure, .invalidResponse) }
    }

    func testTranslationRequiresConsentAndOffClearsPrivateResults() async throws {
        let initial = try settingsReply(mode: "manual")
        var translations = 0
        NativeServiceHTTPFixture.handler = { request in
            if request.httpMethod == "GET" { return (200, initial, [:]) }
            translations += 1
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), String(repeating: "a", count: 64))
            let body = try NativeServiceHTTPFixture.body(request)
            XCTAssertEqual(body["consent"] as? Bool, true)
            return (200, ["ok": true, "translation": ["text": "Hello", "sourceLanguage": "nl", "targetLanguage": "en"]], [:])
        }
        let session = NativeAccountWebSession(configuration: try configuration(), cookie: "PHPSESSID=fiction", settings: settings())
        let model = NativeTranslationModel()
        await model.connect(session, accountID: "fiction")
        XCTAssertTrue(model.ready)
        model.translate("Hallo", key: "message")
        XCTAssertEqual(model.pendingCount, 0)
        model.setSharingConsent(true)
        model.translate("Hallo", key: "message")
        try await eventually { model.results["message"]?.text == "Hello" }
        XCTAssertEqual(translations, 1)
        model.setSharingConsent(false)
        XCTAssertTrue(model.results.isEmpty)
        XCTAssertEqual(model.pendingCount, 0)
        model.detach()
        await session.close()
    }

    func testDetectedSameLanguageProducesNoTranslationCaption() async throws {
        let initial = try settingsReply()
        NativeServiceHTTPFixture.handler = { request in
            if request.httpMethod == "GET" { return (200, initial, [:]) }
            return (200, ["ok": true, "translation": ["text": "Hello!", "sourceLanguage": "en-US", "targetLanguage": "en"]], [:])
        }
        let session = NativeAccountWebSession(configuration: try configuration(), settings: settings())
        let model = NativeTranslationModel()
        await model.connect(session, accountID: "fiction")
        model.translate("Hello", key: "same", automatic: true)
        try await eventually { model.pendingCount == 0 }
        XCTAssertTrue(model.results.isEmpty)
        XCTAssertTrue(NativeTranslationModel.sameLanguage("nl-NL", "nl"))
        model.detach()
        await session.close()
    }

    func testTranslationCannotAttachAnotherAccountOrTranslateLiveWithoutSeparateConsent() async throws {
        let initial = try settingsReply()
        var requests = 0
        NativeServiceHTTPFixture.handler = { _ in requests += 1; return (200, initial, [:]) }
        let session = NativeAccountWebSession(configuration: try configuration(), settings: settings())
        let model = NativeTranslationModel()
        await model.connect(session, accountID: "other")
        XCTAssertFalse(model.ready)
        await model.connect(session, accountID: "fiction")
        model.translate("Hallo", key: "live", automatic: true, liveDirection: "self")
        XCTAssertEqual(model.pendingCount, 0)
        XCTAssertEqual(requests, 2)
        model.detach()
        await session.close()
    }

    func testClosedWebSessionCannotSendAndDebugDescriptionIsRedacted() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), cookie: "PHPSESSID=fiction", settings: settings())
        XCTAssertEqual(String(describing: session), "NativeAccountWebSession(redacted)")
        await session.close()
        NativeServiceHTTPFixture.handler = { _ in XCTFail("Closed session sent request"); return (200, ["ok": true], [:]) }
        do { _ = try await session.request(.translation); XCTFail("Closed session accepted") } catch {}
    }
}
