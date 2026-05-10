---
phase: 24-onboarding-4-step
plan: 10
subsystem: web-onboarding
tags: [onboarding, web, playwright, e2e, AppV10, ONB-V10-01, ONB-V10-06, ONB-V10-07]
requires: [24-08]
provides:
  - app-root-wires-onboarding-by-default
  - onboarding-mount-conditional-gateway
  - playwright-e2e-coverage-onboarding-v10
affects:
  - frontend/src/AppV10.tsx
tech-stack:
  added:
    - playwright route-mocks per /me + /onboarding/complete (200/409/422)
  patterns:
    - sessionStorage-sentinel guard around addInitScript so seed/clear only fires
      on the first navigation (preserves draft across in-test reload)
    - StrictMode-aware /me mock with `flipAfterCall: 2` so the double-effect on
      mount returns not-onboarded for both calls and refetch returns onboarded
key-files:
  created:
    - frontend/src/api/me.ts
    - frontend/src/screensV10/Onboarding/OnboardingMount.tsx
    - frontend/src/screensV10/Onboarding/OnboardingMount.module.css
    - frontend/tests/e2e/fixtures/onboarding-mocks.ts
    - frontend/tests/e2e/onboarding-v10.spec.ts
  modified:
    - frontend/src/AppV10.tsx
decisions:
  - Use `me.onboarded_at == null` (not `income_cents == null && accounts == []`)
    as the onboarding trigger; MeV10Response does not include accounts and
    /accounts requires `require_onboarded`. onboarded_at is the canonical
    server-side completion signal (set atomically by /onboarding/complete).
  - Re-export `MeV10Response` from `api/me.ts` rather than touching `types.ts`,
    keeping the legacy `MeResponse` consumers untouched.
  - AppV10 root now boots into OnboardingMount by default. The DesignSystem
    preview gallery is opt-in via `?preview=1` in any environment (was
    auto-on in dev). Playwright tests target the default path.
  - StrictMode double-effect handled at the test layer via
    `mockMe({flipAfterCall: 2})` rather than adding an in-flight de-dupe to
    OnboardingMount — keeping the mount logic minimal.
metrics:
  duration: ~22 min
  tasks: 2
  files_created: 5
  files_modified: 1
  completed: 2026-05-10
---

# Phase 24 Plan 10: Web Wire-Up + E2E Summary

Wire OnboardingMount into AppV10 root and ship a Playwright e2e suite covering the full 4-step onboarding flow (200 happy path), draft persistence across mid-flight reload, 409 conflict handling, and 422 validation handling.

## Tasks Executed

### Task 1: getMeV10 wrapper + OnboardingMount + AppV10 wiring (commit `1d46286`)

Created `frontend/src/api/me.ts` with `getMeV10()` typed wrapper and a re-export of `MeV10Response` from `types.ts`. Added `OnboardingMount` (`frontend/src/screensV10/Onboarding/OnboardingMount.tsx`) — a conditional gateway that:

1. Fetches `/api/v1/me` once on mount via `getMeV10()`.
2. Renders `<OnboardingFlow onComplete={refetch}/>` when `me.onboarded_at == null`.
3. Renders `<HomePlaceholder/>` (a coral-themed Phase 25 placeholder with `data-testid="home-placeholder"`) when onboarded.
4. Falls back to a russian loading or error state with retry button while in-flight or on error.

`AppV10.tsx` swapped from "preview-by-default-in-dev" to "OnboardingMount-by-default-everywhere". The DesignSystem preview gallery is now opt-in via `?preview=1` query string. The shell theme (`data-theme="v10"`, coral background) stays applied around `OnboardingMount`.

### Task 2: Playwright e2e suite (commit `648e4f7`)

Created `frontend/tests/e2e/fixtures/onboarding-mocks.ts` with:
- `mockMe(page, { initial, flipAfterCall?, flipTo? })` — installs `/api/v1/me` route mock with optional response flip after N calls (handles StrictMode double-effect on mount).
- `mockMeNotOnboarded(page)` — convenience wrapper.
- `mockOnboardingComplete200/409/422(page)` — `/api/v1/onboarding/complete` mocks.
- `STEP05_DRAFT` — pre-filled draft for tests that pre-populate localStorage.
- `STORAGE_KEY` re-export.

Created `frontend/tests/e2e/onboarding-v10.spec.ts` with 5 tests:

| # | Name | Coverage |
|---|------|----------|
| 1 | first-time user sees Step 01 income screen | trigger logic — onboarded_at null → OnboardingFlow renders |
| 2 | full happy path → 200 → draft cleared → home placeholder | walk all 4 steps + Final + submit + post-200 refetch + localStorage cleared |
| 3 | draft persists across reload mid-flight | save state to localStorage on every reducer transition + lazy reducer init re-hydrates after reload |
| 4 | 409 wipes draft + transitions to home placeholder | Final.onStart → 409 → draft.clear() → toast → onComplete(null) → refetch flips to onboarded → HomePlaceholder |
| 5 | 422 keeps draft + shows error toast | Final.onStart → 422 → draft preserved → toast «Проверьте план…» → still on Final |

