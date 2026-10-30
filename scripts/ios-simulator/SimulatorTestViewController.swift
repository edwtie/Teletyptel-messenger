#if DEBUG && targetEnvironment(simulator)
final class SimulatorTestViewController: CAPBridgeViewController, WKScriptMessageHandler {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.userContentController.add(self, name: "iosSmokeResult")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              var result = message.body as? [String: Any],
              result["fixture"] as? String == "teletyptel-ios-smoke-v1" else { return }
        result["nativeSystemVersion"] = UIDevice.current.systemVersion
        result["nativeSimulator"] = true
        do {
            let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            guard data.count < 1_000_000 else { return }
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try data.write(to: directory.appendingPathComponent("ios-smoke-result.json"), options: .atomic)
        } catch {
            NSLog("Simulator result could not be written: %@", error.localizedDescription)
        }
    }
}
#endif
