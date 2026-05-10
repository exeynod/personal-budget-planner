// Phase 27-11 Task 2: AdminAPI — typed clients for the v0.6 admin
// endpoints used by AccessV10View.
//
// Backend (verified during planning — see app/api/schemas/admin.py):
//   GET /api/v1/admin/users     → [AdminUserDTO]            (require_owner)
//   GET /api/v1/admin/ai-usage  → AdminAiUsageEnvelopeDTO   (require_owner)
//
// Both endpoints are gated server-side by `require_owner` — a non-owner
// receives 403, which AccessV10ViewModel surfaces as the friendly
// «Только для владельца» banner. The client-side ДОСТУП row hide
// (MgmtHubViewModel.isOwner) is defence-in-depth on top of this gate.

import Foundation

// MARK: - DTOs

/// Mirror of `app/api/schemas/admin.py:AdminUserResponse` — the slim
/// fields needed for the AccessV10View list. Optional onboardedAt /
/// lastSeenAt accept the wire string (decoded by APIClient's shared
/// JSONDecoder via .convertFromSnakeCase, no explicit CodingKeys).
struct AdminUserDTO: Decodable, Identifiable, Equatable {
    let id: Int
    let tgUserId: Int
    let role: String
    let spendingCapCents: Int
}

/// Mirror of `AdminAiUsageRow` — one user's AI usage breakdown.
/// Keeps only the fields the V10 list needs (we omit the nested
/// UsageBucket detail; the row shows total est cost + pct of cap).
struct AdminAiUsageRowDTO: Decodable, Identifiable, Equatable {
    let userId: Int
    let tgUserId: Int
    let role: String
    let spendingCapCents: Int
    let estCostCentsCurrentMonth: Int
    let pctOfCap: Double

    /// Identifiable conformance — userId is stable per row within the
    /// same response window.
    var id: Int { userId }
}

/// Mirror of `AdminAiUsageResponse` envelope — `users` + `generated_at`.
struct AdminAiUsageEnvelopeDTO: Decodable, Equatable {
    let users: [AdminAiUsageRowDTO]
    let generatedAt: String
}

// MARK: - Endpoint enum

@MainActor
enum AdminAPI {
    static func users() async throws -> [AdminUserDTO] {
        try await APIClient.shared.request("GET", "/admin/users")
    }

    static func aiUsage() async throws -> AdminAiUsageEnvelopeDTO {
        try await APIClient.shared.request("GET", "/admin/ai-usage")
    }
}
