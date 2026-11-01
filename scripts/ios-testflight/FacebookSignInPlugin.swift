@objc(TeleTypTelFacebookPlugin)
final class TeleTypTelFacebookPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelFacebookPlugin"
    let jsName = "TeleTypTelFacebook"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]
    private var signingIn = false
    #if canImport(FacebookCore) && canImport(FacebookLogin)
    private lazy var loginManager = LoginManager()
    #endif

    private var trustedPage: Bool {
        return isBundledMessenger(bridge?.webView?.url)
    }

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trustedPage, let presenter = self.bridge?.viewController else {
                call.reject("Facebook sign-in is only available in the bundled Messenger.", "UNTRUSTED_ORIGIN")
                return
            }
            guard !self.signingIn else {
                call.reject("Facebook sign-in is already in progress.", "BUSY")
                return
            }
            #if canImport(FacebookCore) && canImport(FacebookLogin)
            guard Bundle.main.object(forInfoDictionaryKey: "TeleTypTelFacebookEnabled") as? Bool == true,
                  let appID = Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String,
                  !appID.isEmpty, call.getString("appId") == appID,
                  let clientToken = Bundle.main.object(forInfoDictionaryKey: "FacebookClientToken") as? String,
                  !clientToken.isEmpty else {
                call.reject("The app and server Facebook configuration do not match.", "CONFIGURATION")
                return
            }
            guard let nonce = call.getString("nonce"), nonce.utf8.count == 64,
                  nonce.rangeOfCharacter(from: CharacterSet(charactersIn: "0123456789abcdefABCDEF").inverted) == nil,
                  let configuration = LoginConfiguration(permissions: ["public_profile", "email"], tracking: .limited, nonce: nonce) else {
                call.reject("A valid server nonce is required for Facebook sign-in.", "INVALID_NONCE")
                return
            }
            self.signingIn = true
            self.loginManager.logOut()
            self.loginManager.logIn(viewController: presenter, configuration: configuration) { result in
                DispatchQueue.main.async {
                    defer {
                        self.loginManager.logOut()
                        self.signingIn = false
                    }
                    guard self.trustedPage else {
                        call.reject("Facebook sign-in is only available in the bundled Messenger.", "UNTRUSTED_ORIGIN")
                        return
                    }
                    switch result {
                    case .cancelled:
                        call.reject("Facebook sign-in cancelled.", "CANCELLED")
                    case .failed:
                        call.reject("Facebook sign-in failed. Please try again.", "FACEBOOK_FAILED")
                    case .success:
                        guard let token = AuthenticationToken.current, token.nonce == nonce, !token.tokenString.isEmpty else {
                            call.reject("Facebook did not provide the expected authentication token.", "MISSING_TOKEN")
                            return
                        }
                        call.resolve(["token": token.tokenString])
                    }
                }
            }
            #else
            call.reject("Facebook sign-in is not configured in this build.", "CONFIGURATION")
            #endif
        }
    }
}
