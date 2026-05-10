---
phase: 30-tech-debt
plan: 02
subsystem: web/screensV10
tags:
  - debt
  - web
  - add-sheet
  - refetch
  - account-picker
requirements:
  - DEBT-02
  - DEBT-03
dependency_graph:
  requires:
    - 30-07  # HomeMount useHomeColor wiring — kept intact (additive integration)
  provides:
    - "RefetchTokenProvider (screensV10/common): cross-mount refetch signal"
    - "AccountPickerSheet (screensV10/AddSheet): bottom-sheet account picker"
    - "parent-refetched data-testid on HomeMount + TransactionsMount roots"
  affects:
    - V10MainShell (owns refetchToken state + provides RefetchTokenProvider)
    - AddSheet (account-row UX: tap-to-cycle → tap-to-open-picker)
    - HomeMount / TransactionsMount (fetch effect now keyed on refetchToken)
tech-stack:
  added: []
  patterns:
    - "React Context for cross-component refetch signal (avoids prop-drilling through PosterRouter pushes)."
    - "Hidden sentinel <span data-testid=...> for testable side-effects without inspecting fetch mocks."
key-files:
  created:
    - frontend/src/screensV10/common/RefetchContext.tsx
    - frontend/src/screensV10/AddSheet/AccountPickerSheet.tsx
    - frontend/src/screensV10/AddSheet/AccountPickerSheet.module.css
    - frontend/src/screensV10/AddSheet/__tests__/AccountPickerSheet.test.tsx
    - frontend/src/screensV10/Home/__tests__/HomeMount.refetch.test.tsx
    - frontend/src/screensV10/Transactions/__tests__/TransactionsMount.refetch.test.tsx
  modified:
    - frontend/src/screensV10/V10MainShell.tsx
    - frontend/src/screensV10/AddSheet/AddSheet.tsx
    - frontend/src/screensV10/AddSheet/index.ts
    - frontend/src/screensV10/Home/HomeMount.tsx
    - frontend/src/screensV10/Transactions/TransactionsMount.tsx
    - frontend/src/screensV10/common/index.ts
decisions:
  - "RefetchTokenProvider lives at screensV10/common — symmetric to PosterRouter/PosterSheet placement; both HomeMount and TransactionsMount consume via a hook with zero-default fallback so unit tests rendering Mount standalone keep working."
  - "Picker is a bottom-sheet (PosterSheet, paper background) rather than an inline dropdown — matches iOS pattern and keeps AddSheet's dark surface uncluttered."
  - "Selected row carries ✓ marker + subtle background tint; aria-pressed reflects state for accessibility."
metrics:
  duration_minutes: 13
  completed: 2026-05-10T23:34:11Z
  tasks_completed: 3
  files_changed: 12
---

# Phase 30 Plan 02: AddSheet refetch + AccountPickerSheet Summary

DEBT-02 wires AddSheet submit success into HomeMount + TransactionsMount via a
new `RefetchTokenProvider` context (owned by V10MainShell). DEBT-03 replaces
the tap-to-cycle account row with a proper bottom-sheet `AccountPickerSheet`
showing each account's name, balance, and an ОСНОВНОЙ badge on the primary
account.

## What changed

### DEBT-02 — AddSheet submit refetch

- New module `screensV10/common/RefetchContext.tsx` exposes
  `RefetchTokenProvider` and `useRefetchToken()`. Default value `0`, so
  unit tests rendering HomeMount / TransactionsMount standalone (without a
  provider) keep working — the fetch effect simply never re-runs from an
  external bump.
- `V10MainShell` owns `[refetchToken, setRefetchToken]` and wraps the entire
  app tree (router + sheet) in `<RefetchTokenProvider value={refetchToken}>`.
  AddSheet's `onSubmitted` callback now does **both** `setAddSheet(false)`
  AND `setRefetchToken((t) => t + 1)`.
- `HomeMount` and `TransactionsMount` consume `useRefetchToken()` and add the
  value to their `useEffect` deps array. Each mount also renders a hidden
  `<span data-testid="parent-refetched" data-refetch-token={refetchToken}>`
  sentinel (display:none, aria-hidden) so tests can assert the bump
  without inspecting fetch mocks.

### DEBT-03 — AccountPickerSheet

- New `screensV10/AddSheet/AccountPickerSheet.tsx` renders inside a
  `PosterSheet` (paper background, separate from AddSheet's dark surface).
  Each row shows `{BANK · MASK}` + balance + `ОСНОВНОЙ` badge (when primary)
  + ✓ marker (when currently selected). Empty list → caption fallback.
- `AddSheet` replaces `onCycleAccount` with `onOpenAccountPicker` +
  `onSelectAccount`. The account-row button now opens the picker on tap
  (`aria-haspopup="dialog"`, `aria-expanded={accountPickerOpen}`). The
  picker is rendered after the cancel-confirm overlay so its portal layers
  on top.

## Tests added

| File | Coverage |
|------|----------|
| `AddSheet/__tests__/AccountPickerSheet.test.tsx` | 8 cases — closed/open render, primary badge, balance, selected ✓ + aria-pressed, empty state, onSelect callback, onClose via backdrop. |
| `Home/__tests__/HomeMount.refetch.test.tsx` | 2 cases — sentinel reflects token; bumping token re-runs fetch effect (verified by mock call counts). |
| `Transactions/__tests__/TransactionsMount.refetch.test.tsx` | 2 cases — symmetric to HomeMount refetch tests. |

## Verification

- `cd frontend && npx vitest run src/screensV10/AddSheet/ src/screensV10/Home/ src/screensV10/Transactions/`
  → 10 test files / 156 tests passed.
- `cd frontend && npx vitest run` → 50 files / **702 tests passed** (full suite).
- `cd frontend && npx tsc --noEmit` → exit 0, no diagnostics.
- 30-07 useHomeColor wiring preserved: HomeMount additions are purely additive
  (refetchToken in deps, sentinel wrapper) — `homeColor` prop still flows into
  HomeView unchanged.

## Deviations from Plan

None. Plan executed as written. The only design choice was using a hidden
`<span>` sentinel instead of placing `data-testid="parent-refetched"` on the
HomeView root `<div>` directly — the sentinel approach has zero visual impact
and works uniformly for loading / error / ready states without needing prop
plumbing into HomeView / TransactionsView.

## Self-Check

Confirmed below in the `## Self-Check` section appended after writing this file.

## TDD Gate Compliance

Plan type was `execute` (not `tdd`), so RED/GREEN/REFACTOR commit gates do not
apply. Tests were authored alongside implementation in a single commit.
