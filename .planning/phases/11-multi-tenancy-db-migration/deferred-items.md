# Phase 11 — Deferred Items

Out-of-scope discoveries during plan execution; tracked here for later resolution.

---

## D-11-04-01 — Test DB schema is stale (missing Phase 10 columns)

**Discovered during:** Plan 11-04 (post-implementation pytest run)

**Symptom:** `tests/test_auth.py::test_owner_whitelist_valid` fails with:
```
asyncpg.exceptions.UndefinedColumnError: column "enable_ai_categorization" of relation "app_user" does not exist
```

**Root cause:** The local test database at `DATABASE_URL` was last migrated before
Phase 10 (which added `app_user.enable_ai_categorization`) and has not been
re-migrated since. ORM models include the column; raw INSERTs fail.

**Why deferred:** Plan 11-04 execution rules explicitly forbid running
`alembic upgrade head` — that is Plan 11-07's responsibility (full upgrade
including the new 0006 multitenancy revision). Running `alembic upgrade head`
now would also apply 0006 prematurely, conflating test results.

**Resolution:** Plan 11-07 will run `alembic upgrade head` end-to-end and
re-validate the test suite. The pre-existing stale test DB will be remediated
as part of that workflow (drop test DB, recreate, run migrations).

**Verified pre-existing:** Same failure reproduces on `git stash` (no local
changes) — confirmed unrelated to Plan 11-04 code modifications.

**Status:** ✅ RESOLVED in Plan 11-07. After applying alembic 0006_multitenancy
end-to-end (and the in-container `entrypoint` runs alembic upgrade head on
each api boot), the schema is current. `tests/test_auth.py` now reports
5 passed / 2 skipped (the skips are DEV_MODE bypass, unrelated).

---

## D-11-07-01 — Existing test suite needs user_id-aware fixtures (Phase 12 backlog)

**Discovered during:** Plan 11-07 full-suite pytest run.

**Symptom:** ~63 tests fail with `NotNullViolationError: null value in column
"user_id"` (or transitive IntegrityError) when inserting Category /
BudgetPeriod / Subscription / etc. without a `user_id`. Affects:
- tests/test_subscriptions.py (9 tests)
- tests/test_planned.py (14 tests)
- tests/test_actual_crud.py / test_actual_period.py (12 tests)
- tests/test_apply_template.py / test_templates.py / test_snapshot.py (12 tests)
- tests/test_balance.py / test_periods_api.py / test_internal_bot.py (10 tests)
- a few more.

**Root cause:** These tests were written pre-Phase-11 and seed domain rows
with `Category(name=..., kind=...)` — no `user_id`. Phase 11 made `user_id`
NOT NULL on 9 tables. Tests need adaptation:
1. Insert an AppUser fixture once.
2. Pass `user_id=<owner.id>` to every Category/Subscription/etc. constructor.
3. Wrap test transactions in `set_tenant_scope()` if they go through service
   layer (or `SET LOCAL ROLE budget_rls_test` if they verify RLS).

**Why deferred:** Plan 11-07's scope is verification of Phase-11 deliverables
— the *new* tests (test_multitenancy_isolation / test_rls_policy /
test_migration_backfill, all 14 passing). Adapting the legacy fixtures is
mechanical but cross-cuts ~60 tests; doing it inside 11-07 would 5x the
diff and obscure verification evidence.

**Resolution path:** Phase 12 (auth refactor) needs to update fixtures
anyway when `get_current_user_id` becomes the auth gate. Bundle the
fixture sweep with that work, OR open a dedicated Plan 12-XX for the
fixture migration before any new feature work in Phase 12.

**Affected:** ~63 failed + 66 errors out of 276 tests in full suite.
Phase 11 *new* tests (14) and the production code paths they exercise
are all GREEN.

---

## D-11-07-02 — Runtime postgres role is SUPERUSER (Phase 12 prerequisite)

**Discovered during:** Plan 11-07 RLS integration tests.

**Symptom:** RLS policies created in alembic 0006 are correct, but they
do NOT enforce at runtime because the `budget` postgres role (used by
api/bot/worker via DATABASE_URL) is a superuser. PostgreSQL bypasses
RLS for superusers unconditionally — even FORCE ROW LEVEL SECURITY
does not apply.

**Verified:** Tests pass under a temporary `budget_rls_test` NOSUPERUSER
NOBYPASSRLS role provisioned by `_rls_test_role` conftest fixture. RLS
mechanics work; only the runtime principal is wrong.

**Why deferred:** Changing the runtime role topology requires:
- A new POSTGRES role for app (e.g. `budget_app`) with NOSUPERUSER, GRANTs
  on schema/tables/sequences, and password rotation
- docker-compose env changes (DATABASE_URL using `budget_app:...@db/...`,
  but `budget` (or a separate `budget_migrate`) for alembic)
- Coordinated rollout: ensure migrations still run as a privileged role

This is auth/runtime infrastructure work that fits Phase 12 (auth refactor
intersects with role management).

**Resolution path:** As part of Phase 12 first plan, introduce `budget_app`
NOSUPERUSER role + DATABASE_URL split (DATABASE_URL = `budget_app`,
DATABASE_URL_MIGRATE = `budget`).

**Mitigation today:** App-side filtering via `where(Model.user_id == user_id)`
in service layer is the PRIMARY defense and works regardless of RLS. The
threat model called this out; RLS is documented as defense-in-depth.
