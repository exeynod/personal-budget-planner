---
phase: 26-category-detail-plan-subscriptions
plan: 05
subsystem: ios-plan-month
tags: [ios, swiftui, observable, plan-month, posterSlider, regulars, single-patch, tdd, zero-touch-swap]

# Dependency graph
requires:
  - phase: 26-category-detail-plan-subscriptions
    plan: 01
    provides: "PATCH /api/v1/plan-month atomic batch endpoint with Σplan ≤ income validation; PATCH /categories/:id v1.0 ext"
  - phase: 26-category-detail-plan-subscriptions
    plan: 03
    provides: "CategoryDetailView push to PlanViewPlaceholderView (placeholder swap target finalised here); CategoryV10UpdateRequest + CategoriesV10API.update + CategoryRollover Codable"
  - phase: 26-category-detail-plan-subscriptions
    plan: 07
    provides: "SubscriptionV10DTO + SubscriptionsV10API + SubscriptionV10UpdateRequest (parallel agent — same wire surface, no overlap)"
  - phase: 25-home-transactions-add-sheet
    plan: 03
    provides: "CategoryV10DTO with v1.0 fields, ActualV10DTO/ActualV10API, PeriodsAPI.current/PeriodDTO"
  - phase: 24-onboarding-v10
    plan: 11
    provides: "MeV10API.shared.fetchMeV10() returning MeV10Response with incomeCents"
provides:
  - "PlanData pure compute helpers: computeSurplus / computeIsOverflow / computeRolloverAggregates / computeRegularsList / applyPlanEdit / plansFromCategories — 6 stateless static functions, 20 XCTest cases all green"
  - "PlanMonthAPI.patch(plans:) wraps PATCH /api/v1/plan-month (Phase 26-01 backend BE-08); PlanMonthItem Encodable struct + PlanMonthResponseDTO Decodable wrapper"
  - "PlanViewModel @MainActor @Observable model with parallel async-let load (categories + subs + me + period), inFlight guard, status state machine; updateSlider local-only, toggleRollover/postRegular/unpostRegular wrap APIs, submit() wraps atomic PATCH with 400 plan_overflow → inline saveError"
  - "PlanView SwiftUI screen rendering all 6 PLAN-V10-* requirements: cobalt bg, surplus plate (yellow OK / red OVER blocks CTA), 2 rollover-aggregate plates, regulars block with post/unpost buttons, 8 PosterSlider per category with chip-pair, atomic save CTA"
  - "Zero-touch placeholder swap: HomePlaceholders.PlanViewPlaceholderView body now returns PlanView() — HomeV10View Plan-bar tap callsite unchanged"
  - "CategoryDetailView wiring finalised: «+ ПОДНЯТЬ ЛИМИТ» now pushes PlanView(focusCategoryId:) instead of placeholder; PlanView ScrollViewReader scrolls to focused row anchor=.center on appear"
affects:
  - "Future Phase 27 Mgmt-хаб может пушить PlanView через тот же placeholder type"
  - "Phase 28 polish: toast surface для toggleRollover/postRegular/unpostRegular silent-fail сайтов"

# Tech tracking
tech-stack:
  added: []  # No new dependencies — uses existing PosterTokens / PosterSlider / Toast / Chip / PosterButton / Mass / Eyebrow / RubleFormatter / V10Formatters + Phase 25-03 / 26-01 / 26-03 / 26-07 surfaces
  patterns:
    - "Single PATCH atomic save pattern (T-P-06): PlanMonthItem Encodable + PlanMonthAPI.patch(plans:) — entire batch lands or none. Mirrors web Plan 26-04 patchPlanMonth(plans). Backend Pydantic + transaction-scope ensures Σplan ≤ income preempts any partial mutation."
    - "Local-only slider state until Submit: PosterSlider's 300ms debounce + applyPlanEdit immutable updates keep mutation count low; PATCH only fires from submit() — sliders don't spam the API on every drag tick (T-26-05-03 mitigation)."
    - "Zero-touch placeholder swap (preserve old type name, replace body): same pattern Plan 25-09 + 26-03 established for TransactionsViewPlaceholderView and CategoryDetailPlaceholderView. Keeps callsites in HomeV10View / CategoryDetailView unchanged so the plan ships isolated to the new feature folder + 6-line edit in HomePlaceholders.swift."
    - "ScrollViewReader scrollTo(anchor:.center) on appear with 150ms grace (DispatchQueue.main.asyncAfter) — ensures the ForEach has rendered before the scroll, mirrors web Plan 26-04 useEffect pattern with same delay budget."
    - "@ObservationIgnored on `var calendar: Calendar` — same Foundation type @Observable macro quirk noted in HomeV10ViewModel / CategoryDetailViewModel."
    - "Period 404 handled inline via local do/catch — wrap and degrade to actuals=[] instead of failing the whole screen (mirrors HomeV10ViewModel + CategoryDetailViewModel pattern)."
    - "APIError.serverError(code, detail) pattern matching for 400 plan_overflow — discriminate via `where code == 400` so VM can surface plan-specific inline error (vs. generic «не удалось сохранить»)."

