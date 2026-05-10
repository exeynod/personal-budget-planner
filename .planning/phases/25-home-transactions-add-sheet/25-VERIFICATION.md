---
phase: 25-home-transactions-add-sheet
verified: 2026-05-10T15:50:00Z
status: gaps_found
score: 2/5 must-haves verified (foundation primitives green; Home wiring + TXN/ADD UI absent)
overrides_applied: 0
gaps:
  - truth: "User-with-onboarded_at != null лендится на HomeView (web AppV10 + iOS V10MainShell), без OnboardingFlow."
    status: failed
    reason: "HomeView / HomeMount / HomeV10View built and tested in isolation, but NEVER mounted into the production routing path. Web AppV10 still routes to <OnboardingMount/> which renders <HomePlaceholder/> (Phase 24 stub) on onboarded users; iOS V10MainShell still renders OnboardingMountView() which falls through to HomePlaceholderView() on onboarded users. There is no Plan 25-09 (web wiring) or Plan 25-10 (iOS wiring) in this phase — the plans 25-04/25-05 SUMMARY files explicitly defer the wiring to those non-existent plans."
    artifacts:
      - path: "frontend/src/AppV10.tsx"
        issue: "Line 41: renders <OnboardingMount/> directly. No PosterRouterProvider, no HomeMount import. After onboarding, OnboardingMount.tsx:117 returns <HomePlaceholder/>, NOT <HomeMount/>."
      - path: "ios/BudgetPlanner/App/V10MainShell.swift"
        issue: "Lines 16-19: body returns OnboardingMountView() only. No PosterRouter env injection, no HomeV10View, no FAB, no BottomNavV10."
      - path: "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift"
        issue: "Line 134: when onboardedAt != nil, renders HomePlaceholderView() (lines 194-206 of same file — Phase 24 stub) instead of HomeV10View()."
      - path: "frontend/src/screensV10/Onboarding/OnboardingMount.tsx"
        issue: "Line 117: returns <HomePlaceholder /> for onboarded users; comment on line 6 admits «Phase 25 will replace» but the swap never happened."
    missing:
      - "Web: replace `<HomePlaceholder/>` reference in OnboardingMount.tsx (or AppV10.tsx) with `<PosterRouterProvider root={<HomeMount/>}><PosterRouterView/></PosterRouterProvider>` for onboarded users."
      - "iOS: replace `HomePlaceholderView()` in OnboardingMountView.swift with `HomeV10View()` wrapped in `PosterNavStack { HomeV10View() }` and inject `@Environment(\\.posterRouter)` so push routes work."
      - "Both: mount BottomNavV10 / FAB at the shell level (5 tabs Home/Savings/FAB-center/AI/Mgmt per TXN-V10-06)."
      - "Both: cover the wiring with at least one integration test (Playwright `home page renders after onboarding` / iOS XCTest with mocked /me returning onboarded_at != nil)."

  - truth: "TXN-V10-01..06 — Transactions registry (cobalt push-stack screen with day-grouping, chip filter, spec-tags) renders and is reachable from Home «ВСЕ ОПЕРАЦИИ →»."
    status: failed
    reason: "Intentional scope limitation per user-provided context and 25-must-haves.md (FOUNDATION-only ship). No TransactionsView component / view directory exists on either web (frontend/src/screensV10/Transactions/) or iOS (ios/BudgetPlanner/FeaturesV10/Transactions/). The HomeMount «ВСЕ ОПЕРАЦИИ →» tap pushes a TransactionsViewPlaceholder («WIP — Transactions») instead. Plan 25-06 (web Transactions) and Plan 25-08 (iOS Transactions) referenced in summaries do not exist in this phase."
    artifacts:
      - path: "frontend/src/screensV10/Transactions/"
        issue: "Directory does not exist."
      - path: "ios/BudgetPlanner/FeaturesV10/Transactions/"
        issue: "Directory does not exist."
      - path: "frontend/src/screensV10/_placeholders.tsx"
        issue: "Contains TransactionsViewPlaceholder stub (intentional WIP per Plan 25-04 SUMMARY)."
    missing:
      - "TransactionsView (web + iOS) with day-grouping, chip filter, roundup/deposit spec-tags, edit modal, swipe-left/right-click delete."
      - "Wire HomeMount onAllOperationsTap to push real TransactionsView instead of placeholder."
      - "v0.6 Transactions tab demotion (TXN-V10-06) — BottomNavV10 wrapper exists but is not mounted; the active root path still renders the v0.6 5-tab MainShell with Transactions visible."

  - truth: "ADD-V10-01..05 — Add Sheet (black bg, custom 3x4 keypad, suppressed system keyboard on iOS, FAB available everywhere) submits POST /actual with account_id."
    status: failed
    reason: "Intentional scope limitation per user-provided context and 25-must-haves.md. No AddSheet component / view directory exists on either platform. Backend wire contract (POST /actual + account_id, 4-valued kind, parent_txn_id) IS in place (Plan 25-01) and integration-tested (16/16 green) — but no UI consumes it. FAB is not mounted at any shell level."
    artifacts:
      - path: "frontend/src/screensV10/AddSheet/"
        issue: "Directory does not exist."
      - path: "ios/BudgetPlanner/FeaturesV10/AddSheet/"
        issue: "Directory does not exist."
      - path: "frontend/src/screensV10/common/PosterSheet.tsx"
        issue: "Web modal primitive ready (165 LOC, exports PosterSheet) but never imported by any AddSheet component."
    missing:
      - "AddSheet component (web + iOS) with 3x4 keypad, BigFig 86px yellow amount, description input, date chips, category chip-scroll, account picker row, CTA state machine."
      - "iOS SuppressedKeyboardField TextField wrapper with inputView=empty UIView."
      - "FAB mounted at shell level (web + iOS) with onTap → open PosterSheet wrapping AddSheet."
      - "Submit handler calling createActualV10({account_id, ...}) and refresh on success."
      - "Confirm-sheet «ОТМЕНИТЬ ЗАПИСЬ?» on dirty close."

