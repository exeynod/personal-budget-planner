import Foundation

/// Phase 27-09 Task 1 (GREEN): widen `AccountKind` to `Codable` so it can
/// serialise as a string literal inside `AccountCreateRequest`.
extension AccountKind: Encodable {}

/// Phase 27-09 — POST /api/v1/accounts request body.
///
/// Mirrors backend `AccountCreate` Pydantic schema (Phase 22 BE-02). All
/// optional fields use `encodeIfPresent` so `null` is never emitted on the
/// wire — the backend uses `model_dump(exclude_unset=True)` semantics for
/// inserts and would otherwise see a literal `null` mask / primary that it
/// has to coerce. Also keeps the wire payload minimal.
///
/// Threat-model T-27-09-01: `balanceCents` is signed but the UI gate
/// (`AccountsData.isValidNewAccountDraft`) enforces ≥0; backend Pydantic
/// has its own bounds (±100M ₽). T-27-09-02: `mask` length is gated UI-side
/// to ≤4 digits; backend has `max_length=16` as defence-in-depth.
struct AccountCreateRequest: Encodable {
    let bank: String
    let kind: AccountKind
    let mask: String?
    let balanceCents: Int
    let primary: Bool?

    enum CodingKeys: String, CodingKey {
        case bank, kind, mask, balanceCents, primary
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(bank, forKey: .bank)
        try c.encode(kind, forKey: .kind)
        try c.encodeIfPresent(mask, forKey: .mask)
        try c.encode(balanceCents, forKey: .balanceCents)
        try c.encodeIfPresent(primary, forKey: .primary)
    }
}

/// Phase 25-03 — typed wrapper for `GET /api/v1/accounts`.
///
/// Used by Home wallet link (HOME-V10-04 sums `Σ balance_cents`),
/// AddSheet account picker (ADD-V10-04), Accounts list view (Phase 27-09).
///
/// Backend (Phase 22 BE-02) sorts the response with the user's primary
/// account first (`ORDER BY is_primary DESC, id ASC`).
@MainActor
enum AccountsAPI {
    /// GET /api/v1/accounts
    static func list() async throws -> [AccountDTO] {
        try await APIClient.shared.request("GET", "/accounts")
    }

    /// POST /api/v1/accounts — create a new account (Phase 27-09).
    /// Returns the created `AccountDTO` (server-assigned id + created_at).
    static func create(_ request: AccountCreateRequest) async throws -> AccountDTO {
        try await APIClient.shared.request("POST", "/accounts", body: request)
    }
}
