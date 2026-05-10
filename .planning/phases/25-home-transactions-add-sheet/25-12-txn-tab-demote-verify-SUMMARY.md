---
phase: 25-home-transactions-add-sheet
plan: 12
subsystem: testing
tags: [vitest, xctest, playwright, txn-v10-06, gap-closure, regression-guard]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 6
    provides: V10MainShell + BottomNavV10 (web — 4-tab + FAB)
  - phase: 25-home-transactions-add-sheet
    plan: 7
    provides: V10MainShell + BottomNavV10 (iOS — 4-tab + FAB)
  - phase: 25-home-transactions-add-sheet
    plan: 8
    provides: HomeMount imports real TransactionsMount (Plan 25-08 swap)
  - phase: 25-home-transactions-add-sheet
    plan: 9
    provides: iOS TransactionsV10View pushed from HomeV10View
  - phase: 25-home-transactions-add-sheet
    plan: 10
    provides: real AddSheet with NEW ENTRY eyebrow (web)
  - phase: 25-home-transactions-add-sheet
    plan: 11
    provides: real AddSheetView (iOS)

provides:
  - "TxV10TabDemote.test.tsx — 6 vitest assertions locking TXN-V10-06 acceptance on web (BottomNavV10 4-tab + FAB; isHidden contract; V10 TabId enum 4 cases; v0.6 BottomNav still has Транзакции; static-grep guards for v0.6 source + HomeMount swap)"
  - "TxV10TabDemoteTests.swift — 3 XCTests mirroring the same enum-level acceptance on iOS (V10 TabId.allCases; v0.6 AppTab.allCases includes .transactions; AppTab.transactions.label == «Транзакции»)"
  - "v10-phase25-acceptance.spec.ts — 1 Playwright chromium-mobile spec wiring the full Phase 25 happy path: open V10MainShell → Home → assert no Транзакции tab → push TransactionsView → 6 filter chips → pop back → FAB → AddSheet (NEW ENTRY)"

affects:
  - 26-plan-editor (regression guard catches accidental V10 BottomNav re-introduction of Транзакции tab)
  - 27-mgmt-savings-ai (when Savings/AI/Mgmt tabs swap from placeholders to real screens, the demote suite remains the contract floor)
  - 28-polish (Phase 28 polish suite picks up the deferred AddSheet submit-flow coverage — see Deferred section below)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-grep guards for source-file-level invariants — when render-test wiring is brittle (e.g. v0.6 BottomNav prop-shape stability) or when a prop swap is the only artefact of the change (HomeMount placeholder→real swap), an `fs.readFileSync` + regex in the same vitest file gives an O(1) regression alarm without any DOM mounting cost. Symmetric to the iOS XCTest enum-level approach (no SwiftUI host needed)."
    - "Cross-version regression guards — both platforms now assert in the SAME test file that v1.0 has demoted Транзакции AND v0.6 still includes it. Future demotion of v0.6 (Phase 30+ or v1.0 cutover) will be a deliberate test edit, not an accidental side-effect of a refactor."
    - "Minimum-viable Playwright acceptance — when full submit-flow coverage requires DOM additions (data-testid surface on the custom 3×4 keypad), the spec asserts the boundary that's already stable (FAB → AddSheet open → BottomNav hidden) and explicitly defers the deeper flow with a code comment + SUMMARY entry. Avoids brittle selector heuristics in CI."

key-files:
  created:
    - frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx
    - ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift
    - frontend/tests/e2e/v10-phase25-acceptance.spec.ts
  modified: []

