---
phase: 03-plan-template-and-planned-transactions
plan: 05
subsystem: ui
tags: [react, typescript, vite, telegram-mini-app, planned-transactions, apply-template, snapshot, css-modules]

# Dependency graph
requires:
  - phase: 02-onboarding-and-categories
    provides: useCategories hook, apiFetch + ApiError + initData injection, design tokens (tokens.css), screen-as-state routing in App.tsx, PeriodRead type
  - phase: 03-plan-template-and-planned-transactions (Plan 03-03)
    provides: REST endpoints — GET /periods/current, GET /periods/{id}/planned, POST /periods/{id}/planned, POST /periods/{id}/apply-template, PATCH /planned/{id}, DELETE /planned/{id}; PlannedRead/Create/Update + ApplyTemplateResponse schemas
  - phase: 03-plan-template-and-planned-transactions (Plan 03-04)
    provides: PlanRow (with subscription_auto read-only branch), BottomSheet, PlanItemEditor (4-mode), useTemplate hook, snapshotFromPeriod() in templates.ts, App.tsx 'planned' placeholder route
provides:
  - planned.ts API client (5 functions — list/create/update/delete/applyTemplate)
  - useCurrentPeriod hook (404 → period: null, onboarding-incomplete signal)
  - usePlanned hook (periodId: number | null skip-fetch branch)
  - PlannedScreen (group-by-kind→category, sketch 005-B; apply-template + snapshot actions; subscription_auto read-only via existing PlanRow branch)
  - DEV-only window.__injectMockPlanned__ helper for PLN-03 visual verification (D-37)