key-files:
  created:
    - "ios/BudgetPlanner/Networking/Endpoints/PlanMonthAPI.swift  # PlanMonthItem + PlanMonthResponseDTO + PlanMonthPatchBody + enum PlanMonthAPI.patch(plans:)"
    - "ios/BudgetPlanner/FeaturesV10/Plan/PlanData.swift  # 6 pure-compute helpers + RolloverAggregates + RegularRow structs"
    - "ios/BudgetPlanner/FeaturesV10/Plan/PlanViewModel.swift  # @MainActor @Observable VM"
    - "ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift  # SwiftUI screen (PLAN-V10-01..06)"
    - "ios/BudgetPlannerTests/FeaturesV10/PlanDataTests.swift  # 20 XCTest cases (18 PlanData + 2 SubscriptionV10DTO decode round-trip)"
  modified:
    - "ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift  # PlanViewPlaceholderView body → PlanView()"
    - "ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift  # «+ ПОДНЯТЬ ЛИМИТ» pushes PlanView(focusCategoryId: cat.id) instead of PlanViewPlaceholderView()"

key-decisions:
  - "Use parallel agent 26-07's SubscriptionV10DTO + SubscriptionsV10API rather than create my own. Discovered mid-Task-1 that 26-07 had landed identical wire-shape DTOs + API enum (commit fd08e3d) before my GREEN commit. Their UpdateRequest uses `cycle: SubCycle?` / `nextChargeDate: Date?` (more type-safe than my draft's String?) — net upgrade. Removed my drafts to avoid redeclaration; my PlanDataTests reference only SubscriptionV10DTO decode (no UpdateRequest), so no test rework needed."
  - "Slider upper bound = max(6_000_000, max(income, currentPlan)). Same formula Step03PlanView (Plan 24-07) uses for onboarding. Floor of 60_000₽ protects low-income users; max(income, currentPlan) ensures already-saved over-budget rows still fit on the slider (rare but possible if user lowered their income after seeding plans)."
  - "Submit fail-mode does NOT clear local plans. User keeps their slider positions when 400 plan_overflow surfaces — they need to see and adjust the values, not start from scratch. Mirrors web Plan 26-04 behaviour."
  - "Toast lifecycle: model.toastMessage drives a single .onChange in the view that flips toastVisible=true; the Toast component's built-in 1.7s auto-dismiss handles the visibility. Source string cleared after 2s grace so the same message fires .onChange again if user re-triggers (e.g. posts another regular)."
  - "Regular rows render two button states: «ПРОВЕСТИ →» (paper outline) when posted_txn_id == nil, «ОТМЕНА» (yellow outline) when set. Two-tap commit (post then maybe unpost) mitigates T-26-05-02 accidental tap repudiation."
  - "Save success → 600ms grace before router.pop(). Lets the user see the «✓ ПЛАН СОХРАНЁН» toast peek before the screen pops — prevents visual whiplash."

