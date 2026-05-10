---
phase: 25-home-transactions-add-sheet
plan: 2
subsystem: ui
tags: [react, typescript, react-router, useReducer, posterRouter, posterSheet, bottomNav, vitest]

# Dependency graph
requires:
  - phase: 23-design-system-foundation
    provides: TabBar (componentsV10), .poster-slide-in-{fwd|back} keyframes, tokens (paper, black)
  - phase: 24-onboarding-4-step
    provides: Slavic plural pattern (pluralAccounts), formatRubles helper
provides:
  - usePosterRouter hook (useReducer-based stack: push/pop/popToRoot/canPop) symmetric to iOS PosterRouter
  - PosterRouterProvider + PosterRouterView (renders top-of-stack with replay-on-key animation)
  - PosterSheet web modal primitive (portal + backdrop + drag-to-close + Escape + body scroll lock)
  - BottomNavV10 wrapper around componentsV10/TabBar with isHidden gate (used while AddSheet open)
  - format helpers (formatDay / formatTimeHM / formatPeriodEyebrow / pluralDays / MONTHS_EN / MONTHS_RU_GENITIVE)
  - barrel export at frontend/src/screensV10/common/index.ts
affects:
  - 25-03-api-clients (independent)
  - 25-04-web-home-view (consumes PosterRouter + format + BottomNavV10)
  - 25-05-ios-home-view (mirrors iOS contract)
  - 25-06+ all V10 web screens (Tx registry, AddSheet) consume these primitives

# Tech tracking
tech-stack:
  added: []   # all dependencies already present (react 18, vitest, @testing-library/react)
  patterns:
    - "React useReducer + Context for navigation stack (mirror of @Observable PosterRouter on iOS)"
    - "Portal-based modal with body scroll lock + Escape gate + native PointerEvents drag-to-close"
    - "Container-scoped queries + explicit afterEach(cleanup) in component tests (no global auto-cleanup)"
    - "Hard cap MAX_STACK=16 with queue-shift on overflow (T-25-02-02 mitigation)"

key-files:
  created:
    - frontend/src/screensV10/common/format.ts
    - frontend/src/screensV10/common/PosterRouter.tsx
    - frontend/src/screensV10/common/PosterRouter.module.css
    - frontend/src/screensV10/common/PosterSheet.tsx
    - frontend/src/screensV10/common/PosterSheet.module.css
    - frontend/src/screensV10/common/BottomNavV10.tsx
    - frontend/src/screensV10/common/BottomNavV10.module.css
    - frontend/src/screensV10/common/index.ts
    - frontend/src/screensV10/common/__tests__/format.test.ts
    - frontend/src/screensV10/common/__tests__/posterRouter.test.tsx
  modified: []

key-decisions:
  - "useReducer over useSyncExternalStore for router state — simpler, sufficient for single shell, mirrors iOS @Observable contract"
  - "Stack entries identified by auto-incremented numeric id (used as React key) so animation replays on every push/pop"
  - "PosterRouterView covers absolute inset:0 — caller responsible for shell box positioning"
  - "PosterSheet uses native PointerEvents (no library) for drag-to-close: threshold 100px translation OR velocity 800px/s"
  - "PosterSheet body has touch-action:pan-y so internal scrolling works inside the sheet"
  - "BottomNavV10 is intentionally minimal wrapper — primary value is the isHidden flag for AddSheet integration"
  - "MONTHS_EN (English) used in eyebrow per prototype line 215; MONTHS_RU_GENITIVE used only in day-grouping headers"
  - "formatPeriodEyebrow uses period_number = (year-2025)*12+month per CONTEXT D-Home — May 2026 = VOL.17 (NOT VOL.05)"
  - "No PosterSheet unit-test in this plan — Playwright in 25-09 covers integration; jsdom pointer-event coverage is brittle"

patterns-established:
  - "PosterRouter API contract: stack/direction/push/pop/popToRoot/canPop — mirror this exact shape in any future router (iOS already conforms)"
  - "Provider+View split: <PosterRouterProvider root={X}> renders <PosterRouterView /> by default; pass children to interleave router-aware UI alongside (used in tests)"
  - "Animation replay pattern: wrap content in <div key={top.id} className='poster-slide-in-fwd|back'> — React remounts on key change → keyframe restarts"
  - "Body scroll lock pattern: capture document.body.style.overflow on open, restore on close + unmount (T-25-02-03)"
  - "Russian Slavic plural helpers: copy mod10/mod100 algorithm from screensV10/Onboarding/format.ts → pluralAccounts (here: pluralDays returns ДЕНЬ/ДНЯ/ДНЕЙ)"
  - "Test isolation: import { afterEach } from vitest; afterEach(cleanup) — required because src/test/setup.ts has no @testing-library/react auto-mode"

requirements-completed:
  - HOME-V10-05
  - TXN-V10-06
  - ADD-V10-01

# Metrics
duration: 8m
completed: 2026-05-10
---

