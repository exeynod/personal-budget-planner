import Foundation

@MainActor
enum SettingsAPI {
    static func get() async throws -> SettingsDTO {
        try await APIClient.shared.request("GET", "/settings")
    }

    static func update(_ request: SettingsUpdateRequest) async throws -> SettingsDTO {
        try await APIClient.shared.request("PATCH", "/settings", body: request)
    }
}
