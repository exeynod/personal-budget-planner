---
phase: 31-regression-hardening
plan: 01
subsystem: testing
tags: [playwright, fixtures, fastapi, auth, dev-mode, e2e, internal-api]

requires:
  - phase: 22-v10-backend
    provides: onboarding_v10 helpers (DEFAULT_CATEGORIES, _upsert_seed_categories, _upsert_savings_category), internal_onboarding_router skeleton, X-Internal-Token gate
  - phase: 29-ui-conformance
    provides: shared `installOnboardedFixture` Playwright fixture + V10 baseline PNGs
  - phase: 12-roles
    provides: get_current_user dependency + DEV_MODE OWNER auto-upsert pattern

provides:
  - dev-mode `X-Test-User` header bypass for FastAPI `get_current_user`
  - idempotent POST `/api/v1/internal/onboarding/seed?tg_user_id=<int>` endpoint
  - opt-in `mode: 'live'` toggle for the shared Playwright fixture

affects: [phase-31-regression-hardening, phase-31-02, phase-31-03, future-e2e-suites]

tech-stack:
  added: []
  patterns:
    - "Header-gated dev bypass — `X-Test-User` is only effective under `settings.DEV_MODE`; silently ignored in production for zero info-leak"
    - "Idempotent seed endpoint reuses onboarding_v10 helpers (DRY w/ live onboarding code)"
    - "Live-mode fixture sets `context.setExtraHTTPHeaders` so all SPA requests inherit auth header"

key-files:
  created:
    - .planning/phases/31-regression-hardening/31-01-SUMMARY.md
  modified:
    - app/api/dependencies.py
    - app/api/routes/internal_onboarding.py
    - frontend/tests/e2e/fixtures/onboarded-user.ts

key-decisions:
  - "Reused existing `DEV_MODE` setting instead of introducing a parallel `ENV=dev` flag (plan suggested `ENV=dev`; project convention is `DEV_MODE`). Same security property, half the config surface."
  - "Seed endpoint reuses onboarding_v10 helpers (_upsert_seed_categories, _upsert_savings_category) rather than duplicating category-seed logic — guarantees seed and real onboarding stay schema-aligned."
  - "Mock mode stays the default of `installOnboardedFixture` — all existing pixel specs untouched. Live mode is opt-in via `{ mode: 'live', context }`."
  - "Live-mode fixture requires `BrowserContext` argument so it can call `setExtraHTTPHeaders`; throws explicit usage error if missing."

patterns-established:
  - "Header-gated dev bypass: privileged behaviour only fires when `DEV_MODE=true`. In production the header is silently ignored — no error, no log, no behaviour change."
  - "Idempotent seed pattern: upsert user → tenant-scope DB session → reuse onboarding helpers → return id map. Re-running returns same ids."

requirements-completed: [REG-01]

duration: 8min
completed: 2026-05-11
---

# Phase 31 Plan 01: Live-mode Playwright fixture + dev-mode auth bypass Summary

**Production-grade onboarded fixture for Playwright: backend `X-Test-User` auth bypass + idempotent `/internal/onboarding/seed` endpoint + opt-in live-mode toggle, with all existing pixel specs preserved.**

## Performance

- **Duration:** ~8 minutes
- **Started:** 2026-05-10T23:35:53Z
- **Completed:** 2026-05-10T23:43:45Z
- **Tasks:** 3 implementation + 1 metadata = 4 atomic commits
- **Files modified:** 3 (+ 1 SUMMARY)

## Accomplishments

- **Backend dev-mode auth bypass.** `X-Test-User: <tg_user_id>` header in `get_current_user` upserts the row (role=owner) and returns it when `settings.DEV_MODE is True`. In production the header is silently ignored. Validated against malformed values (400 on non-int / non-positive).
- **Idempotent seed endpoint.** `POST /api/v1/internal/onboarding/seed?tg_user_id=N` materialises a fully-onboarded user (AppUser + 8 default categories + savings system category + active BudgetPeriod + 1 primary Account) via the existing `onboarding_v10` helpers. Re-runs return the same id map. Token-gated; refuses to run on placeholder `INTERNAL_TOKEN`.
- **Fixture mode toggle.** `installOnboardedFixture(page, { mode: 'live', context })` skips route mocks, calls the seed endpoint, and pins `X-Test-User` as an extra HTTP header on the context. Default `mode='mock'` preserves all existing pixel-spec behaviour verbatim — 8 baseline tests still pass.

## Task Commits

1. **Task 1: Backend `X-Test-User` dev bypass** — `e2759fe` (feat)
2. **Task 2: `POST /internal/onboarding/seed` endpoint** — `4e8c8c6` (feat)
3. **Task 3: `mode: 'live'` fixture toggle** — `2315353` (feat)

