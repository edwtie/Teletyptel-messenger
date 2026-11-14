import Foundation
import XCTest
@testable import TeleTypTelCore

private final class CloudHistoryHTTPFixture: URLProtocol {
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
                    guard count >= 0, body.count + count <= 32768 else { throw NativeCloudHistoryFailure.invalidResponse }
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
final class NativeCloudHistoryTests: XCTestCase {
    private let digest = String(repeating: "a", count: 64)
    private let nextDigest = String(repeating: "b", count: 64)
    private let owner = "owner@localhost"
    private let peer = "peer@localhost"

    override func tearDown() {
        CloudHistoryHTTPFixture.handler = nil
        super.tearDown()
    }

    private func client(cookie: String? = "PHPSESSID=fiction") throws -> NativeCloudHistoryClient {
        let settings = URLSessionConfiguration.ephemeral
        settings.protocolClasses = [CloudHistoryHTTPFixture.self]
        let session = NativeAccountWebSession(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"),
                                              cookie: cookie, settings: settings)
        return NativeCloudHistoryClient(session: session, accountID: "fiction", owner: owner)
    }

    private func fields(_ changes: [String: NativeCloudValue] = [:]) -> [String: NativeCloudValue] {
        var result: [String: NativeCloudValue] = [
            "messageId": .string("original-id"), "conversationPeer": .string(peer), "conversationKind": .string("contact"),
            "conversationName": .string("Peer"), "direction": .string("peer"), "from": .string(peer + "/device"),
            "text": .string("Hello"), "timestamp": .string("2026-11-14 10:20:30"), "version": .string(digest),
            "edited": .bool(false), "retracted": .bool(false), "stylingDisabled": .bool(false), "deliveryStatus": .string("read"),
            "reactions": .object([peer: .array([.string("👍"), .string("❤️")])]),
            "attachment": .object(["url": .string("https://user:opaque@elsewhere.invalid/file"), "size": .number(42)]),
            "location": .object(["latitude": .number(52.1), "longitude": .number(4.3)]),
            "callInfo": .object(["status": .string("ended")]), "jingleHistory": .array([.object(["future": .bool(true)])]),
            "retraction": .null, "futureMetadata": .object(["nested": .array([.null, .number(0), .bool(false), .string("opaque")])])
        ]
        for (key, value) in changes { result[key] = value }
        return result
    }

    private func json(_ value: NativeCloudValue) throws -> Data { try JSONEncoder().encode(value) }

    private func page(_ records: [[String: NativeCloudValue]]? = nil, changes: [String: NativeCloudValue] = [:]) throws -> Data {
        var result: [String: NativeCloudValue] = ["ok": .bool(true), "accountId": .string("fiction"), "owner": .string(owner),
            "messages": .array((records ?? [fields()]).map { .object($0) }), "nextCursor": .null, "saveChat": .bool(true)]
        for (key, value) in changes { result[key] = value }
        return try json(.object(result))
    }

    private func profile(account: String = "fiction", jid: String? = nil, csrf: String? = nil) throws -> Data {
        try json(.object(["ok": .bool(true), "profile": .object(["accountId": .string(account), "jid": .string(jid ?? owner)]),
                          "csrfToken": .string(csrf ?? digest)]))
    }

    private func saved(_ record: [String: NativeCloudValue], changes: [String: NativeCloudValue] = [:]) throws -> Data {
        var result: [String: NativeCloudValue] = ["ok": .bool(true), "accountId": .string("fiction"), "owner": .string(owner), "message": .object(record)]
        for (key, value) in changes { result[key] = value }
        return try json(.object(result))
    }

    private func assertFailure(_ expected: NativeCloudHistoryFailure, file: StaticString = #filePath, line: UInt = #line,
                               operation: () async throws -> Void) async {
        do { try await operation(); XCTFail("Expected \(expected)", file: file, line: line) }
        catch { XCTAssertEqual(error as? NativeCloudHistoryFailure, expected, file: file, line: line) }
    }

