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
        let renamed = try NativeContactEditing.request(jid: "peer@localhost", name: "New", owner: "owner@localhost", identifier: "rename-test", groups: ["Friends & family"])
        XCTAssertTrue(renamed.contains("<group>Friends &amp; family</group>"))
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

    func testGroupUnreadCountsOnlyLiveVisibleUnretractedIncomingMessages() throws {
        var group = NativeGroupConversation(room: "room@conference.localhost", nickname: "owner")
        let incoming = NativeGroupText(id: UUID(), room: group.room, nickname: "peer", identifier: "one", archiveID: nil,
            body: "Fictief", date: Date(), own: false, state: .incoming, locallyRead: false)
        group.messages = [incoming]
        XCTAssertEqual(group.unreadCount, 1)
        group.messages[0].locallyRead = true
        XCTAssertEqual(group.unreadCount, 0)
        group.messages[0].locallyRead = false
        group.messages[0].retracted = true
        XCTAssertEqual(group.unreadCount, 0)
        group.messages[0].retracted = false
        group.messages[0].locallyRead = nil
        XCTAssertEqual(group.unreadCount, 0)
    }

    @MainActor
    func testPasswordChangeRequiresDedicatedServerActionAndDoesNotResaveProfile() async throws {
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [FeatureHTTPFixture.self]
        let session = NativeAccountWebSession(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"), settings: settings)
        let model = NativeAccountLifecycle()
        FeatureHTTPFixture.handler = { request in
            let body = try FeatureHTTPFixture.body(request)
            XCTAssertEqual(body["action"] as? String, "change_password")
            XCTAssertEqual(body["currentPassword"] as? String, "OldFictional123!")
            XCTAssertNil(body["displayName"])
            XCTAssertNil(body["avatarDataUrl"])
            XCTAssertNil(body["rememberPassword"])
            return ["ok": true, "account": ["accountId": "fictional", "jid": "owner@localhost"]]
        }
        let changed = await model.changePassword(session: session, accountID: "fictional", jid: "owner@localhost", current: "OldFictional123!", password: "NewFictional123!")
        XCTAssertTrue(changed)
        FeatureHTTPFixture.handler = nil
        await session.close()
    }

    @MainActor
    func testReturningFromAuthenticatorCanConfirmExistingServerSetupWithoutReplacingKey() async throws {
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [FeatureHTTPFixture.self]
        let session = NativeAccountWebSession(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"), settings: settings)
        let model = NativeAccountLifecycle()
        FeatureHTTPFixture.handler = { _ in ["ok": true, "account": ["accountId": "fictional", "jid": "owner@localhost", "twoFactorEnabled": false]] }
        await model.loadSecurity(session: session, accountID: "fictional", jid: "owner@localhost")
        XCTAssertNil(model.setupSecret)
        FeatureHTTPFixture.handler = { request in
            let body = try FeatureHTTPFixture.body(request)
            XCTAssertEqual(body["action"] as? String, "confirm_two_factor_setup")
            XCTAssertEqual(body["code"] as? String, "123456")
            return ["ok": true]
        }
        await model.confirmTwoFactor(session: session, accountID: "fictional", code: "123456")
        XCTAssertEqual(model.twoFactorEnabled, true)
        FeatureHTTPFixture.handler = nil
        await session.close()
    }
}