## Files Created/Modified

- `app/api/dependencies.py` — added `_dev_mode_resolve_test_user` helper + `x_test_user` header param + DEV-only bypass branch at the top of `get_current_user`.
- `app/api/routes/internal_onboarding.py` — new `seed_onboarded_user` route under existing `internal_onboarding_router`. Imports `DEFAULT_CATEGORIES`, `_upsert_seed_categories`, `_upsert_savings_category` from `app.services.onboarding_v10` for DRY seeding.
- `frontend/tests/e2e/fixtures/onboarded-user.ts` — extended `InstallOptions` with `mode`/`context`/`testUserId`/`backendBaseUrl`/`internalToken`. Live branch returns early before any `page.route` registration. JSDoc shows both usage patterns.
- `.planning/phases/31-regression-hardening/31-01-SUMMARY.md` — this file.

## Verification Results

### 1. Existing pixel specs still pass (mode='mock' default)

```
npx playwright test v10-pixel-snapshots --project=chromium-mobile
→ 8 passed, 1 skipped (sanity from 31-02)
```

### 2. Dev-mode bypass via header

```
curl -H "X-Test-User: 999000" /api/v1/me
→ 200 {"tg_user_id":999000, "role":"owner", ...}

curl /api/v1/me  (no header)
→ 200 {"tg_user_id":123456789, ...}  (regression-safe — OWNER auto-upsert untouched)

curl -H "X-Test-User: not_a_number" /api/v1/me  → 400
curl -H "X-Test-User: -1" /api/v1/me           → 400
```

### 3. Seed endpoint

```
POST /api/v1/internal/onboarding/seed?tg_user_id=999000
  with X-Internal-Token  → 200 + full id map
  re-run                 → 200 + same id map (idempotent)
  without token          → 403
```

### 4. End-to-end fixture surface

`curl -H "X-Test-User: 999000" /api/v1/accounts` returns the seeded Т-Банк card; `/api/v1/categories` returns the 8 default categories. SPA running through Playwright live-mode will see a fully-populated home screen.

### 5. TypeScript compile

`npx tsc --noEmit -p tsconfig.json` → exit 0.

## Deviations from Plan

### Adjustment 1: `DEV_MODE` instead of `ENV=dev`

- **Plan said:** "If `ENV=dev` AND `X-Test-User` header set → bypass initData validation."
- **Adopted:** Use the existing `settings.DEV_MODE` boolean (project convention from D-05; see `app/core/settings.py`). Introducing a parallel `ENV` setting would have doubled the configuration surface for the same property.
- **Security impact:** Identical — `DEV_MODE=true` is already the gate for the legacy OWNER auto-upsert path, and is hard-disabled in production by `validate_production_settings`. Header is ignored in production regardless.
- **CLAUDE.md compliance:** No project rule conflicts; both approaches align with single-tenant dev convenience pattern.

### Adjustment 2: Seed endpoint did NOT exist (created from scratch)

- **Plan said:** "Verify `/api/v1/internal/onboarding/seed?tg_user_id=999000` exists; if not, add an idempotent endpoint."
- **Found:** Only `DELETE /api/v1/internal/onboarding/reset?user_id=<int>` existed (Phase 22 BE-15). The seed endpoint was absent.
- **Action:** Added `POST /api/v1/internal/onboarding/seed?tg_user_id=<int>` to the same router. Reuses `_upsert_seed_categories` + `_upsert_savings_category` helpers from `onboarding_v10` — single source of truth for category schema, no drift.
- **Note:** The endpoint takes `tg_user_id` (Telegram id), not `user_id` (AppUser PK). Reset takes `user_id` for backward compat. Slightly asymmetric but matches the seed-by-tg-id mental model of the Playwright fixture.

## Known Stubs

None. All wired to real data:
- `installOnboardedFixture({ mode: 'live' })` hits the real seed endpoint and the SPA sees real `/api/v1/*` responses.
- Mock mode unchanged from Phase 29-01 — same documented mock surface.

## Self-Check: PASSED

Files exist:
- FOUND: `/Users/exy/pet_projects/tg-budget-planner/app/api/dependencies.py`
- FOUND: `/Users/exy/pet_projects/tg-budget-planner/app/api/routes/internal_onboarding.py`
- FOUND: `/Users/exy/pet_projects/tg-budget-planner/frontend/tests/e2e/fixtures/onboarded-user.ts`
- FOUND: `/Users/exy/pet_projects/tg-budget-planner/.planning/phases/31-regression-hardening/31-01-SUMMARY.md`

Commits exist:
- FOUND: `e2759fe` (task 1)
- FOUND: `4e8c8c6` (task 2)
- FOUND: `2315353` (task 3)
