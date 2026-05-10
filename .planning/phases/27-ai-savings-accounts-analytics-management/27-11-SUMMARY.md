---
phase: 27-ai-savings-accounts-analytics-management
plan: 11
subsystem: ios-mgmt-shell
tags: [ios, swiftui, observable, mgmt-hub, settings, access, owner-gate, shell-wire]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 7
    provides: V10MainShell + handleTabChange contract + BottomNavV10
  - phase: 26-plan-editor-category-detail-subscriptions
    plan: 5
    provides: PlanView (pushed by Mgmt hub «01 PLAN МЕСЯЦА» row)
  - phase: 27-ai-savings-accounts-analytics-management
    plan: 7
    provides: SavingsV10View + AiV10View (pushed by V10MainShell tabs)
  - phase: 27-ai-savings-accounts-analytics-management
    plan: 9
    provides: AccountsListV10View (pushed by Mgmt hub «02 СЧЕТА»)
  - phase: 27-ai-savings-accounts-analytics-management
    plan: 10
    provides: AnalyticsV10View (pushed by Mgmt hub «03 АНАЛИТИКА»)

provides:
  - "MgmtHubView (black) — pure 5/4-row numbered list (ДОСТУП hidden when isOwner=false); fail-closed default."
  - "MgmtHubViewModel — fetches /me, gates ДОСТУП row via role=='owner' check, in-flight guard for concurrent loads."
  - "SettingsV10View (paper) + SettingsV10ViewModel — poster-styled rewrite of v0.6 SettingsView (cycle Stepper 1..28 / notify Stepper 0..30 / AI categorization Toggle / AI cap read-only)."
  - "AccessV10View (black) + AccessV10ViewModel — poster-styled admin Users + AI Usage chip-tabs; 403 → friendly «Только для владельца» banner."
  - "AdminAPI + DTOs (AdminUserDTO / AdminAiUsageRowDTO / AdminAiUsageEnvelopeDTO) — typed mirrors of /api/v1/admin/users + /admin/ai-usage."
  - "MgmtExternalStubs.swift — local fallback views for sibling Phase 27 V10 screens (kept as defensive fallback, dead code after sibling waves merge)."
  - "V10MainShell.handleTabChange — savings/ai/mgmt now push real V10 views instead of legacy placeholders; MGMT-V10-04 closed."

affects:
  - "iOS V10 navigation contract is now complete — all 4 BottomNav tabs (home/savings/ai/mgmt) push real screens; PlanView reachable via Mgmt hub row 01."
  - "MgmtExternalStubs (SavingsV10ViewStub / AiV10ViewStub / AccountsListV10ViewStub / AnalyticsV10ViewStub) — dead code after this plan; can be removed in a follow-up `chore` commit once the wave merges."

# Tech tracking
tech-stack:
  added: []  # all dependencies already present (SwiftUI, Observation, PosterRouter, PosterTokens, MeV10API, APIClient)
  patterns:
    - "Owner-gate fail-closed: MgmtHubViewModel defaults isOwner=false; only flips to true when fetchMeV10() succeeds AND returns role=='owner'. Any error path leaves the «ДОСТУП» row hidden (T-27-11-01 mitigation). Defence-in-depth atop backend require_owner FastAPI dep."
    - "Optimistic settings PATCH with rollback: SettingsV10ViewModel applies the delta to local state, fires PATCH /settings, on error reverts to the previous snapshot + sets saveError. Mirrors web SettingsMount pattern from Plan 27-06."
    - "Parallel fetch with async let: SettingsV10ViewModel + AccessV10ViewModel both fire two endpoints in parallel (settings+me / users+aiUsage) using `async let` — single load-status state machine, no separate spinners per endpoint."
    - "403 → friendly forbidden state: AccessV10ViewModel catches APIError.forbidden / .unauthorized and surfaces `LoadStatus.forbidden`; AccessV10View renders «Только для владельца.» Mass + caption instead of raw error text (T-27-11-04 polish)."
    - "Local-fallback stub views (MgmtExternalStubs.swift): symmetric to web Plan 27-06 _externalMountStubs.tsx pattern. Sibling Phase 27 V10 plans landed their real views before this plan committed, so the stubs are dead code on landing — but kept as documented fallback in case of future parallel-wave coordination needs."
    - "View ║ ViewModel split (continued): all 3 new screens follow the established pattern — pure presentational *V10View consumes data via @State VM + emits events via VM method calls; *V10ViewModel owns fetches, mutations, status machine."

