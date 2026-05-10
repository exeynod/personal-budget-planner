# Phase 25 — Deferred / Out-of-scope Discoveries

Items discovered during execution that are NOT in scope of the active plan.
Logged here per executor scope-boundary rules; addressed by a separate
maintenance plan or quick-task.

## Plan 25-01 — backend-actual-v10 extension

### Pre-existing test failures in tests/test_actual_crud.py

**Discovered during:** Plan 25-01 verification (running legacy CRUD tests
to check no regression).

**Root cause:** The fixture `seed_categories` in `tests/test_actual_crud.py`
constructs `Category(...)` rows without supplying `code` and `ord`. Both
columns were promoted to `NOT NULL` in Phase 22 alembic migration `0013`.
The legacy fixture pre-dates that migration — it has not been touched since
the v0.4 multi-tenant sweep (commit `896def4`, 2026-04 era).

**Failure mode:** Every test in `tests/test_actual_crud.py` that uses
`seed_categories` fails at fixture setup with:
```
NotNullViolationError: null value in column "code" of relation "category"
violates not-null constraint
```

**Why not fixed in plan 25-01:** Out of scope. The plan extends
`/api/v1/actual` POST schema/route — it does not own legacy fixture
maintenance. Fixing it would require a separate sweep across other
fixtures with the same shape (`tests/test_actual_period.py`,
`tests/test_balance.py` likely also need it). New v10 surface is fully
covered by `tests/api/test_actual_v10_extension.py` (16/16 green).

**Suggested follow-up:** quick-task to backfill `code` and `ord` in legacy
test fixtures across the suite.
