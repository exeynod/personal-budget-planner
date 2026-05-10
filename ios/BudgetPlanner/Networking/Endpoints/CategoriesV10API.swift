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
}
