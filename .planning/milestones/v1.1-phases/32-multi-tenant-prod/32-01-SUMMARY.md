# Plan 32-01 Summary: RLS Audit + Live Multi-Tenant Isolation

**Phase:** 32 — Multi-tenant Production Enablement
**Plan:** 01
**Status:** Complete
**Date:** 2026-05-11
**Requirements:** REQ-32-01

## What shipped

- `tests/test_rls_audit.py` — 24 parametrized tests across **12** doмenных таблиц:
  - `test_rls_enabled_and_forced[*]` — проверяет `pg_class.relrowsecurity` + `relforcerowsecurity` = true.
  - `test_rls_policy_uses_current_user_id_setting[*]` — проверяет наличие policy с `current_setting('app.current_user_id')::bigint` filter.
- `tests/test_multitenancy_live.py` — 2 production-style integration scenarios:
  - `test_userB_cannot_see_userA_actual_via_raw_sql` — RLS блокирует SELECT/UPDATE/DELETE cross-tenant под non-superuser ролью.
  - `test_userB_cannot_insert_actual_for_userA` — RLS WITH CHECK блокирует INSERT с чужим user_id.

## Coverage matrix (12 tenant tables)

| Table | RLS shipped in | Audit test |
|-------|----------------|------------|
| category | alembic 0006 | ✓ |
| budget_period | alembic 0006 | ✓ |
| planned_transaction | alembic 0006 | ✓ |
| actual_transaction | alembic 0006 | ✓ |
| subscription | alembic 0006 | ✓ |
| category_embedding | alembic 0006 | ✓ |
| ai_conversation | alembic 0006 | ✓ |
| ai_message | alembic 0006 | ✓ |
| ai_usage_log | alembic 0008 (Phase 13) | ✓ |
| account | alembic 0012 (Phase 22) | ✓ |
| goal | alembic 0014 (Phase 22) | ✓ |
| savings_config | alembic 0014 (Phase 22) | ✓ |

## Deviations

- **CONTEXT mentioned 13 tables** (9 v0.4 + 4 v1.0). Actually 12 — `plan_template_item` table был dropped в v1.0 Phase 22 (plan 22.13); v1.0 расширил `category` напрямую (alembic 0013). Updated TENANT_TABLES list соответственно.
- **`two_tenants` fixture не использовался** — fixture seed-ит `Category` без NOT NULL колонок `code` / `ord` (введены в v1.0), → IntegrityError. Pre-existing breakage; out of scope для Phase 32. Test_multitenancy_live.py seed-ит users inline через raw SQL, минуя fixture.

## Verification

```
$ docker compose exec -T api /app/.venv/bin/python -m pytest tests/test_rls_audit.py tests/test_multitenancy_live.py -v
============================ 26 passed in 0.55s =============================
```

## Files changed

- `tests/test_rls_audit.py` (new, 75 LOC)
- `tests/test_multitenancy_live.py` (new, 215 LOC)