Notable test mechanics:
- `clearDraft` / `seedDraft` use `addInitScript` with a `sessionStorage` sentinel flag so the script only fires on the FIRST page load — subsequent `page.reload()` calls preserve whatever the running app stored. This was load-bearing for test 3 (without the sentinel, reload would silently re-clear the draft).
- React 18 StrictMode triggers the OnboardingMount `useEffect` twice on mount in dev. Tests that need the gate to flip after submit pass `flipAfterCall: 2` so the first 2 mock /me calls return not-onboarded and the post-submit refetch (call 3+) returns onboarded.
- 409 toast assertion targets `getByRole('status')` (Toast component sets `role="status"`).

## Verification

- `npx tsc --noEmit` clean across the whole frontend tree.
- `npx playwright test tests/e2e/onboarding-v10.spec.ts --reporter=list` → **5 passed** on `chromium-mobile` (Pixel 5 viewport, the project's only configured device).
- ESLint config not present in the project (only TypeScript strict mode); skipped per project setup.

## Threat Model Compliance

- T-24-10-01 (Tampering, localStorage): covered by Plan 24-01 sanitiser; e2e test 3 exercises the lifecycle (save → reload → load). No new code surface.
- T-24-10-02 (Information Disclosure, /me payload): accept — same surface as v0.x /me; OnboardingMount never echoes raw error bodies (fixed russian copy «не удалось загрузить профиль»).
- T-24-10-03 (Auth bypass, localStorage): n/a — `onboarded_at` always sourced from `/me`, never from localStorage. Verified by test 4 (409 returns server's true state on refetch).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] StrictMode double-effect breaks `flipAfterCall: 1`**
- **Found during:** Task 2, first run of test 2 (full happy path)
- **Issue:** Plan specified `flipAfterCall: 1`, but React 18 StrictMode in dev fires `useEffect` twice on mount → 2 /me calls → flip happens before the user even sees Step 01.
- **Fix:** Bumped `flipAfterCall` to `2` for the happy-path and 409 tests; documented inline.
- **Files modified:** `frontend/tests/e2e/onboarding-v10.spec.ts`
- **Commit:** `648e4f7`

**2. [Rule 1 - Bug] Cyrillic case-insensitive substring match collision**
- **Found during:** Task 2, first run of test 3
- **Issue:** `getByText('Т-БАНК')` (uppercase row name) also matched the «Т-Банк» chip button due to Playwright's default case-insensitive substring matching, producing a strict-mode violation.
- **Fix:** Switched to `getByText('Т-БАНК', { exact: true })` to lock the locator to the row's uppercase form.
- **Files modified:** `frontend/tests/e2e/onboarding-v10.spec.ts`
- **Commit:** `648e4f7`

**3. [Rule 1 - Bug] addInitScript re-fires on reload, wipes seeded draft**
- **Found during:** Task 2, first run of test 3 (draft persists across reload)
- **Issue:** Initial `clearDraft` used `addInitScript` to wipe localStorage. Playwright re-runs init scripts on every navigation, including `page.reload()` — so the very reload the test was checking would silently wipe the draft, sending the user back to Step 01.
- **Fix:** Added a `sessionStorage` sentinel (`__draft_cleared_once__` / `__draft_seeded_once__`) so the init scripts fire only on the first page load per test.
- **Files modified:** `frontend/tests/e2e/onboarding-v10.spec.ts`
- **Commit:** `648e4f7`

**4. [Rule 2 - Critical functionality] AppV10 surface dispatch wasn't reachable in dev**
- **Found during:** Task 1
- **Issue:** Existing `AppV10.tsx` always returned `'preview'` surface in `import.meta.env.DEV`, meaning OnboardingMount could never render in dev mode (Playwright runs the dev server). Plan said "preview-mode unchanged" but also required dev to render OnboardingMount.
- **Fix:** Changed surface gating: preview is now strictly opt-in via `?preview=1` in any environment (dev or prod). Default boots OnboardingMount.
- **Files modified:** `frontend/src/AppV10.tsx`
- **Commit:** `1d46286`

### Tooling notes

- Plan asked for ESLint verification; no `eslint.config.js` exists in the project (only TS strict mode). Skipped — `tsc --noEmit` is the equivalent gate.

## Self-Check: PASSED

Verified files:
- `frontend/src/api/me.ts` — FOUND
- `frontend/src/screensV10/Onboarding/OnboardingMount.tsx` — FOUND
- `frontend/src/screensV10/Onboarding/OnboardingMount.module.css` — FOUND
- `frontend/tests/e2e/fixtures/onboarding-mocks.ts` — FOUND
- `frontend/tests/e2e/onboarding-v10.spec.ts` — FOUND
- `frontend/src/AppV10.tsx` — modified

Verified commits:
- `1d46286` (Task 1) — FOUND in `git log`
- `648e4f7` (Task 2) — FOUND in `git log`

Playwright run: 5/5 pass on `chromium-mobile`.