key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Management/MgmtHubView.swift            # ~140 LOC
    - ios/BudgetPlanner/FeaturesV10/Management/MgmtHubViewModel.swift       # ~55 LOC
    - ios/BudgetPlanner/FeaturesV10/Management/SettingsV10View.swift        # ~220 LOC
    - ios/BudgetPlanner/FeaturesV10/Management/SettingsV10ViewModel.swift   # ~150 LOC
    - ios/BudgetPlanner/FeaturesV10/Management/AccessV10View.swift          # ~260 LOC
    - ios/BudgetPlanner/FeaturesV10/Management/AccessV10ViewModel.swift     # ~80 LOC
    - ios/BudgetPlanner/FeaturesV10/Management/MgmtExternalStubs.swift      # ~115 LOC
    - ios/BudgetPlanner/Networking/Endpoints/AdminAPI.swift                 # ~60 LOC
    - ios/BudgetPlannerTests/FeaturesV10/MgmtHubTests.swift                 # 5 tests
  modified:
    - ios/BudgetPlanner/App/V10MainShell.swift                              # handleTabChange routing → SavingsV10View / AiV10View / MgmtHubView

key-decisions:
  - "AI spend cap source on iOS is /me (NOT /settings) — same decision as web Plan 27-06. SettingsRead schema does not carry ai_spend_cap_cents; only MeV10Response.aiSpendingCapCents does. SettingsV10ViewModel fetches both endpoints in parallel; SettingsV10View renders the cap read-only via `formatCap(spend:cap:)` from the VM's me-sourced state."
  - "MgmtHubViewModel uses MeV10API.shared singleton for owner-check — same pattern as OnboardingMountModel. Tests inject FakeMeAPIClient via `MeV10API.shared = …` (with setUp/tearDown restore). The plan suggested an init-injected protocol param; that would diverge from the rest of the V10 codebase, so we used the established singleton-swap pattern verbatim."
  - "AccessV10ViewModel does NOT re-fetch on tab switch — both /admin/users and /admin/ai-usage load once on first appear (`load()` is in-flight-guarded; subsequent calls are no-ops). Tab toggle is pure UI state. Symmetric to web 27-06 AccessMount."
  - "Stepper bounds enforced both client-side (SettingsV10ViewModel.cycleMin/cycleMax/notifyMin/notifyMax static constants; Stepper `in:` range) AND server-side (Pydantic Field validators on the backend SettingsUpdateRequest). The VM additionally clamps in `changeCycleStartDay` / `changeNotifyDaysBefore` as a defence-in-depth measure (T-27-11-02 mitigation)."
  - "MgmtExternalStubs.swift kept on landing (not deleted) — the file is dead code after this commit (MgmtHubView and V10MainShell both swapped to real sibling views), but documents the parallel-wave coordination pattern and provides a recovery fallback if a sibling V10 view ever needs to be temporarily yanked. Deletion in a follow-up `chore` commit is fine; not blocking acceptance."

patterns-established:
  - "Owner-gate hidden-row pattern (iOS): filter the row list by `isOwner` flag in the View (`rows.filter { !$0.ownerOnly || model.isOwner }`); do NOT just disable the row. Hiding makes the screen visually clean for non-owners — symmetric to web Plan 27-06 React pattern."
  - "Optimistic + rollback for single-field PATCH (iOS): VM keeps a `lastSnapshot*` field per mutable property; on PATCH error reverts UI state to the snapshot + sets saveError. Avoids the «save button + dirty flag» UX overhead for read-mostly settings screens."

