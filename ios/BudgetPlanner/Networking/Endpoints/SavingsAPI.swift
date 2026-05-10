// Phase 27-08 Task 1 (GREEN): typed wrappers for /api/v1/savings (BE-08..10).
//
// Symmetric to web Plan 27-03 `frontend/src/api/v10/savings.ts`.
//
// Endpoints:
//   - GET   /api/v1/savings           → SavingsSummaryDTO (BE-09)
//   - PATCH /api/v1/savings/config    → SavingsConfigDTO  (BE-08)
//   - POST  /api/v1/savings/deposit   → DepositResponseDTO (BE-10)
//
// `patchConfig` accepts both fields as Optionals + uses a custom
// Encodable struct that emits encodeIfPresent for each — this pairs
// with Pydantic `SavingsConfigPatch` semantics (only fields explicitly
// sent are mutated). Empty body = no-op.
//
// `postDeposit` sends `amount_cents` as a POSITIVE int per backend
// contract (service layer negates internally for the outflow leg).
// `account_id` is REQUIRED (Pydantic Field(gt=0)); the UI gates
// СОХРАНИТЬ on `SavingsData.isValidDepositDraft`.

import Foundation

@MainActor
enum SavingsAPI {

    /// GET /api/v1/savings — full snapshot (totals + config + goals).
    static func summary() async throws -> SavingsSummaryDTO {
        try await APIClient.shared.request("GET", "/savings")
    }

    /// PATCH /api/v1/savings/config — partial update of roundup config.
    /// Both fields optional; nil keys dropped from JSON so the backend
    /// only mutates what's explicitly sent.
    static func patchConfig(
        roundupEnabled: Bool? = nil,
        roundupBase: Int? = nil
    ) async throws -> SavingsConfigDTO {
        return try await APIClient.shared.request(
            "PATCH", "/savings/config",
            body: SavingsConfigPatchBody(
                roundupEnabled: roundupEnabled,
                roundupBase: roundupBase
            )
        )
    }

    /// POST /api/v1/savings/deposit — record a deposit.
    /// Returns the freshly-inserted ActualTransaction (signed amount).
    static func postDeposit(
        amountCents: Int,
        accountId: Int,
        goalId: Int?
    ) async throws -> DepositResponseDTO {
        return try await APIClient.shared.request(
            "POST", "/savings/deposit",
            body: DepositCreateBody(
                amountCents: amountCents,
                accountId: accountId,
                goalId: goalId
            )
        )
    }
}

/// PATCH /api/v1/savings/config request body — drops nil keys via
/// encodeIfPresent so the backend's `model_dump(exclude_unset=True)`
/// only mutates explicitly-sent fields. APIClient.encoder uses
/// `convertToSnakeCase` so camelCase Swift keys map to snake_case
/// wire keys automatically.
private struct SavingsConfigPatchBody: Encodable {
    let roundupEnabled: Bool?
    let roundupBase: Int?

    enum CodingKeys: String, CodingKey {
        case roundupEnabled
        case roundupBase
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(roundupEnabled, forKey: .roundupEnabled)
        try c.encodeIfPresent(roundupBase, forKey: .roundupBase)
    }
}

/// POST /api/v1/savings/deposit request body — drops `goalId` when nil
/// (backend treats absent vs explicit-null differently for some
/// endpoints; our schema accepts either, but matching web's
/// drop-when-nil keeps the wire shape minimal).
private struct DepositCreateBody: Encodable {
    let amountCents: Int
    let accountId: Int
    let goalId: Int?

    enum CodingKeys: String, CodingKey {
        case amountCents
        case accountId
        case goalId
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(amountCents, forKey: .amountCents)
        try c.encode(accountId, forKey: .accountId)
        try c.encodeIfPresent(goalId, forKey: .goalId)
    }
}