deferred:
  - truth: "Pre-existing test_actual_crud.py legacy fixture lacks code/ord NOT NULL columns."
    addressed_in: "Quick-task (out-of-scope sweep across legacy test fixtures — flagged in deferred-items.md)."
    evidence: "Phase 25-01 SUMMARY explicitly logs this as out-of-scope; pre-dates Phase 25 (commit 896def4, 2026-04 era). New v10 surface is fully covered by tests/api/test_actual_v10_extension.py (16/16 green)."
---

# Phase 25: Home + Transactions + Add Sheet — Verification Report

**Phase Goal:** User получает три ключевых экрана нового UX — Home (coral, hero «Дневной темп» с count-up + sorted category list со stagger + plan badge + wallet link), Transactions registry (cobalt push-stack экран с day-grouping, single-select chip filter, spec-tags roundup/deposit), Add Sheet (чёрный фон, custom 3×4 цифровая клава, suppressed system kb на iOS, FAB доступен с любого экрана кроме Add Sheet самого); v0.6 Transactions tab demoted из bottom nav.

**Verified:** 2026-05-10T15:50:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (5 grouped by ROADMAP Success Criteria)

| #   | Truth                                                                                       | Status   | Evidence                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| SC-1 | Home screen (eyebrow / count-up daily pace / wallet link → Accounts) RENDERS to onboarded user | ✗ FAILED | HomeView (web) + HomeV10View (iOS) **components** are built and unit-tested (42 web tests + 41 iOS tests pass), but neither is mounted in production routing. Web AppV10 → OnboardingMount → HomePlaceholder (NOT HomeMount); iOS V10MainShell → OnboardingMountView → HomePlaceholderView (NOT HomeV10View). User who completes onboarding sees Phase 24's `«VOL.05 · ДОМ» / «ДОМ.»` placeholder, not the V10 Home. |
| SC-2 | Sorted category list with stagger animation, OVER plate, push routes (Category Detail + Transactions) | ⚠️ PARTIAL | computeCategoryAggregates / sortCategoriesForHome / HomeView render logic exist and are unit-tested. But HomeView itself is unreachable in production (see SC-1). Push routes go to placeholders (`CategoryDetailPlaceholder`, `TransactionsViewPlaceholder`) which are intentional WIP per Plan 25-04 SUMMARY. |
| SC-3 | Transactions registry (cobalt, day-grouping, chip filter, roundup/deposit spec-tags, swipe-delete) | ✗ FAILED | Intentional scope deferral. Neither `frontend/src/screensV10/Transactions/` nor `ios/BudgetPlanner/FeaturesV10/Transactions/` exists. Backend ActualRead now emits 4-valued kind + parent_txn_id (Plan 25-01) — wire is ready, UI is absent. |
| SC-4 | Add Sheet (FAB → custom keypad → suppressed kb on iOS → POST /actual with account_id) | ✗ FAILED | Intentional scope deferral. Neither `frontend/src/screensV10/AddSheet/` nor `ios/BudgetPlanner/FeaturesV10/AddSheet/` exists. POST /actual route now accepts account_id and dispatches to create_actual_v10 (Plan 25-01) — wire is ready, UI is absent. PosterSheet web primitive exists but is unwired. |
| SC-5 | v0.6 Transactions tab demoted (5-tab nav: Home/Savings/FAB/AI/Mgmt); reachable only via push-stack | ✗ FAILED | BottomNavV10 wrapper component exists (35 LOC, ready) but is not mounted at any shell level. The current production routing path (V10MainShell + AppV10) does not render any bottom nav at all in V10 mode — and the Transactions tab in v0.6 MainShell remains visible because no demotion has been wired. |

**Score:** 2/5 truths verified (foundation pieces green; user-facing experience absent).

