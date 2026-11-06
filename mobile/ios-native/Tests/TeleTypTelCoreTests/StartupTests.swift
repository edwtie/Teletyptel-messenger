import XCTest
@testable import TeleTypTelCore

final class StartupTests: XCTestCase {
    func testConfigurationUsesSecureSameHostSocket() throws {
        let configuration = try ServerConfiguration(address: "https://192.0.2.1:8443/", domain: "LOCALHOST")
        XCTAssertEqual(configuration.webSocket.absoluteString, "wss://192.0.2.1:8443/xmpp-websocket")
        XCTAssertEqual(configuration.domain, "localhost")
        XCTAssertEqual(XMPPProbeStream.opening(for: configuration),
                       "<open xmlns=\"urn:ietf:params:xml:ns:xmpp-framing\" to=\"localhost\" version=\"1.0\"/>")
    }

    func testUnsafeConfigurationRejected() {
        for address in ["http://example.org", "wss://example.org", "https://user:secret@example.org",
                        "https://example.org/chat.html", "https://example.org?token=value",
                        "https://example.org#fragment", "https://example.org:0", "https://example.org:65536"] {
            XCTAssertThrowsError(try ServerConfiguration(address: address, domain: "localhost"), address)
        }
        for domain in ["", "user@example.org", "host/path", "-host", "host-", "a..b", "a b", "a\"b",
                       String(repeating: "a", count: 64), "host\nother"] {
            XCTAssertThrowsError(try ServerConfiguration(address: "https://example.org", domain: domain), domain)
        }
    }

    func testOldAttemptsCannotChangeNewStartup() {
        var state = StartupState()
        let old = state.begin()
        let current = state.begin()
        state.complete(old)
        XCTAssertEqual(state.phase, .checking)
        state.complete(current, failure: .certificate)
        XCTAssertEqual(state.phase, .failed(.certificate))
        state.complete(current)
        XCTAssertEqual(state.phase, .failed(.certificate))
    }

    func testResetAndCancelIgnoreLateResults() {
        var state = StartupState()
        let cancelled = state.begin()
        state.cancel()
        state.complete(cancelled)
        XCTAssertEqual(state.phase, .cancelled)
        let reset = state.begin()
        state.reset()
        state.complete(reset, failure: .offline)
        XCTAssertEqual(state.phase, .idle)
        let valid = state.begin()
        state.complete(valid)
        XCTAssertEqual(state.phase, .available)
        XCTAssertNil(state.attempt)
    }

    func testCertificateTimeoutAndProtocolRemainDistinct() {
        XCTAssertEqual(ConnectionFailure.classify(URLError(.serverCertificateUntrusted)), .certificate)
        XCTAssertEqual(ConnectionFailure.classify(URLError(.timedOut)), .timeout)
        XCTAssertEqual(ConnectionFailure.classify(URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(ConnectionFailure.classify(ConnectionFailure.protocolMismatch), .protocolMismatch)
    }
}
