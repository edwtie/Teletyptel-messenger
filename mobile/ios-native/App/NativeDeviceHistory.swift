import Foundation
import Security
import CryptoKit

@MainActor
final class NativeDeviceHistory: NativeHistoryStoring {
    private let manager = FileManager.default
    private func directory() throws -> URL {
        var url = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("TeleTypTelHistory", isDirectory: true)
        if !manager.fileExists(atPath: url.path) {
            try manager.createDirectory(at: url, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete])
        }
        guard try url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw NativeAccountFailure.invalidResponse }
        var values = URLResourceValues(); values.isExcludedFromBackup = true; try url.setResourceValues(values)
        return url
    }
    private func file(_ scope: NativeHistoryScope) throws -> URL { try directory().appendingPathComponent(scope.filename + ".sealed") }
    private func query(_ scope: NativeHistoryScope) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.tiedragon.teletyptel.native.history",
         kSecAttrAccount as String: scope.filename, kSecAttrSynchronizable as String: false]
    }
    private func key(_ scope: NativeHistoryScope, create: Bool) throws -> SymmetricKey {
        var request = query(scope); request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, data.count == 32 { return SymmetricKey(data: data) }
        guard create, status == errSecItemNotFound else { throw NativeAccountFailure.rejected }
        let generated = SymmetricKey(size: .bits256)
        request = query(scope); request[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        request[kSecValueData as String] = generated.withUnsafeBytes { Data($0) }
        guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else { throw NativeAccountFailure.rejected }
        return generated
    }
    func load(_ scope: NativeHistoryScope) throws -> NativeHistorySnapshot? {
        let url = try file(scope)
        guard manager.fileExists(atPath: url.path) else { return nil }
        let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .fileSizeKey])
        guard values.isSymbolicLink != true, values.isRegularFile == true, (values.fileSize ?? Int.max) <= NativeHistoryCrypto.maximum + 28 else { throw NativeAccountFailure.invalidResponse }
        return try NativeHistoryCrypto.open(Data(contentsOf: url), scope: scope, key: key(scope, create: false))
    }
    func save(_ snapshot: NativeHistorySnapshot) throws {
        let url = try file(snapshot.scope)
        if manager.fileExists(atPath: url.path), try url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink == true { throw NativeAccountFailure.invalidResponse }
        let bytes = try NativeHistoryCrypto.seal(snapshot, key: key(snapshot.scope, create: !manager.fileExists(atPath: url.path)))
        try bytes.write(to: url, options: [.atomic, .completeFileProtection])
    }
    func remove(_ scope: NativeHistoryScope) throws {
        let url = try file(scope)
        if manager.fileExists(atPath: url.path) { try manager.removeItem(at: url) }
        let status = SecItemDelete(query(scope) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeAccountFailure.rejected }
    }
}
