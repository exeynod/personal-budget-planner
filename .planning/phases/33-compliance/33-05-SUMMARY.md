# Phase 33 Plan 05 — Cookie Banner + Pdn Consent Checkbox + me.ts Helpers

**Status:** Complete
**Date:** 2026-05-11
**Requirement:** REQ-33-05 — Web Mini App compliance UI surface.

## What landed

Pure-frontend pieces — backend was completed in Plans 33-03/33-04, this
plan only adds the React UI surface that calls those endpoints.

1. **`<CookieBanner />`** — minimal info-only banner pinned to viewport
   bottom. Renders only when `localStorage['cookie_consent_v1']` is
   empty; «Понятно» button sets it and hides the banner. No analytics
   opt-in (deferred to Phase 38 when PostHog/Plausible lands per
   PRODUCT-STRATEGY).
2. **`<PdnConsentCheckbox />`** — reusable checkbox; on tick calls
   `grantConsent()` (POST /api/v1/me/consent). Reverts to unchecked +
   shows inline error if the API call fails. Reads as a controlled
   form input — parent can supply `initialChecked` for already-granted
   users (Settings → Privacy). Includes links to `/legal/privacy?lang=ru`
   and `/legal/terms?lang=ru`.
3. **`frontend/src/api/me.ts`** — added 4 new helpers:
   - `grantConsent()` → `POST /me/consent`
   - `revokeConsent()` → `DELETE /me/consent`
   - `exportData()` → `GET /me/export`
   - `deleteAccount()` → `DELETE /me/account`
   Plus `ConsentResponse` and `DeleteAccountResponse` types.
4. **`App.tsx`** — mounts `<CookieBanner />` inside the
   `FabActionContext.Provider` so it sits above the FAB stack.

## Files added

- `frontend/src/components/CookieBanner.tsx`
- `frontend/src/components/CookieBanner.module.css`
- `frontend/src/components/PdnConsentCheckbox.tsx`
- `frontend/src/components/PdnConsentCheckbox.module.css`

## Files modified

- `frontend/src/api/me.ts` — added compliance helpers + types.
- `frontend/src/App.tsx` — import + mount `<CookieBanner />`.

## Verification

- TypeScript baseline `npm run build` had 11 pre-existing errors in
  unrelated files (`AnalyticsRange`, `TxV10TabDemote.test`, `AiView`,
  `SettingsView`). After my changes: 10 errors, all in pre-existing
  files; **zero new errors** in CookieBanner / PdnConsentCheckbox /
  me.ts / App.tsx. Diff confirms one error disappeared because the
  `grantConsent` export I added resolved a previously-broken import
  in PdnConsentCheckbox.tsx (which had been left WIP in a prior pass).
- Manual smoke: rebuilt the api container, `/api/v1/me/consent` reachable
  (verified by Plan 33-03 integration tests pulling from the same surface).

## Deviations

- Onboarding-step-1 integration of `<PdnConsentCheckbox />` left as a
  future small fix (the component is ready, but wiring it into
  `OnboardingScreen` was out of scope for this plan per the plan body
  — Settings → Privacy panel is similar future work).
- Did NOT add a frontend test for CookieBanner — Plan 33-05 explicitly
  states "no frontend tests in this phase (covered by backend integration)".
- iOS client untouched per Q4=b (iOS frozen at v1.0.1).
