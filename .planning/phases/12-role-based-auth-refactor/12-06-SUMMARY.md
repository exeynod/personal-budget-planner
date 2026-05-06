---
phase: 12
plan: "06"
subsystem: tests
tags: [test-fixtures, multi-tenancy, user-id, regression-fix]
dependency_graph:
  requires: [12-01, 12-02, 12-03, 12-04, 11-multi-tenancy]
  provides: [passing-test-suite-post-phase-11-12]
  affects: [tests]
tech_stack:
  added: []
  patterns: [user_id-aware seed factories, bot_resolve_user_role mocking]
key_files:
  created:
    - tests/helpers/__init__.py
    - tests/helpers/seed.py
  modified:
    - tests/conftest.py
    - tests/test_subscriptions.py
    - tests/test_planned.py
    - tests/test_actual_crud.py
    - tests/test_actual_period.py
    - tests/test_apply_template.py
    - tests/test_templates.py
    - tests/test_snapshot.py
    - tests/test_balance.py
    - tests/test_periods_api.py
    - tests/test_internal_bot.py
    - tests/test_categories.py
    - tests/test_settings.py
    - tests/test_onboarding.py
    - tests/test_close_period_job.py
    - tests/test_worker_charge.py
    - tests/test_bot_handlers.py
    - tests/test_bot_handlers_phase4.py
decisions:
  - "Mock bot_resolve_user_role in bot handler unit tests instead of seeding DB (keeps tests isolated)"
  - "Seed AppUser explicitly in every db_setup fixture after TRUNCATE (Phase 12-03 removed /me upsert)"
  - "Use SQL lookup SELECT id FROM app_user WHERE tg_user_id = :tg to get user_id after seed"
metrics:
  duration: "~17 minutes"
  completed: "2026-05-06"
  tasks_completed: 4
  files_modified: 15
  files_created: 2
---

# Phase 12 Plan 06: Legacy Test Fixture Sweep Summary

Fixed all ~22 test files that were failing with `NotNullViolationError: null value in column "user_id"` after Phase 11 added multi-tenancy (`user_id NOT NULL FK`) to all domain tables.

## What Was Done

**Task 1 — Seed helpers + single_user fixture:**
- Created `tests/helpers/seed.py` with 7 user_id-aware factory functions: `seed_category`, `seed_budget_period`, `seed_subscription`, `seed_plan_template_item`, `seed_planned_transaction`, `seed_actual_transaction`, `seed_app_user`.
- Added `single_user` pytest fixture to `tests/conftest.py` that TRUNCATEs all domain tables, creates AppUser(owner), and yields `{"id": user.id, "tg_user_id": owner_tg_id}`.

**Task 2 — Sweep group A (subscriptions, planned, actual tests):**
- `test_subscriptions.py`, `test_planned.py`, `test_actual_crud.py`, `test_actual_period.py`: db_setup fixtures now seed AppUser after TRUNCATE; seed helpers pass `user_id=user_id` to all domain object constructors.

**Task 3 — Sweep group B (template, balance, periods, snapshot, internal, categories, settings, onboarding, close_period, worker):**
- `test_apply_template.py`, `test_templates.py`, `test_snapshot.py`, `test_balance.py`, `test_periods_api.py`, `test_internal_bot.py`: same AppUser seeding + user_id propagation pattern.
- `test_categories.py`, `test_settings.py`, `test_onboarding.py`: replaced GET /me bootstrap with explicit `session.add(AppUser(...))` seed (Phase 12-03 removed upsert from /me).
- `test_close_period_job.py`, `test_worker_charge.py`: AppUser seeded; all domain object constructors updated with user_id.

**Task 4 — Bot handler unit tests:**
- `test_bot_handlers.py` (4 async tests): patched `app.bot.handlers.bot_resolve_user_role` with `AsyncMock(return_value=UserRole.owner/revoked)`.
- `test_bot_handlers_phase4.py` (all async tests including `test_cb_disambiguation_flow`): patched `app.bot.commands.bot_resolve_user_role` similarly.

## Commits

| Hash | Description |
|------|-------------|
| a4014d4 | feat(12-06): create tests/helpers/seed.py factories + single_user fixture |
| 896def4 | fix(12-06): sweep group A — add user_id to seeds in subscriptions+planned+actual tests |
| 4a92de4 | fix(12-06): sweep group B — add user_id to seeds in template+balance+periods+internal tests |
| 11d3fa7 | fix(12-06): mock bot_resolve_user_role in bot handler unit tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] test_internal_bot.py seed_data double-seed**
- **Found during:** Task 3
- **Issue:** `seed_data` fixture was creating a new AppUser, but `db_setup` already created one in the same test session, causing a unique constraint violation on `tg_user_id`.
- **Fix:** Removed redundant AppUser creation from `seed_data`; uses SQL lookup of the existing AppUser instead.
- **Files modified:** tests/test_internal_bot.py
- **Commit:** 4a92de4

**2. [Rule 3 - Blocking issue] test_categories/settings/onboarding GET /me no longer bootstraps AppUser**
- **Found during:** Task 3
- **Issue:** These fixtures called `GET /me` expecting it to upsert AppUser, but Phase 12-03 removed that behavior.
- **Fix:** Added explicit `session.add(AppUser(...))` before setting up dependency overrides.
- **Files modified:** tests/test_categories.py, tests/test_settings.py, tests/test_onboarding.py
- **Commit:** 4a92de4

## Known Stubs

None.

## Threat Flags

None — this plan only modifies test files.

## Self-Check: PASSED

- tests/helpers/seed.py: EXISTS
- tests/helpers/__init__.py: EXISTS
- Commit a4014d4: EXISTS
- Commit 896def4: EXISTS
- Commit 4a92de4: EXISTS
- Commit 11d3fa7: EXISTS
