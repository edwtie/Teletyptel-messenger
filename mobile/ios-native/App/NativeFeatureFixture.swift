#if DEBUG
import Foundation
import UIKit

final class NativeFeatureFixture: URLProtocol {
    private static let lock = NSLock()
    private static var profile: [String: Any] = ["accountId": "fixture-ui", "jid": "fixture@localhost", "displayName": "Fictieve gebruiker", "phoneNumber": "", "preferredLanguage": "nl", "avatarColor": "#2563eb"]
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "example.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); defer { Self.lock.unlock() }
        var value: [String: Any] = ["ok": false, "error": "fixture_route_unavailable"]
        var status = 404
        if request.url?.path == "/api/account.php", request.httpMethod == "GET",
           let url = request.url, let jid = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "lookupJid" })?.value,
           ["fixture@localhost", "demo-contact@localhost"].contains(jid) {
            let image = UIGraphicsImageRenderer(size: CGSize(width: 72, height: 72)).image { context in
                UIColor.systemBlue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 72, height: 72))
                UIColor.white.setFill()
                UIBezierPath(ovalIn: CGRect(x: 25, y: 12, width: 22, height: 22)).fill()
                UIBezierPath(ovalIn: CGRect(x: 13, y: 39, width: 46, height: 44)).fill()
            }
            value = ["ok": true, "profile": ["jid": jid, "displayName": jid == "fixture@localhost" ? "Fictieve gebruiker" : "Fictief contact", "avatarColor": "#2563eb", "avatarDataUrl": "data:image/png;base64," + (image.pngData()?.base64EncodedString() ?? "")]]
            status = 200
        }
        if request.url?.path == "/api/native-profile.php" {
            var data = request.httpBody ?? Data()
            if data.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while data.count < 32768 {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
                }
            }
            if request.httpMethod == "POST",
               let update = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
                for (key, field) in update where ["displayName", "phoneNumber", "preferredLanguage", "avatarColor"].contains(key) { Self.profile[key] = field }
            }
            value = ["ok": true, "profile": Self.profile, "csrfToken": String(repeating: "a", count: 64)]; status = 200
        }
        if request.url?.path == "/api/native-upload.php" {
            value = ["ok": true, "file": ["id": String(repeating: "f", count: 32), "url": "api/file.php?id=" + String(repeating: "f", count: 32), "size": Data("Fictieve testbijlage".utf8).count]]; status = 200
        }
        guard let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"]),
              let bytes = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
