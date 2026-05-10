---
phase: 30-tech-debt
plan: 05
subsystem: ui
tags: [react, css-scroll-snap, transactions, web, debt-05, swipe-gesture, vitest]

# Dependency graph
requires:
  - phase: 25-08
    provides: TransactionsView (cobalt) presentational component + window.confirm-gated delete (T-25-08-02)
provides:
  - Touch swipe-left → red «УДАЛИТЬ» action plate (parity with iOS swipeActions trailing edge).
  - Desktop right-click → custom context-menu overlay («Удалить» / «Отмена»), replacing the old window.confirm gate.
  - .swipeContainer CSS pattern (overflow-x auto + scroll-snap-type x mandatory) reusable for other rows that need trailing actions.
affects: [Transactions screen UX, future row-level destructive actions (e.g. subscriptions list), DEBT-05 closure]

# Tech tracking
tech-stack:
  added: []  # no new npm deps — pure CSS scroll-snap + 1 useState
  patterns:
    - "Row-level swipe gesture via native scroll-snap (no JS handler / no library)"
    - "Desktop right-click context-menu overlay (z-index 50, fixed inset, backdrop closes)"
    - "Per-row sub-component (TxRow) owning local UI state — keeps parent render pure"

key-files:
  created: []
  modified:
    - frontend/src/screensV10/Transactions/TransactionsView.tsx
    - frontend/src/screensV10/Transactions/TransactionsView.module.css
    - frontend/src/screensV10/Transactions/TransactionsMount.tsx
    - frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx

key-decisions:
  - "Use CSS scroll-snap instead of touch event handlers — zero JS, zero deps, native momentum/inertia"
  - "Drop window.confirm gate on right-click: swipe gesture or explicit context-menu choice now serves as the intent gate (parity with iOS swipeActions, where there is no extra confirm dialog after a destructive swipe)"
  - "80px action width, --poster-red bg, --poster-paper text, Manrope 13px UPPERCASE per plan §4"
  - "Border-top moved from .row to .swipeContainer so the separator spans the full container even when the row scrolls"
  - "Action button uses stopPropagation in its click handler — prevents the wrapping row's onRowTap from firing simultaneously"

patterns-established:
  - "Row + trailing action via CSS scroll-snap: container is overflow-x auto + scroll-snap-type x mandatory; row is flex 0 0 100% with scroll-snap-align start; action is flex 0 0 80px with scroll-snap-align end. Touch users get native swipe-left; desktop users see only the row."
  - "Right-click context-menu fallback: onContextMenu={preventDefault + setState(true)} → conditional <div role=menu> overlay with stopPropagation backdrop"

requirements-completed: [DEBT-05]

# Metrics
duration: 12min
completed: 2026-05-11
---

# Phase 30 Plan 05: Web Transactions Swipe-Left Delete Summary

**Touch swipe-left → red «УДАЛИТЬ» action on Transactions rows via CSS scroll-snap (zero deps) + desktop right-click context-menu fallback, parity with iOS `swipeActions(edge: .trailing)`.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-10T23:14:00Z
- **Completed:** 2026-05-10T23:26:16Z
- **Tasks:** 2
- **Files modified:** 4 (3 source, 1 test)

## Accomplishments
- DEBT-05 closed: web Transactions row now matches iOS UX — swipe-left exposes a 80px red «УДАЛИТЬ» plate; tap fires `onRowDelete(tx)` immediately (no extra confirm dialog).
- Desktop right-click → custom context-menu overlay with «Удалить» / «Отмена», replacing the pre-existing `window.confirm(...)` gate. Backdrop click also closes the menu.
- Zero new npm dependencies — implementation uses native CSS scroll-snap (`scroll-snap-type: x mandatory` + `scroll-snap-align: start/end`) and a single `useState` for the desktop menu.
- 6 new vitest cases covering: container presence, action label, action click → `onRowDelete` (NOT `onRowTap`), right-click → menu open, menu «Удалить» → delete + close, menu «Отмена» → close without delete, backdrop click → close without delete.

## Task Commits

1. **Task 1: TransactionRow swipe + delete handler** — `26ec76b` (feat)
2. **Task 2: SUMMARY** — this file (final docs commit will follow)

## Files Created/Modified
- `frontend/src/screensV10/Transactions/TransactionsView.tsx` — Extracted row rendering into `TxRow` sub-component. Each row wrapped in `.swipeContainer` with trailing `.swipeAction` button + optional `.contextMenuOverlay`. Updated `onRowDelete` JSDoc to describe the new dual gate (swipe / right-click).
- `frontend/src/screensV10/Transactions/TransactionsView.module.css` — Added `.swipeContainer` (overflow-x scroll-snap), `.swipeAction` (80px red plate, Manrope 13px UPPERCASE), `.contextMenuOverlay` + `.contextMenu` + `.contextMenuItem(Danger)`. Border-top moved from `.row` to `.swipeContainer`.
- `frontend/src/screensV10/Transactions/TransactionsMount.tsx` — Updated header doc-comment + inline comment in `handleRowDelete` to reflect that the View gates intent via swipe/menu (not `window.confirm`). No functional change.
- `frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx` — Added two new describe-blocks (swipe-left delete + right-click context-menu fallback) with 6 cases.

