---
phase: 05-dashboard-period-lifecycle
plan: "05"
subsystem: frontend-screen
tags: [frontend, screen, integration, dashboard, edge-states]
dependency_graph:
  requires: ["05-03", "05-04"]
  provides: [HomeScreen-dashboard]
  affects: ["05-06"]
tech_stack:
  added: []
  patterns: [local-state-selectedPeriodId, useMemo-sort-by-category-order, busy-guard, toast-pattern, isActiveCurrent-guard]
key_files:
  created: []
  modified:
    - frontend/src/screens/HomeScreen.tsx
    - frontend/src/screens/HomeScreen.module.css
decisions:
  - "selectedPeriodId kept as local state in HomeScreen (not lifted to App.tsx) — other screens don't need it"
  - "Empty state detection: balance.by_category.filter(r => r.planned_cents > 0).length === 0 (planned rows absent = empty, even if actuals exist)"
  - "MainButton props adapted to actual API: {text, enabled, onClick} instead of plan's {text, onClick, disabled, visible}"
  - "Apply Template feedback distinguishes 3 cases: empty template, already applied (created=0), and success"
  - "Task 2 (App.tsx) is no-op: existing onNavigate prop signature compatible without modification"
metrics:
  duration: "~15min"
  completed: "2026-05-03T18:50:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 5 Plan 05: HomeScreen Full Dashboard Integration

**One-liner:** HomeScreen placeholder fully replaced with live dashboard — HeroCard/PeriodSwitcher/TabBar/AggrStrip/DashboardCategoryRow wired to useDashboard + usePeriods, all 4 edge states (empty/in-progress/warn/closed) implemented with FAB and MainButton conditional visibility.

## What Was Built

### Task 1: HomeScreen.tsx full replacement + HomeScreen.module.css

**`HomeScreen`** — complete dashboard screen implementing DSH-01..06:

**State management:**
- `useCurrentPeriod()` → `currentPeriod` (determines "active current" identity)
- `usePeriods()` → `periods` list for PeriodSwitcher
- `selectedPeriodId: number | null` — local state, initialized via `useEffect` when `currentPeriod` loads
- `isActiveCurrent` — true only when `selectedPeriod === currentPeriod` AND `status === 'active'`
- `isClosed` — `selectedPeriod?.status === 'closed'`
- `useDashboard(selectedPeriodId, isActiveCurrent)` → `balance` + `refetchDashboard`
- `useCategories(false)` → category sort order for `visibleRows` computation
- `activeTab: CategoryKind` — defaults `'expense'`, toggles TabBar

**Layout (top → bottom):**
1. HeroCard — shown when `balance && selectedPeriod` loaded
2. PeriodSwitcher — shown when `periods.length > 0 && selectedPeriodId !== null`
3. Sticky TabBar — Расходы / Доходы (44px height, full-bleed)
4. AggrStrip — shown when `balance` loaded
5. Empty state (DSH-04) — when `isEmpty` (no planned rows in period)
6. Category list — `visibleRows` filtered by `activeTab`, sorted by `categories` order, orphans appended last
7. FAB — only when `isActiveCurrent && !isClosed`
8. MainButton "Период закрыт" (enabled=false) — only when `isClosed`
9. BottomSheet + ActualEditor — FAB-triggered quick-add actual pipeline

**Empty state (DSH-04):**
- Criterion: `balance.by_category.filter(r => r.planned_cents > 0).length === 0`
- CTA "Применить шаблон" → `applyTemplate(currentPeriod.id)` + toast + `refetchDashboard()`
- CTA "Добавить вручную" → `onNavigate('planned')`
- Both CTAs disabled when `busy || !isActiveCurrent`

**Apply Template (DSH-04):**
- Distinguishes 3 feedback cases: empty template / already applied (created=0) / success ("Шаблон применён")
- `busy` guard prevents double-click
- `mutationError` inline display on failure

**Closed period (DSH-05):**
- FAB hidden (`isActiveCurrent` false when `isClosed`)
- MainButton visible with `text="Период закрыт"` and `enabled={false}`
- `rootClosed` CSS class adds bottom padding to avoid MainButton overlap

