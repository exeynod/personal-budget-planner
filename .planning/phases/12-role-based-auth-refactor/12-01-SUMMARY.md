---
phase: 12-role-based-auth-refactor
plan: "01"
subsystem: auth-tests
tags: [tdd, red-tests, auth, role, postgres-role, threat-model-evidence]
dependency_graph:
  requires: []
  provides:
    - tests/test_role_based_auth.py
    - tests/test_require_owner.py
    - tests/test_me_returns_role.py
    - tests/test_postgres_role_runtime.py
    - tests/test_bot_role_resolution.py
  affects:
    - app/api/dependencies.py (Plans 12-02 will make RED tests GREEN)
    - app/api/router.py (Plan 12-03)
    - app/bot/auth.py (Plan 12-04)
    - alembic migrations (Plan 12-05)
tech_stack:
  added: []
  patterns:
    - db_client fixture pattern (TRUNCATE + dependency_overrides[get_db]) for isolated integration tests
    - stub endpoint registration in tests via app.get() + try/finally cleanup
key_files:
  created:
    - tests/test_role_based_auth.py
    - tests/test_require_owner.py
    - tests/test_me_returns_role.py
    - tests/test_postgres_role_runtime.py
    - tests/test_bot_role_resolution.py
  modified: []
decisions:
  - "RED tests written before implementation (TDD RED gate) — all 18 tests expected to fail on Phase-11 code"
  - "db_client fixture uses TRUNCATE...CASCADE before each test to ensure isolation"
  - "stub admin endpoint registered inline in test_require_owner.py with try/finally cleanup per T-12-01-03 threat"
  - "test_postgres_role_runtime.py uses two_tenants fixture (from conftest) for RLS test — no custom seeding needed"
metrics:
  duration: "3 minutes"
  completed_date: "2026-05-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
---

# Phase 12 Plan 01: RED Test Gate for Role-Based Auth Refactor Summary

**One-liner:** 5 RED test files (18 tests) covering ROLE-02/03/04/05 + D-11-07-02 + bot helper, all failing on Phase-11 code as TDD gate for Plans 12-02..12-05.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED tests for ROLE-02/03/04 auth-dep refactor | 05b4177 | tests/test_role_based_auth.py, tests/test_require_owner.py |
| 2 | RED tests for ROLE-05, D-11-07-02, bot helper | db9c3dc | tests/test_me_returns_role.py, tests/test_postgres_role_runtime.py, tests/test_bot_role_resolution.py |

## Test Coverage

### tests/test_role_based_auth.py (6 tests — ROLE-02 / ROLE-03)
- `test_revoked_user_gets_403` — seed revoked user → GET /me → must get 403
- `test_member_user_gets_200` — seed member user → GET /me → must get 200 (RED: current code 403 for non-OWNER)
- `test_owner_user_gets_200` — seed owner user (OWNER_TG_ID) → must get 200
- `test_unknown_tg_user_id_gets_403` — no seed → must get 403 (unknown tg_user_id)
- `test_get_current_user_returns_app_user_orm` — stub endpoint checks isinstance(user, AppUser) (RED: current returns dict)
- `test_owner_tg_id_eq_no_longer_in_get_current_user` — grep check: settings.OWNER_TG_ID must not appear in dependencies.py (RED: 2 occurrences found on lines 46, 63)

### tests/test_require_owner.py (3 tests — ROLE-04)
- `test_require_owner_allows_owner` — owner → stub admin endpoint → 200
- `test_require_owner_blocks_member` — member → stub admin endpoint → 403
- `test_require_owner_blocks_revoked` — revoked → stub admin endpoint → 403
- All 3 RED: `require_owner` does not exist in app/api/dependencies.py → ImportError

### tests/test_me_returns_role.py (2 tests — ROLE-05)
- `test_me_includes_role_for_owner` — seed owner → GET /me → JSON must have "role": "owner"
- `test_me_includes_role_for_member` — seed member → GET /me → JSON must have "role": "member"
- Both RED: current MeResponse schema lacks `role` field

### tests/test_postgres_role_runtime.py (3 tests — D-11-07-02)
- `test_runtime_database_url_uses_nosuperuser_role` — DATABASE_URL must connect as `budget_app` NOSUPERUSER NOBYPASSRLS
- `test_admin_database_url_present_and_privileged` — ADMIN_DATABASE_URL env var must exist and connect as admin
- `test_rls_enforces_at_runtime_without_test_role` — SELECT FROM category without SET LOCAL → must see 0 rows
- All RED: current runtime uses `budget` superuser; ADMIN_DATABASE_URL not set

### tests/test_bot_role_resolution.py (4 tests — bot helper)
- `test_bot_resolve_user_role_owner` — seed owner → bot_resolve_user_role() → UserRole.owner
- `test_bot_resolve_user_role_member` — seed member → UserRole.member
- `test_bot_resolve_user_role_revoked` — seed revoked → UserRole.revoked
- `test_bot_resolve_user_role_unknown_returns_none` — no seed → None
- All 4 RED: `app/bot/auth.py` does not exist → ImportError

## Verification

- `pytest --collect-only -q`: 18 tests collected from 5 files, 0 collection errors
- `test_owner_tg_id_eq_no_longer_in_get_current_user` confirmed RED: found `settings.OWNER_TG_ID` on lines 46, 63 of `app/api/dependencies.py`
- No production code modified — only tests/* added

## Deviations from Plan

None — plan executed exactly as written. All 5 test files created with exact content from plan specification.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Test-only files added.

No threat flags raised.

## TDD Gate Compliance

This plan is the RED gate for Phase 12. All 18 tests are expected to fail on Phase-11 code:
- GREEN gates will be achieved by Plans 12-02 (auth-dep refactor), 12-03 (/me role), 12-04 (bot helper), 12-05 (Postgres role split)

## Self-Check: PASSED

Files exist:
- tests/test_role_based_auth.py: FOUND
- tests/test_require_owner.py: FOUND
- tests/test_me_returns_role.py: FOUND
- tests/test_postgres_role_runtime.py: FOUND
- tests/test_bot_role_resolution.py: FOUND

Commits:
- 05b4177: FOUND
- db9c3dc: FOUND