affects: [03-06 acceptance checkpoint, 04-actual-transactions, 06-subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skip-fetch hook pattern: usePlanned(periodId: number | null) returns empty rows with loading=false when periodId is null — used to gate planned-transactions fetch on period-existence (onboarding state)"
    - "404-as-null hook pattern: useCurrentPeriod converts ApiError(status=404) to period: null instead of error — distinguishes 'no period yet' from real fetch failures"
    - "DEV-only global helper via useEffect + import.meta.env.DEV guard + cleanup: tree-shaken in prod, stays out of mockRows POST/PATCH paths so mock data never leaves local state (T-03-23 + T-03-24 mitigation)"
    - "Mock-merge for visual verification: realRows + mockRows combined only in render (allRows useMemo); mutation handlers operate on real rows only — keeps DEV affordance from corrupting backend state"

key-files:
  created:
    - frontend/src/api/planned.ts
    - frontend/src/hooks/useCurrentPeriod.ts
    - frontend/src/hooks/usePlanned.ts
    - frontend/src/screens/PlannedScreen.tsx
    - frontend/src/screens/PlannedScreen.module.css
  modified:
    - frontend/src/App.tsx (replaced 'planned' placeholder with <PlannedScreen>; passes onNavigateToTemplate)

key-decisions:
  - "404 on GET /periods/current → period: null (not error) — separates 'onboarding incomplete' UX branch from genuine API failures; useCurrentPeriod owns this conversion so callers stay simple"
  - "usePlanned accepts `periodId: number | null` and skips fetching when null — caller doesn't need a separate gate; loading defaults to false when no period"
  - "DEV-only window.__injectMockPlanned__ kept inside PlannedScreen useEffect (not in App.tsx or a global module) — scoped to the screen that actually renders the data; auto-cleared on unmount; tree-shaken via import.meta.env.DEV"
  - "mockRows merged with realRows only at render-time (useMemo allRows); all mutation handlers (createPlanned/updatePlanned/deletePlanned/applyTemplate/snapshotFromPeriod) operate on real period state only — guarantees mock data cannot accidentally POST to backend (T-03-24)"
  - "Apply-template button gated on `realRows.length === 0 && templateItems.length > 0` — mockRows do not affect visibility (uses realRows, not allRows); empty-state placeholder offered when both are empty (with optional Template-screen link)"
  - "PlannedScreen reuses CLOSED_SHEET sentinel pattern from TemplateScreen — minor consistency improvement for sheet-state resets"
  - "Sub-header period label uses Russian locale `toLocaleDateString` with `month: 'long'` for the year header and `day/month: 'short'` for the range — matches sketch 005-B copy ('Февраль 2026 · 5 фев — 4 мар')"

patterns-established:
  - "DEV-mock-injection helper: useEffect under import.meta.env.DEV sets window.__name__; cleanup deletes it. Mock data lives in local state and is merged only into render-derived collections."
  - "Period-aware hook composition: useCurrentPeriod (returns period | null) + usePlanned(period?.id ?? null) — chained without conditional hook calls; downstream UI handles loading/null branches explicitly."
  - "Toast helper: setToast(msg) + setTimeout(setToast(null), 2200) — minimal pattern, no library; positioned with safe-bottom inset."

requirements-completed:
  - PLN-01
  - PLN-02
  - PLN-03
  - TPL-03
  - TPL-04

# Metrics
duration: ~7 min
completed: 2026-05-03
---

# Phase 3 Plan 05: PlannedScreen + planned API/hooks + PLN-03 mock helper Summary

**PlannedScreen with apply-template and snapshot-to-template actions, period-aware data hooks, and a DEV-only window.__injectMockPlanned__ helper that lets PLN-03 «🔁 Подписка» badge render before Phase 6 lands real subscription data.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-03T03:23:13Z (UTC)
- **Completed:** 2026-05-03T03:29:06Z (UTC)
- **Tasks:** 2 / 2
- **Files modified:** 6 (5 created + 1 modified)

## Accomplishments

- **PLN-01..03 + TPL-03/04 fully wired end-to-end** through the Mini App against the Plan 03-03 backend: list/create/update/delete planned-transactions, apply-template (idempotent — D-31), snapshot-from-period (destructive overwrite — D-32, window.confirm-guarded — D-39).
- **PlannedScreen** uses the reusable PlanRow / BottomSheet / PlanItemEditor primitives from Plan 03-04 unchanged — including PlanRow's existing `source === 'subscription_auto'` read-only branch — so PLN-03 visual rendering needed zero new component code, only the data path (mock injection helper).
- **Apply-template UX (D-38)** gated on real rows (`realRows.length === 0 && templateItems.length > 0`); when both plan and template are empty, an explanatory message links to the Template screen (`onNavigateToTemplate` prop).
- **DEV-only `window.__injectMockPlanned__`** lets a developer paste a mock subscription_auto row from the browser console and immediately see the «🔁 Подписка» badge render — exactly the verification path described in 03-UI-SPEC §Acceptance.2 step 5. Helper is scoped inside the screen's useEffect, cleaned on unmount, and tree-shaken in prod.
- **Onboarding-incomplete state handled gracefully** via useCurrentPeriod's 404 → `period: null` conversion; PlannedScreen renders a "Сначала завершите onboarding" message instead of erroring.

## Task Commits

Each task was committed atomically with `--no-verify`:

1. **Task 1: API client + hooks (planned.ts, useCurrentPeriod, usePlanned)** — `5821ed0` (feat)
2. **Task 2: PlannedScreen + DEV mock-injection helper + App.tsx wire** — `0750b9b` (feat)

**Plan metadata commit:** _(this SUMMARY.md commit; appended after self-check)_

## Files Created/Modified

### Created (5)
- `frontend/src/api/planned.ts` — 5 REST functions: `listPlanned`, `createPlanned`, `updatePlanned`, `deletePlanned`, `applyTemplate`
- `frontend/src/hooks/useCurrentPeriod.ts` — `{ period, loading, error, refetch }` hook; converts 404 to `period: null`
- `frontend/src/hooks/usePlanned.ts` — `{ rows, loading, error, refetch }` hook; accepts `periodId: number | null` (null → skip fetch)
- `frontend/src/screens/PlannedScreen.tsx` — group-by-kind→category, apply-template + snapshot actions, mock-injection helper, BottomSheet/PlanItemEditor wired for create/edit-planned modes
- `frontend/src/screens/PlannedScreen.module.css` — header / actions row / kind-group / category-group / empty / toast styles (no new design tokens)

### Modified (1)
- `frontend/src/App.tsx` — `'planned'` route now renders `<PlannedScreen onBack=… onNavigateToTemplate=… />` instead of the Plan 03-04 placeholder; import added

## Decisions Made

- **404-as-null in useCurrentPeriod**: GET `/periods/current` returns 404 if onboarding hasn't been completed; converting to `period: null` keeps the caller branch-free (just check `if (!period)` for the empty UX) and reserves the `error` channel for genuine failures (network, 5xx).
- **periodId-nullable usePlanned**: rather than make the caller skip rendering when period is null, the hook itself accepts `null` and short-circuits with empty rows + loading=false. Mirror to useCurrentPeriod's pattern.
- **Mock helper scoped to PlannedScreen, not App.tsx**: only the screen that renders planned-transactions needs the helper; mounting it on the App level would require always-loaded screen state. The useEffect+cleanup approach also auto-clears the global when the user navigates away.
- **Mock data isolated from mutation paths**: `mockRows` lives in PlannedScreen state and is only merged into `allRows` (a useMemo) for rendering. Every handler — `handleApplyTemplate`, `handleSnapshot`, `handleAmountSave`, `handleSave`, `handleDelete` — operates on `realRows`, the period, or `sheet.item` (which only ever points to backend-fetched rows). T-03-24 mitigation is structural, not just a comment.
- **Apply-template button uses `realRows`, not `allRows`**: a mock row would otherwise hide the button unintentionally; using `realRows.length === 0` keeps the action visible while devs experiment with mocks.
- **CLOSED_SHEET sentinel**: copied from TemplateScreen to avoid the `{ open: false, mode: 'create-planned' }` literal sprinkled through close-handlers.

## Deviations from Plan

None — plan executed exactly as written. The Plan 03-04 deviation already centralised `Window.Telegram.WebApp` typing in `api/client.ts`, so this plan needed no further global-typing fixes. All five files compiled clean on first attempt.

**Note on TDD attribute:** Plan was tagged `tdd="true"` per the planner's standard, but Phase 3 carries `D-22` from Phase 2 — no frontend test infrastructure exists, and the plan's verification gates are TS-check + Vite build (which doubles as a smoke test of the entire module graph). Both gates exit 0 on first run. This matches Plan 03-04's execution profile (also `tdd="true"` without dedicated tests).

## Issues Encountered

None. The reusable primitives from Plan 03-04 dropped in cleanly; the PlanRow's existing `source === 'subscription_auto'` branch meant PLN-03 needed only a data path (mock-injection helper), not a component change.

## Known Stubs

- **`window.__injectMockPlanned__`** (PlannedScreen.tsx) — DEV-only helper, intentional per D-37. Phase 3 has no real subscription_auto data path (subscriptions land in Phase 6); this helper exists explicitly so the «🔁 Подписка» badge can be visually verified during 03-06 acceptance checkpoint via `window.__injectMockPlanned__({ id: -1, period_id: <id>, kind: 'expense', amount_cents: 99000, description: 'YouTube Premium', category_id: <id>, planned_date: '2026-02-10', source: 'subscription_auto', subscription_id: 1 })` in the browser console. Stub is tree-shaken in prod via `import.meta.env.DEV` guard and removed in Phase 6 once real subscription_auto rows arrive from the worker.

## User Setup Required

None — no environment variables, dashboard configuration, or external services touched in this plan.

## Next Phase Readiness

**Ready for Plan 03-06 (acceptance checkpoint):**

All 9 manual verification steps from `.planning/phases/03-plan-template-and-planned-transactions/03-UI-SPEC.md` Acceptance.3 are now executable end-to-end:
1. Setup (post-onboarding) — already covered Phase 2
2. Создать template — TemplateScreen (Plan 03-04)
3. Apply template к пустому периоду — PlannedScreen (this plan, action button D-38)
4. Idempotency check (DevTools fetch) — backend Plan 03-03 D-31 + UI refetch
5. Edit planned inline — PlanRow inline-edit (Plan 03-04) + handleAmountSave (this plan)
6. Add manual planned via BottomSheet — handleSave create-planned mode (this plan)
7. Snapshot template from period — handleSnapshot + window.confirm (this plan, D-39)
8. PLN-03 mock badge — `window.__injectMockPlanned__` helper (this plan)
9. Refresh → mock-strings disappear — mockRows is local state, no persistence (this plan)

**No blockers.** Backend (Plan 03-03), reusable components (Plan 03-04), and PlannedScreen + helpers (this plan) cover the full Phase 3 surface; 03-06 is purely human-verification.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| (none) | — | All Phase 3 mitigations from the plan's `<threat_model>` (T-03-23..T-03-27) are addressed structurally: import.meta.env.DEV guard + cleanup on the mock helper (T-03-23), mockRows isolation from mutation paths (T-03-24), busy-flag reentry guard (T-03-25), window.confirm before snapshot (T-03-26). T-03-27 (server-side guard for subscription_auto PATCH) is enforced by Plan 03-02 backend service. No new trust boundaries or attack surface introduced by this plan beyond what was modelled. |

## Self-Check: PASSED

Verified files exist:
- FOUND: `frontend/src/api/planned.ts`
- FOUND: `frontend/src/hooks/useCurrentPeriod.ts`
- FOUND: `frontend/src/hooks/usePlanned.ts`
- FOUND: `frontend/src/screens/PlannedScreen.tsx`
- FOUND: `frontend/src/screens/PlannedScreen.module.css`
- FOUND: `frontend/src/App.tsx` (modified — `'planned'` route now renders `<PlannedScreen>`)

Verified commits exist on branch:
- FOUND: `5821ed0` (Task 1)
- FOUND: `0750b9b` (Task 2)

Verified gates:
- `cd frontend && npx tsc --noEmit` → exit 0
- `cd frontend && npm run build` (tsc -b && vite build) → exit 0, 231 kB JS / 20.64 kB CSS

---
*Phase: 03-plan-template-and-planned-transactions*
*Completed: 2026-05-03*