requirements-completed:
  - MGMT-V10-01    # Mgmt hub 5/4-row numbered list with owner gate
  - MGMT-V10-02    # SettingsV10View poster rewrite (cycle/notify steppers + AI toggle + cap read-only)
  - MGMT-V10-03    # AccessV10View poster rewrite (Users + AI Usage chip-tabs)
  - MGMT-V10-04    # V10MainShell tab routing wires real MgmtHubView + sibling V10 views

# Metrics
duration: ~10m
completed: 2026-05-10
---

# Phase 27 Plan 11: iOS Mgmt Hub + Settings Rewrite + Access Page + V10MainShell Wire Summary

**Wired the iOS V10 management cluster (MgmtHubView, SettingsV10View, AccessV10View) in poster style and rewrote V10MainShell.handleTabChange so all 4 BottomNav tabs (home/savings/ai/mgmt) push real V10 screens instead of legacy placeholders. ДОСТУП row owner-gated with fail-closed default; settings PATCH optimistic with rollback; access tab catches 403 and renders friendly «Только для владельца» banner.**

## Performance

- **Duration:** ~10 min wall-clock
- **Started:** 2026-05-10T19:43:04Z
- **Completed:** 2026-05-10T19:54:00Z
- **Tasks:** 3 of 3 (3 commits, TDD RED+GREEN combined per plan note)
- **Files created:** 9 (7 in FeaturesV10/Management + AdminAPI + MgmtHubTests)
- **Files modified:** 1 (V10MainShell.swift handleTabChange)
- **LOC added:** ~1080 in Management folder + ~80 LOC AdminAPI + ~120 LOC tests + ~10 LOC V10MainShell diff

## Task Commits

1. **fc796ad** — `test(27-11): RED MgmtHubViewModel owner-gate tests` — TDD RED gate (5 tests, build-for-testing fails as expected because MgmtHubViewModel does not exist yet)
2. **6d4b163** — `feat(27-11): MgmtHubView + Settings/AccessV10 + AdminAPI (GREEN)` — combined GREEN commit because MgmtHubView's `onTap` routes into SettingsV10View / AccessV10View (interlocking imports, same pattern as web Plan 27-06)
3. **e8bb547** — `feat(27-11): V10MainShell wires real Savings/Ai/MgmtHub views` — V10MainShell handleTabChange swap + MgmtHubView zero-touch swap from stubs to real sibling views

All commits used `--no-verify` per parallel-executor protocol.

## Accomplishments

### MgmtHubView + MgmtHubViewModel + 5 unit tests (Task 1, TDD)

- **MgmtHubView.swift (~140 LOC)** — black background, paper text. Renders Eyebrow «MANAGEMENT / УПРАВЛЕНИЕ» + Mass italic «Управление.» (size 70) + numbered list of 5 (or 4 if !isOwner) rows. Each row: `[mono nn] [archivo black NAME] [arrow →]`. View reads `@Environment(\.posterRouter)` for navigation; back button rendered when canPop.
- **MgmtHubViewModel.swift (~55 LOC)** — `@Observable` final class. Fetches `MeV10API.shared.fetchMeV10()` on `load()`, sets `isOwner` from `me.role == "owner"` (fail-closed default false on any error). In-flight guard so two concurrent `.task` triggers coalesce to one fetch.
- **MgmtHubTests.swift (5 tests, all pass)**:
  1. `testInitialIsOwnerIsFalse` — default fail-closed
  2. `testLoadFlipsIsOwnerWhenRoleIsOwner` — role=='owner' → isOwner=true
  3. `testLoadKeepsIsOwnerFalseWhenRoleIsMember` — role!='owner' → stays false
  4. `testLoadSilentOnErrorKeepsIsOwnerFalse` — fetch failure → stays false
  5. `testConcurrentLoadsCoalesce` — two concurrent `load()` calls → one fetch

### SettingsV10View + SettingsV10ViewModel (Task 2)

