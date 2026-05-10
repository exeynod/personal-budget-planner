// Phase 24-01: typed wrapper for POST /api/v1/onboarding/complete (BE-15).
//
// Wire shape mirrors `app/api/schemas/onboarding_v10.py:OnboardingV10Body`
// verbatim. Server enforces `extra="forbid"` + strict on every nested
// model — we MUST emit exactly the field set listed, no `step`
// (UI-only), no extra keys.
//
// Encoding strategy: APIClient configures its JSONEncoder with
// `keyEncodingStrategy = .convertToSnakeCase`, so the camelCase Swift
// properties below are converted on the wire (e.g. `incomeCents` →
// `income_cents`). We rely on that — no explicit CodingKeys.
//
// Note: there's a parallel `OnboardingDraft` in FeaturesV10/Onboarding
// for UserDefaults persistence. That one uses explicit CodingKeys so
// the on-disk JSON is independent of APIClient's encoder. Keeping the
// two types separate means the persistence format and the wire format
// stay decoupled even if either evolves.

import Foundation

// MARK: - Request body

struct OnboardingAccountWire: Encodable {
    let bank: String
    let mask: String?
    let kind: String  // "card" | "cash" | "savings"
    let balanceCents: Int
    let primary: Bool
}

struct OnboardingGoalWire: Encodable {
    let name: String
    let targetCents: Int
    let due: String?  // ISO yyyy-MM-dd, or nil to omit (Pydantic Optional)
}

struct OnboardingSavingsConfigWire: Encodable {
    let roundupEnabled: Bool
    let base: Int  // 10 | 50 | 100
}

struct OnboardingAPIBody: Encodable {
    let incomeCents: Int
    let accounts: [OnboardingAccountWire]
    let categoryPlans: [String: Int]
    let goal: OnboardingGoalWire?
    let savingsConfig: OnboardingSavingsConfigWire?
}

// MARK: - Response

struct OnboardingSavingsConfigOut: Decodable {
    let roundupEnabled: Bool
    let roundupBase: Int
}

struct OnboardingAPIResponse: Decodable {
    let userId: Int
    let incomeCents: Int
    let accountIds: [Int]
    let categoryIdsByCode: [String: Int]
    let savingsCategoryId: Int
    let goalId: Int?
    let savingsConfig: OnboardingSavingsConfigOut
    let onboardedAt: String  // ISO-8601
}

// MARK: - Endpoint

/// V10 onboarding endpoint namespace.
///
/// Named `OnboardingV10API` rather than `OnboardingAPI` to avoid a
/// redeclaration conflict with the legacy v0.x `enum OnboardingAPI` in
/// `AuthAPI.swift` (used by the old `Features/Onboarding/OnboardingView.swift`
/// flow). When the legacy onboarding is removed, this can be renamed.
@MainActor
enum OnboardingV10API {
    /// POST /api/v1/onboarding/complete — atomic onboarding submit (BE-15).
    ///
    /// Throws `APIError.conflict` (409 → already onboarded) or
    /// `.unprocessable` (422 → server-side validation). Caller is
    /// responsible for wiping the persisted draft on success.
    static func postOnboardingComplete(
        body: OnboardingAPIBody,
    ) async throws -> OnboardingAPIResponse {
        try await APIClient.shared.request(
            "POST",
            "/onboarding/complete",
            body: body,
        )
    }
}

// MARK: - OnboardingFlow → wire body

extension OnboardingFlow {
    /// Convert in-memory state → wire body. Strips UI-only `step`;
    /// omits `goal` / `savingsConfig` when nil so server logs do not
    /// show meaningless null-only fields.
    func toAPIBody() -> OnboardingAPIBody {
        let wireAccounts = accounts.map { acct in
            OnboardingAccountWire(
                bank: acct.bank,
                mask: acct.mask,
                kind: acct.kind.rawValue,
                balanceCents: acct.balanceCents,
                primary: acct.primary,
            )
        }
        let wireGoal: OnboardingGoalWire? = goal.map { g in
            OnboardingGoalWire(
                name: g.name,
                targetCents: g.targetCents,
                due: g.due,
            )
        }
        let wireSavings: OnboardingSavingsConfigWire? = savingsConfig.map { cfg in
            OnboardingSavingsConfigWire(
                roundupEnabled: cfg.roundupEnabled,
                base: cfg.base,
            )
        }
        return OnboardingAPIBody(
            incomeCents: incomeCents,
            accounts: wireAccounts,
            categoryPlans: categoryPlans,
            goal: wireGoal,
            savingsConfig: wireSavings,
        )
    }
}
