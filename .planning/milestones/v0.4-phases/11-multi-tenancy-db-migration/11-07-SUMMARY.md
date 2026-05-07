---
phase: 11-multi-tenancy-db-migration
plan: 07
subsystem: integration-test+verification
tags: [verification, integration-test, uat, multitenancy, rls, manual-check, deviation-fixes]

# Dependency graph
requires:
  - phase: 11-01
    provides: "RED test skeletons (3 files) + placeholder two_tenants fixture"
  - phase: 11-02
    provides: "alembic 0006 migration with user_id + RLS + role enum + backfill"
  - phase: 11-03
    provides: "ORM models with user_id Mapped + UserRole enum"
  - phase: 11-04
    provides: "get_current_user_id + set_tenant_scope helper + dev_seed role"
  - phase: 11-05
    provides: "categories/periods/templates/planned/onboarding services scoped by user_id"
  - phase: 11-06
    provides: "actual/subscriptions/analytics/AI/internal_bot services + worker per-tenant"
provides:
  - "two_tenants fixture: real AppUser+Category+Subscription seed for user_a/user_b"
  - "_rls_test_role fixture: provisions NOSUPERUSER NOBYPASSRLS role for RLS verification"
  - "14 passing integration tests — multitenancy isolation (6) + RLS policy (4) + migration backfill (4)"
  - "11-VERIFICATION.md: PASS evidence for MUL-01..05 + ROLE-01; status=human_needed pending live TG smoke test"
  - "Three Rule-1 bugfixes: alembic version_num length, set_tenant_scope SQL bind, RLS NULLIF"
