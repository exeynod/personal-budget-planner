import Foundation

@MainActor
enum ActualAPI {
    static func list(
        periodId: Int, kind: CategoryKind? = nil, categoryId: Int? = nil
    )
        async throws -> [ActualDTO]
    {
        var query: [String: String] = [:]
        if let kind { query["kind"] = kind.rawValue }
        if let categoryId { query["category_id"] = "\(categoryId)" }
        return try await APIClient.shared.request(
            "GET", "/periods/\(periodId)/actual",
            query: query.isEmpty ? nil : query
        )
    }

    @available(
        *, deprecated,
        message:
            "Legacy v0.x — canonical is ActualV10API.create (4-valued ActualV10DTO + delta-balance/roundup). Non-equivalent (ActualDTO 2-valued vs ActualV10DTO 4-valued); tracked DEBT-70-ACT. See .planning/LEGACY-V10-DEBT-REGISTRY.md"
    )
    static func create(_ request: ActualCreateRequest) async throws -> ActualDTO {
        try await APIClient.shared.request("POST", "/actual", body: request)
    }

    @available(
        *, deprecated,
        message:
            "Legacy v0.x — ActualV10API has no update. Non-equivalent (no V10 counterpart; ActualDTO 2-valued vs ActualV10DTO 4-valued); tracked DEBT-70-ACT. See .planning/LEGACY-V10-DEBT-REGISTRY.md"
    )
    static func update(id: Int, _ request: ActualUpdateRequest) async throws -> ActualDTO {
        try await APIClient.shared.request("PATCH", "/actual/\(id)", body: request)
    }

    /// Canonical shared delete — used by v06 + V10 VMs (DEBT-70-ACT).
    /// Intentionally NOT deprecated: `ActualV10API` has no delete, so both
    /// shells route DELETE /actual/{id} through here. See registry.
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
    static func list(
        periodId: Int, kind: CategoryKind? = nil, categoryId: Int? = nil
    )
        async throws -> [PlannedDTO]
    {
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

    // MARK: - v1.1 post / unpost (AGREED §F — «Провести»)

    /// POST /periods/{pid}/planned/{id}/post — post a planned row into a real
    /// actual on `txDate`. Returns the new `txn_id` + `planned_id` (the
    /// `posted_txn_id` bridge). Reversible via `unpost`.
    @discardableResult
    static func post(periodId: Int, plannedId: Int, txDate: BusinessDate)
        async throws -> PostPlannedResponseDTO
    {
        try await APIClient.shared.request(
            "POST", "/periods/\(periodId)/planned/\(plannedId)/post",
            body: PostPlannedRequestDTO(txDate: txDate)
        )
    }

    /// POST /periods/{pid}/planned/{id}/unpost — reverse a posted planned row
    /// (204 No Content). Clears `posted_txn_id` and deletes the bridged actual.
    static func unpost(periodId: Int, plannedId: Int) async throws {
        try await APIClient.shared.requestVoid(
            "POST", "/periods/\(periodId)/planned/\(plannedId)/unpost"
        )
    }

    /// POST /periods/{pid}/planned/post-batch — bulk-post; one actual per line.
    @discardableResult
    static func postBatch(periodId: Int, plannedIds: [Int], txDate: BusinessDate? = nil)
        async throws -> PostPlannedBatchResponseDTO
    {
        try await APIClient.shared.request(
            "POST", "/periods/\(periodId)/planned/post-batch",
            body: PostPlannedBatchRequestDTO(plannedIds: plannedIds, txDate: txDate)
        )
    }
}

// MARK: - v1.1 planned post/unpost wire types

struct PostPlannedRequestDTO: Encodable {
    let txDate: BusinessDate
}

struct PostPlannedResponseDTO: Decodable {
    let plannedId: Int
    let txnId: Int
}

struct PostPlannedBatchRequestDTO: Encodable {
    let plannedIds: [Int]
    let txDate: BusinessDate?
}

struct PostPlannedBatchResponseDTO: Decodable {
    let posted: [Int]
    let skipped: [Int]
}

@available(
    *, deprecated,
    message:
        "Legacy v0.x — canonical is CategoriesV10API (update only). Non-equivalent (V10API lacks create + delete; v06 management needs both); tracked DEBT-70-CATW. See .planning/LEGACY-V10-DEBT-REGISTRY.md"
)
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