patterns-established:
  - "PATCH-batch save pattern for atomic editing screens: ViewModel maintains local edit array (here: `var plans: [PlanMonthItem]`) mutated by PosterSlider onCommit closures, PATCH only fires from explicit Submit. Keeps the wire-traffic count = 1 per save action regardless of slider activity. Re-applicable for any future bulk-edit surface (Categories management Phase 27, Subscriptions bulk-pause, etc)."
  - "APIError serverError(code, _) discrimination via `where` clause inside catch — clean way to handle service-layer error contracts (here: 400 plan_overflow) without exposing the raw HTTP code to the user."

requirements-completed:
  - PLAN-V10-01  # cobalt bg, eyebrow «MGMT / LIMITS», Mass «PLAN МЕСЯЦА.» 70pt — pushed from HomeV10View Plan-bar tap (zero-touch swap)
  - PLAN-V10-02  # «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» plate with OK/OVER colour; OVER blocks «СОХРАНИТЬ» CTA via disabled=true + .ghost variant
  - PLAN-V10-03  # 2 rollover-aggregate plates («→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ»); Σ(plan-fact) per rollover policy, paused & savings-code & isOver excluded
  - PLAN-V10-04  # «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» block — monthly subs sorted by day_of_month, ПРОВЕСТИ→/ОТМЕНА per row, Toast on success
  - PLAN-V10-05  # 8 PosterSlider per category (step 50_000 = 500₽, 300ms debounce); chip-pair «ПРОЧЕЕ»/«НАКОПЛЕНИЯ» per category mutates rollover via PATCH /categories/:id
  - PLAN-V10-06  # «СОХРАНИТЬ» → PlanMonthAPI.patch(plans:); 200 → Toast + router.pop after 600ms grace; 400 plan_overflow → inline saveError

# Metrics
duration: ~12m
completed: 2026-05-10
---

# Phase 26 Plan 05: iOS PLAN мая Summary

**Built the iOS PLAN мая screen (PLAN-V10-01..06): cobalt-bg ZStack with «MGMT / LIMITS» eyebrow + Mass «PLAN МЕСЯЦА.» 70pt header, surplus plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» that flips yellow→red and disables «СОХРАНИТЬ» when Σplan exceeds income, two rollover-aggregate plates («→ ПРОЧЕЕ» / «→ НАКОПЛЕНИЯ»), a «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» block with «ПРОВЕСТИ →» / «ОТМЕНА» buttons that wrap POST /subscriptions/:id/post|unpost, eight PosterSlider rows (step 50_000 = 500₽, 300ms debounce built-in) with a paper-outline chip-pair toggling rollover per category via PATCH /categories/:id (Phase 26-01 backend ext), and a single «СОХРАНИТЬ» CTA that fires PATCH /api/v1/plan-month atomically (Phase 26-01 BE-08) with the entire local edit batch — surplus plate's red state + CTA's disabled state + server-side Σplan ≤ income check create three layered overflow defences. Symmetric to web Plan 26-04 — by adding pure-compute helpers (PlanData) with TDD coverage (20 XCTests, all green), an @Observable VM (parallel async-let load, inFlight guard, atomic submit), a SwiftUI view, and two zero-touch wirings: HomePlaceholders.PlanViewPlaceholderView's body rebound to render PlanView() and CategoryDetailView's «+ ПОДНЯТЬ ЛИМИТ» CTA finalising its push from PlanViewPlaceholderView() to PlanView(focusCategoryId: cat.id) so the screen scrolls to the focused slider row anchor=.center on appear.**

## Performance

- **Duration:** ~12 min wall-clock (this agent only — 3 other agents in parallel)
- **Started:** 2026-05-10T18:15:02Z
- **Completed:** 2026-05-10T18:27:29Z
- **Tasks:** 3 of 3 (Task 1 TDD red/green, Tasks 2 & 3 atomic feat commits)
- **Files created:** 5 (4 production swift + 1 test swift)
- **Files modified:** 2 (HomePlaceholders.swift, CategoryDetailView.swift)
- **Commits (this plan only):** 4
  - `1229c9c` test(26-05): RED — failing PlanDataTests (18 cases) for PlanData + DTOs
  - `e04cfc2` feat(26-05): GREEN — PlanData pure compute + PlanMonthAPI
  - `a944caa` feat(26-05): PlanViewModel + PlanView SwiftUI screen (PLAN-V10-01..06)
  - `7d5794a` feat(26-05): zero-touch swap PlanViewPlaceholderView → PlanView + finalize CategoryDetail push