    func testJSONAndRichFieldsRoundTripWithoutAFieldsWrapper() throws {
        let message = NativeCloudMessage(fields: fields())
        let bytes = try JSONEncoder().encode(message)
        XCTAssertEqual(try JSONDecoder().decode(NativeCloudMessage.self, from: bytes), message)
        XCTAssertEqual(try JSONDecoder().decode([String: NativeCloudValue].self, from: bytes), message.fields)
        XCTAssertEqual(message.messageID, "original-id")
        XCTAssertEqual(message.key, "contact\u{0}peer@localhost\u{0}original-id")
        XCTAssertEqual(message.peer, peer); XCTAssertEqual(message.kind, "contact")
        XCTAssertEqual(message.direction, "peer"); XCTAssertEqual(message.sender, peer + "/device")
        XCTAssertEqual(message.text, "Hello"); XCTAssertFalse(message.edited); XCTAssertFalse(message.retracted)
        XCTAssertEqual(message.reactions, [peer: ["👍", "❤️"]])
        XCTAssertEqual(message.deliveryStatus, "read"); XCTAssertEqual(message.version, digest)
        XCTAssertThrowsError(try json(.number(.infinity)))
        XCTAssertThrowsError(try json(.number(.nan)))
        XCTAssertEqual(try JSONDecoder().decode(NativeCloudValue.self, from: Data("true".utf8)), .bool(true))
        XCTAssertEqual(try JSONDecoder().decode(NativeCloudValue.self, from: Data("1".utf8)), .number(1))
    }

    func testDatesUseUTCAndAcceptPHPAndISO8601() throws {
        let php = NativeCloudMessage(fields: fields()).date
        for timestamp in ["2026-11-14T10:20:30Z", "2026-11-14T11:20:30+01:00", "2026-11-14 10:20:30.000", "2026-11-14T10:20:30.000Z"] {
            let message = NativeCloudMessage(fields: fields(["timestamp": .string(timestamp)]))
            try message.validate(); XCTAssertEqual(message.date, php)
        }
        let milliseconds = NativeCloudMessage(fields: fields(["timestamp": .string("2026-11-14 10:20:30.123")]))
        XCTAssertEqual(milliseconds.date.timeIntervalSince(php), 0.123, accuracy: 0.00001)
        for timestamp in ["", "yesterday", "2026-02-30 10:20:30", "2026-02-30T10:20:30Z", "2026-11-14 10:20:30junk", "2026-11-14T10:20:30", "2026-11-14 25:00:00"] {
            XCTAssertThrowsError(try NativeCloudMessage(fields: fields(["timestamp": .string(timestamp)])).validate())
        }
    }

    func testMessageBoundsTypesAndTypedReactions() throws {
        try NativeCloudMessage(fields: fields(["text": .string(""), "retracted": .bool(true), "reactions": .array([])])).validate()
        try NativeCloudMessage(fields: fields(["messageId": .string(String(repeating: "é", count: 75)),
                                               "text": .string(String(repeating: "a", count: 8192))])).validate()
        var actors: [String: NativeCloudValue] = [:]
        for index in 0..<64 { actors["actor-\(index)"] = .array([.string("👍")]) }
        try NativeCloudMessage(fields: fields(["reactions": .object(actors)])).validate()
        actors["extra"] = .array([])
        let invalid: [[String: NativeCloudValue]] = [
            ["messageId": .string("")], ["messageId": .string(String(repeating: "é", count: 76))],
            ["messageId": .string("bad\nidentifier")], ["text": .string(String(repeating: "é", count: 4097))],
            ["text": .string("bad\u{0}text")], ["text": .null], ["edited": .string("true")], ["direction": .string("outgoing")],
            ["conversationPeer": .string(peer + "/device")], ["conversationKind": .string("unknown")],
            ["version": .string("bad")], ["version": .number(1)], ["deliveryStatus": .bool(true)],
            ["reactions": .array([.string("👍")])], ["reactions": .object([peer: .string("👍")])],
            ["reactions": .object([peer: .array([.number(1)])])], ["reactions": .object([peer: .array([.string("text")])])],
            ["reactions": .object([peer: .array(Array(repeating: .string("👍"), count: 17))])],
            ["reactions": .object([peer: .array([.string("👍"), .string("👍")])])], ["reactions": .object(actors)]
        ]
        for change in invalid { XCTAssertThrowsError(try NativeCloudMessage(fields: fields(change)).validate(), "\(change.keys)") }
    }