> Strict reading per SC-1..5: 0 of 5 are fully VERIFIED. The "2/5" score in frontmatter credits the two foundation-level achievements (backend wire contract + web/iOS primitives) that **enable** the screens but do not satisfy the user-observable goal of the phase. By goal-backward verification, the goal is NOT achieved.

### Deferred Items

| #   | Item                                                                              | Addressed In       | Evidence                                                                                                                                                |
| --- | --------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pre-existing tests/test_actual_crud.py NotNullViolationError on code/ord columns | quick-task (out-of-scope sweep) | Logged in deferred-items.md. Pre-dates Phase 25 (Phase 22 alembic 0013 made columns NOT NULL but legacy test fixture not updated). New v10 surface fully covered (16/16 green). |

> NOTE: TXN-V10-01..06 and ADD-V10-01..05 requirements are intentionally NOT marked as deferred to a later milestone phase because no later phase (26 / 27 / 28) claims to cover them in its goal or success criteria. Phase 26 covers Category Detail + PLAN + Subscriptions; Phase 27 covers AI + Savings + Accounts + Analytics + Management; Phase 28 is animations polish. The Transactions registry and Add Sheet are part of THIS phase's goal and remain UNFULFILLED — they require either a follow-up plan in this phase or a re-scoped Phase 25.5 / Phase 26 addendum. The user-provided context confirms this is an intentional FOUNDATION-only ship and asks for `gaps_found` status accordingly.

---

## Required Artifacts

### Backend (Plan 25-01)

