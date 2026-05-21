# Phase 33 Plan 04 — Data Export + Account Deletion + Purge Job

**Status:** Complete
**Date:** 2026-05-11
**Requirement:** REQ-33-04 — Subject rights (152-ФЗ §14/§21) — access + erasure.

## What landed

Two subject-rights flows + the worker job that physically completes erasure:

1. **`GET /api/v1/me/export`** — JSON dump of all PII for the caller
   (CMP-33-06). 13 top-level keys: `user / accounts / categories /
   budget_periods / planned_transactions / actual_transactions /
   subscriptions / ai_conversations / ai_messages / goals /
   savings_config / audit_log / _meta`. Each call writes a `data_export`
   audit event (CMP-33-01).
2. **`DELETE /api/v1/me/account`** — soft-delete with 30-day cooling
   (CMP-33-02). Sets `app_user.deleted_at = now()`, writes
   `deletion_requested` audit event, returns 200 with `purge_after_days=30`.
   A repeat call after deletion returns 410 Gone.
3. **`purge_deleted_users_job`** — daily APScheduler cron at 02:00 MSK
   (advisory lock key `20260101`, disjoint from close_period /
   notify / charge). Finds users with `deleted_at < now() - 30d`, runs
   `purge_user_data()` per candidate in an isolated session, writes
   `deletion_completed` audit event after each successful cascade.

## Files added

- `app/services/data_export.py` — `build_export()` + `_serialize_row()`
  (datetime/enum/bytes JSON-safe coercion).
- `app/services/account_deletion.py` — `soft_delete_account()`,
  `purge_user_data()`, `is_due_for_purge()`, `COOLING_DAYS=30`,
  `PURGE_ORDER` (11 tenant-scoped tables in reverse-dep order).
- `app/worker/jobs/purge_deleted_users.py` — `purge_deleted_users_job()`
  + `ADVISORY_LOCK_KEY=20260101`.
- `tests/test_data_export.py` — 4 tests (top-level keys; audit event;
  serialize_row; empty for unknown user).
- `tests/test_account_deletion.py` — 4 tests (cooling-day threshold;
  COOLING_DAYS const; PURGE_ORDER coverage; endpoint 200→410 flow + audit).
- `tests/test_purge_deleted_users_job.py` — 4 tests (lock key disjoint;
  past-cooling purge; recent skip; no-candidate idempotent).

## Files modified

- `app/api/routes/me.py` — `export_my_data` now uses `Depends(get_db)`
  + manual `set_tenant_scope` (was: `get_db_with_tenant_scope`). Reason:
  the X-Test-User AppUser upsert lives in the same session FastAPI
  creates for `get_current_user`; a separate session opened by
  `get_db_with_tenant_scope` doesn't see the uncommitted upsert, leading
  to `build_export` returning `{}`. Same-session pattern matches the
  consent endpoints from Plan 33-03.
- `main_worker.py` — registered `purge_deleted_users_job` at 02:00 MSK.

## Verification

`docker compose exec api /app/.venv/bin/python -m pytest \
 tests/test_data_export.py tests/test_account_deletion.py \
 tests/test_purge_deleted_users_job.py -v` → **12 passed in 1.25s**.

Cross-check 33-03 regression: `pytest tests/test_pdn_consent_flow.py
tests/test_bot_handlers_consent.py tests/test_bot_handlers.py` →
17 passed.

## Deviations

- No `budget_admin` BYPASSRLS role exists (runtime user is `budget_app`
  NOSUPERUSER NOBYPASSRLS, FORCE RLS on domain tables). `purge_user_data`
  instead sets the tenant GUC inside its transaction; RLS policies admit
  the DELETE on the target user's rows. `app_user` itself has no RLS so
  the final DELETE is unaffected.
- `pdn_audit_log` rows are **deliberately preserved** through purge:
  they reference `user_id_hash` (sha256), have no FK to `app_user`, and
  per CMP-33-01 the audit trail must outlive the right-to-erasure
  (152-ФЗ §22.1).
- `ai_usage_log` / `auth_token` cascade automatically via
  `ON DELETE CASCADE` on the user_id FK — not in `PURGE_ORDER`.
- Test fixtures intentionally avoid the pre-existing-broken `two_tenants`
  conftest fixture (Phase 22 `Category.code NOT NULL` mismatch). Each
  test file uses a dedicated tg_user_id range fixture for isolation.
