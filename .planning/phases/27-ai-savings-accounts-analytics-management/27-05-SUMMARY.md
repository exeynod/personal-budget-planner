---
phase: 27-ai-savings-accounts-analytics-management
plan: 05
subsystem: web-analytics
tags: [react, typescript, vitest, analytics, bar-chart, segmented, top-categories]
requirements: [ANAL-V10-01, ANAL-V10-02, ANAL-V10-03, ANAL-V10-04]
dependency_graph:
  requires:
    - "Phase 8 backend `/analytics/*` endpoints (existing)"
    - "Phase 25-03 v10 API surface (`listCategoriesV10`, `listActualV10`)"
    - "Phase 26-04 PlanView shape patterns (compute split, Mount/View)"
  provides:
    - "AnalyticsMount + AnalyticsView ready for wire from Mgmt hub `03 АНАЛИТИКА` (plan 27-06)"
    - "fetchTopCategories typed wrapper (re-exported from `api/v10`)"
    - "8 pure compute helpers (lastNMonths/groupActuals*/computeKPI*/shouldHighlightRed/computePct)"
  affects:
    - "frontend/src/api/v10/index.ts (append-only export of fetchTopCategories + types)"
tech_stack:
  added: []
  patterns:
    - "Mount + View + compute split (Plan 26 pattern)"
    - "SVG bar-chart with conditional `.barRed` class for ≥75% threshold"
    - "Cancellation guard via `cancelled` closure flag on useEffect cleanup (T-27-05-02)"
key_files:
  created:
    - "frontend/src/api/v10/analytics.ts"
    - "frontend/src/screensV10/Analytics/AnalyticsView.tsx"
    - "frontend/src/screensV10/Analytics/AnalyticsView.module.css"
    - "frontend/src/screensV10/Analytics/AnalyticsMount.tsx"
    - "frontend/src/screensV10/Analytics/computeAnalytics.ts"
    - "frontend/src/screensV10/Analytics/__tests__/computeAnalytics.test.ts"
    - "frontend/src/screensV10/Analytics/__tests__/AnalyticsView.test.tsx"
    - "frontend/src/screensV10/Analytics/__tests__/AnalyticsMount.test.tsx"
    - "frontend/src/screensV10/Analytics/index.ts"
  modified:
    - "frontend/src/api/v10/index.ts (append fetchTopCategories + TopCategoryItem export)"
decisions:
  - "Period segmented chips map to backend `range='1M'` (per-period query deferred to Phase 28). Mount resolves period_id by `period_start.slice(0,7)` prefix-match against `listPeriods()` to honour the chip selection for actuals/KPI delta."
  - "Top-categories backend wire shape (`{name, actual_cents, planned_cents}`) is normalised in the v10 wrapper to `{category_name, sum_cents, plan_cents, pct_of_plan}` for symmetry with iOS sister API and the local `groupActualsByCategory` shape."
  - "`shouldHighlightRed` + `computePct` guard `plan <= 0` (T-27-05-03) so the bar chart never renders NaN heights or div-by-zero pct labels."
  - "View is router-agnostic — all interactions are passed as callbacks, mirroring Plan/Subscriptions pattern. Mount handles `usePosterRouter` integration."
metrics:
  duration_minutes: 7
  completed: 2026-05-10
  tasks_completed: 3
  files_changed: 9
  tests_added: 54
  commits:
    - "4069a2f test(27-05): RED — computeAnalytics helpers tests"
    - "1c594f6 feat(27-05): GREEN — analytics helpers + top-categories wrapper"
    - "1b0f4bd feat(27-05): AnalyticsView (cream poster) + 20 tests"
    - "cfb075f feat(27-05): AnalyticsMount + barrel + smoke tests"
---

# Phase 27 Plan 05: Web Analytics Rewrite Summary

Web Analytics screen rewrite в poster style — cream фон, Mass italic «Месяц.»,
segmented period chips (МАР/АПР/МАЙ), 2 KPI plates (тёмная «ПОТРАЧЕНО» с
delta + жёлтая «СЭКОНОМЛЕНО»), segmented group-mode (ДЕНЬ/НЕД./КАТ.), SVG
bar-chart с red highlight ≥75% от плана, top-5 categories список через
`/analytics/top-categories`. Backend без изменений (Phase 8 endpoints).

## Implementation Approach

Three-layer split mirroring Phase 26 PlanView pattern:

1. **`computeAnalytics.ts`** — 8 pure helpers, all deterministic / side-effect-free,
   100% unit-tested (30 cases). Helpers: `lastNMonths(now, n)` (RU month chip
   labels), `groupActualsByDay/Week/Category` (bar-chart bucketing), `computeKPISpent`
   (current vs prev expense delta), `computeKPISaved` (Σ positive plan-fact
   remainders, skipping system `savings` code + paused), `shouldHighlightRed`
   (≥75% gate with div-by-zero guard), `computePct` (clamped 0..100).

2. **`AnalyticsView.tsx`** — pure presenter (router-agnostic). Composition:
   ← НАЗАД + Eyebrow «ANALYTICS · МЕСЯЦ» + Mass italic «Месяц.» + 3 period
   chips + 2 KPI plates + 3 group-mode chips + SVG bar-chart + top-5 list.
   Loading + error subviews. 20 RTL tests cover: chip selection callbacks,
   KPI rendering, bar-red highlighting, top-5 capping at 5, lifecycle
   subviews, back-button.

3. **`AnalyticsMount.tsx`** — data glue. Parallel fetch (`listCategoriesV10`,
   `listPeriods`, `fetchTopCategories('1M', 5)`), then sequential
   `listActualV10(periodId)` for current + prev periods (KPI delta).
   Cancellation guard on cleanup (T-27-05-02). Bar data shape switches per
   group mode. 4 smoke tests via `vi.mock` cover: loading, transition, error
   surface, period-chip refetch.

