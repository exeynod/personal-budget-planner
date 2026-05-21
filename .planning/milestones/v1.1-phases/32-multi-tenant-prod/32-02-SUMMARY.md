# Plan 32-02 Summary: AI Cost Cap Default 100→500 + /ai/usage Per-User Balance

**Phase:** 32 — Multi-tenant Production Enablement
**Plan:** 02
**Status:** Complete
**Date:** 2026-05-11
**Requirements:** REQ-32-03

## What shipped

- `app/db/models.py:163` — `AppUser.spending_cap_cents` default 100 → 500 + server_default "500".
- `alembic/versions/0018_ai_cost_cap_default_500.py` — new migration `0018_cap_500`:
  - `ALTER TABLE app_user ALTER COLUMN spending_cap_cents SET DEFAULT 500`.
  - `UPDATE app_user SET spending_cap_cents = 500 WHERE spending_cap_cents = 100` (preserve admin-customised rows).
  - Downgrade: `SET DEFAULT 100` (data preserved).
- `app/api/schemas/ai.py:UsageResponse` — extended с optional `cap_cents`, `remaining_cents`, `spent_cents_period`.
- `app/api/routes/ai.py:get_usage` — теперь принимает `current_user` + `db` deps, возвращает per-user fields.
- `tests/test_ai_cap_default.py` — 3 new tests (orm default, server default, INSERT default).

## Migration audit

```
Upgrade  : 0017_v10_account_id_composite_fk → 0018_cap_500
Downgrade: 0018_cap_500 → 0017_v10_account_id_composite_fk
Round-trip: clean (verified)

SELECT column_default FROM information_schema.columns
  WHERE table_name='app_user' AND column_name='spending_cap_cents'
→ '500'::bigint  (after upgrade)
→ '100'::bigint  (after downgrade)
```

## Verification

```
$ pytest tests/test_ai_cap_default.py -v
============================ 3 passed in 0.08s =============================

$ pytest tests/test_me_ai_spend.py tests/test_admin_ai_usage_api.py tests/test_enforce_spending_cap_dep.py -v
============================ 15 passed in 1.84s ============================
```

Zero regression on existing AI spend/cap tests.

## Files changed

- `app/db/models.py` (default 100 → 500)
- `alembic/versions/0018_ai_cost_cap_default_500.py` (new)
- `app/api/schemas/ai.py` (UsageResponse + 3 optional fields)
- `app/api/routes/ai.py` (get_usage signature + per-user fields)
- `tests/test_ai_cap_default.py` (new, 65 LOC)
