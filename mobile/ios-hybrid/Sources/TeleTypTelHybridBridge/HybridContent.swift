import Foundation
import WebKit

public struct HybridContent {
    private struct Manifest: Decodable {
        let version: Int
        let revision: String
        let files: [String: Resource]
    }

    private struct Resource: Decodable {
        let mime: String
        let base64: String
    }

    private let resources: [String: (mime: String, data: Data)]
    private static let scripts: Set<String> = ["native-session.js", "login-presentation.js", "ui-language.js"]
    private static let styles: Set<String> = ["chat-client.css", "xmpp-availability.css", "hybrid-login.css"]

    public init(data: Data) throws {
        guard data.count <= 24 * 1024 * 1024,
              let manifest = try? JSONDecoder().decode(Manifest.self, from: data), manifest.version == 1,
              manifest.revision == "334688e73c5218be27ad6270c7f96809c94de460",
              manifest.files.count <= 32 else { throw HybridFailure.invalidRequest }
        let required = Self.scripts.union(Self.styles).union(["chat.html", "assets/brand/teletyptel-logo-header@2x.png"])
        guard required.isSubset(of: Set(manifest.files.keys)) else { throw HybridFailure.invalidRequest }
        var resources: [String: (mime: String, data: Data)] = [:]
        var bytes = 0
        for (path, resource) in manifest.files {
            guard let mime = Self.mime(for: path), mime == resource.mime,
                  let decoded = Data(base64Encoded: resource.base64), !decoded.isEmpty else { throw HybridFailure.invalidRequest }
            bytes += decoded.count
            guard bytes <= 16 * 1024 * 1024 else { throw HybridFailure.invalidRequest }
            resources[path] = (mime, decoded)
        }
        self.resources = resources
    }

    private static func mime(for path: String) -> String? {
        guard !path.split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
        if path == "chat.html" { return "text/html" }
        if scripts.contains(path) { return "text/javascript" }
        if styles.contains(path) { return "text/css" }
        guard path.range(of: #"\Aassets/(brand|backgrounds|icons)/[a-zA-Z0-9_@/-]+\.(png|svg)\z"#, options: .regularExpression) != nil else { return nil }
        return path.hasSuffix(".svg") ? "image/svg+xml" : "image/png"
    }

    public func resource(for url: URL?) throws -> (mime: String, data: Data) {
        guard let url = url, let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "capacitor", parts.host == "localhost", parts.port == nil,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.percentEncodedPath == parts.path, parts.path.hasPrefix("/"),
              let resource = resources[String(parts.path.dropFirst())] else { throw HybridFailure.untrustedDocument }
        return resource
    }
}

@MainActor
public final class HybridContentHandler: NSObject, WKURLSchemeHandler {
    private let content: HybridContent

    public init(content: HybridContent) { self.content = content }

    public func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        do {
            guard urlSchemeTask.request.httpMethod == "GET", let url = urlSchemeTask.request.url else { throw HybridFailure.invalidRequest }
            let resource = try content.resource(for: url)
            urlSchemeTask.didReceive(URLResponse(url: url, mimeType: resource.mime, expectedContentLength: resource.data.count,
                                                textEncodingName: resource.mime.hasPrefix("text/") ? "utf-8" : nil))
            urlSchemeTask.didReceive(resource.data)
            urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(HybridFailure.untrustedDocument) }
    }

    public func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
}

@MainActor
public final class HybridNavigationPolicy: NSObject, WKNavigationDelegate, WKUIDelegate {
    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(HybridDocumentPolicy.permits(navigationAction.request.url, mainFrame: navigationAction.targetFrame?.isMainFrame == true) ? .allow : .cancel)
    }

    public func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(HybridDocumentPolicy.permits(navigationResponse.response.url, mainFrame: navigationResponse.isForMainFrame) ? .allow : .cancel)
    }

    public func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                        initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                        decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
}
