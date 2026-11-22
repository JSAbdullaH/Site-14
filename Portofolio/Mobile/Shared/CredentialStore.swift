import Foundation
import Security

/// Keeps the device key in the Keychain, readable in the background after the first unlock.
enum CredentialStore {
    private static let service = "sa.site14.device"
    private static let account = "current"

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    static func load() -> StoredDevice? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSON.decoder.decode(StoredDevice.self, from: data)
    }

    @discardableResult
    static func save(_ device: StoredDevice) -> Bool {
        guard let data = try? JSON.encoder.encode(device) else { return false }
        SecItemDelete(query as CFDictionary)
        var q = query
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func clear() {
        SecItemDelete(query as CFDictionary)
    }
}