| Artifact                                  | Expected                                                                                            | Status     | Details                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/schemas/actual.py`               | 4-valued ActualKindStr Literal; ActualCreate.account_id; ActualRead.{account_id,parent_txn_id}      | ✓ VERIFIED | 106 lines. ActualKindStr declared at line 27 with all 4 values. ActualCreate.account_id (line 51, gt=0). ActualRead.account_id + parent_txn_id (lines 80-81). extra='forbid' guard on ActualCreate. Backward-compat KindStr alias preserved (line 28). |
| `app/api/routes/actual.py`                | POST /actual dispatches to create_actual_v10 when account_id present; 404 on cross-tenant; legacy path preserved | ✓ VERIFIED | 308 lines. Lines 142-168 implement the body.account_id branch with explicit get_or_404 pre-validation (T-25-01-01) and dispatch to create_actual_v10. Legacy path (lines 170-183) intact. AccountNotFoundError → 404 mapping at line 184. |
| `tests/api/test_actual_v10_extension.py`  | Integration tests for account_id + 4-valued kind + parent_txn_id + cross-tenant 404                 | ✓ VERIFIED | 18934 bytes; declared 16 tests in SUMMARY (11 schema unit + 5 route integration). All claimed green by SUMMARY self-check.                                                                          |

### Web (Plans 25-02, 25-03, 25-04)

| Artifact                                                          | Expected                                                                                       | Status     | Details                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `frontend/src/screensV10/common/PosterRouter.tsx`                | usePosterRouter hook + Provider + View; min 80 lines                                          | ✓ VERIFIED | 159 LOC. Exports PosterRouterProvider, PosterRouterView, usePosterRouter, MAX_STACK, types. useReducer-based state machine with PUSH/POP/POP_TO_ROOT actions; cap MAX_STACK=16 enforced.                                                                                                          |
| `frontend/src/screensV10/common/PosterSheet.tsx`                 | web modal: backdrop opacity 0.45 + slide-up + drag-to-close + Escape + scroll lock; min 50 LOC | ⚠️ ORPHANED | 169 LOC. PosterSheet primitive exports correctly; backdrop click + Escape handler + drag-to-close (100px / 800px·s thresholds) + body scroll lock all present. **NOT IMPORTED ANYWHERE** in production code (no AddSheet consumer).                                                              |
| `frontend/src/screensV10/common/BottomNavV10.tsx`                | 5-tab wrapper + isHidden gate; min 30 LOC                                                      | ⚠️ ORPHANED | 35 LOC. Wraps existing TabBar. **NOT IMPORTED ANYWHERE** in production code. Outside its file and barrel re-export, zero consumers (no V10MainShell mount, no AppV10 mount).                                                                                                                     |
| `frontend/src/screensV10/common/format.ts`                       | formatDay / formatTimeHM / formatPeriodEyebrow / pluralDays                                   | ✓ VERIFIED | 101 LOC; all 4 functions exported. Imported by HomeMount.tsx (formatPeriodEyebrow). Tests pass (22/22).                                                                                                                                                                                           |
| `frontend/src/screensV10/Home/HomeView.tsx`                       | HomeView with eyebrow / hero / wallet / plan / category list                                  | ⚠️ ORPHANED | 245 LOC. Renders all 6 HOME-V10-* features per prototype. Imported only by HomeMount.tsx (which is itself orphaned).                                                                                                                                                                              |
| `frontend/src/screensV10/Home/HomeMount.tsx`                     | data fetcher (parallel listAccounts/listCategoriesV10/listActual + period resolver) + render HomeView | ⚠️ ORPHANED | 261 LOC. Promise.all parallel fetch correctly wired; PosterRouter.push handlers wired to placeholders. **NEVER IMPORTED IN PRODUCTION**: only references in HomeView.tsx comments, _placeholders.tsx comment, computeHomeData.ts comment, and Home/index.ts barrel. AppV10.tsx does NOT import it. |
| `frontend/src/screensV10/Transactions/TransactionsView.tsx`      | registry with filter chips, day grouping, etc.                                                 | ✗ MISSING  | Directory does not exist. Intentional scope deferral.                                                                                                                                                                                                                                            |
| `frontend/src/screensV10/AddSheet/AddSheet.tsx`                  | black sheet with keypad + description + chips + cat scroll + account picker + CTA + submit    | ✗ MISSING  | Directory does not exist. Intentional scope deferral.                                                                                                                                                                                                                                            |
| `frontend/src/screensV10/AddSheet/Keypad.tsx`                    | 3×4 numeric pad component                                                                      | ✗ MISSING  | Directory does not exist.                                                                                                                                                                                                                                                                        |
| `frontend/src/api/v10/actual.ts`                                 | listActualV10 + createActualV10 + 4-valued kind enum                                            | ✓ VERIFIED | 71 LOC. Both functions exported; runtime guard `amount_cents > 0` on create.                                                                                                                                                                                                                     |
| `frontend/src/api/v10/accounts.ts`                               | listAccounts → AccountResponse[]                                                                | ✓ VERIFIED | 25 LOC.                                                                                                                                                                                                                                                                                          |
| `frontend/src/api/v10/categories.ts`                             | listCategoriesV10 → CategoryV10[]                                                               | ✓ VERIFIED | 35 LOC. Schema-gap defensive optional fields.                                                                                                                                                                                                                                                    |
| `frontend/src/AppV10.tsx`                                        | Mount-after-onboarding switch → V10MainShell when onboarded_at != null                          | ✗ FAILED   | Line 41: directly returns `<OnboardingMount/>`. No HomeMount import, no PosterRouterProvider. The switch never lands.                                                                                                                                                                            |
| `frontend/src/screensV10/V10MainShell.tsx`                       | V10 root shell with PosterRouter root = HomeView + BottomNavV10 + FAB → AddSheet PosterSheet  | ✗ MISSING  | File does not exist on web (only the iOS variant exists).                                                                                                                                                                                                                                        |

### iOS (Plans 25-03, 25-05)

| Artifact                                                                          | Expected                                                                                         | Status     | Details                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift`                        | formatDay / formatTimeHM / formatPeriodEyebrow / pluralDays + month constants; min 60 LOC        | ✓ VERIFIED | 105 LOC. enum-with-static-funcs symmetric to web format.ts. Imported by HomeViewModel.                                                                                                                                                                               |
| `ios/BudgetPlanner/FeaturesV10/Common/BottomNavV10.swift`                        | 5-tab bottom nav using existing TabBar component                                                  | ✗ MISSING  | File does not exist. Plan 25-05 SUMMARY does not list it as created.                                                                                                                                                                                                  |
| `ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift`                              | SwiftUI HomeView (renamed HomeV10View per @Observable name collision); min 140 LOC               | ⚠️ ORPHANED | 383 LOC (HomeV10View). All 6 HOME-V10-* features rendered. **Only referenced in its own #Preview.** No external consumer (V10MainShell.swift renders only OnboardingMountView).                                                                                       |
| `ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift`                         | @Observable @MainActor model loading /me /accounts /categories /actual + computing daily pace + surplus + sorted cats | ⚠️ ORPHANED | 124 LOC (HomeV10ViewModel). Status state machine, parallel async-let fetch, period 404 fallback. Only referenced from HomeView.swift (which is itself orphaned).                                                                                                       |
| `ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift`                              | Pure compute helpers (Swift) + CategoryAggregateRow                                              | ✓ VERIFIED | 142 LOC. Imported by HomeViewModel + tested (20 cases in HomeDataTests).                                                                                                                                                                                              |
| `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift`                      | 4 placeholder views                                                                              | ✓ VERIFIED | 90 LOC. AccountsListPlaceholderView / PlanViewPlaceholderView / CategoryDetailPlaceholderView / TransactionsViewPlaceholderView. Used by HomeView.swift router calls.                                                                                                  |
| `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsView.swift`              | registry with filter chips, day grouping, swipe-left delete                                      | ✗ MISSING  | Directory does not exist.                                                                                                                                                                                                                                            |
| `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift`                      | black sheet with keypad / description / date chips / cat scroll / account picker / CTA          | ✗ MISSING  | Directory does not exist.                                                                                                                                                                                                                                            |
| `ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift`                        | 3×4 numeric pad SwiftUI component                                                                | ✗ MISSING  | Directory does not exist.                                                                                                                                                                                                                                            |
| `ios/BudgetPlanner/FeaturesV10/AddSheet/SuppressedKeyboardField.swift`           | TextField wrapper inputView=empty UIView                                                         | ✗ MISSING  | Directory does not exist.                                                                                                                                                                                                                                            |
| `ios/BudgetPlanner/Networking/Endpoints/AccountsAPI.swift`                       | AccountsAPI.list() returning [AccountDTO]                                                        | ✓ VERIFIED | 16 LOC. Used by HomeViewModel (orphaned chain — wired to HomeViewModel which is orphaned).                                                                                                                                                                            |
| `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift`                  | CategoriesV10API.list() returning [CategoryV10DTO]                                               | ✓ VERIFIED | 35 LOC.                                                                                                                                                                                                                                                              |
| `ios/BudgetPlanner/Networking/DTO/AccountDTO.swift`                              | AccountDTO Decodable                                                                             | ✓ VERIFIED | 31 LOC. balanceCents + primary + kind enum.                                                                                                                                                                                                                          |
| `ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift`                          | CategoryV10DTO with v1.0 fields                                                                  | ✓ VERIFIED | 109 LOC (per file size). Defensive Decodable init for schema-gap fields per Plan 25-03 SUMMARY.                                                                                                                                                                      |
| `ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift`                          | extend ActualDTO.kind + accountId + parentTxnId (parallel ActualV10DTO chosen)                  | ✓ VERIFIED | Per Plan 25-03 SUMMARY: parallel ActualV10DTO struct (not replace), keeps v0.6 byte-clean.                                                                                                                                                                            |
| `ios/BudgetPlanner/App/V10MainShell.swift`                                       | Route between OnboardingMountView (if not onboarded) → HomeView via PosterRouter + BottomNavV10 + AddSheet PosterSheet | ✗ FAILED   | Lines 16-19: `body { OnboardingMountView() .preferredColorScheme(.dark) }`. **No PosterRouter env injection, no HomeV10View, no FAB, no BottomNavV10**. The OnboardingMountView at line 134 falls through to a HomePlaceholderView() (Phase 24 stub). |

