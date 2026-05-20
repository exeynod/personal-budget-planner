// Phase 27-08 Task 1 (GREEN): V10 wire DTOs for /api/v1/savings surface.
//
// Symmetric to web Plan 27-03 frontend/src/api/types.ts (SavingsConfig /
// SavingsSnapshot / SavingsConfigPatchPayload / DepositCreatePayload /
// DepositResponse) and to backend app/api/schemas/savings.py
// (SavingsConfigRead / SavingsConfigPatch / DepositCreate /
// SavingsSnapshotResponse).
//
// Backend invariants honoured here:
//   - SavingsConfigRead.roundup_base ∈ {10, 50, 100} (Pydantic Literal +
//     DB CHECK ck_savings_config_base_enum). On the wire we keep `Int`
//     because the Swift type system has no Literal-of-Int; the UI Chip
//     row only emits 10/50/100 and the backend rejects anything else
//     with 422 — defence in depth.
//   - DepositCreate.amount_cents > 0 (Field(gt=0, le=100M ₽)). Service
//     layer negates internally (deposits show as outflow on the source
//     account). Wire payload carries POSITIVE amount; the response
//     `amount_cents` (DepositResponse) is signed (negative for the
//     outflow leg) — matches backend's app.services.savings.deposit
//     which returns the freshly-inserted ActualTransaction.
//   - DepositCreate.account_id REQUIRED (Field(gt=0)) — non-null Swift
//     type on the request body. The DepositSheet enforces via
//     SavingsData.isValidDepositDraft (СОХРАНИТЬ disabled until a
//     chip is picked).
//
// `convertFromSnakeCase` / `convertToSnakeCase` strategies on
// APIClient.shared.{decoder,encoder} translate between Swift
// camelCase and the wire's snake_case automatically.

import Foundation

/// PATCH /api/v1/savings/config — partial update.
///
/// Mirrors backend `SavingsConfigPatch` (both fields Optional). The
/// Swift type carries Optionals so each VM mutation can send only the
/// touched field via custom Encodable that drops nil keys (see
/// `SavingsAPI.patchConfig`).
///
/// `Equatable` for VM optimistic-update tests. `Decodable` for the
/// response (PATCH returns the updated `SavingsConfigRead`).
struct SavingsConfigDTO: Codable, Equatable {
    let roundupEnabled: Bool
    let roundupBase: Int  // wire value ∈ {10, 50, 100}; backend enforces Literal.
}

/// GET /api/v1/savings → savings dashboard snapshot.
///
/// Mirrors backend `SavingsSnapshotResponse`:
///   - `total_cents`: balance of all `kind='savings'` accounts plus
///     deposit-class transactions (computed by service).
///   - `month_in_cents`: sum of inflows during the current period.
///   - `config`: current roundup settings (enabled flag + base).
///   - `goals`: every goal owned by the user.
///
/// Equatable so the VM can compare snapshots in tests.
struct SavingsSummaryDTO: Decodable, Equatable {
    let totalCents: Int
    let monthInCents: Int
    let config: SavingsConfigDTO
    let goals: [GoalDTO]
}

/// POST /api/v1/savings/deposit → freshly-inserted ActualTransaction.
///
/// Returned by backend's `SavingsService.deposit`. `amount_cents` is
/// SIGNED — negative for the source-account outflow leg (the savings
/// service inserts a negated transaction on the source account so
/// the outflow shows up correctly in registries). UI does not need to
/// parse the sign; it just reloads the snapshot to get fresh totals.
struct DepositResponseDTO: Decodable, Equatable {
    let id: Int
    let amountCents: Int  // signed (typically negative for outflow leg)
    let accountId: Int?
    let categoryId: Int
    let txDate: BusinessDate
    let description: String?
}
