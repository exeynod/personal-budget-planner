// Phase 24-01: Codable structs for V10 onboarding draft (iOS side).
//
// Wire shape matches web `frontend/src/screensV10/Onboarding/types.ts`
// byte-for-byte: JSON keys are snake_case, `step` is the UI-only step
// counter (1..5) stripped before submit, `category_plans` is a string
// dictionary, `goal` / `savings_config` are Optional nested structs.
//
// All Codable types here use explicit `CodingKeys` for snake_case
// mapping so persistence to `UserDefaults["onboarding.v10.draft"]` is
// independent of `APIClient`'s convertSnakeCase strategy. The wire body
// for POST /onboarding/complete is in `OnboardingAPI.swift` (separate
// type — that one does ride on APIClient's encoder).

import Foundation

enum OnboardingAccountKind: String, Codable, Hashable, Sendable {
    case card
    case cash
    case savings
}

struct OnboardingAccount: Codable, Hashable, Sendable {
    var bank: String
    var mask: String?
    var kind: OnboardingAccountKind
    var balanceCents: Int
    var primary: Bool

    enum CodingKeys: String, CodingKey {
        case bank
        case mask
        case kind
        case balanceCents = "balance_cents"
        case primary
    }
}

struct OnboardingGoal: Codable, Hashable, Sendable {
    var name: String
    var targetCents: Int
    /// ISO yyyy-MM-dd; optional, server enforces strict-future.
    var due: String?

    enum CodingKeys: String, CodingKey {
        case name
        case targetCents = "target_cents"
        case due
    }
}

struct OnboardingSavingsConfig: Codable, Hashable, Sendable {
    var roundupEnabled: Bool
    /// Round-up base — Pydantic Literal[10, 50, 100].
    var base: Int

    enum CodingKeys: String, CodingKey {
        case roundupEnabled = "roundup_enabled"
        case base
    }
}

/// Draft persisted to `UserDefaults["onboarding.v10.draft"]`.
///
/// `step` is local-only — `OnboardingFlow.toAPIBody()` strips it before
/// posting so the server (extra="forbid") never sees it.
struct OnboardingDraft: Codable, Hashable, Sendable {
    var step: Int
    var incomeCents: Int
    var accounts: [OnboardingAccount]
    var categoryPlans: [String: Int]
    var goal: OnboardingGoal?
    var savingsConfig: OnboardingSavingsConfig?

    enum CodingKeys: String, CodingKey {
        case step
        case incomeCents = "income_cents"
        case accounts
        case categoryPlans = "category_plans"
        case goal
        case savingsConfig = "savings_config"
    }

    static let initial = OnboardingDraft(
        step: 1,
        incomeCents: 0,
        accounts: [],
        categoryPlans: [:],
        goal: nil,
        savingsConfig: nil,
    )
}
