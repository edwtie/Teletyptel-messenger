import Foundation
import LocalAuthentication
import Security

@MainActor
final class NativeBiometricLoginVault: NativeLoginVault {
    private enum Failure: Error { case unavailable, keychain, missing }
    private var context: LAContext?
    private let enabled: Bool
    private let consentKey = "teletyptel.nativepreview.biometric-login-consented"

    init(enabled: Bool = true) { self.enabled = enabled }

    var automaticRestoreAllowed: Bool { enabled && UserDefaults.standard.bool(forKey: consentKey) }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.tiedragon.teletyptel.nativepreview.biometric-login",
         kSecAttrAccount as String: "saved-login",
         kSecAttrSynchronizable as String: false]
    }

    var containsLogin: Bool {
        guard enabled else { return false }
        var request = query
        let context = LAContext()
        context.interactionNotAllowed = true
        request[kSecUseAuthenticationContext as String] = context
        request[kSecReturnAttributes as String] = true
        let status = SecItemCopyMatching(request as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    func save(_ login: NativeSavedLogin) async throws {
        guard enabled else { throw Failure.unavailable }
        let context = LAContext()
        context.localizedFallbackTitle = ""
        self.context = context
        defer { if self.context === context { self.context = nil }; context.invalidate() }
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            throw Failure.unavailable
        }
        guard try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Bewaar je TeleTypTel-aanmelding voor automatisch inloggen met Face ID of Touch ID.") else {
            throw Failure.unavailable
        }
        try Task.checkCancellation()
        guard let access = SecAccessControlCreateWithFlags(nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, nil) else {
            throw Failure.unavailable
        }
        let data = try JSONEncoder().encode(login)
        var request = query
        request[kSecAttrAccessControl as String] = access
        request[kSecValueData as String] = data
        request[kSecUseAuthenticationContext as String] = context
        UserDefaults.standard.set(false, forKey: consentKey)
        let previous = SecItemDelete(query as CFDictionary)
        guard previous == errSecSuccess || previous == errSecItemNotFound else { throw Failure.keychain }
        guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else { throw Failure.keychain }
        UserDefaults.standard.set(true, forKey: consentKey)
    }

    func load() async throws -> NativeSavedLogin {
        guard enabled else { throw Failure.unavailable }
        let context = LAContext()
        context.localizedFallbackTitle = ""
        self.context = context
        defer { if self.context === context { self.context = nil }; context.invalidate() }
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            throw Failure.unavailable
        }
        guard try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Ontgrendel je bewaarde TeleTypTel-aanmelding.") else { throw Failure.unavailable }
        try Task.checkCancellation()
        var request = query
        request[kSecUseAuthenticationContext as String] = context
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { throw Failure.missing }
        try Task.checkCancellation()
        return try NativeSavedLogin.decode(data)
    }

    func remove() throws {
        cancel()
        guard enabled else { return }
        UserDefaults.standard.set(false, forKey: consentKey)
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure.keychain }
    }

    func cancel() {
        context?.invalidate()
        context = nil
    }
}
