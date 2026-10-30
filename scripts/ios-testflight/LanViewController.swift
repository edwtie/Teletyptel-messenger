final class LanViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LanSystemTrustPlugin())
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
