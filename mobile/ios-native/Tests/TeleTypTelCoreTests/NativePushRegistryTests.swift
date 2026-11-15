import Foundation
import XCTest
@testable import TeleTypTelCore

private final class PushRegistryHTTPFixture: URLProtocol {
    static var handler: ((URLRequest, Data) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            var body = request.httpBody ?? Data()
            if body.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    guard count >= 0, body.count + count <= 32768 else { throw NativePushRegistryFailure.invalidResponse }
                    if count == 0 { break }
                    body.append(contentsOf: buffer.prefix(count))
                }
            }
            let (status, bytes) = try XCTUnwrap(Self.handler)(request, body)
            let response = try XCTUnwrap(HTTPURLResponse(url: try XCTUnwrap(request.url), statusCode: status,
                httpVersion: nil, headerFields: ["Content-Type": "application/json"]))
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: bytes)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor
final class NativePushRegistryTests: XCTestCase {
    private let deviceID = UUID(uuidString: "12345678-1234-4234-9234-123456789abc")!
    private let csrf = String(repeating: "a", count: 64)
    private let generation = String(repeating: "b", count: 32)
    private let current: TimeInterval = 1_800_000_000

    override func tearDown() {
        PushRegistryHTTPFixture.handler = nil
        super.tearDown()
    }

    private func client(cookie: String? = "PHPSESSID=fiction", accountID: String = "fiction") throws -> NativePushRegistryClient {
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [PushRegistryHTTPFixture.self]
        let session = NativeAccountWebSession(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"),
            cookie: cookie, settings: settings)
        return NativePushRegistryClient(session: session, accountID: accountID, now: { 1_800_000_000 })
    }

    private func envelope(_ fields: [String: Any] = [:]) throws -> Data {
        var value: [String: Any] = ["ok": true, "accountId": "fiction", "csrfToken": csrf, "devices": []]
        for (key, field) in fields { value[key] = field }
        return try JSONSerialization.data(withJSONObject: value)
    }

    private func registration(_ fields: [String: Any] = [:]) throws -> Data {
        var value: [String: Any] = ["deviceId": deviceID.uuidString.lowercased(), "generation": generation, "expiresAt": current + 86400]
        for (key, field) in fields { value[key] = field }
        return try envelope(value)
    }

    private func assertFailure(_ expected: NativePushRegistryFailure, operation: () async throws -> Void,
                               file: StaticString = #filePath, line: UInt = #line) async {
        do { try await operation(); XCTFail("Expected refusal", file: file, line: line) }
        catch { XCTAssertEqual(error as? NativePushRegistryFailure, expected, file: file, line: line) }
    }

