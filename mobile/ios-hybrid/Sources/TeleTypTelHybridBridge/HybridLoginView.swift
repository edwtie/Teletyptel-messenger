#if canImport(UIKit)
import SwiftUI
import UIKit
import WebKit

@MainActor
public struct HybridLoginView: UIViewControllerRepresentable {
    private let session: HybridSession
    private let content: HybridContent

    public init(session: HybridSession, content: HybridContent) {
        self.session = session
        self.content = content
    }

    public func makeUIViewController(context: Context) -> HybridLoginViewController {
        HybridLoginViewController(session: session, content: content)
    }

    public func updateUIViewController(_ uiViewController: HybridLoginViewController, context: Context) {}

    public static func dismantleUIViewController(_ uiViewController: HybridLoginViewController, coordinator: ()) {
        uiViewController.detachPresentation()
    }
}

@MainActor
public final class HybridLoginViewController: UIViewController {
    private let content: HybridContent
    private let sessionBridge: HybridWebKitBridge
    private let navigationPolicy = HybridNavigationPolicy()
    private var webView: WKWebView?

    public init(session: HybridSession, content: HybridContent) {
        self.content = content
        self.sessionBridge = HybridWebKitBridge(session: session)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Use init(session:content:)") }

    public override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.setURLSchemeHandler(HybridContentHandler(content: content), forURLScheme: "capacitor")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = navigationPolicy
        webView.uiDelegate = navigationPolicy
        webView.isOpaque = true
        webView.backgroundColor = .white
        webView.scrollView.backgroundColor = .white
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        self.webView = webView
        view = webView
        do {
            try sessionBridge.attach(to: webView)
            webView.load(URLRequest(url: URL(string: "capacitor://localhost/chat.html")!))
        } catch {
            let status = UILabel()
            status.text = "De hybride weergave kon niet starten."
            status.textAlignment = .center
            status.numberOfLines = 0
            status.textColor = .label
            status.backgroundColor = .systemBackground
            view = status
        }
    }

    public func detachPresentation() {
        sessionBridge.detach()
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
    }
}
#endif
