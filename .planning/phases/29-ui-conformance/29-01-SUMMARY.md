---
phase: 29-ui-conformance
plan: 01
subsystem: testing

tags: [playwright, fixtures, visual-regression, snapshot-testing, web]

# Dependency graph
requires:
  - phase: 28-polish
    provides: "v10-pixel-snapshots.spec.ts scaffold (POL-04) + 8 setup helpers (gotoHome/Transactions/AddSheet/CategoryDetail/PlanMonth/Subscriptions/Savings/Ai)"
  - phase: 24-onboarding
    provides: "onboarding-mocks.ts pattern for Playwright route mocking"
provides:
  - "Reusable Playwright fixture installOnboardedFixture() for onboarded V10 user"
  - "8 baseline PNGs (home/transactions/add-sheet/category-detail/plan-month/subscriptions/savings/ai-initial) at -darwin platform suffix"
  - "freezeMotion() helper extracted to shared module"
affects: [29-02-web-audit, 29-04-blocker-fixes, 29-05-divergences-update, 31-regression-suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playwright route precedence: catch-all FIRST, specific endpoints LAST (last-registered wins)"
    - "Fixture module per persona/state (onboarded vs not-onboarded) under tests/e2e/fixtures/"

key-files:
  created:
    - frontend/tests/e2e/fixtures/onboarded-user.ts
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/ (8 PNGs)
  modified:
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts

key-decisions:
  - "Snapshot folder = Playwright default `<spec>.ts-snapshots/` (NOT `__screenshots__/<spec>.ts/`) — matches snapshotPathTemplate default; the legacy `__screenshots__/v10-pixel/.gitkeep` from Plan 28-03 is now historical"
  - "Catch-all `**/api/v1/**` registered FIRST, specific endpoints LAST — Playwright last-registered-wins precedence requires this ordering for specific overrides to take effect"
  - "extraRoutes opts param installed AFTER specific routes so per-test overrides win against both layers"

patterns-established:
  - "Reusable fixture module pattern: mock data constants + install function + opts.extraRoutes escape hatch"
  - "Motion freeze helper colocated with fixture to keep snapshot determinism wiring in one place"

requirements-completed: [UICONF-01]

# Metrics
duration: 14min
completed: 2026-05-11
---

# Phase 29 Plan 01: Playwright onboarded fixture + 8 baseline PNGs Summary

**Reusable installOnboardedFixture() shared fixture extracted from v10-pixel-snapshots spec; 8 V10 baseline PNGs generated at platform-suffixed `-darwin` for Phase 29-02 side-by-side audit and Phase 31 REG-01 regression.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-11T01:13:00Z
- **Completed:** 2026-05-11T01:28:08Z
- **Tasks:** 2
- **Files modified:** 2 (1 new, 1 refactored) + 8 generated PNGs

## Accomplishments

- Extracted `ME_ONBOARDED_V10`, `ACCOUNTS_V10`, `CATEGORIES_V10`, `PERIOD_CURRENT_V10` mock constants and route installer into shared `tests/e2e/fixtures/onboarded-user.ts`.
- Added `installOnboardedFixture(page, { extraRoutes? })` with proper Playwright route precedence semantics (catch-all first, overrides later).
- Co-located `freezeMotion(page)` motion-kill helper in the same fixture module.
- Generated 8 platform-suffixed baseline PNGs and verified deterministic re-run (no `--update-snapshots` flag, all 8 tests green in 5.4 s).
- Refactored `v10-pixel-snapshots.spec.ts`: removed inline mock constants + `installMocks()` helper + inline `freezeMotion()`; spec now consumes fixture via single import.

## Task Commits

Each task was committed atomically (--no-verify, hooks bypassed per parallel-agent budget):

1. **Task 1: Extract onboarded fixture module** — `b6fd896` (feat)
2. **Task 2: Refactor spec + generate baselines** — `5bafd34` (test, includes [Rule 1 - Bug] route-precedence fix)

## Files Created/Modified

- `frontend/tests/e2e/fixtures/onboarded-user.ts` — **created**, 227 lines. Exports: `ME_ONBOARDED_V10`, `ACCOUNTS_V10`, `CATEGORIES_V10`, `PERIOD_CURRENT_V10`, `installOnboardedFixture(page, opts?)`, `freezeMotion(page)`, `ExtraRoute` / `InstallOptions` types.
- `frontend/tests/e2e/v10-pixel-snapshots.spec.ts` — **modified**, removed 104 lines of inline mocks + helpers, added shared-fixture import.
- `frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/` — **created**, 8 PNGs (see filenames below).

## Baseline PNG Inventory

Path: `frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/`

| Filename                                          | Size (bytes) |
| ------------------------------------------------- | ------------ |
| `home-chromium-mobile-darwin.png`                 | 29 714       |
| `transactions-chromium-mobile-darwin.png`         | 33 152       |
| `add-sheet-chromium-mobile-darwin.png`            | 22 161       |
| `category-detail-chromium-mobile-darwin.png`      | 31 813       |
| `plan-month-chromium-mobile-darwin.png`           | 28 971       |
| `subscriptions-chromium-mobile-darwin.png`        | 30 051       |
| `savings-chromium-mobile-darwin.png`              |  2 374       |
| `ai-initial-chromium-mobile-darwin.png`           | 45 138       |

**Note for Plan 29-02:** `savings-chromium-mobile-darwin.png` is unusually small (2 374 B) — the screen likely renders an empty/placeholder state under the current onboarded fixture (no goal, no roundup data, etc). Audit should verify this is the intended «empty Savings» surface and not a render gap; if it's a gap, Plan 29-02 will need to extend the fixture (`extraRoutes`) with a non-empty goals/savings_config payload before re-snapshotting.

## Fixture API (for Phase 31 REG-01 reuse)

```ts
// tests/e2e/fixtures/onboarded-user.ts
export const ME_ONBOARDED_V10: { /* MeV10Response */ };
export const ACCOUNTS_V10:     [{ /* AccountRead */ }];
export const CATEGORIES_V10:   [{ /* CategoryRead */ }, …];
export const PERIOD_CURRENT_V10: { /* BudgetPeriodRead */ };

export interface ExtraRoute {
  pattern: string | RegExp;
  handler: (route: Route) => Promise<void> | void;
}
export interface InstallOptions { extraRoutes?: ExtraRoute[]; }

export async function installOnboardedFixture(
  page: Page, opts?: InstallOptions,
): Promise<void>;

export async function freezeMotion(page: Page): Promise<void>;
```

Routes installed (in registration order — Playwright last-wins precedence):
1. `**/api/v1/**` (catch-all) — GET → `[]`, non-GET → `route.continue()`.
2. `**/api/v1/me` → `ME_ONBOARDED_V10`
3. `**/api/v1/accounts` → `ACCOUNTS_V10`
4. `**/api/v1/categories**` → `CATEGORIES_V10`
5. `**/api/v1/periods/current` → `PERIOD_CURRENT_V10`
6. `**/api/v1/periods/5/actual**` → `[]`
7. (optional) `opts.extraRoutes` — registered last so per-test overrides win.

Init script: `localStorage['ui.theme'] = 'v10'` set BEFORE app boot.

## Decisions Made

- **Snapshot path:** Playwright's default `<spec>.ts-snapshots/` is the actual landing folder, not the `__screenshots__/v10-pixel/` placeholder created by Plan 28-03 (which has a stray `.gitkeep` and is now historical). The plan-defined path was documentation-imprecise; we matched Playwright defaults to avoid forcing a non-default `snapshotPathTemplate`.
- **Route ordering:** Catch-all FIRST, specific endpoints LAST — diametrically opposite to the original inline `installMocks()` (which was buggy but masked because Playwright still routed correctly when patterns were exclusive — `me`, `accounts`, `categories**` don't overlap by glob, but `**/api/v1/**` does). The bug only surfaced once the catch-all and specifics were exercised in the same fixture from a fresh page session — see Deviations §1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inverted Playwright route precedence so /me, /accounts, /categories actually return their mock payloads**
- **Found during:** Task 2 — first `--update-snapshots` run. All 8 tests failed at `expect(getByText(/Дневной темп/)).toBeVisible()` with the page rendering OnboardingFlow ШАГ 01 / 04 instead of HomeView.
- **Investigation:** Added a one-shot debug spec that logged `/me` response bodies — `RES /me 200 []`. The catch-all `**/api/v1/**` was intercepting `/me` and returning `[]`, which TypeScript-coerced to `onboarded_at == null` in `OnboardingMount`, forcing the onboarding flow on every Home navigation.
- **Root cause:** Playwright route precedence is **last-registered wins** for overlapping patterns. The plan's specified order (specific routes first, catch-all last) inverts this: the catch-all wins against everything beneath it.
- **Fix:** In `installOnboardedFixture`, register the catch-all FIRST, then the specific endpoint mocks, then `opts.extraRoutes` last. After the fix, debug spec showed `RES /me 200 {"tg_user_id":100000001,…,"onboarded_at":"2026-04-01T10:00:00+00:00",…}` and the body contained `Дневной темп —` and `238₽`.
- **Files modified:** `frontend/tests/e2e/fixtures/onboarded-user.ts` (route ordering + JSDoc note)
- **Verification:** Re-ran `npx playwright test … --update-snapshots --project=chromium-mobile` → 8 passed, 8 PNGs written. Re-ran without `--update-snapshots` → 8 passed in 5.4 s (deterministic).
- **Committed in:** `5bafd34` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, Rule 1)
**Impact on plan:** Necessary correctness fix — without it, no baseline could be generated. The plan's described ordering (specific then catch-all) was conceptually correct but incompatible with Playwright's actual semantics; the docstring on `installOnboardedFixture` now documents the corrected ordering for future reuse.

## Issues Encountered

- The `savings` screen rendered as an unusually small 2 374-byte snapshot, suggesting an empty state. Logged in the inventory above so Plan 29-02 can decide whether to enrich the fixture (likely with a goal / savings_config payload via `extraRoutes`) before audit.
- No flake-mitigation needed beyond the existing `freezeMotion` (150 ms settle is enough; BigFig count-up froze cleanly under the kill-switch). No additional `waitForTimeout` or `page.evaluate` freeze hooks were required.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **29-02 (web side-by-side audit):** ready. Read PNGs from `frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/` and compare against `.planning/v1.0-handoff/handoff/prototype/index.html` per screen. Be prepared to extend the fixture for the `savings` empty-state issue noted above.
- **29-05 (DIVERGENCES.md update):** §W-04 «baseline PNGs deferred» can be closed; the actual edit happens in 29-05.
- **31 REG-01 (full regression):** `installOnboardedFixture` is reusable — REG-01 can layer additional fixtures (e.g., `installNotOnboardedFixture`, `installPostCloseFixture`) following the same pattern.

## Self-Check: PASSED

Files verified:
- FOUND: frontend/tests/e2e/fixtures/onboarded-user.ts
- FOUND: frontend/tests/e2e/v10-pixel-snapshots.spec.ts (refactored)
- FOUND: frontend/tests/e2e/v10-pixel-snapshots.spec.ts-snapshots/{home,transactions,add-sheet,category-detail,plan-month,subscriptions,savings,ai-initial}-chromium-mobile-darwin.png (8 files)

Commits verified in `git log --oneline`:
- FOUND: b6fd896 feat(29-01): add onboarded-user Playwright fixture
- FOUND: 5bafd34 test(29-01): refactor v10-pixel spec to fixture + 8 baseline PNGs

---
*Phase: 29-ui-conformance*
*Completed: 2026-05-11*