    func testRegistrationUsesOwnCSRFSessionAndNoTokenInURL() async throws {
        let service = try client()
        let challenge = try envelope()
        let credential = "ab." + String(repeating: "c", count: 64)
        let registered = try registration(["controlToken": credential])
        var methods: [String] = []
        PushRegistryHTTPFixture.handler = { request, body in
            XCTAssertEqual(request.url?.absoluteString, "https://example.invalid/api/call-push.php")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fiction")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://example.invalid")
            methods.append(request.httpMethod ?? "")
            if request.httpMethod == "GET" {
                XCTAssertNil(request.value(forHTTPHeaderField: "X-CSRF-Token"))
                XCTAssertTrue(body.isEmpty)
                return (200, challenge)
            }
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), self.csrf)
            let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(Set(fields.keys), Set(["action", "deviceId", "token", "consent"]))
            XCTAssertEqual(fields["action"] as? String, "register")
            XCTAssertEqual(fields["deviceId"] as? String, self.deviceID.uuidString.lowercased())
            XCTAssertEqual(fields["token"] as? String, String(repeating: "2a", count: 32))
            XCTAssertEqual(fields["consent"] as? Bool, true)
            return (200, registered)
        }
        let result = try await service.register(deviceID: deviceID, token: Data(repeating: 42, count: 32), consented: true)
        XCTAssertEqual(methods, ["GET", "POST"])
        XCTAssertEqual(result.deviceID, deviceID); XCTAssertEqual(result.generation, generation)
        XCTAssertEqual(result.expiresAt, current + 86400); XCTAssertEqual(result.controlCredential, credential)
        XCTAssertEqual(String(describing: result), "NativePushRegistration(redacted)")
        XCTAssertEqual(String(reflecting: result), "NativePushRegistration(redacted)")
    }

    func testRegistryAvailabilityDoesNotImplyBackgroundAnswerRecovery() async throws {
        let service = try client()
        for (fields, expected): ([String: Any], Bool) in [([:], false),
            (["capabilities": ["backgroundAnswerRecovery": false]], false),
            (["capabilities": ["backgroundAnswerRecovery": true]], true)] {
            let data = try envelope(fields)
            PushRegistryHTTPFixture.handler = { _, _ in (200, data) }
            let ready = try await service.backgroundAnswerReady()
            XCTAssertEqual(ready, expected)
        }
        let invalid = try envelope(["accountId": "other", "capabilities": ["backgroundAnswerRecovery": true]])
        PushRegistryHTTPFixture.handler = { _, _ in (200, invalid) }
        await assertFailure(.invalidResponse) { _ = try await service.backgroundAnswerReady() }
    }

    func testNoConsentCookieInvalidIdentityOrTokenNeverMakesNetworkRequests() async throws {
        PushRegistryHTTPFixture.handler = { _, _ in XCTFail("Must not contact server"); return (500, Data()) }
        let service = try client()
        await assertFailure(.rejected) { _ = try await service.register(deviceID: self.deviceID, token: Data(repeating: 1, count: 32), consented: false) }
        for length in [0, 15, 257] {
            await assertFailure(.rejected) { _ = try await service.register(deviceID: self.deviceID, token: Data(repeating: 1, count: length), consented: true) }
        }
        for identifier in ["12345678-1234-4234-1234-123456789abc", "12345678-1234-7234-9234-123456789abc"] {
            let invalid = try XCTUnwrap(UUID(uuidString: identifier))
            await assertFailure(.rejected) { _ = try await service.register(deviceID: invalid, token: Data(repeating: 1, count: 32), consented: true) }
            await assertFailure(.rejected) { try await service.revoke(deviceID: invalid) }
        }
        for candidate in [try client(cookie: nil), try client(accountID: ""), try client(accountID: "bad\naccount"), try client(accountID: String(repeating: "a", count: 97))] {
            await assertFailure(.unavailable) { try await candidate.checkAvailability() }
        }
    }

    func testChallengeBindsExactAccountCSRFDevicesAndLeaseBeforePosting() async throws {
        let service = try client()
        let device: [String: Any] = ["device_id": deviceID.uuidString, "generation": generation, "expires": String(Int(current + 100))]
        let valid = try envelope(["devices": [device]])
        PushRegistryHTTPFixture.handler = { _, _ in (200, valid) }
        try await service.checkAvailability()
        for fields: [String: Any] in [["accountId": "another"], ["ok": false], ["csrfToken": "bad"],
            ["devices": [device, device]], ["devices": [["device_id": "bad", "generation": generation, "expires": current + 100]]],
            ["devices": [["device_id": deviceID.uuidString, "generation": "bad", "expires": current + 100]]],
            ["devices": [["device_id": deviceID.uuidString, "generation": generation, "expires": current]]],
            ["devices": [["device_id": deviceID.uuidString, "generation": generation, "expires": current + 86431]]]] {
            let invalid = try envelope(fields)
            PushRegistryHTTPFixture.handler = { request, _ in XCTAssertEqual(request.httpMethod, "GET"); return (200, invalid) }
            await assertFailure(.invalidResponse) { _ = try await service.register(deviceID: self.deviceID, token: Data(repeating: 1, count: 32), consented: true) }
        }
    }

    func testRegistrationRejectsMismatchedDeviceGenerationExpiryAndControlToken() async throws {
        let service = try client()
        let challenge = try envelope()
        for fields: [String: Any] in [["accountId": "other"], ["deviceId": UUID().uuidString], ["generation": "bad"],
            ["expiresAt": current], ["expiresAt": current + 86431], ["expiresAt": current + 0.5],
            ["controlToken": "bad"], ["controlToken": "abc." + String(repeating: "c", count: 64)],
            ["controlToken": String(repeating: "a", count: 960) + "." + String(repeating: "c", count: 64)]] {
            let invalid = try registration(fields)
            PushRegistryHTTPFixture.handler = { request, _ in (200, request.httpMethod == "GET" ? challenge : invalid) }
            await assertFailure(.invalidResponse) { _ = try await service.register(deviceID: self.deviceID, token: Data(repeating: 1, count: 32), consented: true) }
        }
    }

    func testRevocationNeedsItsOwnChallengeAndConfirmedResponse() async throws {
        let service = try client()
        let challenge = try envelope()
        let revoked = try envelope(["revoked": true])
        PushRegistryHTTPFixture.handler = { request, body in
            if request.httpMethod == "GET" { return (200, challenge) }
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), self.csrf)
            let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
            XCTAssertEqual(fields, ["action": "revoke-device", "deviceId": self.deviceID.uuidString.lowercased()])
            return (200, revoked)
        }
        try await service.revoke(deviceID: deviceID)
        let unconfirmed = try envelope(["revoked": false])
        PushRegistryHTTPFixture.handler = { request, _ in (200, request.httpMethod == "GET" ? challenge : unconfirmed) }
        await assertFailure(.invalidResponse) { try await service.revoke(deviceID: self.deviceID) }
    }

    func testAnswerNeedsFreshCSRFAndExactDeviceSessionMediaReservation() async throws {
        let service = try client()
        let invitation = try XCTUnwrap(NativeCallInvitation(sid: "live-call", expiresAt: current + 45, media: .total, now: current))
        let device = NativePushRegistration(deviceID: deviceID, generation: generation, expiresAt: current + 100, controlCredential: nil)
        let challenge = try envelope()
        let call: [String: Any] = ["callId": invitation.id.uuidString, "sid": invitation.sid, "state": "accepted",
            "hasVideo": true, "mediaProfile": "total", "expiresAt": invitation.expiresAt]
        let accepted = try envelope(["call": call])
        PushRegistryHTTPFixture.handler = { request, body in
            if request.httpMethod == "GET" { return (200, challenge) }
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), self.csrf)
            let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
            XCTAssertEqual(fields, ["action": "accept", "callId": invitation.id.uuidString.lowercased(),
                "deviceId": self.deviceID.uuidString.lowercased(), "generation": self.generation, "fullJid": "bob@localhost/awakened"])
            return (200, accepted)
        }
        try await service.accept(invitation: invitation, registration: device, fullJID: "bob@localhost/awakened")
        for changed: [String: Any] in [["callId": UUID().uuidString], ["sid": "other"], ["state": "ringing"],
            ["hasVideo": false], ["mediaProfile": "audio"], ["expiresAt": invitation.expiresAt + 1]] {
            let invalid = try envelope(["call": call.merging(changed) { _, new in new }])
            PushRegistryHTTPFixture.handler = { request, _ in (200, request.httpMethod == "GET" ? challenge : invalid) }
            await assertFailure(.invalidResponse) { try await service.accept(invitation: invitation, registration: device, fullJID: "bob@localhost/awakened") }
        }
    }

    func testDisabledServerErrorsOversizedRepliesAndCancellationFailClosed() async throws {
        let service = try client()
        for (status, expected) in [(404, NativePushRegistryFailure.unavailable), (403, .rejected), (503, .rejected)] {
            PushRegistryHTTPFixture.handler = { _, _ in (status, Data("{}".utf8)) }
            await assertFailure(expected) { try await service.checkAvailability() }
        }
        PushRegistryHTTPFixture.handler = { _, _ in (200, Data(repeating: 32, count: 16385)) }
        do { try await service.checkAvailability(); XCTFail("Oversized response accepted") } catch {}
        PushRegistryHTTPFixture.handler = { _, _ in XCTFail("Cancelled request reached network"); return (200, Data()) }
        let task = Task { try await Task.sleep(nanoseconds: 1_000_000); try await service.checkAvailability() }
        task.cancel()
        do { try await task.value; XCTFail("Cancelled request accepted") } catch { XCTAssertTrue(error is CancellationError) }
    }
}