# Phase 25 Plan 2: Web Routing + BottomNav Primitives Summary

**Web `screensV10/common` foundation (PosterRouter useReducer hook + PosterSheet portal modal + BottomNavV10 wrapper + day/time/period formatters) symmetric to iOS PosterRouter/PosterSheet, unblocking all Phase 25 UI plans (Home, Transactions, AddSheet).**

## Performance

- **Duration:** ~7-8 min (446s for execution + verification)
- **Started:** 2026-05-10T11:49:33Z
- **Completed:** 2026-05-10T11:56:59Z
- **Tasks:** 3 (5 commits with TDD RED/GREEN splits for Tasks 1-2)
- **Files created:** 10 (5 source + 2 CSS modules + 1 barrel + 2 test files)
- **Files modified:** 0

## Accomplishments

- usePosterRouter hook with stack semantics matching iOS PosterRouter (push/pop/popToRoot/canPop + forward/backward direction flag for asymmetric animation)
- PosterRouterView renders ONLY top-of-stack inside a `.poster-slide-in-{fwd|back}` wrapper — keyed by entry id so the keyframe replays on every navigation event
- PosterSheet web modal: portal-rendered, backdrop opacity 0.45, drag-to-close (100px translation OR 800px/s velocity), Escape key gate, body scroll lock with restoration on close + unmount
- BottomNavV10 wrapper exposing `isHidden` flag for AddSheet integration (T-N-02 acceptance: nav hidden while sheet open)
- format helpers: `formatDay` (Сегодня/Вчера/N мая), `formatTimeHM` (zero-padded HH:MM), `pluralDays` (Slavic ДЕНЬ/ДНЯ/ДНЕЙ), `formatPeriodEyebrow` (VOL.NN / MONTH YYYY · N ДНЕЙ via period_number = (year-2025)*12+month)
- 32/32 unit tests pass (22 format + 10 PosterRouter); tsc strict clean; vite build succeeds
- Hard stack cap MAX_STACK=16 with queue-shift on overflow (T-25-02-02 DoS mitigation per threat register)

## Task Commits

Each task was committed atomically (TDD RED → GREEN where applicable):

1. **Task 1 RED: failing tests for format helpers** — `15d6555` (test)
2. **Task 1 GREEN: implement format helpers** — `cf6d17e` (feat)
3. **Task 2 RED: failing tests for PosterRouter** — `1c0b70d` (test)
4. **Task 2 GREEN: implement PosterRouter** — `3e37e64` (feat)
5. **Task 3: PosterSheet + BottomNavV10 + barrel** — `4f9f647` (feat)

_Plan-level metadata commit (this SUMMARY) follows separately per execute-plan protocol._

## Files Created/Modified

### Created
- `frontend/src/screensV10/common/format.ts` (101 LOC) — MONTHS_EN/RU constants + formatDay/formatTimeHM/pluralDays/formatPeriodEyebrow helpers
- `frontend/src/screensV10/common/PosterRouter.tsx` (~165 LOC) — useReducer-based router + Provider + View
- `frontend/src/screensV10/common/PosterRouter.module.css` — `.viewWrap` absolute-fill wrapper
- `frontend/src/screensV10/common/PosterSheet.tsx` (~165 LOC) — portal modal, drag/Escape/scroll-lock
- `frontend/src/screensV10/common/PosterSheet.module.css` — `.backdrop` + `.sheet` + `.handle` styles + posterSheetIn / posterSheetFade keyframes
- `frontend/src/screensV10/common/BottomNavV10.tsx` (~35 LOC) — TabBar wrapper with isHidden flag
- `frontend/src/screensV10/common/BottomNavV10.module.css` — placeholder for future overrides (intentionally empty)
- `frontend/src/screensV10/common/index.ts` — barrel re-export of all 4 primitives + format helpers
- `frontend/src/screensV10/common/__tests__/format.test.ts` (164 LOC, 22 tests)
- `frontend/src/screensV10/common/__tests__/posterRouter.test.tsx` (~145 LOC, 10 tests)

## Decisions Made

