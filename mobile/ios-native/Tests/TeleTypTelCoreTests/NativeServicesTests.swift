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
private final class NativeGoogleChoiceFixture: NativeGoogleAccountChoosing {
    var browserRequests = 0
    var challengeProof: String?
    var legacyRequests = 0

    func chooseGoogleAccount(at url: URL, clientID: String, challenge: String) async throws -> String {
        browserRequests += 1
        XCTAssertEqual(clientID, "fictional-client")
        XCTAssertEqual(url.scheme, "https")
        XCTAssertEqual(url.path, "/api/auth/google/start")
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        XCTAssertEqual(query.first(where: { $0.name == "mode" })?.value, "ios_account_choice")
        XCTAssertEqual(query.first(where: { $0.name == "challenge" })?.value, challenge)
        challengeProof = query.first(where: { $0.name == "code_challenge" })?.value
        XCTAssertNotNil(challengeProof)
        XCTAssertFalse(query.contains(where: { $0.name == "browserVerifier" || $0.name == "email" }))
        return try NativeGoogleAccountChoice.code(from: XCTUnwrap(URL(string: "teletyptel-google://signin/complete?state=tt-ios-\(challenge)&code=fictional-code")), challenge: challenge)
    }

    func signIn(provider: NativeIdentityProvider, clientID: String, nonce: String) async throws -> String {
        legacyRequests += 1
        return "fictional-legacy-code"
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

    func testAvatarCacheChecksIdentityAndClearsProfilesWhenDetached() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), settings: settings())
        let cache = NativeAvatarCache()
        NativeServiceHTTPFixture.handler = { request in
            let jid = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value ?? ""
            return (200, ["ok": true, "profile": ["jid": jid == "peer@localhost" ? "wrong@localhost" : jid,
                "displayName": "Fictieve gebruiker", "avatarColor": "#2563eb", "avatarDataUrl": ""]], [:])
        }
        let contact = NativeContact(jid: "peer@localhost", name: "Peer", groups: [], subscription: "both")
        cache.connect(session, owner: "fixture@localhost", contacts: [contact])
        try await eventually { cache.profiles["fixture@localhost"] != nil }
        for _ in 0..<10 { await Task.yield() }
        XCTAssertNil(cache.profiles["peer@localhost"])
        XCTAssertNil(cache.profiles["wrong@localhost"])
        cache.detach()
        XCTAssertTrue(cache.profiles.isEmpty); XCTAssertNil(cache.owner)
        await session.close()
    }

    func testInterpreterUsesBoundSessionFreshCSRFAndOnlyAnExplicitRoomQuery() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), cookie: "PHPSESSID=fictional-session", settings: settings())
        let client = NativeInterpreterAPI(session: session, account: "fiction")
        let room = String(repeating: "a", count: 48)
        var posts = 0
        NativeServiceHTTPFixture.handler = { request in
            XCTAssertEqual(request.url?.host, "example.invalid")
            XCTAssertEqual(request.url?.path, "/api/interpreter.php")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fictional-session")
            if request.httpMethod == "POST" {
                posts += 1
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), self.csrf)
                let body = try NativeServiceHTTPFixture.body(request)
                XCTAssertEqual(body["action"] as? String, "request")
                XCTAssertEqual(body["provider"] as? String, "internal")
                XCTAssertEqual(body["callId"] as? String, "test-call")
                return (200, ["ok": true, "csrfToken": self.csrf, "roomId": room], [:])
            }
            return (200, ["ok": true, "csrfToken": self.csrf, "accountId": "fiction", "jid": "fixture@localhost", "rooms": []], [:])
        }
        do { _ = try await client.request(peer: "peer@localhost", sid: "test-call"); XCTFail("Request before challenge") } catch {}
        _ = try await client.dashboard()
        let requested = try await client.request(peer: "peer@localhost", sid: "test-call")
        XCTAssertEqual(requested, room)
        XCTAssertEqual(posts, 1)
        do { _ = try await session.request(.account, interpreterRoom: room); XCTFail("Foreign room route") } catch {}
        do { _ = try await session.request(.interpreter, interpreterRoom: "../bad"); XCTFail("Room injection") } catch {}
        await session.close()
    }

    func testAvatarRefreshReplacesAllowedProfilesWithoutLookingUpUnrelatedUsers() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), settings: settings())
        let cache = NativeAvatarCache()
        var version = "Eerste naam"
        var lookedUp: [String] = []
        NativeServiceHTTPFixture.handler = { request in
            let jid = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value ?? ""
            lookedUp.append(jid)
            return (200, ["ok": true, "profile": ["jid": jid, "displayName": version, "avatarColor": "#2563eb", "avatarDataUrl": ""]], [:])
        }
        cache.connect(session, owner: "fixture@localhost", contacts: [])
        try await eventually { cache.profiles["fixture@localhost"]?.displayName == "Eerste naam" }
        version = "Bijgewerkte naam"
        cache.refreshOwner()
        try await eventually { cache.profiles["fixture@localhost"]?.displayName == "Bijgewerkte naam" }
        cache.refresh("unrelated@localhost")
        XCTAssertEqual(lookedUp, ["fixture@localhost", "fixture@localhost"])
        cache.detach(); await session.close()
    }

    func testNativeAvatarSaveUsesFreshCSRFAndOnlyUpdatesTheBoundOwner() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), cookie: "PHPSESSID=fictional-session", settings: settings())
        let model = NativeAvatarEditor()
        let image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lvkAAAAASUVORK5CYII="
        var stored = "", reads = 0, posts = 0
        NativeServiceHTTPFixture.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/native-avatar.php")
            XCTAssertNil(request.url?.query)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fictional-session")
            if request.httpMethod == "GET" { reads += 1 }
            else {
                posts += 1; XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), self.csrf)
                let body = try NativeServiceHTTPFixture.body(request)
                XCTAssertEqual(Set(body.keys), ["avatarDataUrl"])
                stored = try XCTUnwrap(body["avatarDataUrl"] as? String)
            }
            return (200, ["ok": true, "accountId": "fiction", "csrfToken": self.csrf,
                "profile": ["jid": "fixture@localhost", "displayName": "Fixture", "avatarColor": "#2563eb", "avatarDataUrl": stored]], [:])
        }
        await model.configure(session: session, account: "fiction", owner: "fixture@localhost")
        let saved = await model.save(image)
        XCTAssertTrue(saved); XCTAssertEqual(reads, 2); XCTAssertEqual(posts, 1)
        XCTAssertEqual(model.profile?.avatarDataUrl, image)
        let invalid = await model.save("data:image/svg+xml;base64,PHN2Zz4=")
        XCTAssertFalse(invalid); XCTAssertEqual(posts, 1)
        let removed = await model.save("")
        XCTAssertTrue(removed); XCTAssertEqual(model.profile?.avatarDataUrl, "")
        model.detach(); await session.close()
    }
    func testNativeAvatarRejectsChangedAccountBeforeUpload() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), settings: settings()), model = NativeAvatarEditor()
        var count = 0
        NativeServiceHTTPFixture.handler = { request in
            count += 1; XCTAssertEqual(request.httpMethod, "GET")
            return (200, ["ok": true, "accountId": count == 1 ? "fiction" : "other", "csrfToken": self.csrf,
                "profile": ["jid": "fixture@localhost", "displayName": "Fixture", "avatarColor": "#2563eb", "avatarDataUrl": ""]], [:])
        }
        await model.configure(session: session, account: "fiction", owner: "fixture@localhost")
        let saved = await model.save("")
        XCTAssertFalse(saved); XCTAssertEqual(count, 2); XCTAssertNotNil(model.notice)
        model.detach(); await session.close()
    }
    func testNativeAvatarBodyAllowanceDoesNotWidenOtherRoutes() async throws {
        let session = NativeAccountWebSession(configuration: try configuration(), settings: settings())
        var requests = 0
        NativeServiceHTTPFixture.handler = { request in
            requests += 1; XCTAssertEqual(request.url?.path, "/api/native-avatar.php")
            return (200, ["ok": true], [:])
        }
        do { _ = try await session.request(.profile, body: Data(repeating: 0, count: 40000)); XCTFail("Profile body widened") } catch {}
        _ = try await session.request(.avatar, body: Data(repeating: 0, count: 40000))
        do { _ = try await session.request(.avatar, body: Data(repeating: 0, count: 525313)); XCTFail("Oversized avatar") } catch {}
        do { _ = try await session.request(.avatar, accountID: "other"); XCTFail("Foreign avatar query") } catch {}
        XCTAssertEqual(requests, 1); await session.close()
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

    func testGoogleBrowserChoiceRetainsNativeSessionAndSecondFactor() async throws {
        let signer = NativeGoogleChoiceFixture()
        let challenge = String(repeating: "a", count: 64)
        let cookie = cookie
        var initialProof: String?
        var actions: [String] = []
        NativeServiceHTTPFixture.handler = { request in
            let body = try NativeServiceHTTPFixture.body(request)
            let action = try XCTUnwrap(body["action"] as? String)
            actions.append(action)
            if action == "begin" {
                initialProof = body["browserChallenge"] as? String
                XCTAssertEqual(initialProof?.utf8.count, 43)
                return (200, ["ok": true, "challenge": challenge, "serverClientId": "fictional-client", "browserAccountChoice": true], cookie)
            }
            XCTAssertEqual(action, "complete_browser")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fictional-session")
            XCTAssertEqual(body["challenge"] as? String, challenge)
            XCTAssertEqual(body["code"] as? String, "fictional-code")
            XCTAssertEqual((body["browserVerifier"] as? String)?.utf8.count, 43)
            XCTAssertNotEqual(body["browserVerifier"] as? String, initialProof)
            return (200, ["ok": true, "accountId": "fiction", "twoFactorRequired": true, "method": "authenticator"], cookie)
        }
        let step = try await NativeSocialAccountClient(settings: settings).login(configuration: configuration(), provider: .google, signer: signer)
        guard case .challenge(let secondFactor) = step else { return XCTFail("Google account choice skipped 2FA") }
        XCTAssertEqual(signer.browserRequests, 1)
        XCTAssertEqual(signer.legacyRequests, 0)
        XCTAssertEqual(signer.challengeProof, initialProof)
        XCTAssertEqual(actions, ["begin", "complete_browser"])
        secondFactor.cancel()
    }

    func testGoogleBrowserChoiceRejectsForeignStateAndCallback() throws {
        let challenge = String(repeating: "a", count: 64)
        for url in ["teletyptel-google://signin/complete?state=wrong&code=fictional",
                    "teletyptel-google://signin/other?state=tt-ios-\(challenge)&code=fictional",
                    "teletyptel-google://signin/complete?state=tt-ios-\(challenge)&code=fictional&code=other",
                    "https://signin/complete?state=tt-ios-\(challenge)&code=fictional"] {
            XCTAssertThrowsError(try NativeGoogleAccountChoice.code(from: XCTUnwrap(URL(string: url)), challenge: challenge))
        }
        XCTAssertThrowsError(try NativeGoogleAccountChoice.code(from: XCTUnwrap(URL(string:
            "teletyptel-google://signin/complete?state=tt-ios-\(challenge)&error=access_denied")), challenge: challenge)) {
            XCTAssertTrue($0 is CancellationError)
        }
    }

    func testGoogleBrowserChoiceKeepsSDKForServerWithoutSupport() async throws {
        let signer = NativeGoogleChoiceFixture()
        let cookie = cookie
        NativeServiceHTTPFixture.handler = { request in
            let body = try NativeServiceHTTPFixture.body(request)
            if body["action"] as? String == "begin" {
                return (200, ["ok": true, "challenge": String(repeating: "a", count: 64), "serverClientId": "fictional-client"], cookie)
            }
            XCTAssertEqual(body["action"] as? String, "complete")
            XCTAssertEqual(body["code"] as? String, "fictional-legacy-code")
            XCTAssertNil(body["browserVerifier"])
            return (200, ["ok": true, "accountId": "fiction", "twoFactorRequired": true, "method": "authenticator"], cookie)
        }
        let step = try await NativeSocialAccountClient(settings: settings).login(configuration: configuration(), provider: .google, signer: signer)
        guard case .challenge(let secondFactor) = step else { return XCTFail("Expected 2FA in SDK fallback") }
        XCTAssertEqual(signer.browserRequests, 0)
        XCTAssertEqual(signer.legacyRequests, 1)
        secondFactor.cancel()
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
        XCTAssertTrue(model.isCurrent(key: "message", text: "Hallo"))
        model.discardStale(key: "message", text: "Hallo")
        XCTAssertNotNil(model.results["message"])
        model.discardStale(key: "message", text: "Gecorrigeerd")
        XCTAssertNil(model.results["message"])
        XCTAssertFalse(model.isCurrent(key: "message", text: "Gecorrigeerd"))
        model.translate("Hallo", key: "message")
        try await eventually { model.results["message"]?.text == "Hello" }
        XCTAssertEqual(translations, 2)
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