key-decisions:
  - "Used static-grep (fs.readFileSync + regex) for the v0.6 BottomNav source guard AND the HomeMount swap guard — render-mounting v0.6 BottomNav exposes the test to v0.6 prop-shape drift (which is out of scope for Phase 25), and the HomeMount swap is fundamentally a single-line import statement that fs-grep catches more cheaply than a render assertion. Belt-and-braces: kept the v0.6 render assertion (`getByRole('button', { name: 'Транзакции' })`) AS WELL — if anyone accidentally breaks the v0.6 tab without removing the source token, the render guard fires too."
  - "iOS XCTests are pure enum-level (no SwiftUI host) — symmetric to the Plan 25-07 V10MainShellTests pattern. Saves the 19s xcodebuild build cycle from being multiplied by SwiftUI render assertions; the enum acceptance IS the source-of-truth for TXN-V10-06 because both platforms route Транзакции/Реестр UI through the corresponding TabId / AppTab cases."
  - "Playwright spec deliberately omits the AddSheet submit flow — the custom 3×4 keypad lacks a stable data-testid surface, and adding selectors solely for e2e would be a Plan 25-12 scope creep. Documented as deferred to Phase 28 polish (when the keypad gets its production-quality testid sweep). The shipped spec still locks the load-bearing assertion: FAB → AddSheet opens → BottomNav unmounts."
  - "Used the 'all 5 chips visible' assertion as the TXN-V10-02 acceptance proxy in the Playwright spec — chip-bar is a `div` with `role=tablist`, but each chip is rendered by the `Chip` component without role=tab; we assert by exact text match on each label which gives the same regression coverage at lower selector cost."
  - "FAB locator uses `getByRole('button', { name: /Добавить транзакцию/ })` — same selector the V10MainShell vitest suite uses, ensuring symmetry between unit-level and e2e-level FAB queries."

patterns-established:
  - "Cross-platform / cross-version demote suite: ONE test file per platform (web vitest + iOS XCTest), each asserting BOTH that v1.0 has demoted the legacy element AND that v0.6 hasn't. Reusable for any future demotion (Analytics tab? Subs tab?) — copy the file, swap the enum / aria-label patterns."
  - "fs.readFileSync static-grep inside a vitest file — for invariants that are 'X must reference Y' or 'X must NOT reference Z'. Avoids the cost of mounting the component when the only artefact is a single import / single string literal. Path resolution: `path.resolve(__dirname, '../relative-path')`."

requirements-completed:
  - TXN-V10-06    # acceptance now locked on BOTH platforms by automated CI tests

# Metrics
duration: ~5m
completed: 2026-05-10
---

# Phase 25 Plan 12: Transactions Tab Demote Verify Summary

**Locked TXN-V10-06 acceptance on both web (vitest) and iOS (XCTest) plus a single end-to-end Playwright spec covering the Phase 25 happy path (Home → Transactions push → AddSheet open) — any future regression that re-adds a «Транзакции» tab to the V10 BottomNav, or accidentally demotes the legacy v0.6 nav, breaks CI immediately.**

## Performance

- **Duration:** ~5 min wall-clock (272s start→last commit)
- **Started:** 2026-05-10T16:45:48Z
- **Completed:** 2026-05-10T16:50:20Z
- **Tasks:** 3 of 3 (all `type=auto`; Task 1 marked `tdd=true` in plan but the underlying production code was already in place — the test landed GREEN-from-the-start as a lock-in suite, no separate RED commit needed since there was nothing to fail against the existing 4-tab BottomNav implementation)
- **Files created:** 3 (1 vitest + 1 XCTest + 1 Playwright)
- **Files modified:** 0

## Accomplishments

- **`frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx` — 6 vitest assertions, all green:**
  1. BottomNavV10 with `active=home` renders exactly 4 `[role=tab]` buttons (ГЛАВНАЯ / КОПИЛКА / AI / УПР.) + 1 FAB; no «Транзакции» / «Реестр» / «Transactions» label appears anywhere.
  2. BottomNavV10 with `isHidden=true` renders no DOM at all (T-N-02 / ADD-V10-01 contract).
  3. V10 TabId enum has exactly 4 keys (`['ai', 'home', 'mgmt', 'savings']`); `'transactions'` not present.
  4. v0.6 BottomNav still renders the «Транзакции» tab via `getByRole('button', { name: 'Транзакции' })` — regression guard against accidental v0.6 demotion.
  5. v0.6 BottomNav source file (`frontend/src/components/BottomNav.tsx`) still references both `Транзакции` and `transactions` literals — static-grep belt-and-braces guard.
  6. HomeMount source file (`frontend/src/screensV10/Home/HomeMount.tsx`) imports `TransactionsMount` and does NOT import `TransactionsViewPlaceholder` — Plan 25-08 swap regression guard.