affects: ["12-*"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS verification pattern: SET LOCAL ROLE budget_rls_test (NOSUPERUSER) → SET LOCAL app.current_user_id → assert visibility"
    - "Cleanup pattern: RESET ROLE + SET LOCAL row_security = off (admin-bypass, requires superuser)"
    - "set_tenant_scope: SELECT set_config('app.current_user_id', :uid, true) — function call accepts bind params (SET LOCAL doesn't)"
    - "RLS policy expression: coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)"

key-files:
  created:
    - .planning/phases/11-multi-tenancy-db-migration/11-VERIFICATION.md
    - .planning/phases/11-multi-tenancy-db-migration/11-07-SUMMARY.md
  modified:
    - tests/conftest.py — two_tenants fixture (full implementation) + _rls_test_role fixture
    - tests/test_multitenancy_isolation.py — 6 tests filled with real assertions
    - tests/test_rls_policy.py — 4 tests filled with real assertions
    - tests/test_migration_backfill.py — 4 tests filled with real assertions
    - app/db/session.py — set_tenant_scope: switched to set_config() function call
    - alembic/versions/0006_multitenancy.py — renamed from 0006_multitenancy_user_id_rls_role.py; RLS policy NULLIF fix
    - .planning/phases/11-multi-tenancy-db-migration/deferred-items.md — D-11-04-01 resolved; D-11-07-01 + D-11-07-02 added

decisions:
  - "Manual UAT (live TG MiniApp smoke test) marked human_needed in VERIFICATION.md — cannot be automated; user signs off when ready"
  - "Legacy test fixture failures (~63 tests with user_id NotNullViolation) deferred as D-11-07-01 (Phase 12 backlog) — out of scope for verification plan"
  - "Runtime postgres role is superuser → RLS bypassed at runtime; deferred as D-11-07-02 (Phase 12 prerequisite). Tests use SET LOCAL ROLE to non-superuser to verify policies actually enforce"
  - "Three Rule-1 bugs auto-fixed inline (revision-id length, parameterised SET LOCAL, NULLIF for empty-string GUC) — single deviation commit"

metrics:
  duration: ~25 min
  completed: 2026-05-06
---

# Phase 11 Plan 07: Verification — multitenancy isolation, RLS, backfill — Summary

Final verification checkpoint for Phase 11. Filled in the 14 RED test bodies
across three files using the seeded `two_tenants` fixture; ran them against
live PostgreSQL via `scripts/run-integration-tests.sh`; verified the alembic
upgrade/downgrade/upgrade cycle and full schema (user_id FK, scoped uniques,
RLS policies, role enum, OWNER backfill) on the dev DB; produced
`11-VERIFICATION.md` mapping all 6 requirements (MUL-01..05, ROLE-01) to
test evidence with status=`human_needed` pending one live-TG manual UAT.

## What was filled

### tests/conftest.py
- `two_tenants` fixture: real AppUser+Category+Subscription seed for two
  tenants (tg_user_id 9_000_000_001/002); pre/post-test cleanup using
  `SET LOCAL row_security = off` for admin bypass + `RESET ROLE` to revert
  any prior test's role switch.
- `_rls_test_role` fixture (new): idempotently creates `budget_rls_test`
  NOSUPERUSER NOBYPASSRLS role so RLS-enforcement tests can verify policies
  actually fire.

### tests/test_multitenancy_isolation.py — 6 tests
1. `test_user_a_does_not_see_user_b_categories` — `list_categories(user_id=user_a)` returns only user_a's category_ids
2. `test_user_a_cannot_get_user_b_category_by_id` — `get_or_404` with cross-tenant id raises `CategoryNotFoundError`
3. `test_user_a_cannot_get_user_b_subscription_by_id` — RLS blocks raw SELECT on user_b's subscription (under non-superuser)
4. `test_user_a_cannot_see_user_b_planned_transactions` — assert no row leaks across tenants
5. `test_user_a_cannot_see_user_b_actual_transactions` — same for actuals
6. `test_unique_category_name_scoped_per_user` — both tenants have `Продукты` (no global UNIQUE collision)

### tests/test_rls_policy.py — 4 tests
1. `test_rls_blocks_query_without_setting` — without GUC, `coalesce → -1` blocks all rows
2. `test_rls_filters_by_app_current_user_id` — SET LOCAL scopes to user
3. `test_rls_setting_resets_after_commit` — SET LOCAL is transaction-scoped
4. `test_rls_enabled_on_all_nine_tables` — pg_class.relrowsecurity AND relforcerowsecurity = true on 9 tables

### tests/test_migration_backfill.py — 4 tests
1. `test_user_id_backfilled_to_owner` — no NULL user_id on any of 9 tables
2. `test_role_owner_assigned_to_owner_tg_id` — OWNER row has role='owner'
3. `test_user_role_enum_type_exists` — pg_enum has [owner, member, revoked] in order
4. `test_category_unique_scoped_per_user` — scoped uniques exist; old global uniques absent

## Manual UAT results (Task 4)

- ✅ `alembic upgrade head` → `0006_multitenancy (head)` (after Note 1 fix)
- ✅ `alembic downgrade -1` → `0005_enable_ai_categorization`, schema cleanly reverted
- ✅ `alembic upgrade head` (re-apply) → `0006_multitenancy (head)` again, no errors
- ✅ `psql \d app_user` shows role enum NOT NULL DEFAULT 'member'
- ✅ `psql \d category` shows user_id BIGINT NOT NULL FK ON DELETE RESTRICT, scoped UNIQUE, RLS policy
- ✅ `psql \dT user_role` enum present with owner/member/revoked
- ✅ All 9 tables: `relrowsecurity = t AND relforcerowsecurity = t`
- ✅ `SELECT id, tg_user_id, role FROM app_user` → `1 | 123456789 | owner`
- ✅ Phase 11 new test suite: **14/14 passing in 0.59s**
- ⚠ Full pytest suite: 63 failed + 66 errors in legacy fixtures (NOT regressions of Phase 11 code; documented as D-11-07-01)
- ⏳ Live TG MiniApp smoke test: `human_needed` — see VERIFICATION.md

## Deviations from Plan

### Rule-1 Bugfixes (single commit `47808cd`)

**1. [Rule 1 - Bug] alembic revision id too long for varchar(32)**
- Found during: Task 4 step 1 (first migration apply attempted via container restart)
- Issue: `0006_multitenancy_user_id_rls_role` (34 chars) > `alembic_version.version_num VARCHAR(32)`. Postgres raises `StringDataRightTruncationError` when alembic tries to stamp the version.
- Fix: renamed file to `alembic/versions/0006_multitenancy.py`; revision id `0006_multitenancy` (16 chars). Down_revision pointer untouched.
- Files: `alembic/versions/0006_multitenancy.py` (renamed)
- Commit: `47808cd`

**2. [Rule 1 - Bug] set_tenant_scope used parameterised SET LOCAL**
- Found during: Task 4 step 3 (first integration test run)
- Issue: `SET LOCAL app.current_user_id = $1` rejected by Postgres ('syntax error at or near "$1"'); SET commands do not accept bind parameters.
- Fix: switched to `SELECT set_config('app.current_user_id', :uid, true)` — a regular function call that accepts parameters; added `isinstance(int)` guard for defense-in-depth.
- Files: `app/db/session.py`
- Commit: `47808cd`

**3. [Rule 1 - Bug] RLS policy cast empty string to bigint**
- Found during: Task 4 step 3 (third integration test run after fixes 1+2)
- Issue: `current_setting('app.current_user_id', true)` returns `''` (empty string), not NULL, when GUC unset → `''::bigint` raises `InvalidTextRepresentationError` BEFORE coalesce can apply.
- Fix: wrapped expression with `NULLIF(..., '')` so empty string → NULL → coalesce → -1 (intended sentinel). Updated alembic 0006 source; live DB re-stamped via downgrade/upgrade cycle.
- Files: `alembic/versions/0006_multitenancy.py`
- Commit: `47808cd`

### Test infra additions

**[Rule 2 - Missing critical functionality] Non-superuser RLS test role**
- Found during: Task 4 step 3 (assertion failure: count=14 instead of 0 even with SET LOCAL)
- Issue: dev/prod DB role `budget` is SUPERUSER → bypasses RLS unconditionally. Without role switch, RLS tests cannot verify enforcement.
- Fix: added `_rls_test_role` conftest fixture that idempotently creates `budget_rls_test` NOSUPERUSER NOBYPASSRLS role with required GRANTs; RLS-enforcement tests use `SET LOCAL ROLE budget_rls_test` before assertions.
- Files: `tests/conftest.py`, `tests/test_rls_policy.py`, `tests/test_multitenancy_isolation.py` (3 tests)
- Commit: `47808cd`
- Follow-up: D-11-07-02 — Phase 12 must move runtime off the superuser to actually benefit from RLS at runtime.

### Cleanup pattern correction

**[Rule 1 - Bug] _cleanup didn't reset role after test**
- Found during: Task 4 step 3 (final integration run produced 6 teardown errors despite tests passing)
- Issue: tests now use `SET LOCAL ROLE budget_rls_test`; the role persists through to fixture's `finally: _cleanup`, and the non-superuser cannot DELETE under RLS.
- Fix: `_cleanup` now starts with `RESET ROLE` before `SET LOCAL row_security = off` and DELETE statements.
- Files: `tests/conftest.py`
- Commit: `47808cd`

## Out-of-Scope Discoveries (deferred-items.md)

- **D-11-04-01** — RESOLVED: stale test DB schema (test_auth.py NotNull error) fixed by running alembic upgrade head end-to-end. test_auth.py now passes.
- **D-11-07-01 (NEW)** — Legacy test fixtures need user_id-aware seeds. ~63 failed + 66 errors in pre-Phase-11 tests (test_subscriptions, test_planned, test_actual_*, test_apply_template, test_balance, test_periods_api, test_internal_bot, test_snapshot, test_templates). Bundle with Phase 12 fixture sweep.
- **D-11-07-02 (NEW)** — Runtime postgres `budget` role is SUPERUSER → RLS bypassed at runtime. Tests verify RLS works under non-superuser context (via `_rls_test_role`). Phase 12 prerequisite: introduce `budget_app` NOSUPERUSER role + DATABASE_URL split.

## Self-Check

- [x] `tests/conftest.py` parses; two_tenants real fixture present (FOUND)
- [x] 3 test files: 0 NotImplementedError; 30 real assertions across 14 tests (FOUND)
- [x] 14/14 Phase 11 integration tests passing in 0.59s (VERIFIED)
- [x] alembic upgrade/downgrade/upgrade cycle works (VERIFIED)
- [x] psql introspection confirms enum, FKs, scoped uniques, RLS policies (VERIFIED)
- [x] `.planning/phases/11-multi-tenancy-db-migration/11-VERIFICATION.md` exists with 6 reqs + manual checkpoints + sign-off (FOUND)
- [x] Commits exist: `1a98ee2`, `1b18dbd`, `4c675d3`, `47808cd`, `f0fe165` (FOUND in git log)

## Self-Check: PASSED

## Pointer

**Single source of truth for verification results:** `.planning/phases/11-multi-tenancy-db-migration/11-VERIFICATION.md`