- **Test count:** 20 PlanDataTests (18 PlanData behaviours + 2 SubscriptionV10DTO decode round-trip). Regression: HomeDataTests (20) + CategoryDetailDataTests (13) + V10MainShellTests (8) all re-run green — no regressions. **61/61 total** in the smoke suite.

## Accomplishments

- **`PlanData` (~140 lines)**: pure compute layer.
  - `computeSurplus(incomeCents:plans:)` — `income − Σplan` (signed).
  - `computeIsOverflow(_:)` — predicate `surplus < 0`.
  - `RolloverAggregates` Equatable struct with `miscCents` + `savingsCents`.
  - `computeRolloverAggregates(categories:plans:actuals:)` — partition `max(0, plan − fact)` by `rollover` policy; excludes paused, savings-code, over-budget rows.
  - `RegularRow` Identifiable Equatable struct with `id, name, dayOfMonth, categoryName, amountCents, postedTxnId`.
  - `computeRegularsList(subs:categories:)` — filter monthly + dayOfMonth, join category name (O(1) via dictionary), sort by dayOfMonth ASC.
  - `applyPlanEdit(_:categoryId:newCents:)` — immutable replace-or-append (asserted by test fixture).
  - `plansFromCategories(_:)` — seed list for initial state, drops savings + paused.

- **`PlanMonthItem` Encodable + `PlanMonthResponseDTO` Decodable + `PlanMonthPatchBody` wrapper + `PlanMonthAPI.patch(plans:)`** — single-method enum mirrors web `frontend/src/api/v10/planMonth.ts` (Plan 26-04). Throws on `APIError.serverError(400, _)` for plan_overflow; VM catches with `where code == 400` to surface inline message.

- **`PlanViewModel` (~180 lines)**: @MainActor @Observable class.
  - Status state machine (`Status: Equatable` — idle / loading / ready / error(String)).
  - `load()` opens `async let categoriesTask = CategoriesV10API.list()` in parallel with `async let subsTask = SubscriptionsV10API.list()`, `async let meTask = MeV10API.shared.fetchMeV10()`. Period wrapped in inline `do/catch` (404-tolerant). Categories filtered to `code != "savings" && !paused`, sorted by `ord`. plans seeded via `PlanData.plansFromCategories`. Actuals fetched only if a period resolves.
  - `inFlight` guard returns immediately on re-entrant calls (T-26-05-03).
  - `updateSlider(categoryId:cents:)` — local-only mutation via `applyPlanEdit`; no PATCH (sliders are debounced upstream by PosterSlider, this method just commits the new array to local state).
  - `toggleRollover(categoryId:to:)` — PATCH /categories/:id with `CategoryV10UpdateRequest(rollover:)`; replaces the local DTO from server response.
  - `postRegular(_:)` / `unpostRegular(_:)` — wrap POST endpoints + show toast + reload.
  - `submit()` — fires `PlanMonthAPI.patch(plans:)`; returns Bool so the caller can chain `router.pop()` after a 600ms grace. 400 plan_overflow → `saveError` inline.

