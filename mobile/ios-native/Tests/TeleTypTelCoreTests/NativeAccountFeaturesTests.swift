import Foundation
import XCTest
@testable import TeleTypTelCore

private final class FeatureHTTPFixture: URLProtocol {
    static var handler: ((URLRequest, Data) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            var data = request.httpBody ?? Data()
            if data.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    guard count >= 0, data.count + count <= 280000 else { throw NativeAccountFailure.rejected }
                    if count == 0 { break }; data.append(contentsOf: buffer.prefix(count))
                }
            }
            let (status, bytes) = try XCTUnwrap(Self.handler)(request, data)
            client?.urlProtocol(self, didReceive: try XCTUnwrap(HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)), cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor
final class NativeAccountFeaturesTests: XCTestCase {
    private let profile: [String: Any] = ["accountId": "fiction", "jid": "owner@localhost", "displayName": "Naam", "phoneNumber": "", "preferredLanguage": "nl", "avatarColor": "#2563eb"]
    private func session() throws -> NativeAccountWebSession {
        let settings = URLSessionConfiguration.ephemeral; settings.protocolClasses = [FeatureHTTPFixture.self]
        return NativeAccountWebSession(configuration: try ServerConfiguration(address: "https://example.invalid", domain: "localhost"), cookie: "PHPSESSID=fiction", settings: settings)
    }
    private func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
    func testProfileSaveSendsOnlyEditableFieldsAndRejectsCrossAccountResponse() async throws {
        var current = profile; var posts = 0
        FeatureHTTPFixture.handler = { request, bytes in
            if request.httpMethod == "POST" {
                posts += 1
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-CSRF-Token"), String(repeating: "a", count: 64))
                let input = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: String])
                XCTAssertEqual(Set(input.keys), ["displayName", "phoneNumber", "preferredLanguage", "avatarColor"])
                for (key, value) in input { current[key] = value }
            }
            return (200, try self.json(["ok": true, "profile": current, "csrfToken": String(repeating: "a", count: 64)]))
        }
        let session = try session(); let model = NativeAccountSettingsModel()
        await model.connect(session, accountID: "wrong"); XCTAssertNil(model.profile)
        await model.connect(session, accountID: "fiction")
        var update = try XCTUnwrap(model.profile); update.displayName = "Andere naam"; update.preferredLanguage = "en"
        await model.save(update); XCTAssertEqual(posts, 1); XCTAssertEqual(model.profile?.displayName, "Andere naam")
        update.displayName = "\n"
        await model.save(update); XCTAssertEqual(posts, 1)
        model.detach(); XCTAssertNil(model.profile); await session.close()
    }
    func testChunkUploadIsBoundedAccountBoundAndDoesNotSendChat() async throws {
        let bytes = Data(repeating: 42, count: 262145)
        let selection = try NativeUploadSelection(name: "test.pdf", data: bytes)
        var chunks = 0
        FeatureHTTPFixture.handler = { request, body in
            if request.url?.path == "/api/native-profile.php" {
                return (200, try self.json(["ok": true, "profile": self.profile, "csrfToken": String(repeating: "a", count: 64)]))
            }
            XCTAssertEqual(request.url?.path, "/api/native-upload.php")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "PHPSESSID=fiction")
            XCTAssertLessThan(body.count, 280000)
            let text = String(decoding: body, as: UTF8.self)
            XCTAssertTrue(text.contains("name=\"chunkIndex\"\r\n\r\n\(chunks)\r\n")); chunks += 1
            let value: [String: Any] = chunks == 2 ? ["ok": true, "file": ["id": String(repeating: "f", count: 32), "url": "api/file.php?id=" + String(repeating: "f", count: 32), "size": bytes.count]] : ["ok": true]
            return (200, try self.json(value))
        }
        let session = try session(); let model = NativeFileTransferModel()
        let wrong = await model.upload(selection, session: session, accountID: "wrong")
        XCTAssertNil(wrong); XCTAssertEqual(chunks, 0)
        let link = await model.upload(selection, session: session, accountID: "fiction")
        XCTAssertTrue(link?.hasPrefix("Bestand: test.pdf\nhttps://example.invalid/api/file.php?id=") == true)
        XCTAssertEqual(chunks, 2); XCTAssertNil(model.progress)
        await session.close()
    }
    func testFileReferencesNeverFetchExternalOrUnsafeURLs() throws {
        let configuration = try ServerConfiguration(address: "https://example.invalid", domain: "localhost")
        let id = String(repeating: "f", count: 32)
        XCTAssertNotNil(NativeFileReference.parse("api/file.php?id=" + id, configuration: configuration))
        for value in ["http://example.invalid/api/file.php?id=" + id, "https://other.invalid/api/file.php?id=" + id,
            "https://user@example.invalid/api/file.php?id=" + id, "https://example.invalid/api/file.php?id=" + id + "&next=evil", "https://example.invalid/api/file.php?id=" + id + "#secret"] {
            XCTAssertNil(NativeFileReference.parse(value, configuration: configuration))
        }
        for name in ["../test.pdf", "test.exe", "test\r\n.pdf", "bad\".pdf"] { XCTAssertThrowsError(try NativeUploadSelection(name: name, data: Data([1]))) }
        XCTAssertThrowsError(try NativeUploadSelection(name: "empty.txt", data: Data()))
    }
    func testDownloadDoesNotForwardAuthenticationAndClosedSessionCannotFetch() async throws {
        let session = try session()
        let reference = try XCTUnwrap(NativeFileReference.parse("api/file.php?id=" + String(repeating: "f", count: 32), configuration: session.configuration))
        var count = 0
        FeatureHTTPFixture.handler = { request, _ in count += 1; XCTAssertNil(request.value(forHTTPHeaderField: "Cookie")); return (200, Data("Fictief bestand".utf8)) }
        let result = try await session.downloadFile(reference)
        XCTAssertEqual(result, Data("Fictief bestand".utf8)); await session.close()
        do { _ = try await session.downloadFile(reference); XCTFail("Closed session fetched a file") } catch {}
        XCTAssertEqual(count, 1)
    }
}