    func testIdentityCannotBeChangedThroughMutableFields() throws {
        var candidate = NativeCloudMessage(fields: fields())
        candidate.fields["text"] = .string("Edited")
        candidate.fields["edited"] = .bool(true)
        try candidate.validate(); XCTAssertEqual(candidate.text, "Edited"); XCTAssertTrue(candidate.edited)
        XCTAssertEqual(candidate.fields["futureMetadata"], fields()["futureMetadata"])
        let mutations: [String: NativeCloudValue] = ["messageId": .string("latest-stanza-id"), "conversationPeer": .string("other@localhost"),
            "conversationKind": .string("group"), "direction": .string("self"), "from": .string(owner), "timestamp": .string("2026-11-14 10:20:31")]
        for (key, value) in mutations {
            var changed = candidate; changed.fields[key] = value
            XCTAssertThrowsError(try changed.validate())
            XCTAssertThrowsError(try JSONEncoder().encode(changed))
        }
    }

    func testFetchUsesOnlyAuthenticatedHistoryRouteAndOpaqueCursor() async throws {
        let client = try client(); let cursor = "opaque+/=?&before=not-a-url"
        var requests = 0
        CloudHistoryHTTPFixture.handler = { request, body in
            requests += 1
            XCTAssertEqual(request.url?.scheme, "https"); XCTAssertEqual(request.url?.host, "example.invalid")
            XCTAssertEqual(request.url?.path, "/api/native-history.php"); XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertTrue(body.isEmpty)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fiction")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://example.invalid")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            XCTAssertNil(request.value(forHTTPHeaderField: "X-CSRF-Token"))
            let items = try XCTUnwrap(URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems)
            XCTAssertEqual(items.count, 5)
            XCTAssertEqual(Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") }),
                           ["accountId": "fiction", "peer": self.peer, "kind": "contact", "limit": "50", "before": cursor])
            return (200, try self.page(changes: ["nextCursor": .string(cursor), "saveChat": .bool(false)]))
        }
        let page = try await client.fetch(peer: peer, kind: "contact", before: cursor)
        XCTAssertEqual(page.messages.first?.fields, fields()); XCTAssertEqual(page.nextCursor, cursor)
        XCTAssertFalse(page.saveChat); XCTAssertEqual(requests, 1)
    }

