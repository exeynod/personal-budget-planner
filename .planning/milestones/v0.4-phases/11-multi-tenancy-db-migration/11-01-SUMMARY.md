---
phase: 11-multi-tenancy-db-migration
plan: 01
subsystem: testing
tags: [pytest, multitenancy, rls, fixtures, red-phase, asyncio]

# Dependency graph
requires:
  - phase: none
    provides: starting point — only existing conftest.py fixtures (db_session, async_client) referenced
provides:
  - two_tenants pytest fixture skeleton (skip placeholder, returns tuple[int, int])
  - 14 RED test signatures across 3 new test files (multitenancy isolation, RLS policy, migration backfill)
  - Acceptance-criteria-as-code for Plan 11-07 to fill in
affects: [11-02, 11-03, 11-04, 11-05, 11-06, 11-07]

# Tech tracking
tech-stack:
  added: []  # no new libraries; uses existing pytest, pytest-asyncio, sqlalchemy
  patterns:
    - "RED-skeleton-with-NotImplementedError: tests raise with explicit Plan 11-07 pointer text in message instead of pass/assert False"
    - "Fixture-as-skip-placeholder: fixture itself calls pytest.skip when downstream data isn't ready, so chained tests skip cleanly"

key-files:
  created:
    - tests/test_multitenancy_isolation.py
    - tests/test_rls_policy.py
    - tests/test_migration_backfill.py
  modified:
    - tests/conftest.py

key-decisions:
  - "RED tests raise NotImplementedError (not pass/skip-by-default) — pytest reports 5 explicit FAILs which cannot be silently green"
  - "two_tenants fixture skips rather than seeds — migration is Plan 11-02; seeding into pre-migration schema would error or silently insert into a future-dropped table"
  - "Each test docstring + raise message names the exact Plan 11-07 implementation step (e.g. 'after refactor get_or_404(db, category_id, user_id)')"

patterns-established:
  - "Wave-0 RED files use future-self pointer messages: each NotImplementedError quotes the future call signature so 11-07 has copy-paste-ready acceptance code"
  - "two_tenants returns tuple[int, int] (not richer dict) — keeps fixture surface minimal until 11-07 needs more"

requirements-completed: []  # MUL-03/MUL-05 are RED-skeleton'd here, not yet implemented; will be marked complete after Plan 11-07 fills assertions and they pass

# Metrics
duration: 3min
completed: 2026-05-06
---

# Phase 11 Plan 01: RED tests + 2-tenant fixture skeleton Summary

**14 explicit RED test signatures across 3 new pytest files plus a `two_tenants` fixture skip-placeholder, locking in acceptance criteria for the Phase 11 multi-tenant migration before any production code changes.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-06T16:16:50Z
- **Completed:** 2026-05-06T16:19:41Z
- **Tasks:** 3
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments

- `two_tenants` async fixture added to `tests/conftest.py` returning `tuple[int, int]` (currently `pytest.skip`-placeholder until 11-07 seeds two real `app_user` rows)
- 6 multi-tenancy isolation test signatures (MUL-03 + MUL-04) covering category/subscription/planned/actual cross-tenant queries and per-user unique constraint
- 4 RLS policy test signatures (MUL-02): block-without-setting, filter-by-setting, transaction-scope reset, relrowsecurity on all 9 domain tables
- 4 migration backfill test signatures (MUL-04 + MUL-05 + ROLE-01): user_id backfilled to OWNER, role='owner' assigned, user_role enum exists, category unique scoped per user
- All 14 tests verified to FAIL or SKIP (not pass) when run via `pytest --tb=no -q`: 5 explicit FAIL on NotImplementedError, 9 SKIP via `two_tenants` fixture chain — zero false-greens

## Task Commits

Each task committed atomically:

1. **Task 1: extend conftest.py with two_tenants fixture skeleton** — `44f43b7` (test)
2. **Task 2: add tests/test_multitenancy_isolation.py RED skeleton (6 tests)** — `7f13129` (test)
3. **Task 3: add tests/test_rls_policy.py + tests/test_migration_backfill.py RED skeletons (4+4 tests)** — `6d84d47` (test)

**Plan metadata:** _(committed alongside SUMMARY)_

## Test Signatures (14 total)

### tests/test_multitenancy_isolation.py (6 tests, MUL-03 + MUL-04)

| Test | Goal |
|------|------|
| `test_user_a_does_not_see_user_b_categories` | `list_categories(user_id=user_a)` returns no rows belonging to user_b |
| `test_user_a_cannot_get_user_b_category_by_id` | direct GET of user_b's category_id from user_a → CategoryNotFoundError |
| `test_user_a_cannot_get_user_b_subscription_by_id` | same pattern for subscription |
| `test_user_a_cannot_see_user_b_planned_transactions` | `list_planned_for_period(period_id, user_id=user_a)` filters strictly |
| `test_user_a_cannot_see_user_b_actual_transactions` | same for actuals |
| `test_unique_category_name_scoped_per_user` | both tenants can hold a `Category(name='Продукты')` simultaneously (MUL-04) |

### tests/test_rls_policy.py (4 tests, MUL-02)