## Decisions Made
- **Native CSS scroll-snap over a swipe library.** The plan suggested either `react-swipeable` or scroll-snap — chose scroll-snap to avoid an extra dep and to inherit native momentum/inertia on mobile. The row claims 100% of the container width so the action stays off-screen until the user swipes; no JS needed for the gesture.
- **Removed `window.confirm` on right-click.** The pre-existing flow was: right-click → preventDefault → `window.confirm('Удалить операцию?')` → delete. With swipe-left now being the primary mobile gesture (no confirm there, matching iOS), keeping a confirm on desktop right-click would be inconsistent. Replaced with an explicit two-option context-menu («Удалить» / «Отмена»), which is a clearer affordance than a browser-native modal dialog and visually consistent with the poster aesthetic.
- **`TxRow` extracted to a sub-component** so menu-open state lives on the row, not the screen. Avoids `useState` array per row in the parent and keeps `TransactionsView` props-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Inconsistency] Removed stale `window.confirm` from TransactionsView right-click handler**
- **Found during:** Task 1 (designing the right-click fallback)
- **Issue:** The plan §5 specified a custom overlay menu with «Удалить» / «Отмена» as the desktop fallback. Keeping the pre-existing `window.confirm('Удалить операцию?')` line on right-click in addition to the new swipe gesture would be redundant and inconsistent: swipe-left on touch fires `onRowDelete` immediately (no confirm), so the desktop path should also rely on an explicit menu choice rather than a duplicate browser-native confirm.
- **Fix:** Replaced the `window.confirm` branch with `setMenuOpen(true)`. The new `.contextMenuOverlay` then renders «Удалить» (fires `onRowDelete`) and «Отмена» (just closes). Backdrop click also closes without deleting. Updated the prop docstring on `onRowDelete` and the comment in `TransactionsMount.tsx` to remove now-stale references to `window.confirm` and T-25-08-02's confirm-gate.
- **Files modified:** TransactionsView.tsx, TransactionsMount.tsx
- **Verification:** 4 new vitest cases (right-click → menu open, «Удалить» → onRowDelete + menu closes, «Отмена» → no delete + menu closes, backdrop → no delete + menu closes) all pass.
- **Committed in:** 26ec76b (Task 1 commit)

**2. [Rule 1 — Test edits for behaviour change] Existing tests untouched; only new tests added**
- **Found during:** Task 1
- **Issue:** The prompt warned that existing tests may need updating for the new swipe gesture (cf. Phase 29-04). Reviewed `TransactionsView.test.tsx`: the existing right-click test never existed (the file only exercised `onRowTap`/`onChipChange`/`onBack`/empty state/spec-tags) — so there was nothing to amend. All 42 pre-existing cases still pass unchanged.
- **Fix:** Added 6 new cases for the swipe + context-menu flows on top of the existing suite.
- **Files modified:** __tests__/TransactionsView.test.tsx (additive only)
- **Verification:** `npx vitest run src/screensV10/Transactions/` → 48/48 green (was 42 before).
- **Committed in:** 26ec76b

---

**Total deviations:** 1 auto-fixed (1 inconsistency / dead-code removal) + 0 test-rewrite churn.
**Impact on plan:** No scope creep. The `window.confirm` removal is a strict simplification — same conceptual behaviour («user confirms before delete») now lives in a single place (the swipe gesture OR the explicit context-menu choice) instead of being duplicated across the touch/desktop branches.

## Issues Encountered
- None. CSS scroll-snap worked first try; tests passed first run.

## Verification
- `cd frontend && npx vitest run src/screensV10/Transactions/` → **48/48 green** (Test Files 2 passed, Tests 48 passed, Duration 519ms).
- `cd frontend && npx vitest run` → **690/690 green** across the full suite (47 test files); no regression.
- `cd frontend && npx tsc --noEmit` → **clean** (exit 0, no output).

## User Setup Required
None — pure UI change, no env vars, no migration, no backend touch.

## Next Phase Readiness
- DEBT-05 closed. Six tech-debt items remain in this phase: DEBT-01..04 + 06..08, some already complete per recent commits (30-06, 30-07).
- The `.swipeContainer` + `.swipeAction` CSS pattern is now available for other web row-lists that may want trailing destructive actions (e.g. subscriptions list, accounts list) — same 4 rules: container `overflow-x: auto; scroll-snap-type: x mandatory`, row `flex 0 0 100%; scroll-snap-align: start`, action `flex 0 0 80px; scroll-snap-align: end`, action click handler must `stopPropagation` to avoid triggering the row tap.

## Self-Check: PASSED

- File `frontend/src/screensV10/Transactions/TransactionsView.tsx` modified — present.
- File `frontend/src/screensV10/Transactions/TransactionsView.module.css` modified — present.
- File `frontend/src/screensV10/Transactions/TransactionsMount.tsx` modified — present.
- File `frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx` modified — present.
- Commit `26ec76b` present in `git log` (HEAD).
- SUMMARY ≥ 10 lines: yes (this file is well over 100).
- SUMMARY contains literal `DEBT-05`: yes (frontmatter `requirements-completed: [DEBT-05]` + title bullet + multiple sections).

---
*Phase: 30-tech-debt*
*Completed: 2026-05-11*
