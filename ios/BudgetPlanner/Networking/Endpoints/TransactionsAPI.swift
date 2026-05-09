import Foundation

@MainActor
enum ActualAPI {
    static func list(periodId: Int, kind: CategoryKind? = nil, categoryId: Int? = nil)
    async throws -> [ActualDTO] {
        var query: [String: String] = [:]
        if let kind { query["kind"] = kind.rawValue }
        if let categoryId { query["category_id"] = "\(categoryId)" }
        return try await APIClient.shared.request(
            "GET", "/periods/\(periodId)/actual",
            query: query.isEmpty ? nil : query
        )
    }

    static func create(_ request: ActualCreateRequest) async throws -> ActualDTO {
        try await APIClient.shared.request("POST", "/actual", body: request)
    }

    static func update(id: Int, _ request: ActualUpdateRequest) async throws -> ActualDTO {
        try await APIClient.shared.request("PATCH", "/actual/\(id)", body: request)
    }

    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/actual/\(id)")
    }
}

@MainActor
enum PlannedAPI {
    static func list(periodId: Int, kind: CategoryKind? = nil, categoryId: Int? = nil)
    async throws -> [PlannedDTO] {
        var query: [String: String] = [:]
        if let kind { query["kind"] = kind.rawValue }
        if let categoryId { query["category_id"] = "\(categoryId)" }
        return try await APIClient.shared.request(
            "GET", "/periods/\(periodId)/planned",
            query: query.isEmpty ? nil : query
        )
    }

    static func create(periodId: Int, _ request: PlannedCreateRequest) async throws -> PlannedDTO {
        try await APIClient.shared.request(
            "POST", "/periods/\(periodId)/planned", body: request
        )
    }

    static func update(id: Int, _ request: PlannedUpdateRequest) async throws -> PlannedDTO {
        try await APIClient.shared.request("PATCH", "/planned/\(id)", body: request)
    }

    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/planned/\(id)")
    }
}

@MainActor
enum CategoriesWriteAPI {
    static func create(_ request: CategoryCreateRequest) async throws -> CategoryDTO {
        try await APIClient.shared.request("POST", "/categories", body: request)
    }

    static func update(id: Int, _ request: CategoryUpdateRequest) async throws -> CategoryDTO {
        try await APIClient.shared.request("PATCH", "/categories/\(id)", body: request)
    }

    static func delete(id: Int) async throws {
        try await APIClient.shared.requestVoid("DELETE", "/categories/\(id)")
    }
}

@MainActor
enum SettingsAPI {
    static func get() async throws -> SettingsDTO {
        try await APIClient.shared.request("GET", "/settings")
    }

    static func update(_ request: SettingsUpdateRequest) async throws -> SettingsDTO {
        try await APIClient.shared.request("PATCH", "/settings", body: request)
    }
}
