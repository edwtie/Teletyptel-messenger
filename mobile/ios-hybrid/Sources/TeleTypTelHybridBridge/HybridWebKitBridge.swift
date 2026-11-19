import Foundation
import WebKit

@MainActor
public final class HybridWebKitBridge: NSObject, WKScriptMessageHandlerWithReply {
    public static let handlerName = "teletyptelNative"
    private let session: HybridSession
    private weak var webView: WKWebView?

    public init(session: HybridSession) {
        self.session = session
        super.init()
    }

    public func attach(to webView: WKWebView) throws {
        guard self.webView == nil else { throw HybridFailure.invalidState }
        self.webView = webView
        webView.configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: Self.handlerName)
        session.onStateChange = { [weak self] snapshot in self?.send(snapshot) }
    }

    public func detach() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.handlerName, contentWorld: .page)
        session.onStateChange = nil
        webView = nil
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                                      replyHandler: @escaping (Any?, String?) -> Void) {
        guard let webView = webView, message.webView === webView,
              userContentController === webView.configuration.userContentController,
              HybridDocumentPolicy.permits(webView.url, mainFrame: true),
              HybridDocumentPolicy.permits(message.frameInfo.request.url, mainFrame: message.frameInfo.isMainFrame) else {
            replyHandler(nil, HybridFailure.untrustedDocument.rawValue)
            return
        }
        guard let body = message.body as? String, body.utf8.count <= 8192 else {
            replyHandler(nil, HybridFailure.invalidRequest.rawValue)
            return
        }
        do {
            let reply = try session.handle(Data(body.utf8), document: message.frameInfo.request.url, mainFrame: true)
            let value = try JSONSerialization.jsonObject(with: JSONEncoder().encode(reply))
            replyHandler(value, nil)
        } catch let failure as HybridFailure {
            replyHandler(nil, failure.rawValue)
        } catch {
            replyHandler(nil, HybridFailure.invalidRequest.rawValue)
        }
    }

    private func send(_ snapshot: HybridSnapshot) {
        guard let webView = webView, HybridDocumentPolicy.permits(webView.url, mainFrame: true),
              let data = try? JSONEncoder().encode(snapshot),
              let value = try? JSONSerialization.jsonObject(with: data) else { return }
        webView.callAsyncJavaScript("window.dispatchEvent(new CustomEvent('teletyptel:native-state', {detail: state}));",
                                   arguments: ["state": value], in: nil, in: .page, completionHandler: nil)
    }
}
