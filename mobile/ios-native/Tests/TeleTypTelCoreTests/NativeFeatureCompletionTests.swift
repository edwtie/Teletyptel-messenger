import Foundation
import XCTest
@testable import TeleTypTelCore

private final class FeatureHTTPFixture: URLProtocol {
    static var handler: ((URLRequest) throws -> [String: Any])?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let body = try XCTUnwrap(Self.handler)(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: body))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class NativeFeatureCompletionTests: XCTestCase {
    func testLegacyPreferencesDecodeAndNewPrivacySettingsRoundTrip() throws {
        let legacy = try JSONDecoder().decode(NativeChatPreferences.self, from: Data("{}".utf8))
        XCTAssertTrue(legacy.blockedPeers.isEmpty)
        XCTAssertTrue(legacy.mutedPeers.isEmpty)
        XCTAssertFalse(legacy.doNotDisturb)
        var value = legacy
        value.blockedPeers = ["peer@localhost"]
        value.mutedPeers = ["muted@localhost"]
        value.doNotDisturb = true
        XCTAssertEqual(try JSONDecoder().decode(NativeChatPreferences.self, from: JSONEncoder().encode(value)), value)
    }

    func testUnreadIsLocalAndDoesNotEnableReadReceiptsOrCountDuplicates() throws {
        var store = NativeChatStore()
        XCTAssertFalse(store.preferences.sendDisplayed)
        store.receive(.message(peer: "peer@localhost", identifier: "first", body: "Fictief"))
        store.receive(.message(peer: "peer@localhost", identifier: "first", body: "Fictief"))
        XCTAssertEqual(store.unreadCount(peer: "peer@localhost"), 1)
        store.markRead(store.messages.map(\.id))
        XCTAssertEqual(store.unreadCount(peer: "peer@localhost"), 0)
        XCTAssertFalse(store.preferences.sendDisplayed)
        XCTAssertFalse(store.messages[0].displayedAttempted)
        let restored = try JSONDecoder().decode(NativeChatStore.self, from: JSONEncoder().encode(store))
        XCTAssertEqual(restored.unreadCount(peer: "peer@localhost"), 0)
    }

    func testServerBlockAndRemovalAreScopedEscapedCorrelatedIQs() throws {
        let blocked = try NativeContactEditing.blockRequest(jid: "peer@localhost", blocked: true, owner: "owner@localhost", identifier: "blocking-test")
        XCTAssertTrue(blocked.contains("<block xmlns='urn:xmpp:blocking'><item jid='peer@localhost'/>"))
        XCTAssertFalse(blocked.contains("unblock"))
        let unblocked = try NativeContactEditing.blockRequest(jid: "peer@localhost", blocked: false, owner: "owner@localhost", identifier: "blocking-test")
        XCTAssertTrue(unblocked.contains("<unblock"))
        XCTAssertFalse(unblocked.contains("<unblock xmlns='urn:xmpp:blocking'/>"))
        let removed = try NativeContactEditing.removalRequest(jid: "peer@localhost", owner: "owner@localhost", identifier: "remove-test")
        XCTAssertTrue(removed.contains("subscription='remove'"))
        XCTAssertThrowsError(try NativeContactEditing.blockRequest(jid: "owner@localhost", blocked: true, owner: "owner@localhost", identifier: "test"))
        XCTAssertThrowsError(try NativeContactEditing.removalRequest(jid: "peer@localhost/resource", owner: "owner@localhost", identifier: "test"))
    }

    @MainActor
    func testRegistrationCannotPretendAnExternalProfileCreatesAnXMPPAccount() throws {
        let local = try ServerConfiguration(address: "https://example.invalid", domain: "localhost")
        let external = try ServerConfiguration(address: "https://example.invalid", domain: "example.invalid")
        XCTAssertThrowsError(try NativeAccountLifecycle.registration(configuration: external, jid: "new@example.invalid", name: "Test", password: "Fictional123!"))
        XCTAssertThrowsError(try NativeAccountLifecycle.registration(configuration: local, jid: "new@localhost", name: "Test", password: "short"))
        let data = try NativeAccountLifecycle.registration(configuration: local, jid: "new@localhost", name: "Test", password: "Fictional123!")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(body["action"] as? String, "create")
        XCTAssertEqual(body["rememberPassword"] as? Bool, false)
        XCTAssertEqual(body["xmppWebSocket"] as? String, "wss://example.invalid/xmpp-websocket")
    }

    @MainActor
    func testTwoFactorRequiresLoadedDisabledStateAndValidatesServerSecret() async throws {
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [FeatureHTTPFixture.self]
        let session = NativeAccountWebSession(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"), settings: settings)
        let model = NativeAccountLifecycle()
        FeatureHTTPFixture.handler = { _ in XCTFail("Must load security before setup"); return ["ok": false] }
        await model.beginTwoFactor(session: session, accountID: "fictional")
        XCTAssertNil(model.setupSecret)
        FeatureHTTPFixture.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            return ["ok": true, "account": ["accountId": "fictional", "jid": "owner@localhost", "twoFactorEnabled": false]]
        }
        await model.loadSecurity(session: session, accountID: "fictional", jid: "owner@localhost")
        XCTAssertEqual(model.twoFactorEnabled, false)
        FeatureHTTPFixture.handler = { _ in ["ok": true, "method": "authenticator", "manualSecret": "not a valid secret"] }
        await model.beginTwoFactor(session: session, accountID: "fictional")
        XCTAssertNil(model.setupSecret)
        FeatureHTTPFixture.handler = { _ in ["ok": true, "method": "authenticator", "manualSecret": "JBSWY3DPEHPK3PXP"] }
        await model.beginTwoFactor(session: session, accountID: "fictional")
        XCTAssertNotNil(model.setupSecret)
        model.detach()
        XCTAssertNil(model.setupSecret)
        XCTAssertNil(model.twoFactorEnabled)
        FeatureHTTPFixture.handler = nil
        await session.close()
    }

    func testNewMediaTypesAreBoundedAndExecutableTypesRemainRejected() throws {
        XCTAssertEqual(try NativeUploadSelection(name: "opname.m4a", data: Data([1])).mime, "audio/mp4")
        XCTAssertEqual(try NativeUploadSelection(name: "video.mp4", data: Data([1])).mime, "video/mp4")
        XCTAssertThrowsError(try NativeUploadSelection(name: "video.html", data: Data([1])))
        XCTAssertThrowsError(try NativeUploadSelection(name: "../video.mp4", data: Data([1])))
        XCTAssertThrowsError(try NativeUploadSelection(name: "video.mp4", data: Data(repeating: 0, count: NativeUploadSelection.maximumBytes + 1)))
    }
}
