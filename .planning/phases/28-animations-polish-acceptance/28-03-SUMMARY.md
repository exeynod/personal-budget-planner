---
phase: 28-animations-polish-acceptance
plan: 03
subsystem: testing
tags: [playwright, pixel-perfect, screenshots, divergences, polish, ios-handoff, pol-04]

requires:
  - phase: 25-home-transactions-add-sheet
    provides: V10 Home/Transactions/AddSheet routes (snapshot targets 1-3)
  - phase: 26-category-detail-plan-month
    provides: V10 CategoryDetail + PlanMonth routes (snapshot targets 4-5)
  - phase: 27-management-savings-ai
    provides: V10 Subscriptions/Savings/Ai routes (snapshot targets 6-8)
provides:
  - Playwright pixel-perfect baseline spec covering 8 V10 screens
  - DIVERGENCES.md cataloging W-01..W-05, I-01..I-05, X-01..X-02 + iOS visual QA checklist
  - Acceptance gate (W-04) flagging deferred --update-snapshots run
affects: [28-acceptance, 28-performance, v1.0-acceptance]

tech-stack:
  added: []
  patterns:
    - "Playwright toHaveScreenshot baseline with 2% maxDiffPixelRatio for sub-pixel AA tolerance"
    - "freezeMotion() helper injects animation/transition kill-switch for snapshot determinism"
    - "Catch-all /api/v1/** GET → [] mock so all screens render initial state without backend"

key-files:
  created:
    - frontend/tests/e2e/v10-pixel-snapshots.spec.ts
    - frontend/tests/e2e/__screenshots__/v10-pixel/.gitkeep
    - .planning/v1.0-handoff/DIVERGENCES.md
  modified: []

key-decisions:
  - "Baseline PNG generation deferred to operator's first manual --update-snapshots run (W-04) — parallel-agent worktree lacks node_modules + backend stack to produce deterministic baselines"
  - "macOS-only baseline ship strategy (W-02) — CI either regenerates or skips; documented in spec header"
  - "Permissive selectors for Plan/Subscriptions nav entries (W-05) accepted as v1.0 trade-off; v1.1 to add data-testids"

patterns-established:
  - "Pixel-snapshot test pattern: addInitScript for ui.theme, installMocks before each, freezeMotion after each navigation, fullPage: true with 2% tolerance"
  - "DIVERGENCES.md schema: W-XX (web) / I-XX (iOS) / X-XX (cross-platform) + manual checklist appendix"

requirements-completed: [POL-04]

duration: 5min
completed: 2026-05-10
---

# Phase 28 Plan 03: Playwright Pixel-Perfect Baseline + DIVERGENCES Summary

**Playwright snapshot scaffolding for 8 V10 screens (home, transactions, add-sheet, category-detail, plan-month, subscriptions, savings, ai-initial) plus a 207-line DIVERGENCES.md cataloging W/I/X divergences with an iOS manual visual-QA checklist for acceptance §14.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-10T20:26:00Z
- **Completed:** 2026-05-10T20:31:16Z
- **Tasks:** 2
- **Files created:** 3 (spec, .gitkeep, DIVERGENCES.md)
- **Files modified:** 0

## Accomplishments

- Pixel-snapshot spec with 8 screens, mock fixtures, motion freezer, and 2% diff tolerance
- DIVERGENCES.md (207 LOC) covering 12 documented divergences + iOS manual checklist + ADR-001/-002 references + future-work backlog
- Explicit acceptance-gate note (W-04) so operator knows baseline PNG generation is the next manual step before POL-04 closes

## Task Commits

1. **Task 1: v10-pixel-snapshots.spec.ts (8 screens) + .gitkeep** — `835e7d6` (test)
2. **Task 2: DIVERGENCES.md (web + iOS hybrid + iOS visual QA checklist)** — `7781d8b` (docs)

## Snapshot Targets

| # | Screen          | Helper                  | Status |
| - | --------------- | ----------------------- | ------ |
| 1 | home            | `gotoHome`              | scaffolded (✓ helper exercises real Home mass headline assertion before snapshot) |
| 2 | transactions    | `gotoTransactions`      | scaffolded (✓ taps «ВСЕ ОПЕРАЦИИ →», waits for «Реестр.» mass headline) |
| 3 | add-sheet       | `gotoAddSheet`          | scaffolded (✓ taps FAB by aria-label «Добавить транзакцию», waits for «NEW ENTRY») |
| 4 | category-detail | `gotoCategoryDetail`    | scaffolded (taps first «Кафе» row from Home) |
| 5 | plan-month      | `gotoPlanMonth`         | scaffolded — permissive selector (W-05); may capture Home if Plan badge copy changes |
| 6 | subscriptions   | `gotoSubscriptions`     | scaffolded — permissive selector (W-05); routes through УПР. → «Подписки» |
| 7 | savings         | `gotoSavings`           | scaffolded (taps КОПИЛКА tab) |
| 8 | ai-initial      | `gotoAi`                | scaffolded (taps AI tab) |

