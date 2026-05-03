---
phase: 03-plan-template-and-planned-transactions
plan: 04
subsystem: ui
tags: [react, typescript, vite, telegram-mini-app, bottom-sheet, css-modules]

# Dependency graph
requires:
  - phase: 02-onboarding-and-categories
    provides: useCategories hook, CategoryRow inline-edit pattern, apiFetch + initData injection, design tokens (tokens.css), screen-as-state routing in App.tsx
  - phase: 03-plan-template-and-planned-transactions (Plan 03-03)
    provides: REST endpoints /api/v1/template/items (CRUD) + /api/v1/template/snapshot-from-period/{id}; PlannedRead/TemplateItemRead Pydantic schemas
provides:
  - Phase 3 frontend types (PlanSource, TemplateItemRead/Create/Update, PlannedRead/Create/Update, ApplyTemplateResponse, SnapshotFromPeriodResponse)
  - templates.ts API client (5 functions)
  - useTemplate hook
  - BottomSheet reusable primitive (Phase 4 add-actual-transaction will reuse)
  - PlanItemEditor universal form (4 modes: create/edit × template/planned)
  - PlanRow shared row (inline-edit + open-editor; subscription_auto read-only branch for PLN-03)
  - TemplateScreen (group-by-kind → group-by-category, sketch 005-B)
  - HomeScreen + App.tsx routing extended for 'template' and 'planned' screens
