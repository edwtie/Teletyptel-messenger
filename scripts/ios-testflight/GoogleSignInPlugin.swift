@objc(TeleTypTelGooglePlugin)
final class TeleTypTelGooglePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelGooglePlugin"
    let jsName = "TeleTypTelGoogle"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]
    private var signingIn = false

    private var trustedPage: Bool {
        return isBundledMessenger(bridge?.webView?.url)
    }

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trustedPage, let presenter = self.bridge?.viewController else {
                call.reject("Google sign-in is only available in the bundled Messenger.", "UNTRUSTED_ORIGIN")
                return
            }
            guard !self.signingIn else {
                call.reject("Google sign-in is already in progress.", "BUSY")
                return
            }
            guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                  let serverClientID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String,
                  call.getString("serverClientId") == serverClientID else {
                call.reject("The app and server Google configuration do not match.", "CONFIGURATION")
                return
            }
            self.signingIn = true
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID, serverClientID: serverClientID)
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                self.signingIn = false
                defer { GIDSignIn.sharedInstance.signOut() }
                if let error = error {
                    let cancelled = (error as? GIDSignInError)?.code == .canceled
                    call.reject(cancelled ? "Google sign-in cancelled." : "Google sign-in failed. Please try again.", cancelled ? "CANCELLED" : "GOOGLE_FAILED")
                    return
                }
                guard self.trustedPage, let code = result?.serverAuthCode, !code.isEmpty else {
                    call.reject("Google did not provide a server authorization code.", "MISSING_CODE")
                    return
                }
                call.resolve(["serverAuthCode": code])
            }
        }
    }
}
