import Foundation

/// Phase 25-03 — typed wrapper for `GET /api/v1/accounts`.
///
/// Used by Home wallet link (HOME-V10-04 sums `Σ balance_cents`),
/// AddSheet account picker (ADD-V10-04), Accounts list view (Phase 26).
///
/// Backend (Phase 22 BE-02) sorts the response with the user's primary
/// account first (`ORDER BY is_primary DESC, id ASC`).
@MainActor
enum AccountsAPI {
    /// GET /api/v1/accounts
    static func list() async throws -> [AccountDTO] {
        try await APIClient.shared.request("GET", "/accounts")
    }
}