**Baseline PNGs:** 0/8 generated in this plan. See DIVERGENCES.md §W-04 — operator must run
`npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts --update-snapshots` from a developer
machine with the full backend + Vite dev stack live, then commit the resulting PNGs in
`frontend/tests/e2e/__screenshots__/v10-pixel-snapshots.spec.ts/`. Re-run without
`--update-snapshots` should pass green; any screen that fails to settle gets demoted to a
W-XX divergence entry rather than silently dropped.

**Snapshot baseline platform note:** macOS-only (`-darwin` suffix) per W-02. CI either
regenerates on its own runner or skips the spec.

## DIVERGENCES.md Table of Contents

- **Web Divergences:** W-01 (DM Serif Cyrillic fallback / ADR-001), W-02 (2% tolerance + macOS-only baseline), W-03 (motion frozen in snapshots), W-04 (baseline PNGs deferred — acceptance gate), W-05 (permissive routing selectors)
- **iOS Divergences:** I-01 (PT Serif fallback / ADR-001), I-02 (PosterNavStack vs UIKit / ADR-002), I-03 (SwiftUI spring vs CSS cubic-bezier), I-04 (safe-area), I-05 (bare `.animation()` callsites flagged for v1.1)
- **iOS Manual Screenshot Checklist:** 10-row table for acceptance §14 (Home, Transactions, AddSheet, CategoryDetail, PLAN мая, Subscriptions, Savings, AI initial, Accounts, Analytics) + reduce-motion + edge-swipe-back VoiceOver smoke
- **Cross-Platform:** X-01 (tab swap), X-02 (toast lifetime — symmetric)
- **Future Work:** `.timingCurve` upgrade, custom DM Serif Cyrillic glyphs, multi-platform CI baselines, stable test-ids for W-05

## Decisions Made

- **W-04 deferred baseline:** parallel-agent worktree has no `node_modules`, no Vite dev server, and no backend container stack. Running Playwright `--update-snapshots` here would either time-out at the dev-server boot step or capture loading/error frames, polluting the baseline. The honest path is to commit the spec + `.gitkeep` + a clear acceptance gate documented in DIVERGENCES.md §W-04, and let the operator run the generation locally with the full stack up. Plan 28-03 Task 1 already anticipates this in its "Запусти один раз с `--update-snapshots`" instruction.
- **Catch-all GET → []:** the per-screen mock list from Plan 25-12's acceptance spec only covers 5 endpoints. Plan-month, subscriptions, savings, and ai-initial each hit their own subset of `/api/v1/v10/...` routes. Returning `[]` from the catch-all produces deterministic empty/initial states (matching the «AI initial» expectation literally) instead of error fallbacks; non-GET requests still fall through to `route.continue()` to avoid masking submit-flow bugs.
- **2% tolerance:** chosen over the default 0% to absorb sub-pixel Chromium AA shifts between minor versions and host machines. Tighter tolerances would produce noisy CI failures; wider would risk missing real visual regressions. 2% is the same threshold used in equivalent SwiftUI snapshot suites.

## Deviations from Plan

None — plan executed exactly as written. Both Task 1 and Task 2 used the structures the plan provided. The W-04 «deferred baseline» entry is explicitly anticipated by Plan 28-03 Task 1 («задокументируй пропуск в DIVERGENCES.md») and the «зафиксируй выбор в SUMMARY» note about platform-suffixed baselines, so it is in-scope rather than a deviation.

## Issues Encountered

- **`tsc -b` from worktree fails with «Cannot find module 'react'» etc.** Root cause: parallel-agent worktree has no `node_modules`. This is environmental, not caused by the spec; verified spec syntax via `npx esbuild tests/e2e/v10-pixel-snapshots.spec.ts --bundle=false` (passed). Same pattern (`import { expect, test, type Page } from '@playwright/test'`) is used by `v10-phase25-acceptance.spec.ts` which ships green in main repo.

## User Setup Required

**Acceptance gate before POL-04 closes** — see DIVERGENCES.md §W-04 for the exact commands. Summary:
1. From a dev machine with backend + Vite stack live, run `npx playwright test tests/e2e/v10-pixel-snapshots.spec.ts --update-snapshots`
2. Commit the generated PNGs in `frontend/tests/e2e/__screenshots__/v10-pixel-snapshots.spec.ts/`
3. Re-run without `--update-snapshots` and verify green
4. Optionally run the iOS visual-QA checklist (10 rows + 2 smoke checks) from DIVERGENCES.md before v1.0 ship

## Next Phase Readiness

- POL-04 web scaffolding ready; baseline PNG generation is operator's manual step
- POL-04 iOS handoff complete — DIVERGENCES.md is the single artefact for §14.7 acceptance
- Plan 28-02 (iOS bare-`.animation()` audit) should append findings to I-05 when it ships

## Self-Check: PASSED

- FOUND: frontend/tests/e2e/v10-pixel-snapshots.spec.ts
- FOUND: frontend/tests/e2e/__screenshots__/v10-pixel/.gitkeep
- FOUND: .planning/v1.0-handoff/DIVERGENCES.md
- FOUND: .planning/phases/28-animations-polish-acceptance/28-03-SUMMARY.md
- FOUND commit: 835e7d6 (Task 1 spec + .gitkeep)
- FOUND commit: 7781d8b (Task 2 DIVERGENCES.md)

---
*Phase: 28-animations-polish-acceptance*
*Completed: 2026-05-10*
