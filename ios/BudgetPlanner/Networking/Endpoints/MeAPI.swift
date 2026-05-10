// Phase 24-11: typed wrapper for GET /api/v1/me v1.0 response.
//
// Mirror of `app/api/schemas/me_v10.py:MeV10Response`. The legacy v0.x
// /me hit lives in AuthAPI.swift as `enum MeAPI` (returns UserDTO with
// Date-typed onboardedAt). We add a v1.0-typed parallel hit here so
// the new onboarding gateway (OnboardingMountView) gets the
// `incomeCents` field and the wire-string `onboardedAt` exactly as the
// server emits it. When the legacy onboarding flow is deleted, the
// v0.x enum can be retired and this can take the simpler `MeAPI` name.
//
// Naming note (Plan 24-11 deviation, Rule 3 blocking-issue auto-fix):
// the plan frontmatter listed file `MeAPI.swift` and protocol/enum
// `MeAPI` — but a redeclaration conflict with `enum MeAPI` in
// AuthAPI.swift (legacy v0.x) prevents that. Rename to `MeV10API` /
// `MeV10APIClient` follows the same convention OnboardingV10API used
// in plan 24-01 for the same reason.
//
// Static `var shared` (not `let`) so tests can swap the impl;
// production code uses `LiveMeV10API` which delegates to APIClient.

import Foundation

// MARK: - Response shape

/// GET /api/v1/me v1.0 typed response (BE-01). Field-by-field mirror
/// of `MeV10Response`. Decoded by APIClient's shared JSONDecoder which
/// is configured with `.convertFromSnakeCase`, so the camelCase Swift
/// properties below pick up `tg_user_id`, `income_cents`, etc.
/// automatically — no explicit CodingKeys.
///
/// `onboardedAt` is intentionally `String?` (not `Date?`) to mirror
/// the wire schema verbatim; the gateway only inspects nil/non-nil so
/// we avoid triggering the date decoder for a value we never format.
struct MeV10Response: Decodable, Equatable {
    let tgUserId: Int
    let tgChatId: Int?
    let cycleStartDay: Int
    let onboardedAt: String?
    let chatIdKnown: Bool
    let role: String
    let aiSpendCents: Int
    let aiSpendingCapCents: Int
    /// nil when the user has not completed onboarding yet (DATA-MODEL §1.1).
    let incomeCents: Int?
}

// MARK: - Client protocol (testable)

/// Protocol seam for tests. Production conformance is `LiveMeV10API`;
/// `OnboardingMountTests` injects `FakeMeAPIClient`.
@MainActor
protocol MeV10APIClient {
    func fetchMeV10() async throws -> MeV10Response
}

/// Production implementation — delegates to APIClient.shared, the
/// same path the legacy /me hit uses.
@MainActor
struct LiveMeV10API: MeV10APIClient {
    func fetchMeV10() async throws -> MeV10Response {
        try await APIClient.shared.request("GET", "/me")
    }
}

/// V10 /me endpoint namespace. `shared` is a `var` (mutable) so tests
/// can swap; production callers should treat it as effectively
/// constant after launch.
@MainActor
enum MeV10API {
    static var shared: any MeV10APIClient = LiveMeV10API()
}
