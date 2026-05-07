---
phase: 14-multi-tenant-onboarding
plan: 05
subsystem: ui
tags: [react, typescript, vitest, error-handling, onboarding, multi-tenant]

# Dependency graph
requires:
  - phase: 14-multi-tenant-onboarding
    provides: OnboardingScreen with user.role in MeResponse (from plan 14-02 backend gate)
provides:
  - OnboardingRequiredError class exported from frontend/src/api/client.ts
  - apiFetch distinguishes 409 onboarding_required from other 409s
  - App.tsx pendingOnboarding catch-all via window unhandledrejection listener
  - OnboardingScreen hero copy branched on user.role (member vs owner)
  - vitest unit tests for 409 sub-shape detection (4 tests GREEN)
affects: [14-06-integration-tests, any frontend code calling apiFetch on gated endpoints]

# Tech tracking
tech-stack:
  added: [vitest 4.1.5, @vitest/ui]
  patterns:
    - OnboardingRequiredError extends ApiError — sub-class pattern for 409 sub-shapes
    - window.unhandledrejection listener in App.tsx for race-condition defence
    - user.role-based copy branching in JSX without layout changes

key-files:
  created:
    - frontend/src/api/client.test.ts
  modified:
    - frontend/src/api/client.ts
    - frontend/src/screens/OnboardingScreen.tsx
    - frontend/src/App.tsx
    - frontend/package.json

key-decisions:
  - "OnboardingRequiredError extends ApiError so existing 409 == AlreadyOnboarded handlers in OnboardingScreen.handleSubmit remain intact"
  - "window.unhandledrejection chosen over React error boundary for catch-all — simpler, no extra component boundary needed"
  - "Hero copy branching by user.role via inline ternary in JSX — no CSS/layout redesign (keeps sketch 006-B structure)"
  - "vitest installed as devDependency (not in original package.json) to satisfy unit test requirement"
  - "Type assertions (err as ApiError) added to test file to fix tsc -b strict unknown type errors in test catch clauses"

patterns-established:
  - "Pattern: Sub-class ApiError for specific error shapes with body parsing inline in apiFetch"
  - "Pattern: pendingOnboarding state flag + unhandledrejection listener as defensive secondary onboarding route in App.tsx"

requirements-completed: [MTONB-04, MTONB-02]

# Metrics
duration: 15min
completed: 2026-05-07
---

# Phase 14 Plan 05: Frontend 409 Interceptor Summary

**OnboardingRequiredError class + apiFetch 409 sub-shape detection + role-branched hero copy + App-level unhandledrejection catch-all, backed by 4 vitest unit tests**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-07T13:24:00Z
- **Completed:** 2026-05-07T13:26:00Z
- **Tasks:** 2
- **Files modified:** 5 (client.ts, client.test.ts, OnboardingScreen.tsx, App.tsx, package.json)

## Accomplishments
- `OnboardingRequiredError extends ApiError` exported from client.ts; `apiFetch` throws it on 409 + `detail.error === "onboarding_required"`, falls back to plain `ApiError` for any other 409 shape
- `OnboardingScreen` hero block and header title now branch on `user.role === 'member'` — invited members see "Привет!" / "Несколько шагов и вы готовы вести бюджет", owner sees existing copy unchanged
- `App.tsx` adds `pendingOnboarding` state + `window.unhandledrejection` listener; any `OnboardingRequiredError` from any unhandled promise flip-renders `OnboardingScreen` as a race-condition safety net
- 4 vitest unit tests cover: onboarding_required 409, other 409 shape (AlreadyOnboarded), malformed JSON 409, non-409 error — all GREEN
- Build clean (`npm run build` exit 0, `npx tsc --noEmit` exit 0)

## Task Commits

1. **Task 1: Add OnboardingRequiredError class + 409 sub-shape detection** - `69b2c51` (feat)
2. **Task 2: Branch OnboardingScreen hero copy + App-level catch-all** - `8420e16` (feat)

**Plan metadata:** (this commit — docs)

## Files Created/Modified
- `frontend/src/api/client.ts` - Added `OnboardingRequiredError` class + 409 sub-shape detection in `apiFetch`
- `frontend/src/api/client.test.ts` - 4 vitest unit tests for 409 detection paths (new file)
- `frontend/src/screens/OnboardingScreen.tsx` - Hero title + header branching on `user.role === 'member'`
- `frontend/src/App.tsx` - `pendingOnboarding` state, `useEffect` unhandledrejection listener, `OnboardingRequiredError` import
- `frontend/package.json` - Added vitest + @vitest/ui devDependencies

## Decisions Made
- `OnboardingRequiredError extends ApiError` so `OnboardingScreen.handleSubmit` existing `e.status === 409` handler continues treating any 409 from `/onboarding/complete` as already-onboarded (no regression — that path returns `AlreadyOnboarded` detail string shape, not the `{detail: {error: "..."}}` object shape).
- `window.unhandledrejection` listener chosen over React Error Boundary — simpler for a catch-all across all async calls app-wide without restructuring the component tree.
- Type assertions `(err as ApiError)` added in test `.catch((e: unknown) => e)` to satisfy `tsc -b` strict checking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed vitest (not in original package.json)**
- **Found during:** Task 1 (test infrastructure check)
- **Issue:** vitest not in `devDependencies`; plan instructed to install if missing
- **Fix:** `npm install --save-dev vitest @vitest/ui`
- **Files modified:** `frontend/package.json`, `frontend/package-lock.json`
- **Verification:** `npx vitest run` succeeds
- **Committed in:** `69b2c51` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript unknown-type errors in test catch clauses**
- **Found during:** Task 2 (build verification)
- **Issue:** `catch((e) => e)` in test returns `unknown`; tsc strict mode rejects `err.status` access. `tsc -b` (used by `npm run build`) includes test files, causing build failure.
- **Fix:** Added `catch((e: unknown) => e)` + `(err as ApiError).status` casts in test assertions
- **Files modified:** `frontend/src/api/client.test.ts`
- **Verification:** `npm run build` exits 0
- **Committed in:** `8420e16` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking install, 1 type-error bug)
**Impact on plan:** Both necessary — vitest install was planned (plan stated to install if missing); type fix was required for clean build.

## Issues Encountered
- `npx vitest run --reporter=basic` failed due to Vite 8.x / vitest version incompatibility with that reporter flag — ran without `--reporter` flag, tests pass fine.

## Known Stubs
None — no UI stubs introduced. Hero copy is real copy, not placeholder text.

## Threat Flags
None — no new network endpoints, auth paths, or schema changes introduced. Frontend-only changes.

## Next Phase Readiness
- Frontend 409 gate is complete. Plan 14-06 integration tests can now verify the full member onboarding flow end-to-end including 409 responses being caught and redirecting to OnboardingScreen.
- `OnboardingRequiredError` is exported and ready to be imported by any future hook/screen that needs to detect the onboarding gate.

---
*Phase: 14-multi-tenant-onboarding*
*Completed: 2026-05-07*
