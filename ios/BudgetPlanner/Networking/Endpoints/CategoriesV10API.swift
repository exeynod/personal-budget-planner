import Foundation

/// Phase 25-03 — typed wrapper for `GET /api/v1/categories` (v1.0 surface).
///
/// Parallel to the legacy `CategoriesWriteAPI` (TransactionsAPI.swift) so
/// v0.6 paths stay untouched. v1.0 features (Phase 25 Home / AddSheet)
/// decode through `CategoryV10DTO` (which carries the v1.0 fields with
/// defensive defaults — see CategoryV10DTO.swift).
///
/// **Note**: a separate read-only enum (no create/update/delete) — the
/// Phase 25 surface only consumes the list. Mutations stay on the legacy
/// `CategoriesWriteAPI` until Phase 26 / 27 adds v1.0 management screens.
@MainActor
enum CategoriesV10API {
    /// GET /api/v1/categories?include_archived=<bool>
    ///
    /// Returns active categories by default. Pass `includeArchived=true`
    /// for the management screen.
    static func list(includeArchived: Bool = false) async throws -> [CategoryV10DTO] {
        let q: [String: String]? = includeArchived
            ? ["include_archived": "true"]
            : nil
        return try await APIClient.shared.request("GET", "/categories", query: q)
    }

    /// PATCH /api/v1/categories/{id} — partial update (Phase 26 BE-01 ext).
    ///
    /// Backend (`CategoryUpdate` Pydantic schema, Phase 26-01) accepts
    /// `plan_cents`, `rollover`, `paused`, `parent_id` in addition to the
    /// legacy `name` / `sort_order` / `is_archived`. Each field is optional;
    /// only fields explicitly set on `payload` are sent on the wire (custom
    /// encoder skips nil keys via `encodeIfPresent`).
    ///
    /// Errors:
    ///   - 404 — cross-tenant or missing id (RESTful — no existence leak).
    ///   - 422 — invalid value (e.g. negative `plan_cents`).
    ///   - 400 — domain-specific validation (Phase 26-01 may raise overflow
    ///     checks server-side in the future).
    static func update(id: Int, payload: CategoryV10UpdateRequest) async throws -> CategoryV10DTO {
        try await APIClient.shared.request("PATCH", "/categories/\(id)", body: payload)
    }
}
