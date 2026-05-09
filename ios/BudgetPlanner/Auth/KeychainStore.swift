import Foundation
import Security

enum KeychainError: LocalizedError {
    case unhandled(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unhandled(let status):
            let message = SecCopyErrorMessageString(status, nil) as String?
                ?? "Unknown Keychain status"
            return "Keychain error \(status): \(message)"
        }
    }
}

enum KeychainStore {
    private static let service = "com.exeynod.BudgetPlanner.bearer"
    private static let userDefaultsKey = "com.exeynod.BudgetPlanner.bearer.fallback"

    /// На iOS 17+ Simulator с unsigned билдами Keychain отдаёт
    /// `errSecMissingEntitlement` (-34018). Для dev-флоу падаем в
    /// UserDefaults — менее безопасно, но на dev-устройстве владельца
    /// этого достаточно. На signed builds (TestFlight, production)
    /// Keychain отрабатывает нормально и UserDefaults никогда не
    /// читается.
    static func save(_ token: String, account: String = "default") throws {
        let data = Data(token.utf8)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked

        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecSuccess {
            UserDefaults.standard.removeObject(forKey: userDefaultsKey)
            return
        }

        if status == -34018 {
            UserDefaults.standard.set(token, forKey: userDefaultsKey)
            return
        }

        throw KeychainError.unhandled(status)
    }

    static func load(account: String = "default") -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess,
           let data = result as? Data,
           let token = String(data: data, encoding: .utf8) {
            return token
        }

        return UserDefaults.standard.string(forKey: userDefaultsKey)
    }

    static func delete(account: String = "default") {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
    }
}