affects: [03-05 PlannedScreen, 03-06 acceptance checkpoint, 04-actual-transactions, 06-subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BottomSheet reusable primitive (CSS transform animation, Telegram BackButton + Esc keydown lifecycle in useEffect)"
    - "Discriminated-union PlanRowItem ({ kind: 'template' | 'planned', row: ... }) for shared row component across two screens"
    - "Discriminated-mode editor (create-template | edit-template | create-planned | edit-planned) — single PlanItemEditor handles all four flows"
    - "Per-screen `wrap()` helper that mirrors CategoriesScreen — captures errors, then refetches"
    - "Window.Telegram.WebApp typing centralised in api/client.ts to avoid composite-tsc augmentation conflicts"

key-files:
  created:
    - frontend/src/api/templates.ts
    - frontend/src/hooks/useTemplate.ts
    - frontend/src/components/BottomSheet.tsx
    - frontend/src/components/BottomSheet.module.css
    - frontend/src/components/PlanItemEditor.tsx
    - frontend/src/components/PlanItemEditor.module.css
    - frontend/src/components/PlanRow.tsx
    - frontend/src/components/PlanRow.module.css
    - frontend/src/screens/TemplateScreen.tsx
    - frontend/src/screens/TemplateScreen.module.css
  modified:
    - frontend/src/api/types.ts (added 9 Phase 3 type exports)
    - frontend/src/api/client.ts (added BackButton to Window.Telegram.WebApp typing — Rule 1 fix)
    - frontend/src/components/BottomSheet.tsx (removed local declare-global; uses canonical typing from client.ts)
    - frontend/src/screens/HomeScreen.tsx (4 nav buttons; onNavigate union extended)
    - frontend/src/screens/HomeScreen.module.css (nav row wraps to 2x2 grid)
    - frontend/src/App.tsx (Screen union extended with 'template' | 'planned'; 'template' wired to TemplateScreen, 'planned' inline placeholder until Plan 03-05)

key-decisions:
  - "Single TS-augmentation site for window.Telegram.WebApp (api/client.ts) — avoids TS2717 collision under composite tsc -b when multiple files declare partial Window types"
  - "PlanItemEditor mode is a flat union (4 string literals) instead of nested discriminator — simpler ternaries in render; isTemplate / isEdit derived booleans keep render logic readable"
  - "PlanRow lives in components/ (not screens/template/) and accepts a discriminated PlanRowItem so Plan 03-05 can drop it into PlannedScreen without duplication"
  - "App.tsx 'planned' screen rendered inline as placeholder (not a separate file) — keeps the Screen union exhaustive without speculatively scaffolding PlannedScreen.tsx that Plan 03-05 will own"
  - "HomeScreen.module.css uses flex-wrap + flex-basis calc(50% - 4px) for 2x2 grid — minimal CSS change, no new tokens"

patterns-established:
  - "Reusable BottomSheet: subscribe to BackButton + keydown only when open; cleanup on close/unmount (T-03-20 mitigation)"
  - "Editor confirm-on-delete: window.confirm wrapper inside PlanItemEditor.handleDelete (T-03-21)"
  - "Inline-edit amount: parse rubles → kopecks via shared helper; no-op on parse failure or unchanged value (preserves CategoryRow ergonomics)"
  - "wrap() helper in screens — single try/catch + refetch boundary; mirrors CategoriesScreen.wrap"

requirements-completed:
  - TPL-01
  - TPL-02

# Metrics
duration: ~5 min
completed: 2026-05-03
---

# Phase 3 Plan 04: TemplateScreen + reusable BottomSheet/PlanItemEditor/PlanRow Summary

**TemplateScreen with group-by-category layout (sketch 005-B), inline-edit amount, and a reusable BottomSheet+PlanItemEditor stack that Plan 03-05 PlannedScreen and Phase 4 add-actual will share.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-03T03:18:56Z (UTC)
- **Completed:** 2026-05-03T03:23:04Z (UTC)
- **Tasks:** 3 / 3
- **Files modified:** 16 (10 created + 6 modified)

## Accomplishments

- TPL-01 + TPL-02 fully wired end-to-end: list/create/update/delete template items through Telegram Mini App against the Plan 03-03 backend, with both inline-edit (amount only) and full-editor (BottomSheet) flows.
- Built 3 reusable frontend primitives that Plan 03-05 (PlannedScreen) and Phase 4 (add-actual sketch 002-B) will pick up unchanged: BottomSheet, PlanItemEditor (4-mode), PlanRow (discriminated template/planned union; subscription_auto read-only branch already present for PLN-03).
- Resolved a TypeScript composite-build collision (TS2717) between two `declare global` augmentations of `window.Telegram.WebApp` — centralised the typing in `api/client.ts`, which is now the single source of truth for Telegram WebApp shape.
- HomeScreen + App.tsx extended for two new screens (`template`, `planned`) without breaking existing onboarding/categories/settings navigation.

## Task Commits

Each task was committed atomically with `--no-verify`:

1. **Task 1: TS types + API client + useTemplate hook** — `f1565f5` (feat)
2. **Task 2: BottomSheet + PlanItemEditor + PlanRow components** — `4f6db08` (feat)
3. **Task 3: TemplateScreen + integrate into App.tsx + HomeScreen** — `1d825ac` (feat, includes Rule 1 deviation fix)

## Files Created/Modified

### Created (10)
- `frontend/src/api/templates.ts` — 5 REST functions (list/create/update/delete + snapshotFromPeriod)
- `frontend/src/hooks/useTemplate.ts` — `{ items, loading, error, refetch }` hook (mirrors useCategories)
- `frontend/src/components/BottomSheet.tsx` — slide-up modal with backdrop + Telegram BackButton/Esc
- `frontend/src/components/BottomSheet.module.css` — backdrop + sheet animation, safe-bottom inset
- `frontend/src/components/PlanItemEditor.tsx` — universal create/edit form (4 modes)
- `frontend/src/components/PlanItemEditor.module.css` — form fields + footer (delete left, cancel/save right)
- `frontend/src/components/PlanRow.tsx` — discriminated PlanRowItem (template | planned), inline-edit + open-editor + subscription_auto read-only
- `frontend/src/components/PlanRow.module.css` — 2-zone (amount / meta), badge styles
- `frontend/src/screens/TemplateScreen.tsx` — group-by-kind → group-by-category, sketch 005-B
- `frontend/src/screens/TemplateScreen.module.css` — header, kind/category headings, dashed "+ add" button

### Modified (6)
- `frontend/src/api/types.ts` — added PlanSource, TemplateItemRead/Create/Update, SnapshotFromPeriodResponse, PlannedRead/Create/Update, ApplyTemplateResponse (9 new exports)
- `frontend/src/api/client.ts` — augmented Window.Telegram.WebApp with BackButton typing (Rule 1 fix; canonical site for Telegram WebApp shape)
- `frontend/src/components/BottomSheet.tsx` — removed duplicate `declare global` block; relies on canonical typing in client.ts
- `frontend/src/screens/HomeScreen.tsx` — 4 nav buttons (Категории, Шаблон, План, Настройки); onNavigate union extended
- `frontend/src/screens/HomeScreen.module.css` — `.nav` flex-wrap + `.navBtn` flex-basis calc(50% - 4px) for 2x2 grid
- `frontend/src/App.tsx` — Screen union extended; 'template' → TemplateScreen, 'planned' → inline placeholder (Plan 03-05 will replace)

## Decisions Made

- **Centralise Window.Telegram.WebApp typing in api/client.ts**: rather than each component re-declaring partial globals (which collides under composite `tsc -b`), client.ts hosts the full shape including BackButton. New primitives just import — no global re-declarations.
- **Inline placeholder for 'planned' screen** in App.tsx instead of scaffolding PlannedScreen.tsx now: keeps the Screen union exhaustive for TS without speculating about Plan 03-05 internals. Placeholder is < 10 lines and trivially deleted by Plan 03-05.
- **Disabled "+ Строка" button when categories.length === 0**: prevents opening the editor with an empty `<select>` (would let user submit an invalid category_id which the backend would 422 reject) — better UX than a hidden 422.
- **Sort_order omitted from create payload when not user-specified**: backend D-36 assigns auto sort_order; sending `sort_order: 0` would override that. The TemplateItemCreatePayload type allows omission via `?:`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2717 'Subsequent property declarations must have the same type' under composite tsc -b**

- **Found during:** Task 3 — `npm run build` (which runs `tsc -b && vite build`) failed even though `npx tsc --noEmit` passed in isolation.
- **Issue:** `BottomSheet.tsx` introduced its own `declare global { interface Window { Telegram?: { WebApp?: { BackButton?: TgBackButton } } } }` block. `api/client.ts` already had a richer declaration (with MainButton, initData, openTelegramLink, ready). Composite-mode tsc enforces structural compatibility across module-augmentation sites; the two partial shapes collided because each was missing fields the other had. Result: TS2717 + downstream TS2339 ("Property 'BackButton' does not exist on type ...").
- **Fix:** Added the `BackButton` shape to the canonical declaration in `api/client.ts`; removed the duplicate `declare global` block from `BottomSheet.tsx` (added an explanatory comment in its place). Now there is exactly one Window.Telegram.WebApp augmentation site in the codebase.
- **Files modified:** `frontend/src/api/client.ts`, `frontend/src/components/BottomSheet.tsx`
- **Verification:** `cd frontend && npx tsc --noEmit` exit=0 + `npm run build` exit=0 (vite produces 223 kB JS / 17.8 kB CSS).
- **Committed in:** `1d825ac` (folded into Task 3 commit; documented in commit body).

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix essential — composite TS build is the production gate (Vite calls `tsc -b`). Pattern of single-site Window typing is now the canonical approach for any future component that needs WebApp APIs (e.g. `HapticFeedback`, `MainButton` from Phase 4). No scope creep.

## Issues Encountered

None beyond the deviation above. Backend (Plan 03-03) endpoints already shipped; types & API client mirror Pydantic schemas line-for-line. No CSS token additions required — `tokens.css` already provided every variable referenced (`--safe-bottom`, `--shadow-lg`, `--radius-lg`, etc.).

## User Setup Required

None — no environment variables, dashboard configuration, or external services touched in this plan.

## Next Phase Readiness

**Ready for Plan 03-05 (PlannedScreen):**
- `PlanRow` already accepts `{ kind: 'planned', row: PlannedRead }` and renders `subscription_auto` as read-only with `🔁 Подписка` badge — Plan 03-05 only needs to wire the data hook + create-planned mutation.
- `PlanItemEditor` already supports `create-planned` and `edit-planned` modes with `planned_date` input and optional `periodBounds` for min/max.
- `BottomSheet` is ready as-is.
- `App.tsx` placeholder for `'planned'` screen is a 7-line stub — Plan 03-05 swap is mechanical.

**Plan 03-05 outstanding work:**
- Implement `PlannedScreen.tsx` + `useCurrentPeriod` + `usePlanned` + `api/planned.ts` + apply-template / snapshot action buttons (D-38, D-39).
- Replace App.tsx `'planned'` placeholder with the real screen.
- DEV-only `window.__injectMockPlanned__` helper for PLN-03 visual verification (D-37).

**No blockers.**

## Self-Check: PASSED

Verified files exist:
- FOUND: `frontend/src/api/templates.ts`
- FOUND: `frontend/src/hooks/useTemplate.ts`
- FOUND: `frontend/src/components/BottomSheet.tsx`
- FOUND: `frontend/src/components/BottomSheet.module.css`
- FOUND: `frontend/src/components/PlanItemEditor.tsx`
- FOUND: `frontend/src/components/PlanItemEditor.module.css`
- FOUND: `frontend/src/components/PlanRow.tsx`
- FOUND: `frontend/src/components/PlanRow.module.css`
- FOUND: `frontend/src/screens/TemplateScreen.tsx`
- FOUND: `frontend/src/screens/TemplateScreen.module.css`

Verified commits exist on branch:
- FOUND: `f1565f5` (Task 1)
- FOUND: `4f6db08` (Task 2)
- FOUND: `1d825ac` (Task 3)

Verified gates:
- `npx tsc --noEmit` → exit 0
- `npm run build` (tsc -b && vite build) → exit 0, 223 kB JS / 17.8 kB CSS

---
*Phase: 03-plan-template-and-planned-transactions*
*Completed: 2026-05-03*