- **SettingsV10View.swift (~220 LOC)** — paper background, ink text. Eyebrow «SETTINGS / НАСТРОЙКИ» + Mass italic «Настройки.» (size 56) + 4 rows:
  1. ДЕНЬ НАЧАЛА ЦИКЛА — Stepper 1..28
  2. НАПОМИНАТЬ ЗА ДНЕЙ ДО ПОДПИСКИ — Stepper 0..30
  3. AI АВТО-КАТЕГОРИЗАЦИЯ — Toggle (text «ВКЛ»/«ВЫКЛ»)
  4. AI ЛИМИТ РАСХОДОВ — read-only «$N.NN / $M.MM» mono
  States: loading (spinner + «ЗАГРУЗКА»), error (Mass + «ПОВТОРИТЬ →»), ready (form). saveError displayed below form if PATCH rollback occurred.
- **SettingsV10ViewModel.swift (~150 LOC)** — parallel fetch of `SettingsAPI.get()` + `MeV10API.shared.fetchMeV10()` on `load()`. Three mutation methods (`changeCycleStartDay`, `changeNotifyDaysBefore`, `toggleEnableAiCategorization`) — each clamps to client bounds, applies optimistic update, fires PATCH, rolls back UI + sets saveError on failure.

### AccessV10View + AccessV10ViewModel + AdminAPI (Task 2)

- **AccessV10View.swift (~260 LOC)** — black background, paper text. Header + Mass italic «Доступ.» (size 56) + 2 chip-tabs (Chip component from FeaturesV10/Common). Users tab: list of `AdminUserDTO` with ID + role badge + cap. AI Usage tab: list of `AdminAiUsageRowDTO` with ID + role badge + cost + pct-of-cap (color: red ≥1.0, yellow ≥0.8, dimmed otherwise). Empty hint when list empty («Нет пользователей.» / «Нет данных по AI.»). Forbidden state renders «Только для владельца.» Mass + caption.
- **AccessV10ViewModel.swift (~80 LOC)** — parallel fetch of `AdminAPI.users()` + `AdminAPI.aiUsage()` on `load()`. Catches `APIError.forbidden` / `.unauthorized` → sets `LoadStatus.forbidden`; other errors → generic «Не удалось загрузить доступ». Tab state local; switching tabs does not re-fetch.
- **AdminAPI.swift (~60 LOC)** — typed enum + DTOs (`AdminUserDTO`, `AdminAiUsageRowDTO`, `AdminAiUsageEnvelopeDTO`). DTO shapes verified against `app/api/schemas/admin.py` (`AdminUserResponse`, `AdminAiUsageRow`, `AdminAiUsageResponse` envelope). APIClient `.convertFromSnakeCase` handles tg_user_id / spending_cap_cents / etc. automatically — no explicit CodingKeys.

### V10MainShell wiring (Task 3)

- **V10MainShell.swift handleTabChange** — rewrote per CONTEXT spec:
  ```swift
  case .home:    router.popToRoot()
  case .savings: router.push(SavingsV10View())   // Plan 27-07
  case .ai:      router.push(AiV10View())        // Plan 27-07/10
  case .mgmt:    router.push(MgmtHubView())      // This plan
  ```
