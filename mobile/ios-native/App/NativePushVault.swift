import Foundation
import Security

@MainActor
final class NativePushVault: NativePushStoring {
    private enum Failure: Error { case keychain, invalid }
    private let consentKey = "teletyptel.nativepreview.call-registration-consent"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.tiedragon.teletyptel.nativepreview.call-registration",
         kSecAttrAccount as String: "installation",
         kSecAttrSynchronizable as String: false]
    }

    func load() throws -> NativePushRecord? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, data.count <= 4096 else { throw Failure.keychain }
        var value = try JSONDecoder().decode(NativePushRecord.self, from: data)
        let configuration = try ServerConfiguration(address: value.scope.origin, domain: "localhost")
        guard configuration.origin.absoluteString == value.scope.origin,
              !value.scope.accountID.isEmpty, value.scope.accountID.utf8.count <= 96,
              !value.scope.accountID.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains),
              value.controlCredential.map({ $0.utf8.count <= 1024 }) ?? true else { throw Failure.invalid }
        if !UserDefaults.standard.bool(forKey: consentKey) {
            value.consented = false; value.pendingRevocation = true; value.controlCredential = nil
        }
        return value
    }

    func save(_ record: NativePushRecord) throws {
        let data = try JSONEncoder().encode(record)
        guard data.count <= 4096 else { throw Failure.invalid }
        try remove()
        var request = query
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        request[kSecValueData as String] = data
        guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else { throw Failure.keychain }
        UserDefaults.standard.set(record.consented, forKey: consentKey)
    }

    func remove() throws {
        UserDefaults.standard.set(false, forKey: consentKey)
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure.keychain }
    }
}