    func testFetchRejectsWrongAccountOwnerPeerKindDuplicatesAndVersions() async throws {
        let client = try client()
        var unversioned = fields(); unversioned.removeValue(forKey: "version")
        let payloads = try [
            page(changes: ["accountId": .string("other")]), page(changes: ["owner": .string("Owner@localhost")]),
            page(changes: ["ok": .bool(false)]), page([fields(["conversationPeer": .string("other@localhost")])]),
            page([fields(["conversationKind": .string("group"), "from": .string(peer + "/nick")])]),
            page([fields(), fields()]), page([unversioned]), page([fields(["version": .null])]),
            page([fields(["version": .string(String(repeating: "g", count: 64))])]),
            page(changes: ["nextCursor": .string(String(repeating: "x", count: 1025))]),
            page(changes: ["nextCursor": .string("bad\r\ncursor")]), page(changes: ["nextCursor": .number(1)])
        ]
        for payload in payloads {
            CloudHistoryHTTPFixture.handler = { _, _ in (200, payload) }
            await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: self.peer, kind: "contact", before: nil) }
        }
    }

    func testFetchLimitsRecordsAndChecksSenderWithoutInferringGroupRealJIDs() async throws {
        let client = try client()
        let fifty = (0..<50).map { fields(["messageId": .string("m-\($0)")]) }
        CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.page(fifty)) }
        let page = try await client.fetch(peer: peer, kind: "contact", before: nil)
        XCTAssertEqual(page.messages.count, 50)
        CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.page(fifty + [self.fields(["messageId": .string("overflow")])])) }
        await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: self.peer, kind: "contact", before: nil) }
        for change in [["from": NativeCloudValue.string(owner)], ["direction": .string("self"), "from": .string(peer)]] {
            CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.page([self.fields(change)])) }
            await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: self.peer, kind: "contact", before: nil) }
        }
        CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.page([self.fields(["direction": .string("self"), "from": .string(self.owner + "/device")])])) }
        _ = try await client.fetch(peer: peer, kind: "contact", before: nil)
        let room = "room@conference.localhost"
        let group = fields(["conversationKind": .string("group"), "conversationPeer": .string(room), "from": .string(room + "/Anonymous Nick"),
                            "realJid": .string("not-the-sender@localhost")])
        CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.page([group])) }
        let groups = try await client.fetch(peer: room, kind: "group", before: nil)
        XCTAssertEqual(groups.messages.first?.sender, room + "/Anonymous Nick")
        for sender in [owner, room, room + "/", room + "/nick/other", "other@conference.localhost/nick"] {
            var invalid = group; invalid["from"] = .string(sender)
            CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.page([invalid])) }
            await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: room, kind: "group", before: nil) }
        }
    }

    func testInvalidRequestsAndMissingSessionNeverAccessNetwork() async throws {
        var requests = 0
        CloudHistoryHTTPFixture.handler = { _, _ in requests += 1; return (500, Data()) }
        let client = try client()
        for cursor in ["", String(repeating: "é", count: 513), "\n"] {
            await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: self.peer, kind: "contact", before: cursor) }
        }
        await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: "https://outside.invalid", kind: "contact", before: nil) }
        await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: self.peer, kind: "groupchat", before: nil) }
        let unauthenticated = try self.client(cookie: nil)
        await assertFailure(.unavailable) { _ = try await unauthenticated.fetch(peer: self.peer, kind: "contact", before: nil) }
        await assertFailure(.unavailable) { _ = try await unauthenticated.conversations() }
        XCTAssertEqual(requests, 0)
    }

    func testSaveBindsCSRFAndCASWhilePreservingOpaqueMetadata() async throws {
        let client = try client(); var candidate = NativeCloudMessage(fields: fields())
        candidate.fields["text"] = .string("Updated"); candidate.fields["edited"] = .bool(true)
        var calls: [String] = []
        CloudHistoryHTTPFixture.handler = { request, body in
            calls.append(try XCTUnwrap(request.url?.path))
            XCTAssertEqual(request.url?.host, "example.invalid")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fiction")
            if request.url?.path == "/api/native-profile.php" {
                XCTAssertEqual(request.httpMethod, "GET"); return (200, try self.profile())
            }
            XCTAssertEqual(request.httpMethod, "POST"); XCTAssertNil(request.url?.query)
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), self.digest)
            let input = try JSONDecoder().decode([String: NativeCloudValue].self, from: body)
            XCTAssertEqual(Set(input.keys), ["accountId", "message", "expectedVersion"])
            XCTAssertEqual(input["accountId"], .string("fiction")); XCTAssertEqual(input["expectedVersion"], .string(self.digest))
            XCTAssertEqual(input["message"], .object(candidate.fields))
            var result = candidate.fields; result["version"] = .string(self.nextDigest)
            return (200, try self.saved(result))
        }
        let result = try await client.save(candidate, expectedVersion: digest)
        XCTAssertEqual(calls, ["/api/native-profile.php", "/api/native-history.php"])
        XCTAssertEqual(result.messageID, "original-id"); XCTAssertEqual(result.version, nextDigest)
        XCTAssertEqual(result.fields["futureMetadata"], candidate.fields["futureMetadata"])
        XCTAssertEqual(result.fields["attachment"], candidate.fields["attachment"])
    }

    func testInsertExplicitlySendsNullExpectedVersion() async throws {
        let client = try client(); var record = fields(); record.removeValue(forKey: "version")
        let message = NativeCloudMessage(fields: record)
        CloudHistoryHTTPFixture.handler = { request, body in
            if request.url?.path == "/api/native-profile.php" { return (200, try self.profile()) }
            let input = try JSONDecoder().decode([String: NativeCloudValue].self, from: body)
            XCTAssertEqual(input["expectedVersion"], .null)
            var response = record; response["version"] = .string(self.digest)
            return (200, try self.saved(response))
        }
        let saved = try await client.save(message, expectedVersion: nil)
        XCTAssertEqual(saved.version, digest)
    }

    func testSaveRejectsPreflightIdentityVersionAndSizeChangesWithoutRequests() async throws {
        let client = try client(); var requests = 0
        CloudHistoryHTTPFixture.handler = { _, _ in requests += 1; return (500, Data()) }
        var changed = NativeCloudMessage(fields: fields()); changed.fields["messageId"] = .string("new-stanza-id")
        await assertFailure(.invalidResponse) { _ = try await client.save(changed, expectedVersion: self.digest) }
        let original = NativeCloudMessage(fields: fields())
        for version in [nil, "bad", nextDigest] {
            await assertFailure(.invalidResponse) { _ = try await client.save(original, expectedVersion: version) }
        }
        var huge = original; huge.fields["opaque"] = .string(String(repeating: "x", count: 32768))
        await assertFailure(.invalidResponse) { _ = try await client.save(huge, expectedVersion: self.digest) }
        let wrongSender = NativeCloudMessage(fields: fields(["from": .string(owner)]))
        await assertFailure(.invalidResponse) { _ = try await client.save(wrongSender, expectedVersion: self.digest) }
        XCTAssertEqual(requests, 0)
    }

    func testProfileMustMatchExactAccountAndOwnerBeforePosting() async throws {
        let client = try client(); let message = NativeCloudMessage(fields: fields())
        for payload in try [profile(account: "other"), profile(jid: "Owner@localhost"), profile(csrf: "bad")] {
            var posts = 0
            CloudHistoryHTTPFixture.handler = { request, _ in
                if request.httpMethod == "POST" { posts += 1 }
                return (200, payload)
            }
            await assertFailure(.invalidResponse) { _ = try await client.save(message, expectedVersion: self.digest) }
            XCTAssertEqual(posts, 0)
        }
    }

    func testSaveRejectsWrongResponseScopeIdentityAndMissingVersion() async throws {
        let client = try client(); let original = NativeCloudMessage(fields: fields())
        var unversioned = fields(); unversioned.removeValue(forKey: "version")
        let payloads = try [saved(fields(), changes: ["accountId": .string("other")]), saved(fields(), changes: ["owner": .string("Owner@localhost")]),
            saved(fields(["messageId": .string("other")])), saved(fields(["from": .string(peer + "/other-device")])),
            saved(fields(["timestamp": .string("2026-11-14 10:20:31")])), saved(unversioned)]
        for payload in payloads {
            CloudHistoryHTTPFixture.handler = { request, _ in
                (200, request.url?.path == "/api/native-profile.php" ? try self.profile() : payload)
            }
            await assertFailure(.invalidResponse) { _ = try await client.save(original, expectedVersion: self.digest) }
        }
    }

    func testConflictAndSaveDisabledAreTypedAndNeverRetried() async throws {
        let client = try client(); let message = NativeCloudMessage(fields: fields())
        let failures: [(Int, String, NativeCloudHistoryFailure)] = [(409, "cloud_history_conflict", .conflict), (403, "cloud_history_disabled", .disabled),
            (503, "cloud_history_unavailable", .unavailable), (409, "stale_version", .conflict), (403, "save_disabled", .disabled),
            (403, "save-disabled", .disabled), (403, "save_chat_disabled", .disabled), (403, "csrf", .failed),
            (401, "unauthorized", .failed), (404, "not_found", .unavailable), (500, "internal", .failed)]
        for (status, code, failure) in failures {
            var profiles = 0; var posts = 0
            CloudHistoryHTTPFixture.handler = { request, _ in
                if request.url?.path == "/api/native-profile.php" { profiles += 1; return (200, try self.profile()) }
                posts += 1; return (status, try self.json(.object(["ok": .bool(false), "error": .string(code)])))
            }
            await assertFailure(failure) { _ = try await client.save(message, expectedVersion: self.digest) }
            XCTAssertEqual(profiles, 1); XCTAssertEqual(posts, 1)
        }
    }

    func testMalformedResponseAndTransportFailureDoNotBecomeEmptyHistory() async throws {
        let client = try client()
        CloudHistoryHTTPFixture.handler = { _, _ in (200, Data("not-json".utf8)) }
        await assertFailure(.invalidResponse) { _ = try await client.fetch(peer: self.peer, kind: "contact", before: nil) }
        CloudHistoryHTTPFixture.handler = { _, _ in throw URLError(.notConnectedToInternet) }
        await assertFailure(.failed) { _ = try await client.fetch(peer: self.peer, kind: "contact", before: nil) }
        CloudHistoryHTTPFixture.handler = { _, _ in throw URLError(.cancelled) }
        do { _ = try await client.fetch(peer: peer, kind: "contact", before: nil); XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
    }

    func testCatalogIsAccountBoundAndUsesNoPeerOrArbitraryRoute() async throws {
        let client = try client()
        let conversations: [NativeCloudValue] = [.object(["peer": .string(peer), "kind": .string("contact"), "name": .string("Peer")]),
            .object(["peer": .string("room@conference.localhost"), "kind": .string("group"), "name": .string("Room")])]
        CloudHistoryHTTPFixture.handler = { request, _ in
            XCTAssertEqual(request.httpMethod, "GET"); XCTAssertEqual(request.url?.path, "/api/native-history.php")
            let items = try XCTUnwrap(URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems)
            XCTAssertEqual(Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") }),
                           ["accountId": "fiction", "kind": "conversations", "limit": "32"])
            return (200, try self.json(.object(["ok": .bool(true), "accountId": .string("fiction"), "owner": .string(self.owner),
                                                "saveChat": .bool(true), "conversations": .array(conversations)])))
        }
        let result = try await client.conversations()
        XCTAssertEqual(result, [NativeCloudConversation(peer: peer, kind: "contact", name: "Peer"),
                                NativeCloudConversation(peer: "room@conference.localhost", kind: "group", name: "Room")])
    }

    func testCatalogRejectsForeignScopeDuplicatesInvalidEntriesAndOverLimit() async throws {
        let client = try client()
        let entry: NativeCloudValue = .object(["peer": .string(peer), "kind": .string("contact"), "name": .string("Peer")])
        let variants: [[String: NativeCloudValue]] = [["accountId": .string("other")], ["owner": .string("Owner@localhost")],
            ["conversations": .array([entry, entry])], ["conversations": .array(Array(repeating: entry, count: 33))],
            ["conversations": .array([.object(["peer": .string(peer + "/device"), "kind": .string("contact"), "name": .string("Peer")])])],
            ["conversations": .array([.object(["peer": .string(peer), "kind": .string("wrong"), "name": .string("Peer")])])]]
        for variant in variants {
            var payload: [String: NativeCloudValue] = ["ok": .bool(true), "accountId": .string("fiction"), "owner": .string(owner),
                "saveChat": .bool(true), "conversations": .array([entry])]
            for (key, value) in variant { payload[key] = value }
            CloudHistoryHTTPFixture.handler = { _, _ in (200, try self.json(.object(payload))) }
            await assertFailure(.invalidResponse) { _ = try await client.conversations() }
        }
    }

    func testExistingMocksNeedNotImplementCatalog() async throws {
        struct Mock: NativeCloudHistoryServing {
            func fetch(peer: String, kind: String, before: String?) async throws -> NativeCloudHistoryPage {
                NativeCloudHistoryPage(messages: [], nextCursor: nil, saveChat: true)
            }
            func save(_ message: NativeCloudMessage, expectedVersion: String?) async throws -> NativeCloudMessage { message }
        }
        let result = try await Mock().conversations()
        XCTAssertTrue(result.isEmpty)
    }
}
