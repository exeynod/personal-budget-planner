---
phase: 24-onboarding-4-step
plan: 11
type: execute
wave: 6
depends_on: [09]
files_modified:
  - ios/BudgetPlanner/App/V10MainShell.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift
  - ios/BudgetPlanner/Networking/Endpoints/MeAPI.swift
  - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
  - ios/BudgetPlannerTests/OnboardingMountTests.swift
  - .planning/phases/24-onboarding-4-step/24-11-ios-manual-smoke.md
autonomous: true
requirements: [ONB-V10-01, ONB-V10-06, ONB-V10-07]
must_haves:
  truths:
    - "V10MainShell renders OnboardingMountView at root (replacing PreviewGallery for non-preview builds)"
    - "OnboardingMountView fetches /me on appear; renders OnboardingView when onboarded_at == nil; renders Home placeholder otherwise"
    - "After successful submit, view re-fetches /me; flow → home placeholder"
    - "UserDefaults['onboarding.v10.draft'] cleared after 200; preserved after 422"
    - "Manual smoke notes documented for path Xcode-build cannot automate (free-Apple-ID install on physical device)"
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift"
      provides: "Conditional gateway view"
      min_lines: 70
    - path: "ios/BudgetPlanner/Networking/Endpoints/MeAPI.swift"
      provides: "fetchMeV10() typed wrapper"
      min_lines: 40
    - path: ".planning/phases/24-onboarding-4-step/24-11-ios-manual-smoke.md"
      provides: "Steps for human-verify physical-device install + flow walkthrough"
      min_lines: 40
  key_links:
    - from: "V10MainShell.swift"
      to: "OnboardingMountView"
      via: "body returns OnboardingMountView() for the v10 surface"
      pattern: "OnboardingMountView"
    - from: "OnboardingMountView.swift"
      to: "/api/v1/me"
      via: ".task { try await MeAPI.fetchMeV10() }"
      pattern: "MeAPI\\.fetchMeV10"
    - from: "OnboardingMountView.swift"
      to: "OnboardingView"
      via: "if me.onboardedAt == nil { OnboardingView(flow: ..., onComplete: ...) }"
      pattern: "OnboardingView\\(flow"
---

<objective>
Wire iOS onboarding into V10MainShell + add MeAPI endpoint + ship XCTest for the gateway logic + manual smoke checklist.

Mount logic mirrors web (Plan 24-10):
1. V10MainShell renders OnboardingMountView (replacing the current PreviewGallery default).
2. OnboardingMountView calls MeAPI.fetchMeV10() in .task; renders OnboardingView when onboardedAt == nil; HomePlaceholder otherwise.
3. After submit completes, refetch via .refreshable / explicit refetch closure.

XCUI tests are NOT included — manual smoke notes provided per CONTEXT D-01 «iOS make build succeeds with new files» and CONTEXT explicitly leaves XCUI optional. Logic-level XCTest exercises the gateway state machine.

Output: 3 source files (mount view + me API + flow refactor) + 1 test file + 1 manual smoke checklist md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-onboarding-4-step/24-CONTEXT.md
@.planning/phases/24-onboarding-4-step/24-must-haves.md
@.planning/phases/24-onboarding-4-step/24-09-ios-step04-goal-final-PLAN.md
@.planning/phases/24-onboarding-4-step/24-10-web-wire-e2e-PLAN.md

@ios/BudgetPlanner/App/V10MainShell.swift
@ios/BudgetPlanner/App/AppRouter.swift
@ios/BudgetPlanner/Networking/APIClient.swift
@ios/BudgetPlanner/Networking/Endpoints/AuthAPI.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
@ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift
@app/api/schemas/me_v10.py

<interfaces>
# MeV10Response Swift mirror:
struct MeV10Response: Decodable {
  let tgUserId: Int
  let tgChatId: Int?
  let cycleStartDay: Int
  let onboardedAt: String?       // ISO-8601
  let chatIdKnown: Bool
  let role: String
  let aiSpendCents: Int
  let aiSpendingCapCents: Int
  let incomeCents: Int?
  enum CodingKeys: String, CodingKey {
    case tgUserId = "tg_user_id"
    case tgChatId = "tg_chat_id"
    case cycleStartDay = "cycle_start_day"
    case onboardedAt = "onboarded_at"
    case chatIdKnown = "chat_id_known"
    case role
    case aiSpendCents = "ai_spend_cents"
    case aiSpendingCapCents = "ai_spending_cap_cents"
    case incomeCents = "income_cents"
  }
}

