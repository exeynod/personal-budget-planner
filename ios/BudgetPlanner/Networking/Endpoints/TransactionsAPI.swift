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

// MARK: - Phase 25-03 — v1.0 actual surface (parallel to legacy ActualAPI)

/// Phase 25-03 — typed wrapper for the v1.0 `/actual` surface.
///
/// Parallel to the legacy `ActualAPI` so v0.6 features keep decoding
/// into the 2-valued `CategoryKind` `ActualDTO`. v1.0 plans (Phase 25
/// Home / Transactions / AddSheet) call `ActualV10API` to receive the
/// 4-valued `ActualKindV10` + nullable `accountId` / `parentTxnId`.
///
/// `create(_:)` accepts the same `ActualCreateRequest` that
/// `ActualAPI.create` uses — Phase 25-03 extended that struct with
/// optional `accountId` (encodeIfPresent), so passing it triggers the
/// `create_actual_v10` server path (delta-balance + roundup hook).
/// Response decodes into `ActualV10DTO` (extended with v1.0 fields).
@MainActor
enum ActualV10API {
    /// GET /api/v1/periods/{periodId}/actual
    ///
    /// Returns ALL actual transactions for the period, including
    /// roundup / deposit kinds. Use the `kind` filter to narrow at
    /// the server level.
    static func list(
        periodId: Int,
        kind: ActualKindV10? = nil,
        categoryId: Int? = nil
    ) async throws -> [ActualV10DTO] {
        var query: [String: String] = [:]
        if let kind { query["kind"] = kind.rawValue }
        if let categoryId { query["category_id"] = "\(categoryId)" }
        return try await APIClient.shared.request(
            "GET", "/periods/\(periodId)/actual",
            query: query.isEmpty ? nil : query
        )
    }

    /// POST /api/v1/actual
    ///
    /// Pass `request.accountId != nil` to trigger the v1.0 path
    /// (`create_actual_v10` — delta-balance + roundup hook).
    /// `request.amountCents` MUST be > 0 (server enforces gt=0).
    static func create(_ request: ActualCreateRequest) async throws -> ActualV10DTO {
        try await APIClient.shared.request("POST", "/actual", body: request)
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