## API Constraint Adaptation (Rule 3 deviation)

The plan draft assumed the backend `top-categories` endpoint accepted
`?period_start=...&period_end=...`. Reading `app/api/routes/analytics.py`
showed the endpoint actually takes only `range='1M'|'3M'|'6M'|'12M'`. The
v10 wrapper (`fetchTopCategories`) maps to `range='1M'` and the Mount
resolves the per-period actuals/prev-actuals via `listPeriods()` +
month-prefix match. The visual contract is unaffected; the per-period
top-categories query is a Phase 28 polish item.

## Wire-Shape Normalisation

Backend `TopCategoriesResponse.items` items are `{category_id, name,
actual_cents, planned_cents}`. The v10 wrapper normalises to
`{category_id, category_name, sum_cents, plan_cents, pct_of_plan}` (computed
clamp). This keeps the View prop shape symmetric with the iOS sister
`TopCategoryItem` (plan 27-05-ios) and with the `groupActualsByCategory`
fallback bar data.

## Threat Coverage

| Threat ID | Disposition | Mitigation realised |
|-----------|-------------|---------------------|
| T-27-05-01 | accept | Tenant scope enforced server-side (RLS via `get_db_with_tenant_scope` dep on `/analytics/*`). |
| T-27-05-02 | mitigate | `let cancelled = false` flag in useEffect; cleanup sets `cancelled = true` so stale fetches don't update state on rapid month-switch. |
| T-27-05-03 | mitigate | `shouldHighlightRed(barSum, barPlan)` returns `false` when `barPlan <= 0`; `computePct(sum, plan)` returns `0` when `plan <= 0`. Both branches unit-tested. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Adapted to actual backend API surface**
- **Found during:** Task 1 (reading `app/api/routes/analytics.py`)
- **Issue:** Plan draft assumed `/analytics/top-categories?period_start=...&period_end=...` query shape; backend takes only `range='1M'|...|'12M'`. Plan also assumed `listActualV10(period_start, period_end)` shape; backend wrapper takes `listActualV10(periodId)`.
- **Fix:** v10 wrapper calls `range='1M'`; Mount calls `listPeriods()` and matches by month-prefix to resolve `periodId` for the selected chip. Documented in Mount header comment + this Summary.
- **Files modified:** `frontend/src/api/v10/analytics.ts`, `frontend/src/screensV10/Analytics/AnalyticsMount.tsx`
- **Commits:** `1c594f6`, `cfb075f`

**2. [Rule 2 - Critical] Cancellation guard added to refetch effect**
- **Found during:** Task 3
- **Issue:** Without the cancellation flag, rapid period-chip switching causes a stale fetch to land in `setState` after a newer fetch — UI flickers between data sets.
- **Fix:** Standard `let cancelled = false` closure flag; cleanup sets `cancelled = true`; every `setState` checks the flag before applying. Mirrors PlanMount / SavingsMount pattern.
- **Files modified:** `frontend/src/screensV10/Analytics/AnalyticsMount.tsx`
- **Commits:** `cfb075f`
- **Threat tied:** T-27-05-02.

## Verification Evidence

- `npx tsc --noEmit` — clean (0 errors).
- `npm test -- screensV10/Analytics --run` — **54 / 54 pass** (3 test files).
- Full frontend suite (`npm test --run`) — Analytics scope clean. 1 unrelated
  failure in `SavingsMount.test.tsx` belongs to sibling agent's plan 27-03 work
  (out of scope for 27-05; logged as deferred).
- Keyword grep contracts:
  - `grep -c "Месяц\|ПОТРАЧЕНО\|СЭКОНОМЛЕНО\|ДЕНЬ\|НЕД\|КАТ" AnalyticsView.tsx` → **16** (≥5 required).
  - `grep -c "fetchTopCategories\|listActualV10\|listCategoriesV10\|lastNMonths" AnalyticsMount.tsx` → **14** (≥3 required).

## Out-of-Scope / Deferred

- Per-period `top-categories` query (Phase 28 — backend would need
  `?period_start` / `?period_end` accepted on `/analytics/top-categories`).
- Wire mount into `V10MainShell` Mgmt-hub `03 АНАЛИТИКА` row → plan 27-06.
- iOS sister Analytics screen → plan 27-05-ios (parallel agent).
- Sibling agent's `SavingsMount.test.tsx` failure (BigFig NBSP fmt assertion
  mismatch) — belongs to plan 27-03 scope.

## Self-Check: PASSED

Files (all FOUND):
- `frontend/src/screensV10/Analytics/computeAnalytics.ts` — FOUND
- `frontend/src/screensV10/Analytics/AnalyticsView.tsx` — FOUND
- `frontend/src/screensV10/Analytics/AnalyticsView.module.css` — FOUND
- `frontend/src/screensV10/Analytics/AnalyticsMount.tsx` — FOUND
- `frontend/src/screensV10/Analytics/index.ts` — FOUND
- `frontend/src/screensV10/Analytics/__tests__/computeAnalytics.test.ts` — FOUND
- `frontend/src/screensV10/Analytics/__tests__/AnalyticsView.test.tsx` — FOUND
- `frontend/src/screensV10/Analytics/__tests__/AnalyticsMount.test.tsx` — FOUND
- `frontend/src/api/v10/analytics.ts` — FOUND

Commits (all FOUND in `git log`):
- `4069a2f` — FOUND
- `1c594f6` — FOUND
- `1b0f4bd` — FOUND
- `cfb075f` — FOUND