# Existing iOS patterns:
- AuthAPI.swift already has /me hit (legacy v0.x); we add a v1.0 typed alternative MeAPI.fetchMeV10
- AppRouter.swift handles theme switching v0.6 vs v10 — V10MainShell is selected when ui.theme == "v10"
- V10MainShell currently always renders PreviewGallery — we replace its body with OnboardingMountView
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: MeAPI + OnboardingMountView + V10MainShell wiring</name>
  <files>
    ios/BudgetPlanner/Networking/Endpoints/MeAPI.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift,
    ios/BudgetPlanner/App/V10MainShell.swift,
    ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingFlow.swift
  </files>
  <behavior>
    MeAPI:
      - protocol MeAPIClient { func fetchMeV10() async throws -> MeV10Response }
      - struct LiveMeAPI: MeAPIClient { func fetchMeV10() async throws -> MeV10Response { try await APIClient.shared.request("GET", "/me") } }
      - enum MeAPI { static var shared: any MeAPIClient = LiveMeAPI() }   // overrideable for tests
    OnboardingMountView:
      - @State private var me: MeV10Response? = nil
      - @State private var loadError: String? = nil
      - @State private var isLoading: Bool = true
      - @State private var flow = OnboardingFlow()
      - var apiClient: any MeAPIClient = MeAPI.shared
      - var body:
          if isLoading { LoadingView() }
          else if let error = loadError { ErrorView(message: error) { Task { await reload() } } }
          else if let me = me {
              if me.onboardedAt == nil {
                  OnboardingView(flow: flow, onComplete: { _ in Task { await reload() } })
                      // OnboardingView ignores nil response (passed in 409 path) — same UX: refetch and conditionally land on home
              } else {
                  HomePlaceholderView()
              }
          }
      - func reload() async {
          isLoading = true; loadError = nil
          do { me = try await apiClient.fetchMeV10() }
          catch { loadError = "не удалось загрузить профиль" }
          isLoading = false
        }
      - .task { await reload() }
    V10MainShell update:
      - Replace `PreviewNavStack { PreviewGallery() }` with `OnboardingMountView()` — wrapped in same coral background
      - Keep #Preview pointed at OnboardingMountView()
    OnboardingFlow refactor (defensive):
      - Confirm flow is `@Observable final class` — no SwiftUI dependency
      - Add `init(defaults: UserDefaults = .standard)` parameter (already from Plan 24-01); reuse for tests
      - Verify `clearDraft()` works against the injected defaults instance
  </behavior>
  <action>
    1. Read APIClient.swift to confirm `request(_:_:)` returns `Decodable`-conforming generic. The existing AuthAPI.swift line 18 shows `try await APIClient.shared.request("GET", "/me")` — match that signature.
    2. Create MeAPI.swift mirroring the OnboardingAPIClient protocol pattern from Plan 24-09. MeAPI.shared is a `var` (not `let`) so tests can swap.
    3. Create OnboardingMountView.swift. LoadingView and ErrorView can be tiny inline `private struct` views. HomePlaceholderView = coral background + Eyebrow + Mass placeholder text.
    4. Update V10MainShell.swift body to render OnboardingMountView. Keep `.preferredColorScheme(.dark)` and `.environment(AuthStore())` if previously present.
    5. Verify Xcode target membership: run `make generate` if XcodeGen is wired (per Memory: ios-tooling.md mentions Makefile in /ios/).
    6. Build: `cd ios && make build`.
  </action>
  <verify>
    <automated>cd ios && make build 2>&1 | tail -30</automated>
  </verify>
  <done>
    `make build` succeeds. V10MainShell mounts OnboardingMountView. Manual launch in simulator shows loading state, then either Step 01 or Home placeholder.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: OnboardingMountTests + manual smoke checklist</name>
  <files>
    ios/BudgetPlannerTests/OnboardingMountTests.swift,
    .planning/phases/24-onboarding-4-step/24-11-ios-manual-smoke.md
  </files>
  <behavior>
    OnboardingMountTests:
      - testFetchSuccessRendersOnboardingWhenNotOnboarded:
          inject MeAPI fake returning { onboardedAt: nil }; call view's reload(); assert me != nil && me.onboardedAt == nil → expected to render OnboardingView (assertion via state, not view introspection)
      - testFetchSuccessRendersHomeWhenOnboarded:
          fake returns { onboardedAt: "2026-05-10T..." }; reload; me.onboardedAt != nil
      - testFetchFailureSetsErrorState:
          fake throws; reload; assert loadError != nil
      - testReloadAfterCompleteRefetches:
          fake returns nil onboardedAt initially; verify state; swap fake to return onboarded; call reload again; verify me.onboardedAt != nil
      - testDraftClearOn200Submit (integration with FinalView submit handler from Plan 24-09):
          set up flow with sample draft persisted to a test UserDefaults suite; inject success-returning OnboardingAPI fake; trigger submit logic; assert UserDefaults suite no longer has key
      - testDraftKeptOn422:
          inject 422-throwing fake; trigger submit; assert UserDefaults still has the key
    Manual smoke checklist (24-11-ios-manual-smoke.md):
      - Build via `make run` to install on physical device or simulator
      - Verify steps 01-04 + Final render correctly side-by-side with prototype/poster-screens.jsx (visual eyeball check, NOT pixel-perfect — that's Phase 28)
      - Submit flow → expect Home placeholder
      - Force-quit + relaunch mid-flight on Step 02 → expect Step 02 with previously entered data
      - Quirk: PosterSheet drag-to-close behaviour for balance input — verify gesture works
      - Note: full XCUITests are deferred to Phase 28 acceptance
  </behavior>
  <action>
    1. Implement OnboardingMountTests using protocol-based fakes for MeAPI and OnboardingAPI (both refactored in earlier plans).
    2. Use `XCTestCase.setUp/tearDown` to create a fresh test UserDefaults suite per test:
       ```swift
       override func setUp() {
           super.setUp()
           testDefaults = UserDefaults(suiteName: "OnboardingMountTests-\(UUID().uuidString)")!
       }
       override func tearDown() {
           testDefaults.removePersistentDomain(forName: testDefaults.dictionaryRepresentation().keys.joined())
           super.tearDown()
       }
       ```
    3. Write manual smoke checklist file with concrete tap-by-tap steps for the user to follow. Include screenshot-comparison cue («открыть prototype/poster-screens.jsx side-by-side в браузере»).
    4. Document `make run` invocation per Memory `ios-tooling.md`.
  </action>
  <verify>
    <automated>cd ios && xcrun xcodebuild -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 15' test -only-testing:BudgetPlannerTests/OnboardingMountTests 2>&1 | tail -30</automated>
  </verify>
  <done>
    OnboardingMountTests all pass. Manual smoke checklist file exists with concrete step list. Phase 24 acceptance can proceed to user verification.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| /me response | Server-issued; trusted |
| UserDefaults draft | Plan 24-01 sanitiser handles |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-24-11-01 | Auth bypass | manipulating onboardedAt locally | n/a | onboardedAt comes from server /me only; client never writes it |
| T-24-11-02 | Network failure | /me 401/403 → infinite loading | mitigate | catch surfaces loadError; user sees retry button; AuthStore handles 401 redirect to login (existing v0.x behaviour) |
| T-24-11-03 | Replay | repeated reload triggers | mitigate | isLoading guard prevents concurrent reloads (set true at entry) |
</threat_model>

<verification>
- `make build` clean
- OnboardingMountTests pass
- Manual smoke checklist executed (recorded in 24-VERIFICATION.md by execute-phase agent)
</verification>

<success_criteria>
- T1 (trigger logic) verifiable on iOS
- T11 (web ↔ iOS UX parity) ensured: same gateway logic, same Home placeholder
- ONB-V10-01, ONB-V10-06, ONB-V10-07 closed on iOS side
- All ONB-V10 reqs closed across web + iOS plans (24-01..24-11)
</success_criteria>

<output>
Create `.planning/phases/24-onboarding-4-step/24-11-ios-wire-shell-SUMMARY.md` listing files + a final coverage table mapping ONB-V10-01..07 to plan numbers + any deferred manual-verification items.
</output>
