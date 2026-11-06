import AudioToolbox

@objc(TeleTypTelIncomingCallPlugin)
final class TeleTypTelIncomingCallPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelIncomingCallPlugin"
    let jsName = "TeleTypTelIncomingCall"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pulse", returnType: CAPPluginReturnPromise)
    ]
    private var lastPulseAt: TimeInterval = -.infinity

    @objc func pulse(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard isBundledMessenger(self.bridge?.webView?.url) else {
                call.reject("Call alerts are only available in the bundled Messenger.", "UNTRUSTED_ORIGIN")
                return
            }
            guard let session = call.getString("sid"), !session.isEmpty, session.count <= 256 else {
                call.reject("A valid call session is required.", "INVALID_SESSION")
                return
            }
            guard UIDevice.current.userInterfaceIdiom == .phone else {
                call.resolve(["requested": false, "reason": "UNSUPPORTED_DEVICE"])
                return
            }
            let biometrics = MessengerBiometricSession.shared
            guard UIApplication.shared.applicationState == .active,
                  !biometrics.enabled || biometrics.unlocked else {
                call.resolve(["requested": false, "reason": "INACTIVE"])
                return
            }
            let now = ProcessInfo.processInfo.systemUptime
            guard now - self.lastPulseAt >= 2.5 else {
                call.resolve(["requested": false, "reason": "RATE_LIMITED"])
                return
            }
            self.lastPulseAt = now
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            call.resolve(["requested": true])
        }
    }
}
