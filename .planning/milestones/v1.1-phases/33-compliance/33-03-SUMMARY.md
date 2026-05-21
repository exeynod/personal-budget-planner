# Phase 33 Plan 03 — Consent Endpoints + Onboarding Gate + Bot Prompt

**Status:** Complete
**Date:** 2026-05-11
**Requirement:** REQ-33-02 — Server-side ПДн consent gate (152-ФЗ §6/§9).

## What landed

Server-side enforcement of ПДн consent at three boundaries:

1. **`POST /api/v1/me/consent`** — idempotent grant. Sets
   `app_user.pdn_consent_at = now()` only if currently NULL, but always
   writes a `granted` audit event (CMP-33-01). Response includes
   `policy_version="v0.1"` for future versioned-consent tracking.
2. **`DELETE /api/v1/me/consent`** — revoke. Nulls `pdn_consent_at` and
   writes a `revoked` audit event. After revoke, `/onboarding/complete`
   blocks until a new grant.
3. **`POST /api/v1/onboarding/complete` gate** — service-layer check
   in `complete_v10()`: if `app_user.pdn_consent_at IS NULL`, raises
   `PdnConsentRequiredError`; route maps to `403` with body
   `{"error": "pdn_consent_required", "privacy_url": "/legal/privacy",
   "consent_endpoint": "/api/v1/me/consent"}`.
4. **Bot `/start` consent prompt** — `cmd_start` now reads
   `pdn_consent_at` via `bot_resolve_user_status` (extended to a 3-tuple)
   and shows a dedicated prompt before the invite-pending / onboarded
   greetings: «Прочитайте политику обработки персональных данных и
   подтвердите согласие в приложении».

## Files modified

- `app/api/routes/me.py` — added `grant_consent` / `revoke_consent` endpoints.
- `app/api/routes/onboarding_v10.py` — added `PdnConsentRequiredError` → 403 handler;
  documented in route `responses=` map.
- `app/services/onboarding_v10.py` — new `PdnConsentRequiredError` class
  exported via `__all__`; consent gate in `complete_v10()` runs BEFORE
  the existing validators / conflict check. Also fixed a stray duplicate
  `super().__init__()` block left from an earlier WIP that broke
  `PlanExceedsIncomeError` instantiation.
- `app/bot/auth.py` — `bot_resolve_user_status` returns
  `(role, onboarded_at, pdn_consent_at)` — single SELECT, same DB
  pattern as before.
- `app/bot/handlers.py` — new consent branch in `cmd_start` (priority
  over the Phase 14 invite-pending branch).
- `tests/test_bot_handlers.py` — updated existing 3-tuple mocks for
  `bot_resolve_user_status`.

## Tests added

- `tests/test_pdn_consent_flow.py` — **5** integration tests
  (no-consent → 403; grant writes timestamp + audit; idempotency;
  revoke clears + audit; revoke-then-onboard → 403). Uses a dedicated
  `consent_test_user` fixture instead of the pre-existing-broken
  `two_tenants` fixture (Phase 22 `Category.code NOT NULL` not reflected
  in conftest seed — pre-existing issue, out of scope).
- `tests/test_bot_handlers_consent.py` — **3** unit tests
  (consent prompt; granted-user skips prompt; revoked role short-circuits).

## Verification

`docker compose exec api /app/.venv/bin/python -m pytest \
 tests/test_pdn_consent_flow.py tests/test_bot_handlers_consent.py \
 tests/test_bot_handlers.py -v` → **17 passed in 1.62s**.

## Deviations

- Consent-gate exception is raised **inside** `complete_v10()` (service
  layer) rather than as a route-layer guard — keeps the gate co-located
  with onboarding business logic and makes any bot-side or future-job-side
  caller automatically subject to the same enforcement.
- `bot_resolve_user_status` extended in place (3-tuple) rather than
  adding a sibling helper — single SELECT, no extra round-trip; one
  call site already had to change.
