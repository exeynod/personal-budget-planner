---
phase: 05-dashboard-period-lifecycle
plan: "03"
subsystem: frontend-data-layer
tags: [frontend, hooks, api-client, types, money-formatting]
dependency_graph:
  requires: ["05-01"]
  provides: [usePeriods, useDashboard, formatKopecks, listPeriods, getPeriodBalance]
  affects: ["05-04", "05-05"]
tech_stack:
  added: []
  patterns: [cancellation-flag-hook, apiFetch-wrapper, ru-RU-locale-formatting]
key_files:
  created:
    - frontend/src/utils/format.ts
    - frontend/src/api/periods.ts
    - frontend/src/hooks/usePeriods.ts
    - frontend/src/hooks/useDashboard.ts
  modified:
    - frontend/src/api/types.ts
decisions:
  - "formatKopecksWithSign: 0 renders without sign (empty string edge case)"
  - "usePeriods: 404 not special-cased (empty list comes as [], 404 is real error)"
  - "useDashboard loading initial state: true only if periodId!=null || isActiveCurrent"
  - "Existing PlanRow/PlanItemEditor/ActualEditor inline formatters NOT refactored (deferred per plan scope)"
metrics:
  duration: "~15min"
  completed: "2026-05-03T15:32:20Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 1
---

# Phase 5 Plan 03: Frontend Data Layer — Hooks, API Client, Money Formatting

**One-liner:** Centralized ru-RU money formatters + `listPeriods`/`getPeriodBalance` API wrappers + `usePeriods`/`useDashboard` hooks following cancellation-flag pattern — complete data layer for Phase 5 dashboard components.

## What Was Built

### Task 1: `frontend/src/utils/format.ts` — Money Formatting Utilities

Central formatting module for Phase 5 dashboard. Existing inline formatters in PlanRow/PlanItemEditor/ActualEditor are NOT replaced (deferred per plan scope).

| Function | Behavior | Example |
|---|---|---|
| `formatKopecks(cents)` | ru-RU locale, no sign, no currency | `420000` → `"4 200"` |
| `formatKopecksWithSign(cents)` | Leading `+` for positives, `0` without sign | `420000` → `"+4 200"` |
| `formatKopecksWithCurrency(cents)` | Appends `₽` for hero card | `420000` → `"4 200 ₽"` |
| `parseRublesToKopecks(input)` | User input → kopecks or null | `"1 500,50"` → `150050` |

### Task 2: `frontend/src/api/periods.ts` + `types.ts` + `hooks/usePeriods.ts`

**`api/periods.ts`** — two new API wrappers:
- `listPeriods(): Promise<PeriodRead[]>` — `GET /api/v1/periods`
- `getPeriodBalance(periodId: number): Promise<BalanceResponse>` — `GET /api/v1/periods/{id}/balance`

**`api/types.ts`** — added Phase 5 section at the end with `PeriodListResponse` type alias. No duplication of existing `PeriodRead`/`BalanceResponse`.

**`hooks/usePeriods.ts`** — mirrors `useCurrentPeriod` cancellation pattern:
- Returns `{ periods: PeriodRead[], loading, error, refetch }`
- Mount-effect with `let cancelled = false` guard
- 404 not special-cased (empty list = `[]` from backend, 404 = real error)

### Task 3: `frontend/src/hooks/useDashboard.ts`

Endpoint-switching hook for the dashboard balance card:
- `useDashboard(periodId: number | null, isActiveCurrent: boolean): UseDashboardResult`
- `isActiveCurrent=true` → `GET /actual/balance` (existing Phase 4 endpoint)
- `isActiveCurrent=false && periodId!=null` → `GET /periods/{id}/balance` (new Phase 5)
- `periodId=null && !isActiveCurrent` → no fetch, `balance: null`
- Cancellation flag pattern, re-fetches on `periodId`/`isActiveCurrent` change
- `fetchBalance` wrapped in `useCallback` to stabilize `useEffect` deps

## Hook Signatures for Plan 05-04 Consumers

```typescript
// HeroCard, AggrStrip consumers:
import { useDashboard } from '../hooks/useDashboard';
// { balance: BalanceResponse | null, loading, error, refetch }
const { balance, loading, error } = useDashboard(periodId, isActiveCurrent);

// PeriodSwitcher consumer:
import { usePeriods } from '../hooks/usePeriods';
// { periods: PeriodRead[], loading, error, refetch }
const { periods, loading } = usePeriods();

// Money formatting in DashboardCategoryRow, HeroCard, AggrStrip:
import { formatKopecks, formatKopecksWithSign, formatKopecksWithCurrency } from '../utils/format';
```

## Commits

| Task | Commit | Description |
|---|---|---|
| Task 1 | `d6cab0a` | feat(05-03): add central money formatting utilities in utils/format.ts |
| Task 2 | `921a30d` | feat(05-03): add periods API client and usePeriods hook |
| Task 3 | `a37d849` | feat(05-03): add useDashboard hook with active/archive endpoint switching |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan creates data layer utilities only (no UI rendering with placeholder data).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Client-side only changes; security reviewed per threat register (T-05-12 through T-05-15 in plan).

## TypeScript Compilation

```
$ tsc --noEmit
EXIT: 0  (no errors)
```

## Self-Check: PASSED

- `frontend/src/utils/format.ts` — FOUND
- `frontend/src/api/periods.ts` — FOUND
- `frontend/src/hooks/usePeriods.ts` — FOUND
- `frontend/src/hooks/useDashboard.ts` — FOUND
- Commit `d6cab0a` — FOUND
- Commit `921a30d` — FOUND
- Commit `a37d849` — FOUND
- TypeScript: EXIT 0 — PASSED