- **`PlanView` (~310 lines)**: SwiftUI surface.
  - ZStack(.top): cobalt background + content + Toast overlay (top-aligned with 16pt padding).
  - Loading state: ProgressView + «ЗАГРУЗКА» eyebrow.
  - Error state: «ОШИБКА» eyebrow + Mass message + «ПОВТОРИТЬ →» retry PosterButton.
  - Ready state composition (top-down in ScrollView with 22pt horizontal / 56pt top / 90pt bottom padding):
    - `headerRow`: optional «← НАЗАД» button (visible when `router?.canPop`) + Eyebrow «MGMT / LIMITS».
    - `Mass("PLAN МЕСЯЦА.", size: 70)`.
    - `surplusPlate`: VStack with Eyebrow «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» + 22pt Archivo Black amount; sign-prefixed with `+` / U+2212 minus; bg = yellow.opacity(0.18) when OK, red.opacity(0.18) when OVER; foreground = yellow / red accordingly.
    - 2 `aggPlate`s in HStack: paper.opacity(0.08) bg, eyebrow + 14pt mono amount.
    - `regularsSection`: empty-state «Нет регулярных платежей» italic OR ForEach of `regularRow`s with bottom 1pt divider.
    - `regularRow`: HStack with name UPPERCASE 13pt + «N числа · {category}» mono caption + amount mono right-aligned + button («ПРОВЕСТИ →» paper-outline OR «ОТМЕНА» yellow-outline).
    - `categoryRow` per `CategoryV10DTO`: name uppercase 13pt + PosterSlider (range 0...max(6_000_000, max(income, currentPlan)), step 50_000) + Chip pair («ПРОЧЕЕ» / «НАКОПЛЕНИЯ») + 1pt paper.opacity(0.18) divider.
    - SaveError text (red, 12pt mono semibold) when present.
    - PosterButton: «СОХРАНЯЕМ…» when submitting else «СОХРАНИТЬ ↵»; variant `.primary` (yellow) when OK, `.ghost` when overflow; disabled when overflow OR submitting; on tap → `Task { let ok = await model.submit(); if ok { sleep 600ms; router?.pop() } }`.
  - `ScrollViewReader.scrollTo(focusCategoryId, anchor: .center)` on appear with 150ms grace (so the ForEach has rendered before the scroll fires).

- **`HomePlaceholders.swift` modification** (~6 lines): `PlanViewPlaceholderView`'s body changed from a 5-arg PosterPlaceholder to `PlanView()`. Type name kept identical so the existing `router?.push(PlanViewPlaceholderView())` callsites (HomeV10View Plan-bar tap, anywhere else internally referencing the placeholder) continue to work without modification — same zero-touch swap pattern Plan 25-09 established for TransactionsViewPlaceholderView and Plan 26-03 used for CategoryDetailPlaceholderView.

- **`CategoryDetailView.swift` modification** (~6 lines): `ctaRow`'s «+ ПОДНЯТЬ ЛИМИТ» button now pushes `PlanView(focusCategoryId: cat.id)` instead of the placeholder. The PlanView ScrollViewReader picks up the focusCategoryId on appear and scrolls to the matching `.id(c.id)` row anchor=`.center`, so the user lands at the slider they came to adjust. Inline comment documents the wiring.

- **Tests**: 20 XCTest cases covering every code path:
  - `computeSurplus` — 3 (positive / zero / negative).
  - `computeIsOverflow` — 2 (boundary at 0).
  - `computeRolloverAggregates` — 5 (misc bucket / savings bucket / paused excluded / savings-code excluded / over-budget contributes 0).
  - `computeRegularsList` — 3 (monthly + dayOfMonth filter / yearly + nil-day excluded / sort by dayOfMonth ASC).
  - `applyPlanEdit` — 3 (replace existing / append new / does-not-mutate-input).
  - `plansFromCategories` — 2 (savings-code filter / paused filter).
  - `SubscriptionV10DTO` decode round-trip — 2 (full v1.0 ext / missing ext defaults to nil).

## SwiftUI patterns chosen for this plan

### Single-PATCH atomic save with local-only slider state
PLAN мая is the prototypical bulk-edit screen — user moves multiple sliders before pressing Save, and the backend's `update_plan_month_atomic` (Phase 26-01) requires the entire batch to land or none. PlanViewModel maintains `var plans: [PlanMonthItem]` mutated locally by `updateSlider(categoryId:cents:)` (which delegates to `PlanData.applyPlanEdit`); PATCH only fires from `submit()`. PosterSlider's built-in 300ms debounce prevents the local model from updating on every drag tick, but even without it, the wire traffic stays at exactly 1 PATCH per «СОХРАНИТЬ» press regardless of slider activity. Re-applicable to any future bulk-edit screen.

### APIError serverError(code, _) where-clause discrimination
APIClient maps HTTP statuses to specific `APIError` cases (notFound for 404, unprocessable for 422, etc.) but folds the rest into `serverError(Int, String)`. To surface the plan-specific 400 plan_overflow error inline (vs. a generic «не удалось сохранить»), `submit()` uses `catch APIError.serverError(let code, let detail) where code == 400` — a clean way to handle service-layer error contracts without dropping to string-matching the description.

