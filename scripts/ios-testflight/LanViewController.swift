final class LanViewController: CAPBridgeViewController {
    private let mediaHandler = MessengerMediaHandler()

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        configuration.setURLSchemeHandler(mediaHandler, forURLScheme: "teletyptel-media")
        return configuration
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        if let controller = bridge?.webView?.configuration.userContentController {
            let delegate = bridge?.webView?.navigationDelegate as? WKScriptMessageHandler
            controller.removeScriptMessageHandler(forName: "bridge")
            if let delegate = delegate {
                controller.add(MessengerScriptHandler(delegate: delegate), name: "bridge")
            }
        }
        bridge?.registerPluginInstance(LanSystemTrustPlugin())
        bridge?.registerPluginInstance(TeleTypTelGooglePlugin())
        bridge?.registerPluginInstance(TeleTypTelServerPlugin())
    }
}

@objc(LanSystemTrustPlugin)
final class LanSystemTrustPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LanSystemTrustPlugin"
    let jsName = "LanSystemTrust"
    let pluginMethods: [CAPPluginMethod] = []

    override func handleWKWebViewURLAuthenticationChallenge(
        _ challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) -> Bool {
        guard let host = Bundle.main.object(forInfoDictionaryKey: "TeleTypTelServerHost") as? String,
              challenge.protectionSpace.host == host,
              challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            return false
        }
        completionHandler(.performDefaultHandling, nil)
        return true
    }
}