- Doc comment block above handleTabChange updated to reflect the new contract (« real Mgmt hub via Plan 27-11 »).
- HomePlaceholders.swift left untouched (still referenced by HomeV10View's «ВСЕ ОПЕРАЦИИ →» push for TransactionsViewPlaceholderView which is a zero-touch swap to the real `TransactionsV10View` per Plan 25-09).
- **MgmtHubView.onTap** zero-touch swap from MgmtExternalStubs to real sibling V10 views:
  - `accounts` → `AccountsListV10View()` (Plan 27-09)
  - `analytics` → `AnalyticsV10View()` (Plan 27-10)
  - `settings` → `SettingsV10View()` (this plan)
  - `access` → `AccessV10View()` (this plan)
  - `plan` → `PlanView()` (Plan 26-05)

## Verification

- **`cd ios && xcodegen generate`**: clean (no warnings).
- **`make build` (xcodebuild build for iPhone 17 Pro)**: BUILD SUCCEEDED.
- **`xcodebuild build-for-testing`**: TEST BUILD SUCCEEDED.
- **`xcodebuild test-without-building -only-testing:BudgetPlannerTests/MgmtHubTests`**: 5/5 pass (0.034s + 4×0.001s = ~37ms total).
- **`xcodebuild test-without-building -only-testing:BudgetPlannerTests/V10MainShellTests`**: 4/4 pass (no regressions).
- **Verification grep gates** all met:
  - `grep -c "PLAN МЕСЯЦА\|СЧЕТА\|АНАЛИТИКА\|НАСТРОЙКИ\|ДОСТУП" MgmtHubView.swift` → **10** (≥5 required).
  - `grep -c "SavingsV10View\|AiV10View\|MgmtHubView" V10MainShell.swift` → **6** (≥3 required).
  - `grep -c "AccountsListPlaceholderView\|PlanViewPlaceholderView" V10MainShell.swift` → **0** (== 0 required, replaced).
  - `grep -c "Настройки\|День начала цикла\|AI авто-категоризация" SettingsV10View.swift` → **4** (≥3 required).
  - `grep -c "Доступ\|Пользователи\|AI Usage" AccessV10View.swift` → **6** (≥3 required).

## Architecture (final)

```
V10MainShell.handleTabChange
  ├── home    → router.popToRoot()           (root: OnboardingMountView → HomeV10View)
  ├── savings → router.push(SavingsV10View)
  ├── ai      → router.push(AiV10View)
  └── mgmt    → router.push(MgmtHubView)
                  ↓ fetch /me, isOwner = (role == "owner")
                  ↓ MgmtHubView renders 5/4 rows
                  └── onTap(rowId):
                        ├── plan      → router.push(PlanView)             // Plan 26-05
                        ├── accounts  → router.push(AccountsListV10View)  // Plan 27-09
                        ├── analytics → router.push(AnalyticsV10View)     // Plan 27-10
                        ├── settings  → router.push(SettingsV10View)
                        │                    ├── fetch /settings + /me
                        │                    └── optimistic PATCH /settings
                        └── access    → router.push(AccessV10View)        // owner-only via ДОСТУП row
                                             ├── fetch /admin/users + /admin/ai-usage
                                             ├── tab state local
                                             └── 403 → «Только для владельца» banner
```

## Decisions Made

(See `key-decisions` in frontmatter.)

Highlights:
- **AI cap source is /me, not /settings.** Same decision as web Plan 27-06 — `SettingsDTO` does not carry `aiSpendCapCents`; only `MeV10Response.aiSpendingCapCents` does. SettingsV10ViewModel fetches both endpoints in parallel and renders the cap as a separate read-only row.
- **MeV10API.shared singleton-swap pattern** for owner-check in tests — mirrors OnboardingMountModel testing pattern. The plan suggested init-injected protocol param; we used the established singleton-swap to stay consistent with the rest of the V10 codebase.
- **MgmtExternalStubs retained** (not deleted) as documented fallback. Stubs are dead code after this plan's commits (zero-touch swap to real sibling views), but the file documents the parallel-wave coordination pattern and provides a recovery fallback. A follow-up `chore(27-11)` commit can delete it; not blocking acceptance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] Sibling V10 views did not exist at compile-time start**
- **Found during:** Task 1 (writing MgmtHubView.onTap).
- **Issue:** When this executor started (`git status` showed sibling agents staged `*Data.swift` files only — no `*V10View.swift` from siblings). Plan instructed `router.push(AccountsListV10View())` etc., but those types did not yet exist.
- **Fix:** Created `MgmtExternalStubs.swift` with `SavingsV10ViewStub` / `AiV10ViewStub` / `AccountsListV10ViewStub` / `AnalyticsV10ViewStub` — minimal poster-style WIP placeholders. Symmetric to web Plan 27-06 `_externalMountStubs.tsx` pattern. By the time this executor reached Task 3, sibling plans (27-07/09/10) had committed their real V10 views — Task 3 commit performs a zero-touch swap from stubs to real views in both `MgmtHubView.onTap` and `V10MainShell.handleTabChange`.
- **Files modified:** Created `Management/MgmtExternalStubs.swift` (~115 LOC). `MgmtHubView` and `V10MainShell` initially referenced stubs, then swapped to real types in Task 3 commit.
- **Commits:** 6d4b163 (stubs created) + e8bb547 (zero-touch swap).

**2. [Rule 3 — Blocker] AdminAPI shape — /admin/ai-usage returns envelope, not raw array**
- **Found during:** Task 2 (writing AdminAPI.swift).
- **Issue:** Plan suggested `AdminAiUsageDTO` as a flat row type returnable from `aiUsage() -> [AdminAiUsageDTO]`. Inspection of `app/api/schemas/admin.py` showed `AdminAiUsageResponse` is an envelope (`{users: [...], generated_at: datetime}`), not a raw array.
- **Fix:** Modeled `AdminAiUsageRowDTO` (per-user row) + `AdminAiUsageEnvelopeDTO` (envelope wrapper). `AdminAPI.aiUsage()` returns the envelope; `AccessV10ViewModel.load()` accesses `.users` from the envelope. Also added `pctOfCap` / `estCostCentsCurrentMonth` fields that the plan's flat shape omitted but the real schema provides.
- **Files modified:** `Networking/Endpoints/AdminAPI.swift` (envelope-shaped DTOs).
- **Commit:** 6d4b163.

**3. [Rule 1 — Bug] APIError pattern-match — used wrong case for 403**
- **Found during:** Task 2 (writing AccessV10ViewModel).
- **Issue:** Initially wrote `if case .http(let code, _) = api, code == 403` — but `APIError` does not have a `.http` case. The real shape is `.forbidden(String)` / `.unauthorized` / `.notFound` / `.serverError(Int, String)`.
- **Fix:** Switched to `switch api { case .forbidden, .unauthorized: status = .forbidden; default: ... }`. Both 401 and 403 map to the friendly «Только для владельца» banner.
- **Files modified:** `Management/AccessV10ViewModel.swift`.
- **Commit:** 6d4b163.

**4. [Rule 1 — Bug] aiUsageRow display string had broken Int(String) coercion**
- **Found during:** Task 2 (initial draft of AccessV10View.aiUsageRow).
- **Issue:** First draft had `Int(formatCents(row.spendingCapCents).prefix(while: { $0 != "." }) ?? "0") ?? 0` — a malformed expression that the compiler would reject (prefix returns Substring, Int initializer needs String, the optional gymnastics were wrong).
- **Fix:** Replaced with clean string interpolation: `"\(Int(row.pctOfCap * 100))% / $\(formatCents(row.spendingCapCents))"`. Same display intent (percent + cap dollar amount).
- **Files modified:** `Management/AccessV10View.swift`.
- **Commit:** 6d4b163.

**Total deviations:** 4 (all auto-fixed; none architectural). No Rule 4 escalations needed.

### Out-of-scope discoveries

None — every issue found during this plan was caused by the new code this plan adds.

## Authentication Gates

None. `MeV10API.shared` and `APIClient.shared` already handle the V10 auth flow; this plan does no additional networking setup.

## Issues Encountered

- **First `xcodebuild test-without-building` invocation surfaced an «Exit code 65 / early exit before bootstrapping» warning** for MgmtHubTests. Investigation: this was a flake in test-runner connection bootstrap; an identical re-run reported `** TEST EXECUTE SUCCEEDED **` with all 5 tests passing. Documented for future test reliability but not a regression of this plan's code (other test classes — HomeDataTests, V10MainShellTests — also occasionally surface the same flake; pre-existing behavior).
- **Pre-existing warnings in unrelated files** (e.g., HomeV10View.swift Preview unused let). Out-of-scope per deviation rule boundary; left untouched.

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-27-11-01 (non-owner sees ДОСТУП):** mitigated. MgmtHubViewModel.isOwner defaults to false; only flips true on `/me` success with role=='owner'. AccessV10ViewModel additionally traps APIError.forbidden / .unauthorized and shows «Только для владельца» banner. Backend admin routes already require owner role (defence-in-depth).
- **T-27-11-02 (settings PATCH out of range):** mitigated. SwiftUI Stepper enforces bounds (cycle 1..28, notify 0..30); SettingsV10ViewModel additionally clamps via `max(min, min(max, …))` before firing PATCH; backend Pydantic Field validators reject out-of-range PATCH bodies as the authoritative gate.
- **T-27-11-03 (accidental settings change):** accepted per threat model. Inline optimistic change with rollback on error; user sees value live.
- **T-27-11-04 (admin cross-tenant data):** accepted per threat model. Backend require_owner gate + RLS already in place; iOS surface only renders what the server returns.

## Known Stubs

- **`MgmtExternalStubs.swift` SavingsV10ViewStub / AiV10ViewStub / AccountsListV10ViewStub / AnalyticsV10ViewStub** — dead code after this plan's final commit (zero-touch swap to real sibling views). Kept in-repo as documented fallback for the parallel-wave coordination pattern; can be removed in a follow-up `chore(27-11)` commit. They do NOT block MGMT-V10-01..04 acceptance — `MgmtHubView` and `V10MainShell` reference the real sibling V10 views directly.

## Threat surface scan

No new security surface introduced. All admin/settings routes are pre-existing v0.6 endpoints; this plan only re-styles their UI consumers (with the addition of the friendly 403 banner). ДОСТУП visibility gate is purely a UX hint — the backend `require_owner` FastAPI dep is the actual security boundary.

## Next Phase Readiness

- **Phase 28 polish:** consider deleting `MgmtExternalStubs.swift` (dead code after wave merge) in a small `chore` commit.
- **Phase 28 polish:** SettingsV10View could add a one-shot «✓ СОХРАНЕНО» toast after successful PATCH (currently silent on success); web Plan 27-06 likewise deferred this.
- **Future iOS milestone:** AccessV10View could add a row-tap action to edit a user's AI cap via PATCH /admin/users/{id}/cap (CapEditSheet symmetry from v0.6 Plan 15-06). Deferred per CONTEXT — out of scope for MGMT-V10-03.
- **iOS symmetry with web:** Plan 27-06 web counterpart is complete; iOS now matches the same surface area + behavior.

## Self-Check: PASSED

**Files exist:**
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/MgmtHubView.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/MgmtHubViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/SettingsV10View.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/SettingsV10ViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/AccessV10View.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/AccessV10ViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Management/MgmtExternalStubs.swift`
- FOUND: `ios/BudgetPlanner/Networking/Endpoints/AdminAPI.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/MgmtHubTests.swift`
- FOUND: `ios/BudgetPlanner/App/V10MainShell.swift` (modified — handleTabChange routing)

**Commits exist:**
- FOUND: `fc796ad` (test: RED MgmtHubViewModel owner-gate tests)
- FOUND: `6d4b163` (feat: MgmtHubView + Settings/AccessV10 + AdminAPI GREEN)
- FOUND: `e8bb547` (feat: V10MainShell wires real Savings/Ai/MgmtHub views)

**Verification gates:**

| Gate | Required | Actual |
|------|----------|--------|
| `make build` succeeds | yes | yes (BUILD SUCCEEDED) |
| `xcodebuild build-for-testing` succeeds | yes | yes (TEST BUILD SUCCEEDED) |
| `MgmtHubTests` passes | 4+ tests | 5/5 pass (37ms total) |
| `V10MainShellTests` no regressions | yes | 4/4 pass |
| `grep "PLAN МЕСЯЦА\|СЧЕТА\|АНАЛИТИКА\|НАСТРОЙКИ\|ДОСТУП" MgmtHubView` | ≥ 5 | 10 |
| `grep "SavingsV10View\|AiV10View\|MgmtHubView" V10MainShell` | ≥ 3 | 6 |
| `grep "AccountsListPlaceholderView\|PlanViewPlaceholderView" V10MainShell` | == 0 | 0 |
| `grep "Настройки\|День начала цикла\|AI авто-категоризация" SettingsV10View` | ≥ 3 | 4 |
| `grep "Доступ\|Пользователи\|AI Usage" AccessV10View` | ≥ 3 | 6 |

**No accidental file deletions** in any of this plan's 3 commits:
- `git diff fc796ad^..HEAD --diff-filter=D --name-only`: empty.

---
*Phase: 27-ai-savings-accounts-analytics-management*
*Plan: 11*
*Completed: 2026-05-10*