### Two-tap commit for regular post mitigates accidental repudiation
Threat T-26-05-02 (Repudiation: accidental post tap) is mitigated by the ПРОВЕСТИ → / ОТМЕНА row — the user can immediately undo a post they didn't mean to make, since the unpost API is an idempotent inverse. Toast confirms each transition («✓ ПРОВЕДЕНО → РЕЕСТР» / «ОТМЕНЕНО») so the user has explicit confirmation of state.

### Toast wired through model.toastMessage + onChange + auto-dismiss
The Toast component has a built-in 1.7s auto-dismiss tied to `@Binding var visible`. PlanView's `.onChange(of: model.toastMessage)` flips `toastVisible=true` whenever the VM sets a new message; a 2s sleep then clears `model.toastMessage` so the same message can re-trigger `.onChange` if the user posts another regular. Single source of truth (model.toastMessage), View handles only the visibility binding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Parallel agent 26-07 already created SubscriptionV10DTO + SubscriptionsV10API**
- **Found during:** Task 1 GREEN gate (after RED commit landed).
- **Issue:** My initial GREEN draft created `SubscriptionV10DTO.swift` + `SubscriptionsV10API.swift` per the plan files_modified list. Discovered parallel agent 26-07 had already committed these files in commit `fd08e3d` with the same wire shape (Decodable mirror of `SubscriptionRead+Ext` with `dayOfMonth` / `accountId` / `postedTxnId` defensive defaults) plus a slightly more type-safe `UpdateRequest` that uses `cycle: SubCycle?` / `nextChargeDate: Date?` (vs. my draft's `String?`). Continuing my own files would cause redeclaration errors.
- **Fix:** Removed my drafts; rely on 26-07's files. My PlanDataTests's only direct DTO assertion is `SubscriptionV10DTO` decode (`test_subscription_v10_dto_decodes_with_full_v10_ext` + `test_subscription_v10_dto_decodes_when_v10_ext_missing`), which works against 26-07's DTO unchanged. PlanData.swift consumes only the read shape too — no Update required. PlanViewModel uses `SubscriptionsV10API.list/post/unpost` which 26-07 provides identically.
- **Files modified:** my drafts deleted before commit — no commit needed.
- **Documented in:** key-decisions section above + commit message of `e04cfc2`.

**2. [Rule 3 - Blocking] Build collision with parallel agent 26-07 SubscriptionsView.swift**
- **Found during:** Task 1 GREEN gate (xcodebuild test attempt).
- **Issue:** Agent 26-07's draft `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsView.swift` collided with the legacy `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift` — Xcode rejects two source files with the same name in a single target.
- **Fix:** None on my side — out-of-scope for plan 26-05. Documented in commit `e04cfc2` message; verified standalone parse-check of my new files (PlanData.swift + PlanMonthAPI.swift) passes.
- **Resolution:** Agent 26-07 renamed their file to `SubscriptionsV10View.swift` (commit `9894fb7`), restoring the build before I started Task 2. I picked up the green build at Task 2's xcodebuild gate.

### Out-of-scope discoveries

None — every blocker was directly caused either by parallel agent overlap (handled above) or by the new files added in this plan.

## Authentication Gates

None. All API calls go through the existing `APIClient.shared` flow which carries the dev/Telegram token established by AuthAPI in earlier phases. PATCH /api/v1/plan-month + PATCH /api/v1/categories/:id + POST /api/v1/subscriptions/:id/post are all owner-scoped via `get_current_user` + `require_onboarded` (Phase 26-01).

## Issues Encountered

- **Parallel agent file collisions**: Twice in this plan (26-07 created SubscriptionV10DTO before I did → had to remove my drafts; 26-07's SubscriptionsView.swift name-collided with legacy → blocked Task 1 test gate momentarily). Both resolved without intervention — 26-07 renamed their file before I needed Task 2's build gate, and the DTO overlap was a net upgrade. The worktree pattern serialises commits but doesn't prevent overlapping file creation across agents — accepting the cost in exchange for parallel throughput.

- **PosterButton `disabled:` parameter visibility**: The PosterButton initialiser has `disabled: Bool = false` as the third parameter (after `variant`). My initial Task 2 draft passed `disabled` as a trailing modifier (`.disabled(...)`) but PosterButton already wires the disabled flag internally. Verified via `Read PosterButton.swift` — the `init(_:variant:disabled:action:)` signature ergonomically takes the flag inline, no external `.disabled(...)` modifier needed. This is the form used in PlanView's save CTA.

- **`xcodegen generate` invalidates xcodeproj path-relative**: After picking up the new `FeaturesV10/Plan/` folder, `.xcodeproj` is regenerated and ignored by git per `.gitignore`. Per project convention this is the right call — the project file is regenerated locally from `project.yml` whenever new files appear (mirrors Plan 26-03 SUMMARY observation).

## Threat Flags

None — this plan does not introduce any new attack surface beyond what Phase 26-01 backend already accounted for. The four threats called out in this plan's `<threat_model>` are all mitigated:

| Threat ID | Mitigation | Where enforced |
|-----------|------------|----------------|
| T-26-05-01 | Type-safe `PlanMonthItem: Encodable` + backend Pydantic (Phase 26-01) | `ios/BudgetPlanner/Networking/Endpoints/PlanMonthAPI.swift` (PlanMonthItem struct) + Phase 26-01 service-layer validation |
| T-26-05-02 | Toast confirms post + ОТМЕНА inline → two taps before final mutation | `ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift:regularRow(_:)` (button-state switch on postedTxnId) |
| T-26-05-03 | Local @Observable update; PATCH only on Submit; PosterSlider 300ms debounce | `ios/BudgetPlanner/FeaturesV10/Plan/PlanViewModel.swift:updateSlider/submit` + PosterSlider's built-in debounce |
| T-26-05-04 | `CategoryRollover` enum limits chip-pair to 2 known values | `ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift:CategoryRollover` (Codable enum) + Chip's two-instance ForEach |

## Known Stubs

- **toggleRollover / postRegular / unpostRegular silent-fail sites**: All three VM methods catch errors silently and rely on the next `load()` to refresh state. T-26-05-02 / T-26-05-04 mitigations are upstream of these (CategoryRollover enum + 2-tap commit) so the silent fail-mode isn't a security issue, just a UX one. Phase 28 polish wires a toast/banner. Documented inline in PlanViewModel with explicit `// Silent — Phase 28 polish.` comment.

## Self-Check: PASSED

**Files exist:**

- FOUND: `ios/BudgetPlanner/FeaturesV10/Plan/PlanData.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Plan/PlanViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift`
- FOUND: `ios/BudgetPlanner/Networking/Endpoints/PlanMonthAPI.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/PlanDataTests.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` (modified)
- FOUND: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift` (modified)
- DEPS-VERIFIED: `ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift` (provided by parallel agent 26-07 commit `fd08e3d`)
- DEPS-VERIFIED: `ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift` (provided by parallel agent 26-07 commit `fd08e3d`)

**Commits exist (this plan only — verified via `git log --oneline`):**

- FOUND: `1229c9c` test(26-05): RED — failing PlanDataTests (18 cases) for PlanData + DTOs
- FOUND: `e04cfc2` feat(26-05): GREEN — PlanData pure compute + PlanMonthAPI
- FOUND: `a944caa` feat(26-05): PlanViewModel + PlanView SwiftUI screen (PLAN-V10-01..06)
- FOUND: `7d5794a` feat(26-05): zero-touch swap PlanViewPlaceholderView → PlanView + finalize CategoryDetail push

**Verification gates from PLAN <verification>:**

| Gate | Required | Actual |
|------|----------|--------|
| 1. `xcodebuild test -only-testing:BudgetPlannerTests/PlanDataTests` | 18+ pass | ✓ 20/20 cases pass on iPhone 17 Pro Simulator |
| 2. `xcodebuild build` | succeeds | ✓ Build Succeeded after Task 2 + Task 3 (exit 0) |
| 3. `xcodebuild test HomeDataTests + CategoryDetailDataTests + V10MainShellTests` (no regression) | passes | ✓ 61/61 total in smoke suite |
| 4. `grep -c "static func compute\|plansFromCategories\|applyPlanEdit" ios/BudgetPlanner/FeaturesV10/Plan/PlanData.swift` | ≥ 5 | 6 (computeSurplus / computeIsOverflow / computeRolloverAggregates / computeRegularsList / applyPlanEdit / plansFromCategories) |
| 5. `grep -c "PlanMonthAPI" ios/BudgetPlanner/Networking/Endpoints/PlanMonthAPI.swift` | ≥ 1 | 1 |
| 6. `grep -c "PosterSlider\|Chip\|Toast\|Mass\|Eyebrow\|PosterButton" ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift` | ≥ 6 | ≫6 (multiple uses each) |
| 7. `grep -c "ПЛАН МЕСЯЦА\|ОСТАЛОСЬ РАСПРЕДЕЛИТЬ\|ПРОВЕСТИ\|СОХРАНИТЬ\|КАТЕГОРИИ\|РЕГУЛЯРНЫЕ" ios/BudgetPlanner/FeaturesV10/Plan/PlanView.swift` | ≥ 6 | 6+ (ПЛАН МЕСЯЦА × 1 + ОСТАЛОСЬ РАСПРЕДЕЛИТЬ × 1 + ПРОВЕСТИ × 2 + СОХРАНИТЬ × 2 + КАТЕГОРИИ × 1 + РЕГУЛЯРНЫЕ × 1) |
| 8. `grep -c "PlanMonthAPI.patch\|SubscriptionsV10API.post" ios/BudgetPlanner/FeaturesV10/Plan/PlanViewModel.swift` | ≥ 2 | 3 (patch + post + unpost) |
| 9. `grep -c "@Observable\|@MainActor" ios/BudgetPlanner/FeaturesV10/Plan/PlanViewModel.swift` | ≥ 2 | 2 |
| 10. `grep -c "PlanView()" ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` | ≥ 1 | 1 |
| 11. `grep -c "PlanView(focusCategoryId" ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift` | ≥ 1 | 1 |

**No accidental file deletions** in any of this plan's 4 commits.

## TDD Gate Compliance

- **RED gate:** `1229c9c` test(26-05): RED — verified failing build (`cannot find 'PlanData' in scope` + `cannot find 'PlanMonthItem' in scope` × N) before GREEN. The DTO references (`SubscriptionV10DTO`) compiled because parallel agent 26-07 had already landed the type — this is acceptable for a shared-DTO contract; my own helpers (`PlanData`, `PlanMonthItem`) drove the RED.
- **GREEN gate:** `e04cfc2` feat(26-05): GREEN — verified test pass via `xcodebuild test -only-testing:BudgetPlannerTests/PlanDataTests` after the cross-agent build collision was resolved (during Task 2 build gate).
- **REFACTOR gate:** not used (Tasks 2-3 are non-TDD per plan; first-pass implementations didn't need a separate refactor commit).

## Next Phase Readiness

- **Phase 26-04 web Plan view** already integrates against the same backend endpoints (PATCH /plan-month + PATCH /categories/:id + POST /subscriptions/:id/post), so iOS ↔ web parity holds without additional work.
- **Phase 27 Mgmt-хаб** can push `PlanView(focusCategoryId: nil)` from a numbered list-row entry; the placeholder swap means any caller that pushes `PlanViewPlaceholderView()` lands on the real screen too.
- **Phase 28 polish** wires toast/banner for the silent-fail sites in PlanViewModel (toggleRollover / postRegular / unpostRegular). Each catch site is marked `// Silent — Phase 28 polish.` for easy grep.
- **iOS smoke verification** is best done on the simulator (XcodeBuildMCP screenshot) since the verification involves real PATCH calls landing on the dev backend — outside the scope of the headless `xcodebuild test` gate. Build + unit tests are the automated gates; visual / functional smoke is documented but not blocking for SUMMARY-write.

---
*Phase: 26-category-detail-plan-subscriptions*
*Plan: 05*
*Completed: 2026-05-10*
