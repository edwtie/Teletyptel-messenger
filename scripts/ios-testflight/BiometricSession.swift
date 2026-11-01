import LocalAuthentication
import Security

final class MessengerBiometricSession {
    static let shared = MessengerBiometricSession()
    private let defaults = UserDefaults.standard
    private let memoryCookies = URLSessionConfiguration.ephemeral.httpCookieStorage!
    private(set) var unlocked = false
    private(set) var generation = 0
    private var memoryOnly = false
    private var origin: String { Bundle.main.object(forInfoDictionaryKey: "TeleTypTelServerOrigin") as? String ?? "" }
    private var preference: String { "teletyptel.faceID." + origin }
    var enabled: Bool { defaults.bool(forKey: preference) }
    var asked: Bool { defaults.bool(forKey: preference + ".asked") }
    var protectedStorage: Bool { enabled || memoryOnly }
    var storage: HTTPCookieStorage { protectedStorage ? memoryCookies : HTTPCookieStorage.shared }
    var permitsRequests: Bool { !enabled || unlocked }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.tiedragon.teletyptel.faceID",
         kSecAttrAccount as String: origin]
    }

    private init() {
        if enabled { clearCookies(HTTPCookieStorage.shared) }
        else if !asked { SecItemDelete(query as CFDictionary) }
    }

    private func cookies(_ store: HTTPCookieStorage) -> [HTTPCookie] {
        guard let url = URL(string: origin + "/api/account.php") else { return [] }
        return store.cookies(for: url) ?? []
    }

    private func clearCookies(_ store: HTTPCookieStorage) {
        for cookie in cookies(store) { store.deleteCookie(cookie) }
    }

    func decline() { defaults.set(true, forKey: preference + ".asked") }

    func lock() {
        if enabled { unlocked = false }
    }

    func save(accountId: String, jid: String, context: LAContext) throws {
        let sessionCookies = cookies(storage).filter { $0.isSecure && $0.isHTTPOnly }
        guard !sessionCookies.isEmpty, !accountId.isEmpty, !jid.isEmpty else { throw URLError(.userAuthenticationRequired) }
        let entries = sessionCookies.map { cookie -> [String: Any] in
            var entry: [String: Any] = ["name": cookie.name, "value": cookie.value,
                "domain": cookie.domain, "path": cookie.path]
            if let expires = cookie.expiresDate { entry["expires"] = expires.timeIntervalSince1970 }
            return entry
        }
        let data = try JSONSerialization.data(withJSONObject: ["accountId": accountId, "jid": jid,
            "expires": Date().addingTimeInterval(30 * 86400).timeIntervalSince1970, "cookies": entries])
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                                                          .biometryCurrentSet, &error) else {
            throw URLError(.userAuthenticationRequired)
        }
        var item = query
        item[kSecAttrAccessControl as String] = access
        item[kSecValueData as String] = data
        item[kSecUseAuthenticationContext as String] = context
        let deleted = SecItemDelete(query as CFDictionary)
        guard deleted == errSecSuccess || deleted == errSecItemNotFound else { throw URLError(.cannotWriteToFile) }
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw URLError(.cannotWriteToFile) }
        for cookie in sessionCookies { memoryCookies.setCookie(cookie) }
        defaults.set(true, forKey: preference)
        decline()
        unlocked = true
        generation += 1
        clearCookies(HTTPCookieStorage.shared)
    }

    func restore(context: LAContext) throws -> [String: String] {
        var item = query
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        item[kSecUseAuthenticationContext as String] = context
        var result: CFTypeRef?
        let status = SecItemCopyMatching(item as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let expires = payload["expires"] as? Double, expires > Date().timeIntervalSince1970,
              let accountId = payload["accountId"] as? String, let jid = payload["jid"] as? String,
              let entries = payload["cookies"] as? [[String: Any]], let host = URL(string: origin)?.host else {
            throw URLError(.userAuthenticationRequired)
        }
        var restored: [HTTPCookie] = []
        for entry in entries {
            guard let name = entry["name"] as? String, let value = entry["value"] as? String,
                  let domain = entry["domain"] as? String, domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == host,
                  let path = entry["path"] as? String else { throw URLError(.badServerResponse) }
            var properties: [HTTPCookiePropertyKey: Any] = [.name: name, .value: value, .domain: domain,
                .path: path, .secure: "TRUE", HTTPCookiePropertyKey("HttpOnly"): "TRUE"]
            if let expiry = entry["expires"] as? Double {
                guard expiry > Date().timeIntervalSince1970 else { throw URLError(.userAuthenticationRequired) }
                properties[.expires] = Date(timeIntervalSince1970: expiry)
            }
            guard let cookie = HTTPCookie(properties: properties) else { throw URLError(.badServerResponse) }
            restored.append(cookie)
        }
        guard !restored.isEmpty else { throw URLError(.userAuthenticationRequired) }
        clearCookies(HTTPCookieStorage.shared)
        clearCookies(memoryCookies)
        for cookie in restored { memoryCookies.setCookie(cookie) }
        unlocked = true
        return ["accountId": accountId, "jid": jid]
    }

    func disable(keepSession: Bool) throws {
        let retained = keepSession && (!enabled || unlocked) ? cookies(storage) : []
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.cannotRemoveFile) }
        clearCookies(memoryCookies)
        clearCookies(HTTPCookieStorage.shared)
        for cookie in retained { memoryCookies.setCookie(cookie) }
        memoryOnly = true
        defaults.set(false, forKey: preference)
        decline()
        unlocked = false
        generation += 1
    }
}