| Test | Goal |
|------|------|
| `test_rls_blocks_query_without_setting` | SELECT on `category` without `SET LOCAL app.current_user_id` returns 0 rows (coalesce(setting,-1)) |
| `test_rls_filters_by_app_current_user_id` | with `SET LOCAL app.current_user_id = user_a_id`, all returned `user_id` match |
| `test_rls_setting_resets_after_commit` | new transaction without SET LOCAL is again 0-rows (transaction-scoped GUC) |
| `test_rls_enabled_on_all_nine_tables` | `pg_class.relrowsecurity = true` on all 9 domain tables |

### tests/test_migration_backfill.py (4 tests, MUL-04 + MUL-05 + ROLE-01)

| Test | Goal |
|------|------|
| `test_user_id_backfilled_to_owner` | every domain row has `user_id = (SELECT id FROM app_user WHERE tg_user_id=OWNER_TG_ID)`; no NULLs |
| `test_role_owner_assigned_to_owner_tg_id` | `app_user.role = 'owner'` for OWNER_TG_ID row |
| `test_user_role_enum_type_exists` | `pg_enum` for `user_role` has labels `['owner','member','revoked']` |
| `test_category_unique_scoped_per_user` | a `pg_constraint` named like `uq_category_user_id_name` (or similar containing user_id) exists |

## RED-state verification

```
$ ./.venv-test/bin/pytest tests/test_multitenancy_isolation.py \
    tests/test_rls_policy.py tests/test_migration_backfill.py --tb=no -q
sssssssssFFFFF
5 failed, 9 skipped in 0.54s
```

- **5 FAIL** — direct NotImplementedError raises from tests not using `two_tenants` (the `_enabled_on_all_nine_tables` RLS test + 4 backfill tests). Exceeds the ≥3 threshold from execution_rules.
- **9 SKIP** — tests that take `two_tenants` fixture skip via the fixture's own `pytest.skip` (documented behavior; chain-skip is correct RED state per threat model T-11-01-02).
- **0 PASS** — no false-greens. Pytest cannot accidentally report this skeleton as green in CI.

## Files Created/Modified

- `tests/conftest.py` — appended `two_tenants` async fixture (27 lines added, all existing fixtures preserved unchanged)
- `tests/test_multitenancy_isolation.py` — 6 async tests, 82 lines, MUL-03 + MUL-04 acceptance signatures
- `tests/test_rls_policy.py` — 4 async tests, 60 lines, MUL-02 acceptance signatures
- `tests/test_migration_backfill.py` — 4 async tests, 60 lines, MUL-04 + MUL-05 + ROLE-01 acceptance signatures

## Decisions Made

- **NotImplementedError instead of `pass`/`assert False`** — explicit raise produces FAIL with a useful message (Plan 11-07 pointer); `assert False` would FAIL but with no diagnostic; `pass` would silently green.
- **Fixture skips rather than seeds** — Plan 11-02 (parallel) is creating the migration; seeding `app_user` rows into a pre-migration schema is fine but seeding into future-dropped/altered tables would either error or insert orphaned rows. Skip-placeholder is forward-compatible.
- **Hard-coded `(1, 2)` after the skip** — unreachable, present only to satisfy the `tuple[int, int]` return-type hint (mypy/runtime introspection won't choke).

## Deviations from Plan

None - plan executed exactly as written. All three tasks' acceptance criteria validated as specified (AST parse, grep counts, file presence, raise-not-pass via pytest run).

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- `python` not on PATH — used `python3` for AST validation. No action needed.
- `gsd-sdk` CLI not available on this machine and not present under `node_modules/`. STATE.md / ROADMAP.md / REQUIREMENTS.md handler updates that the executor protocol normally drives via the SDK were skipped; left for the orchestrator or follow-up to apply once SDK is reachable. Per-task commits and SUMMARY are intact, so no information loss.

## Next Phase Readiness

- **Plan 11-02** (alembic migration with user_id columns + RLS) can run in parallel — no dependency on 11-01 outcome.
- **Plan 11-07** (verification) consumes this skeleton: each `NotImplementedError` message contains the exact next step (function signature, expected SQL, expected return). Replace each `raise` with the documented assertion to flip RED → GREEN.
- **Pointer for 11-07:** these tests are unblocked once (a) 11-02 migration applied, (b) 11-03 ORM models updated with `user_id`, (c) 11-04..06 services accept `user_id` parameter, and (d) `two_tenants` fixture seeds two real `app_user` rows.

## Self-Check: PASSED

- FOUND: tests/conftest.py (modified, two_tenants present)
- FOUND: tests/test_multitenancy_isolation.py
- FOUND: tests/test_rls_policy.py
- FOUND: tests/test_migration_backfill.py
- FOUND commit: 44f43b7 (Task 1)
- FOUND commit: 7f13129 (Task 2)
- FOUND commit: 6d84d47 (Task 3)
- AST parse: all 4 files valid Python
- Pytest RED state: 5 FAIL + 9 SKIP, 0 PASS

---
*Phase: 11-multi-tenancy-db-migration*
*Completed: 2026-05-06*