---

## Key Link Verification

| From                                  | To                                              | Via                                                | Status        | Details                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/api/routes/actual.py`            | `app.services.actual.create_actual_v10`         | conditional dispatch on body.account_id is not None | ✓ WIRED      | Line 158: `await actual_svc.create_actual_v10(...)` inside `if body.account_id is not None` branch.                                                                                  |
| `app/api/routes/actual.py`            | `app.services.accounts.get_or_404`              | T-25-01-01 cross-tenant pre-validation             | ✓ WIRED      | Lines 148-152: imports `get_or_404` and calls it before dispatch.                                                                                                                    |
| `frontend/src/AppV10.tsx`             | `<V10MainShell>` after `me.onboarded_at != null` | onboarded gate                                     | ✗ NOT_WIRED  | AppV10.tsx contains zero references to V10MainShell or HomeMount. The switch flips between PreviewApp and OnboardingMount only.                                                       |
| `frontend/src/screensV10/Home/HomeMount.tsx` | `listAccounts() / listCategoriesV10() / listActualV10(periodId)` | Promise.all parallel fetch in useEffect            | ✓ WIRED       | Lines 78-87: parallel fetch + sequential actuals. Cancellation guard at line 89.                                                                                                      |
| `HomeMount`                           | `usePosterRouter()` push handlers                | useCallback wrappers                                | ✓ WIRED      | Lines 109-123: 4 push handlers (wallet, plan, category, allOps). Each pushes a placeholder view.                                                                                     |
| `HomeMount` consumer                  | mounted in shell                                 | (none)                                              | ✗ NOT_WIRED  | No PosterRouterProvider wraps HomeMount in production. The hook will throw "must be used inside <PosterRouterProvider>" if HomeMount is ever rendered without provider.              |
| `frontend/src/screensV10/AddSheet/AddSheet.tsx` | `createActualV10({account_id, ...})` POST | (component does not exist)                          | ✗ NOT_WIRED  | AddSheet directory does not exist; createActualV10 has zero callers in production code.                                                                                              |
| `frontend/src/screensV10/Transactions/TransactionsView.tsx` | `listActualV10(periodId)`        | (component does not exist)                          | ✗ NOT_WIRED  | TransactionsView directory does not exist.                                                                                                                                            |
| `ios/BudgetPlanner/App/V10MainShell.swift` | `PosterRouter(root: HomeV10View())` + BottomNavV10 + AddSheet sheet binding | env injection                                  | ✗ NOT_WIRED  | V10MainShell renders only OnboardingMountView. Zero PosterRouter / HomeV10View / BottomNavV10 / FAB references in shell file.                                                         |
| iOS `SuppressedKeyboardField`          | `UITextField.inputView = UIView()` UIViewRepresentable | (file does not exist)                            | ✗ NOT_WIRED  | File does not exist; ADD-V10-02 (suppress system kb on iOS) cannot be satisfied without it.                                                                                          |
| `BottomNavV10` (web + iOS)             | tab labels: Home / Savings / FAB-center / AI / Mgmt (no Transactions tab) | mounted at shell root                       | ✗ NOT_WIRED  | Component exists on web (BottomNavV10.tsx) but is unmounted; iOS counterpart does not exist; v0.6 nav still active for any v0.6-themed surface.                                       |

---

## Data-Flow Trace (Level 4)

| Artifact                | Data Variable                                                           | Source                                  | Produces Real Data        | Status        |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------------- | ------------------------- | ------------- |
| `HomeView.tsx`          | `categoryRows`, `dailyPaceCents`, `walletCents`, `surplusCents`         | props from HomeMount                    | YES (when HomeMount mounts) | ⚠️ HOLLOW (parent unmounted) |
| `HomeMount.tsx`         | `state.data.{accounts,categories,period,actuals}`                       | listAccounts / listCategoriesV10 / getCurrentPeriod / listActualV10 | YES (real REST GETs)      | ⚠️ HOLLOW (component never mounts in prod) |
| `HomeV10View.swift`     | `model.{categoryRows, dailyPaceCents, walletCents, surplusCents}`       | HomeV10ViewModel.load() async           | YES (real REST async-let) | ⚠️ HOLLOW (view never mounts in prod) |
| `BottomNavV10.tsx`      | active tab id                                                           | (from caller)                           | N/A                       | ⚠️ HOLLOW (no caller) |

> "HOLLOW" classification is per Step 4b of the verifier process — the component would render real data IF mounted, but its mount edge is missing. The implementation is real, the wiring is not.

---

## Behavioral Spot-Checks

| Behavior                                                                              | Command                                                                                                                                              | Result                          | Status   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------- |
| Frontend test suite passes                                                            | `cd frontend && npm test -- screensV10 --run`                                                                                                      | 194/194 passed                 | ✓ PASS   |
| Frontend tsc strict clean                                                             | `cd frontend && npx tsc --noEmit`                                                                                                                  | empty output (clean)           | ✓ PASS   |
| Web v10 API barrel exports listAccounts / listCategoriesV10 / listActualV10 / createActualV10 | `grep -c "export.*list\(Accounts\|CategoriesV10\|ActualV10\)\|createActualV10" frontend/src/api/v10/index.ts`                                       | 4 (matches plan requirement)   | ✓ PASS   |
| iOS HomeView push routes ≥ 4                                                          | `grep -c 'router?.push\\|posterRouter' ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift`                                                          | 8 occurrences                  | ✓ PASS   |
| Web compute helpers filter savings/paused                                             | `grep -c 'savings\\|paused' frontend/src/screensV10/Home/computeHomeData.ts`                                                                       | 5 (filter present in 2 funcs)  | ✓ PASS   |
| iOS compute helpers filter savings/paused                                             | `grep -c 'savings\\|paused' ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift`                                                                     | 4                              | ✓ PASS   |
| Production routing path mounts HomeMount                                              | `grep -rn "HomeMount" frontend/src/AppV10.tsx frontend/src/screensV10/Onboarding/*.tsx`                                                            | 0 matches                      | ✗ FAIL   |
| Production routing path mounts HomeV10View                                            | `grep -rn "HomeV10View" ios/BudgetPlanner/App/V10MainShell.swift ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift`                  | 0 matches                      | ✗ FAIL   |
| BottomNavV10 mounted in any production shell                                          | `grep -rn "BottomNavV10" frontend/src --exclude-dir=screensV10/common`                                                                              | 0 matches                      | ✗ FAIL   |
| Backend integration tests for v10 actual extension exist and were green at completion | (per SUMMARY, run inside docker compose stack)                                                                                                       | 16/16 (per Plan 25-01 SUMMARY) | ✓ SKIPPED (no live stack to re-run from CLI) |

---

## Requirements Coverage

| Requirement   | Source Plan | Description                                                                                       | Status     | Evidence                                                                                                  |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| HOME-V10-01   | 25-04, 25-05 | Eyebrow + italic «Дневной темп» + BigFig count-up                                                | ⚠️ BLOCKED  | HomeView/HomeV10View renders this — but neither is mounted in prod. Component complete; route absent.    |
| HOME-V10-02   | 25-03, 25-04, 25-05 | Wallet link «осталось N · в кошельке X ₽ →» + push Accounts                                    | ⚠️ BLOCKED  | onWalletTap pushes AccountsListPlaceholder; UI built; route absent. listAccounts wired in mount.         |
| HOME-V10-03   | 25-04, 25-05 | Plan-bar badge «PLAN МЕСЯЦА · ± X ₽ →»                                                            | ⚠️ BLOCKED  | onPlanTap pushes PlanViewPlaceholder; UI built; route absent.                                            |
| HOME-V10-04   | 25-01, 25-03, 25-04, 25-05 | Category list with stagger + bar-fill + OVER plate                                              | ⚠️ BLOCKED  | computeCategoryAggregates + sortCategoriesForHome + HomeView render logic complete; route absent. Backend wire (4-valued kind, parent_txn_id) ready. |
| HOME-V10-05   | 25-02, 25-04, 25-05 | Tap category → Category Detail; «ВСЕ ОПЕРАЦИИ →» → Transactions                                  | ⚠️ BLOCKED  | onCategoryTap + onAllOperationsTap wired in HomeMount/HomeView. Targets are placeholders — Transactions path goes nowhere real. |
| HOME-V10-06   | 25-04, 25-05 | Background = coral (per Tweak)                                                                    | ⚠️ BLOCKED  | HomeView root has class `styles.root` with var(--poster-coral); HomeV10View uses PosterTokens.Color.coral. Component complete; route absent. |
| TXN-V10-01    | (deferred)  | SECTION II + Mass italic «Реестр.» + N ЗАПИСЕЙ · Σ ₽                                              | ✗ BLOCKED  | No TransactionsView component. **Intentional foundation-only scope per user-provided context + 25-must-haves.md.** |
| TXN-V10-02    | (deferred)  | Single-select chip-bar (Все / Кафе / Продукты / Транспорт / Подписки / Копилка)                  | ✗ BLOCKED  | No TransactionsView component.                                                                            |
| TXN-V10-03    | (deferred)  | Day grouping (Сегодня / Вчера / N мая) DM Serif italic 28px                                      | ⚠️ BLOCKED  | formatDay helper ready (web + iOS); no TransactionsView consumer.                                         |
| TXN-V10-04    | 25-01 (wire), (deferred UI) | Roundup → жёлтая плашка «↻ ОКРУГЛ.»; Deposit → плашка «→ КОПИЛКА»; mono с U+2212 | ⚠️ PARTIAL | Backend wire emits 4-valued kind + parent_txn_id (ActualRead extended); UI to render spec-tags absent. |
| TXN-V10-05    | (deferred)  | Tap → edit sheet (reuse TransactionEditor); swipe-left → delete confirm                          | ✗ BLOCKED  | No TransactionsView component. Plan 25-01 explicitly leaves PATCH endpoint legacy until Phase 26.        |
| TXN-V10-06    | 25-02 (primitive), (deferred wiring) | v0.6 Transactions tab demoted из bottom nav                                          | ⚠️ BLOCKED  | BottomNavV10 wrapper component exists but unmounted; v0.6 nav unchanged in active code paths.            |
| ADD-V10-01    | (deferred)  | FAB → AddSheet; black bg; NEW ENTRY · {date} · {time}; × close                                    | ✗ BLOCKED  | No AddSheet component; no FAB mount in shell.                                                             |
| ADD-V10-02    | (deferred)  | Custom 3×4 keypad; BigFig 86px yellow; iOS suppresses system kb                                  | ✗ BLOCKED  | No keypad component; no SuppressedKeyboardField on iOS.                                                  |
| ADD-V10-03    | (deferred)  | Description input; date chips Сегодня / Вчера / Своя дата + DatePicker                           | ✗ BLOCKED  | No AddSheet component.                                                                                    |
| ADD-V10-04    | (deferred)  | Category chip-scroll (single-select REQUIRED) + account picker row                                | ✗ BLOCKED  | No AddSheet component.                                                                                    |
| ADD-V10-05    | 25-01 (wire), (deferred UI) | CTA states: «ВВЕДИТЕ СУММУ» → «ВЫБЕРИТЕ КАТЕГОРИЮ» → «СОХРАНИТЬ ↵»; submit → POST /actual | ⚠️ PARTIAL | Backend POST /actual + account_id + create_actual_v10 dispatch in place; UI to drive submit absent. |

---

## Anti-Patterns Found

| File                                                                          | Line(s)            | Pattern                                                              | Severity      | Impact                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------|
| `frontend/src/AppV10.tsx`                                                     | 41                 | Renders `<OnboardingMount/>` directly with no fork to V10 home routing | 🛑 Blocker     | Phase goal "User лендится на HomeView" cannot be satisfied without this fork.                                                                        |
| `frontend/src/screensV10/Onboarding/OnboardingMount.tsx`                      | 6, 117             | Stub `<HomePlaceholder/>` returned for onboarded users; comment admits «Phase 25 will replace» | 🛑 Blocker     | Phase 25 was supposed to replace this stub; it did not.                                                                                              |
| `ios/BudgetPlanner/App/V10MainShell.swift`                                    | 12, 16-19          | "real Home lands in Phase 25" comment + only OnboardingMountView() in body | 🛑 Blocker     | Phase 25 was supposed to land real Home; it did not.                                                                                                 |
| `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift`           | 134, 192-206       | Falls through to HomePlaceholderView() stub on onboardedAt != nil    | 🛑 Blocker     | iOS user who completes onboarding never sees HomeV10View.                                                                                            |
| `frontend/src/screensV10/_placeholders.tsx`                                   | (entire file)       | 4 WIP placeholder screens: AccountsList, Plan, CategoryDetail, TransactionsView | ⚠️ Warning     | Documented as intentional WIP per Plan 25-04 SUMMARY (Plans 25-06/26/27 to swap them). For Phase 25 goal, TransactionsViewPlaceholder is a problem because Phase 25 owns Transactions registry. |
| `frontend/src/screensV10/common/BottomNavV10.tsx`                             | 30-35              | Component fully implemented but no production caller                | ⚠️ Warning     | TXN-V10-06 demotion + general bottom-nav presence cannot be observed.                                                                                |
| `frontend/src/screensV10/common/PosterSheet.tsx`                              | (entire file)      | Component fully implemented but no production caller                 | ⚠️ Warning     | ADD-V10-01 (FAB → AddSheet) cannot be observed.                                                                                                      |
| `frontend/src/screensV10/Home/HomeView.tsx` + `HomeMount.tsx`                 | (entire files)     | Components fully implemented but no production caller (orphaned chain) | 🛑 Blocker     | All HOME-V10-* requirements blocked behind a single missing wire.                                                                                    |
| `ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift` + `HomeViewModel.swift`   | (entire files)     | Components fully implemented but no production caller (orphaned chain) | 🛑 Blocker     | All HOME-V10-* requirements blocked behind a single missing wire (iOS).                                                                              |

> No TODO/FIXME/PLACEHOLDER markers were found in the new production code (intentional placeholder views in `_placeholders.tsx` are clearly documented and out-of-band). The orphaned-component pattern is the dominant gap, NOT incomplete implementations within those components.

---

## Human Verification Required

None — all gaps observable programmatically.

---

## Gaps Summary

The phase ships **two solid foundations** (backend wire contract + web/iOS primitives) that fully unblock downstream UI work, but the **user-observable goal is not achieved**:

1. **Home is built but unmounted** (web + iOS). Both `HomeMount` (web) and `HomeV10View` (iOS) exist with full feature coverage, full unit-test coverage (42 web + 41 iOS tests), and correct data-flow plumbing — but neither is referenced from the production routing path. The plans 25-04 and 25-05 SUMMARY explicitly defer mounting to "Plan 25-09" / "Plan 25-10" which do not exist in this phase. As a result, an onboarded user still sees the Phase 24 "ДОМ. экран — впереди." stub, not the V10 Home.

2. **Transactions registry is entirely absent** (web + iOS). No component, no view directory. TXN-V10-01..06 cannot be observed in any form. Per user-provided context this is an intentional foundation-only scope decision captured in `25-must-haves.md`.

3. **Add Sheet is entirely absent** (web + iOS). No component, no view directory, no FAB mounted. ADD-V10-01..05 cannot be observed in any form. Backend wire (POST /actual + account_id) is in place and integration-tested but has no UI consumer. Per user-provided context this is an intentional foundation-only scope decision.

4. **v0.6 Transactions tab demotion (TXN-V10-06) is unfulfilled**. BottomNavV10 wrapper exists in `frontend/src/screensV10/common/` but is not mounted at any shell level. iOS counterpart does not exist.

**What was achieved (high quality):**
- Backend POST /actual + ActualRead schema extension (Plan 25-01) — 16/16 integration tests green; cross-tenant 404 path correct; backward-compat preserved.
- Web routing primitives (PosterRouter useReducer + PosterSheet portal modal + BottomNavV10 wrapper + format helpers) — 32/32 unit tests; tsc strict clean.
- API client wrappers (Plan 25-03) — typed v10 surface for both web (`frontend/src/api/v10/*`) and iOS (`Networking/{DTO,Endpoints}/*`); schema-gap defensive defaults documented.
- HomeView pure compute helpers (web + iOS) — 24 + 20 test cases covering ratio edge cases, sort tie-break, savings/paused filter, division-by-zero clamp.
- HomeView/HomeMount/HomeV10View/HomeV10ViewModel components — feature-complete per HOME-V10-01..06 spec; orphaned only at the shell wiring level.

**Recommended follow-up work to close gaps:**
- A small "Plan 25-06: shell wiring" plan that mounts HomeMount in AppV10 (web) and HomeV10View in V10MainShell (iOS), wraps each in a PosterRouterProvider, and adds BottomNavV10 + FAB at the shell level. This would close HOME-V10-01..06 alone (no new components needed).
- A "Plan 25-07: web Transactions registry" plan and "Plan 25-08: iOS Transactions registry" plan would close TXN-V10-01..06.
- A "Plan 25-09: web AddSheet" plan and "Plan 25-10: iOS AddSheet" plan would close ADD-V10-01..05.

The accomplished work is high-quality and re-usable — gap closure is a matter of consuming the foundations, not redesigning them.

---

_Verified: 2026-05-10T15:50:00Z_
_Verifier: Claude (gsd-verifier)_
