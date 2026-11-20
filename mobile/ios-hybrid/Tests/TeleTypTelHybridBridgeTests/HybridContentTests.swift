import Foundation
import XCTest
@testable import TeleTypTelHybridBridge

final class HybridContentTests: XCTestCase {
    private func manifest(extra: [String: Any] = [:]) throws -> Data {
        let entry: (String) -> [String: String] = { ["mime": $0, "base64": Data("fixture".utf8).base64EncodedString()] }
        var files: [String: Any] = ["chat.html": entry("text/html"), "chat-client.css": entry("text/css"),
            "xmpp-availability.css": entry("text/css"), "hybrid-login.css": entry("text/css"),
            "native-session.js": entry("text/javascript"), "login-presentation.js": entry("text/javascript"), "contacts-presentation.js": entry("text/javascript"),
            "ui-language.js": entry("text/javascript"), "assets/brand/teletyptel-logo-header@2x.png": entry("image/png")]
        files.merge(extra) { _, incoming in incoming }
        return try JSONSerialization.data(withJSONObject: ["version": 1, "revision": "334688e73c5218be27ad6270c7f96809c94de460", "files": files])
    }

    func testOnlyKnownBundledResourcesCanBeServed() throws {
        let content = try HybridContent(data: manifest())
        XCTAssertEqual(try content.resource(for: URL(string: "capacitor://localhost/chat.html")).mime, "text/html")
        for address in ["https://localhost/chat.html", "capacitor://user@localhost/chat.html", "capacitor://localhost:80/chat.html",
                        "capacitor://localhost/chat.html?remote=other", "capacitor://localhost/%63hat.html",
                        "capacitor://localhost/api/auth/login", "capacitor://localhost/chat-client.js", "capacitor://other/chat.html"] {
            XCTAssertThrowsError(try content.resource(for: URL(string: address)), address)
        }
    }

    func testLegacyEnginesTraversalAndWrongMimeAreRejectedBeforeLoading() throws {
        for path in ["chat-client.js", "jingle-webrtc-audio.js", "../config.php", "assets/brand/../secret.png", "native-server.js"] {
            XCTAssertThrowsError(try HybridContent(data: manifest(extra: [path: ["mime": "text/javascript", "base64": "Zml4dHVyZQ=="]])))
        }
        XCTAssertThrowsError(try HybridContent(data: manifest(extra: ["chat.html": ["mime": "text/javascript", "base64": "Zml4dHVyZQ=="]])))
        XCTAssertThrowsError(try HybridContent(data: Data("{}".utf8)))
    }
}