- **`ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift` — 3 XCTests, all green (in 0.003s):**
  1. `TabId.allCases.count == 4` and the raw-value set is exactly `{home, savings, ai, mgmt}`; `'transactions'` not present.
  2. v0.6 `AppTab.allCases.contains("transactions") == true`; full case set is `{home, transactions, ai, management}`.
  3. `AppTab.transactions.label == «Транзакции»` and `.icon == "list.bullet"` — catches accidental rename of the case that would silently demote it from the user's perspective.
- **`frontend/tests/e2e/v10-phase25-acceptance.spec.ts` — 1 Playwright chromium-mobile (Pixel 5) test, passes in 2.5s:**
  - Mocks `/me`, `/accounts`, `/categories`, `/periods/current`, `/periods/5/actual` via `page.route` (no live backend).
  - Asserts Home renders («Дневной темп —», «в кошельке», «Кафе» row).
  - Asserts no «Транзакции» / «Реестр» tab in `[role="tablist"]` (TXN-V10-06 from the user's view).
  - Asserts ГЛАВНАЯ + КОПИЛКА tabs are visible.
  - Pushes TransactionsView via «ВСЕ ОПЕРАЦИИ →» → asserts «SECTION II» eyebrow + «Реестр.» mass + 6 filter chips (Все / Кафе / Продукты / Транспорт / Подписки / Копилка).
  - Pops back via «← НАЗАД» → asserts Home re-renders.
  - Opens AddSheet via FAB → asserts «NEW ENTRY» eyebrow + BottomNav unmounts (`tablist` count == 0).

## Test coverage matrix

| Acceptance assertion                                            | Web                                | iOS                                | Playwright e2e                          |
| --------------------------------------------------------------- | ---------------------------------- | ---------------------------------- | --------------------------------------- |
| V10 nav has 4 tabs + FAB, no Транзакции (TXN-V10-06)            | TxV10TabDemote.test #1, #3         | TxV10TabDemoteTests #1             | v10-phase25-acceptance — tablist scan   |
| BottomNav unmounts while AddSheet open (ADD-V10-01)             | TxV10TabDemote.test #2             | (V10MainShellTests Plan 25-07)     | v10-phase25-acceptance — final assert   |
| v0.6 nav untouched — Транзакции tab still present (regression)  | TxV10TabDemote.test #4, #5         | TxV10TabDemoteTests #2, #3         | (n/a — v0.6 not exercised in v10 e2e)   |
| HomeMount uses real TransactionsMount, not placeholder (25-08)  | TxV10TabDemote.test #6             | (HomeV10View → TransactionsV10View binding asserted in Plan 25-09 tests) | v10-phase25-acceptance — push to Реестр |
| Phase 25 happy path: Home → Tx → AddSheet open                  | (V10MainShell.test Plan 25-06)     | (V10MainShellTests Plan 25-07)     | v10-phase25-acceptance (this plan)      |
| 6 filter chips on TransactionsView (TXN-V10-02)                 | (TransactionsView.test Plan 25-08) | (TransactionsViewTests Plan 25-09) | v10-phase25-acceptance — chip loop      |

## Static-grep guards used

Where render-test wiring would be brittle, two guards used in TxV10TabDemote.test.tsx:

1. **v0.6 BottomNav source guard** — reads `frontend/src/components/BottomNav.tsx` via `fs.readFileSync`, asserts both `/Транзакции/` and `/transactions/` regex match. Catches the case where someone removes the case from the enum but keeps the render guard pass via prop drift.
2. **HomeMount swap guard** — reads `frontend/src/screensV10/Home/HomeMount.tsx` via `fs.readFileSync`, asserts `/TransactionsMount/` matches AND `/TransactionsViewPlaceholder/` does NOT match. Cheaper than mounting the entire HomeMount through @testing-library (which would require the full v10 API mock setup).

Both guards use `path.resolve(__dirname, '../relative-path')` for portable path resolution.

## Playwright spec scope

**Covered:**

- Skip onboarding via `me.onboarded_at != null` mock → Home renders directly.
- Home: «Дневной темп —» visible, «в кошельке» visible, «Кафе» category row visible.
- BottomNav: tablist scoped scan asserts no «Транзакции» / «Реестр» tab; ГЛАВНАЯ + КОПИЛКА present.
- Push: tap «ВСЕ ОПЕРАЦИИ →» → TransactionsView appears (cobalt SECTION II + Реестр. + 6 chips).
- Pop: tap «← НАЗАД» → Home re-renders.
- AddSheet: tap FAB → NEW ENTRY eyebrow visible + BottomNav unmounts.

**Deferred (documented in spec header):**

- Full AddSheet submit flow: tap '5' on keypad → tap «Кафе» chip → tap СОХРАНИТЬ → assert sheet closes + POST /actual fired. Blocked by lack of stable data-testid surface on the custom 3×4 keypad (single-glyph button labels would force brittle text-match selectors). Phase 28 polish suite will add the testid surface and pick up the extended flow.
- v0.6 demote-back regression (i.e. user toggles `?theme=v06` → sees Транзакции tab) — covered indirectly by the vitest static-grep + render guard. A live v06 e2e is out of scope for Phase 25 and would require AppV0 routing infrastructure.
- Multi-period actuals + roundup display — exercised by TransactionsView component tests, not the e2e happy path.

## Phase 25 final acceptance state

| REQ ID         | Provably green via                                                  | Manual / deferred                          |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| HOME-V10-01    | V10MainShell.test (web), V10MainShellTests (iOS), v10-phase25 e2e   | —                                          |
| HOME-V10-02    | HomeView.test (web), HomeViewTests (iOS)                            | —                                          |
| HOME-V10-03    | HomeView.test (count-up final value), v10-phase25 e2e               | Count-up easing curve fidelity (Phase 28)  |
| HOME-V10-04    | HomeView.test, v10-phase25 e2e (wallet visible)                     | —                                          |
| HOME-V10-05    | TabBar tests, V10MainShell.test, v10-phase25 e2e                    | —                                          |
| HOME-V10-06    | HomeView.test (coral background)                                    | Background color toggle alt: cobalt/cream — explicit defer per CONTEXT D-Defer R6 |
| TXN-V10-01     | TransactionsView.test, TransactionsMount.test                       | —                                          |
| TXN-V10-02     | TransactionsView.test, v10-phase25 e2e (6 chips loop)               | —                                          |
| TXN-V10-03     | TransactionsView.test (day grouping), TransactionsTests (iOS)       | —                                          |
| TXN-V10-04     | TransactionsView.test (row format)                                  | —                                          |
| TXN-V10-05     | TransactionsMount.test (delete confirm), TransactionsTests (iOS)    | Web swipe-left delete divergence (right-click) — documented in 25-08 SUMMARY |
| **TXN-V10-06** | **TxV10TabDemote.test (web), TxV10TabDemoteTests (iOS), v10-phase25 e2e (this plan locks)** | —                                          |
| ADD-V10-01     | V10MainShell.test (FAB hides nav), v10-phase25 e2e                  | —                                          |
| ADD-V10-02     | AddSheet.test (NEW ENTRY eyebrow), v10-phase25 e2e                  | —                                          |
| ADD-V10-03     | AddSheet.test (keypad, category required), iOS AddSheetTests        | Pixel-perfect keypad fidelity (Phase 28)   |
| ADD-V10-04     | AddSheet.test (CTA states)                                          | —                                          |
| ADD-V10-05     | AddSheet.test (POST /actual mock), iOS AddSheetTests                | Full e2e submit flow (deferred to Phase 28) |

**Bottom line:** every Phase 25 REQ is now provably green via at least one automated test, except for the explicit CONTEXT D-Defer items (background toggle alt; pixel-perfect easing/keypad fidelity; web swipe-left delete divergence; full e2e submit flow). All four deferred items are documented above and in their respective plan summaries — none are accidental gaps.

## Task Commits

Each task was committed atomically with `--no-verify` (per execution-context instructions):

1. **Task 1 — Web vitest acceptance for TXN-V10-06** — `863d33d` (test)
2. **Task 2 — iOS XCTest acceptance for TXN-V10-06** — `afb9bf7` (test)
3. **Task 3 — Playwright acceptance spec for Phase 25 happy path** — `4a21ab5` (test)

(SUMMARY commit — this file — will follow as a single docs commit per execution-context.)

## Files Created/Modified

### Created

- `frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx` (~128 LOC, 6 tests) — vitest demote suite. All static-grep guards point to `../../components/BottomNav.tsx` and `../Home/HomeMount.tsx` via `path.resolve(__dirname, …)`.
- `ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift` (~66 LOC, 3 tests) — XCTest demote suite. Pure enum-level assertions; no SwiftUI host needed. Auto-discovered by XcodeGen via existing `path: BudgetPlannerTests` source group (no `project.yml` change).
- `frontend/tests/e2e/v10-phase25-acceptance.spec.ts` (~221 LOC, 1 test) — Playwright chromium-mobile spec. All API mocks inline (no shared fixture file added — the demote spec doesn't reuse the onboarding-mocks helpers since it skips onboarding via `onboarded_at != null`).

### Modified

None.

## Decisions Made

(See `key-decisions` in frontmatter for the full list.)

Highlights:

- **Static-grep over render-mount for source-level invariants.** When the only artefact of a regression is a single import statement (HomeMount swap) or a single literal in a sibling file (v0.6 BottomNav «Транзакции» token), `fs.readFileSync` + regex inside a vitest file is dramatically cheaper than mounting the relevant component. Belt-and-braces: kept the v0.6 BottomNav render guard as well, so we have BOTH the cheap source check AND the user-perspective render check.
- **iOS tests are pure enum-level, no SwiftUI host.** Symmetric to Plan 25-07 V10MainShellTests pattern. Saves the 19s xcodebuild cycle from being multiplied across SwiftUI body inspections; the enum source-of-truth IS the demotion contract because both TabId and AppTab cases are how the platforms route the corresponding tabs.
- **Playwright minimum-viable acceptance.** Full AddSheet submit flow deferred per the plan's `<action>` note — the custom 3×4 keypad lacks a stable data-testid surface, and adding selectors solely for e2e would be Plan 25-12 scope creep. The shipped spec asserts the load-bearing boundary (FAB → AddSheet opens → BottomNav unmounts) which is enough to catch any regression of the FAB / sheet / nav-hide contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Playwright e2e directory path correction**
- **Found during:** Task 3 (writing Playwright spec)
- **Issue:** Plan referenced `frontend/e2e/v10-phase25-acceptance.spec.ts`, but the actual Playwright `testDir` (per `frontend/playwright.config.ts`) is `./tests/e2e`. The plan's path would have placed the file outside the test discovery root → spec would silently never run.
- **Fix:** Wrote the spec at `frontend/tests/e2e/v10-phase25-acceptance.spec.ts` instead. Verified via `npx playwright test tests/e2e/v10-phase25-acceptance.spec.ts --reporter=list` → spec discovered + passes.
- **Files modified:** `frontend/tests/e2e/v10-phase25-acceptance.spec.ts` (created at corrected path).
- **Verification:** Playwright lists + runs the spec from the correct directory. The plan frontmatter `files_modified` entry uses the original `frontend/e2e/...` path — this SUMMARY documents the correction. Future verifier should treat the corrected path as authoritative.
- **Committed in:** `4a21ab5`

**2. [Rule 1 — Bug] TabId enum keys-set assertion ordering**
- **Found during:** Task 1 (writing vitest TabId test)
- **Issue:** First draft of the «V10 TabId enum has 4 cases» test compared `Object.keys(map)` to `['home', 'savings', 'ai', 'mgmt']` directly — but Object.keys preserves insertion order, which would diverge from the asserted array if anyone re-ordered the Record literal. False-positive risk.
- **Fix:** Sort `Object.keys(map)` and compare to a sorted array literal `['ai', 'home', 'mgmt', 'savings']`. Order-insensitive, key-set assertion.
- **Files modified:** `frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx` (caught & fixed before first commit; not a separate commit).
- **Verification:** Test passes; re-ordering the Record literal does not break the test (manually re-checked logically).
- **Committed in:** `863d33d` (Task 1 commit; the sorted-keys logic is what shipped).

---

**Total deviations:** 2 auto-fixed (1 blocking — path correction; 1 bug — order-sensitive assertion).
**Impact on plan:** Both auto-fixes essential for correctness. The path correction was a static plan/codebase mismatch; the assertion fix was a self-caught false-positive trap. No scope creep — the deferred AddSheet submit flow is documented per the plan's own `<action>` note.

## Issues Encountered

- **No `gtimeout` available on macOS** — tried to wrap the `xcodebuild test` invocation in a `timeout 280` guard per the orchestrator's 5-min instruction; `timeout` isn't installed and `gtimeout` (coreutils) isn't either. Fell back to invoking `xcodebuild test` directly with the agent harness's 300s timeout — completed in 19s (build) + 0.003s (test) = well under the budget. No issue in practice.
- **iOS source auto-discovery via XcodeGen** — verified that adding a new `.swift` file under `ios/BudgetPlannerTests/FeaturesV10/` does NOT require a `project.yml` change (the source entry is `path: BudgetPlannerTests` which is recursive). Re-ran `xcodegen generate` once after adding the file — no diff in `project.pbxproj` because the file was already discoverable from the path-group spec. xcodebuild picked up the new test file on the next test invocation.
- **Stderr noise during xcodebuild test** — the test app tries to connect to `192.168.31.117:8000` (DEV backend per `BACKEND_URL` env var in `project.yml`) on simulator launch and logs «Connection refused» / «Не удалось подключиться к серверу» before any test runs. Pre-existing behaviour from Phase 24/25 iOS plans (see Plan 25-07 SUMMARY); does not affect test pass/fail.

## Threat Flags

None — implementation matches `<threat_model>` declaration: this is a test-only plan, no production code modified, no new threat surface introduced.

## Known Stubs

None introduced by this plan. The Phase 25 known stubs (per Plan 25-06 / 25-08 SUMMARYs — AccountsListPlaceholder, PlanViewPlaceholder, CategoryDetailPlaceholder pushed by Savings/AI/Mgmt tabs and category taps) are unaffected — this plan only added tests.

## Next Phase Readiness

- **Phase 26 (plan editor / category detail):** the demote suite stays green as Phase 26 swaps `CategoryDetailPlaceholder` and `PlanViewPlaceholder` imports inside `_placeholders.tsx` consumers. Test guard remains the contract floor.
- **Phase 27 (mgmt / savings / AI screens):** Savings/AI/Mgmt tabs swap from `AccountsListPlaceholder` / `PlanViewPlaceholder` to real screens. The TxV10TabDemote suite asserts the tab COUNT (4) — Phase 27 must not change the count, only the push targets. If Phase 27 ever adds a 5th tab, the test fails — deliberate edit required.
- **Phase 28 polish:** picks up the deferred AddSheet submit-flow Playwright coverage. Add `data-testid` to keypad buttons (`data-testid="keypad-digit-5"` etc) + СОХРАНИТЬ button, then extend `v10-phase25-acceptance.spec.ts` with a second test that drives the full submit flow.
- **No blockers** for downstream phases — Phase 25 is now end-to-end CI-locked.

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/screensV10/__tests__/TxV10TabDemote.test.tsx
- FOUND: ios/BudgetPlannerTests/FeaturesV10/TxV10TabDemoteTests.swift
- FOUND: frontend/tests/e2e/v10-phase25-acceptance.spec.ts

**Commits exist:**
- FOUND: 863d33d (test: web vitest demote suite — Task 1)
- FOUND: afb9bf7 (test: iOS XCTest demote suite — Task 2)
- FOUND: 4a21ab5 (test: Playwright Phase 25 happy-path spec — Task 3)

**Verification gates:**
- `cd frontend && npm test -- screensV10/__tests__/TxV10TabDemote.test.tsx --run`: 6/6 pass in ~1.3s
- `cd ios && xcodebuild test … -only-testing:BudgetPlannerTests/TxV10TabDemoteTests`: 3/3 pass in 0.003s (build 19s; total 19s — well under 5-min budget)
- `cd frontend && npx playwright test tests/e2e/v10-phase25-acceptance.spec.ts --reporter=list`: 1/1 pass in 2.5s

**No accidental file deletions.** `git diff 78ecf05..HEAD --diff-filter=D --name-only`: empty. All three commits add new files only.

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 12*
*Completed: 2026-05-10*