@objc(TeleTypTelBiometricsPlugin)
final class TeleTypTelBiometricsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TeleTypTelBiometricsPlugin"
    let jsName = "TeleTypTelBiometrics"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enroll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise)
    ]
    private var busy = false
    private var revision = 0
    private var context: LAContext?
    private var shield: UIView?
    private var observers: [NSObjectProtocol] = []

    override func load() {
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main) { [weak self] _ in
                guard let self = self, MessengerBiometricSession.shared.enabled else { return }
                self.revision += 1
                self.context?.invalidate()
                MessengerBiometricSession.shared.lock()
                if let view = self.bridge?.viewController?.view, self.shield == nil {
                    let cover = UIView(frame: view.bounds)
                    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                    cover.backgroundColor = .systemBackground
                    cover.isAccessibilityElement = true
                    cover.accessibilityViewIsModal = true
                    cover.accessibilityLabel = "TeleTypTel vergrendeld"
                    self.bridge?.webView?.accessibilityElementsHidden = true
                    view.addSubview(cover)
                    self.shield = cover
                }
            })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
                guard let self = self, self.shield != nil else { return }
                self.bridge?.webView?.evaluateJavaScript("window.dispatchEvent(new Event('teletyptel-faceid-resume'))")
            })
    }

    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }

    private func trusted(_ call: CAPPluginCall) -> Bool {
        guard isBundledMessenger(bridge?.webView?.url) else { call.reject("Untrusted page.", "UNTRUSTED_ORIGIN"); return false }
        return true
    }

    private func uncover() {
        shield?.removeFromSuperview()
        shield = nil
        bridge?.webView?.accessibilityElementsHidden = false
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            let context = LAContext()
            let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
                && context.biometryType == .faceID
            let session = MessengerBiometricSession.shared
            call.resolve(["available": available, "enabled": session.enabled, "asked": session.asked])
        }
    }

    private func authenticate(_ call: CAPPluginCall, completion: @escaping (LAContext) throws -> [String: Any]) {
        guard !busy else { call.reject("Face ID is already active.", "BUSY"); return }
        busy = true
        let revision = self.revision
        let context = LAContext()
        context.localizedFallbackTitle = ""
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil), context.biometryType == .faceID else {
            busy = false
            call.reject("Face ID is unavailable. Sign in normally.", "FACE_ID_UNAVAILABLE")
            return
        }
        self.context = context
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Ontgrendel je TeleTypTel-account met Face ID.") { success, _ in
                DispatchQueue.main.async {
                    self.busy = false
                    self.context = nil
                    guard success, revision == self.revision, isBundledMessenger(self.bridge?.webView?.url) else {
                        call.reject("Face ID was not completed. Sign in normally.", "FACE_ID_CANCELLED")
                        return
                    }
                    do {
                        let result = try completion(context)
                        self.uncover()
                        call.resolve(result)
                    } catch { call.reject("Sign in again to renew Face ID access.", "FACE_ID_EXPIRED") }
                }
            }
    }

    @objc func unlock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call), MessengerBiometricSession.shared.enabled else {
                call.reject("Face ID is not enabled.", "FACE_ID_DISABLED"); return
            }
            self.authenticate(call) { context in
                let profile = try MessengerBiometricSession.shared.restore(context: context)
                return ["profile": profile]
            }
        }
    }

    @objc func enroll(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call), !self.busy, let presenter = self.bridge?.viewController,
                  let accountId = call.getString("accountId"), let jid = call.getString("jid") else {
                call.reject("Face ID setup is unavailable."); return
            }
            self.busy = true
            let revision = self.revision
            let consent = UIAlertController(title: "Face ID inschakelen?",
                message: "Wil je voortaan automatisch aanmelden met Face ID? Je sessie wordt beveiligd op deze iPhone bewaard. Je kunt dit uitschakelen bij Instellingen.", preferredStyle: .alert)
            consent.addAction(UIAlertAction(title: "Niet nu", style: .cancel) { _ in
                self.busy = false
                MessengerBiometricSession.shared.decline()
                call.resolve(["enabled": false])
            })
            consent.addAction(UIAlertAction(title: "Face ID inschakelen", style: .default) { _ in
                self.busy = false
                guard revision == self.revision else { call.reject("Sign-in changed.", "CANCELLED"); return }
                self.authenticate(call) { context in
                    MessengerServerConnection.shared.resetSession()
                    try MessengerBiometricSession.shared.save(accountId: accountId, jid: jid, context: context)
                    return ["enabled": true]
                }
            })
            presenter.present(consent, animated: true)
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            self.revision += 1
            self.context?.invalidate()
            do {
                MessengerServerConnection.shared.resetSession()
                try MessengerBiometricSession.shared.disable(keepSession: call.getBool("keepSession") == true)
                self.uncover()
                call.resolve()
            } catch { call.reject("Face ID access could not be removed. Try again.", "FACE_ID_REMOVE_FAILED") }
        }
    }
}