**Period switching (DSH-06):**
- PeriodSwitcher `onSelect={setSelectedPeriodId}` mutates local state
- `useDashboard` re-fetches automatically when `selectedPeriodId` changes (hook deps)

**CSS (`HomeScreen.module.css`):**
- `.root` — max-width 375px, `--space-12` bottom padding
- `.rootClosed` — `calc(var(--safe-bottom) + var(--main-button-height) + 8px)` bottom padding
- `.tabBar` — `position: sticky; top: 0; z-index: 20; height: 44px` full-bleed
- `.emptyState` — centered CTA layout with gap
- `.toast` — success style: `--color-success-soft` bg, `--color-success` text/border, `--radius-full`
- All colors via design token `var(--*)` only

### Task 2: App.tsx — verification only (no changes)

App.tsx passes `onNavigate={(s) => setOverrideScreen(s)}` to HomeScreen — compatible with new props signature. No modifications required.

## TypeScript Compilation

```
$ tsc --noEmit
EXIT: 0  (no errors)
```

## Vite Build

```
$ vite build
✓ 84 modules transformed.
dist/assets/index-O8ZvAIVN.css   31.51 kB │ gzip:  5.66 kB
dist/assets/index-G_pFvEcW.js   250.01 kB │ gzip: 76.49 kB
✓ built in 87ms
EXIT: 0
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `26a0155` | feat(05-05): replace HomeScreen placeholder with full dashboard |

Task 2 — no-op (App.tsx unchanged, verification only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MainButton props adapted to actual API**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified `<MainButton text disabled visible onClick />` but the actual `MainButton` component (Phase 2) only accepts `{ text: string, enabled: boolean, onClick: () => void }` — no `disabled` or `visible` props
- **Fix:** Used `enabled={false}` instead of `disabled`. Removed `visible` prop (not part of MainButton API). The `isClosed` condition in JSX (`{isClosed && <MainButton .../>}`) handles visibility naturally.
- **Files modified:** `frontend/src/screens/HomeScreen.tsx`
- **Commit:** `26a0155`

## Notes for Plan 05-06 (checkpoint — visual verification)

Check visually in browser/Telegram:
1. **HeroCard gradient** — `--gradient-hero` + `--gradient-hero-glow` overlay renders, period date range formatted "5 апр – 4 мая 2026"
2. **PeriodSwitcher disabled states** — ‹ disabled on oldest period, › disabled on current active
3. **Warn state** — category row with ≥80% actual/planned shows `--color-warn` border and progress bar
4. **Overspend state** — category row with >100% shows `--color-danger` border + percentage badge
5. **Closed period read-only** — FAB hidden, MainButton shows "Период закрыт" (grey/disabled)
6. **Tab switch** — Расходы/Доходы toggles category list and AggrStrip totals
7. **Empty state CTA flow** — "Применить шаблон" calls API and shows toast; "Добавить вручную" navigates to PlannedScreen
8. **FAB → BottomSheet → ActualEditor** — quick-add flow, after save dashboard refetches

## Known Stubs

None — HomeScreen is fully wired to real API hooks (useDashboard, usePeriods, useCurrentPeriod). No hardcoded placeholder data.

## Threat Flags

No new threat surface introduced. Confirmed mitigations:
- T-05-22: Apply Template has `busy` guard (double-click prevention) + `showToast` feedback — no silent failure
- T-05-23: useDashboard cancellation flag from Plan 05-03 prevents stale fetch on period switch
- T-05-25: `onNavigate` TypeScript union `'categories' | 'template' | 'planned' | 'actual' | 'settings'` enforces valid screen values

## Self-Check: PASSED

- `frontend/src/screens/HomeScreen.tsx` — FOUND
- `frontend/src/screens/HomeScreen.module.css` — FOUND
- Commit `26a0155` — FOUND
- TypeScript: EXIT 0 — PASSED
- Vite build: EXIT 0 — PASSED