- **useReducer over Zustand/Jotai for router state** — internal to one shell, no external subscribers, matches iOS @Observable single-state contract
- **Provider+View split** — `<PosterRouterProvider root={X}>` defaults to rendering `<PosterRouterView />` but accepts children to interleave router-aware UI (used in tests; future use-cases: debug overlays, persistent global toasts)
- **Animation replay via React key prop** — wrapping content in `<div key={top.id}>` triggers React remount → CSS keyframe restarts; alternative would be JS animation API but key-based approach has zero JS overhead
- **Native PointerEvents for drag-to-close** — no @use-gesture/react or framer-motion dependency; ~25 LOC of pointer logic with proper pointerCapture handling
- **PosterSheet body has touch-action:pan-y** while sheet container has `touch-action: none` — handle swallows drag gestures, body scrolls naturally
- **MAX_STACK=16 with queue-shift** (not error) — silent oldest-shift is more defensive than warn-and-drop; 16 covers Home → Tx → CatDet → AcctDet → ... × 4 worst case
- **English MONTHS in eyebrow, Russian genitive in day groups** — matches prototype line 215 ("MAY 2026") and conventional Russian date listings ("7 мая")
- **No PosterSheet unit-test in this plan** — Playwright in 25-09 covers integration assertions (sheet opens, escape closes, drag-to-close fires); jsdom pointer-event coverage is brittle and adds false-failure surface (per plan note)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test isolation required afterEach(cleanup)**
- **Found during:** Task 2 (PosterRouter test execution)
- **Issue:** First test runs passed individually but later tests failed with "Found multiple elements by data-testid" because `src/test/setup.ts` does NOT enable `@testing-library/react` global auto-cleanup. Container DOM from prior tests leaked into `document.body`, so `screen.getByTestId(...)` matched duplicates.
- **Fix:** Added explicit `afterEach(cleanup)` in `__tests__/posterRouter.test.tsx` and switched `screen.*` queries to container-scoped `container.querySelector(...)`. Also switched the no-Provider throw test to `renderHook` so the synchronous throw is testable without ErrorBoundary wiring.
- **Files modified:** `frontend/src/screensV10/common/__tests__/posterRouter.test.tsx` (test-only)
- **Verification:** 10/10 router tests pass; 32/32 total in screensV10/common
- **Committed in:** `3e37e64` (Task 2 GREEN commit, alongside implementation)

**Note on jsdom uncaught-error noise:** `renderHook(() => usePosterRouter())` with no Provider produces a React component-stack `console.error` that surfaces in stderr even with `console.error = noop`, because the actual throw bubbles through `jsdom.dispatchEvent`. This is benign — the test still asserts the throw via `expect(() => ...).toThrow()`. Could be silenced with a custom ErrorBoundary or jsdom event suppression, but not worth the complexity for one test.

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking, test infrastructure)
**Impact on plan:** No scope creep; deviation isolated to test file. Implementation matches PLAN must_haves exactly.

## Issues Encountered

- TabBar exports use `dark` flag (not `isHidden`) — confirmed by reading `componentsV10/TabBar.tsx`; BottomNavV10 wraps and passes through correctly
- Test file syntax: `ref` is a reserved React prop name — caught quickly by repro test, used `apiRef` prop instead
- vitest config (`src/test/setup.ts`) does not enable @testing-library/react auto-cleanup → required explicit afterEach (documented above as Rule-3 deviation)

## Threat Flags

None — implementation matches `<threat_model>` threats T-25-02-01 (accept), T-25-02-02 (mitigate via MAX_STACK), T-25-02-03 (accept body scroll lock pattern). No new security surface introduced.

## Known Stubs

None — all primitives are functionally complete. BottomNavV10.module.css is intentionally empty (placeholder for future overrides; documented in file).

## Next Phase Readiness

- **25-04 (web Home view):** can now `import { PosterRouterProvider, formatPeriodEyebrow, BottomNavV10 } from 'screensV10/common'`
- **25-08 (web AddSheet):** PosterSheet ready with `backgroundColor='#0E0E0E'` for POSTER.black
- **25-06 (web Transactions registry):** PosterRouter `push` available from Home → Tx; format.formatDay ready for day-grouping
- **iOS parity verified:** API shape (push/pop/popToRoot/canPop + direction flag) matches `ios/.../PosterRouter.swift` exactly, so paired plans stay 1:1

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/screensV10/common/format.ts
- FOUND: frontend/src/screensV10/common/PosterRouter.tsx
- FOUND: frontend/src/screensV10/common/PosterRouter.module.css
- FOUND: frontend/src/screensV10/common/PosterSheet.tsx
- FOUND: frontend/src/screensV10/common/PosterSheet.module.css
- FOUND: frontend/src/screensV10/common/BottomNavV10.tsx
- FOUND: frontend/src/screensV10/common/BottomNavV10.module.css
- FOUND: frontend/src/screensV10/common/index.ts
- FOUND: frontend/src/screensV10/common/__tests__/format.test.ts
- FOUND: frontend/src/screensV10/common/__tests__/posterRouter.test.tsx

**Commits exist:**
- FOUND: 15d6555 (test: format RED)
- FOUND: cf6d17e (feat: format GREEN)
- FOUND: 1c0b70d (test: posterRouter RED)
- FOUND: 3e37e64 (feat: posterRouter GREEN)
- FOUND: 4f9f647 (feat: PosterSheet + BottomNavV10 + barrel)

**Verification gates:**
- tsc --noEmit: clean
- vitest screensV10/common --run: 32/32 pass
- npm run build (vite build): succeeds (244ms)
- barrel export count (PosterRouterProvider | PosterSheet | BottomNavV10 | formatDay): 4/4 present

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 02*
*Completed: 2026-05-10*
