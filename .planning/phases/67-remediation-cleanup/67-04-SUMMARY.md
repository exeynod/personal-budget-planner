---
phase: 67-remediation-cleanup
plan: 04
subsystem: backend-categories-subscriptions
tags: [backend, python, fastapi, sqlalchemy, embeddings, concurrency, alembic, rls]

# Dependency graph
requires:
  - phase: 67-remediation-cleanup
    provides: SubscriptionReadV10 round-trip (67-01) exposing posted_txn_id
provides:
  - _refresh_embedding threads user_id + sets tenant scope (embeddings persist for user categories)
  - post_subscription serialises on SELECT ... FOR UPDATE (double-post race closed)
  - partial unique index uq_subscription_posted_txn_id (belt-and-braces against double-post)
  - IntegrityError on post → SubscriptionAlreadyPostedError (HTTP 409)
affects: [ai-suggest-category, subscriptions-post, money-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Background tasks that write tenant-scoped rows MUST call set_tenant_scope on their own session before INSERT — request-scoped RLS context does not carry into BackgroundTasks."
    - "Money-mutating idempotency = row lock (SELECT ... FOR UPDATE) for serialisation + partial unique index as DB-enforced backstop; IntegrityError mapped to the same 409 as the in-memory guard."
    - "Alembic revision id strings must be <= 32 chars (alembic_version.version_num is varchar(32))."

key-files:
  created:
    - alembic/versions/0025_subscription_posted_txn_unique.py
  modified:
    - app/api/routes/categories.py
    - app/services/subscriptions.py
    - tests/test_categories.py
    - tests/test_subscriptions.py

key-decisions:
  - "P1-2 used BOTH defences the plan offered (FOR UPDATE row lock AND partial unique index) rather than picking one — the row lock serialises the common path, the unique index is a connection-ordering-proof backstop, and the service maps the resulting IntegrityError to the existing SubscriptionAlreadyPostedError → 409 so the route layer is unchanged."
  - "Migration revision id shortened from 0025_subscription_posted_txn_unique (35 chars) to 0025_sub_posted_txn_uq (22 chars) after a StringDataRightTruncationError — alembic_version.version_num is varchar(32). The descriptive filename is retained."
  - "P2-13 savepoint-rollback test drives post_subscription directly against a real session with create_actual_v10 monkeypatched to insert-then-raise, then rolls back — asserting no orphan ActualTransaction and posted_txn_id NULL. This proves the partial-failure property at the service boundary (the route's get_db rolls back the whole transaction on any exception)."

patterns-established:
  - "Embedding refresh is tenant-scoped end-to-end: user_id flows create_category/update_category → _refresh_embedding → set_tenant_scope + upsert_category_embedding(user_id=...)."

requirements-completed: [P1-1, P1-2, P2-13]

# Metrics
duration: 5min
completed: 2026-05-20
---

# Phase 67 Plan 04: Backend P1-1 embeddings + P1-2 double-post race + P2-13 savepoint test Summary

**Closed two backend P1s and the QA savepoint gap: `_refresh_embedding` now threads `user_id` and sets tenant scope so post-onboarding category embeddings actually persist (was a swallowed `TypeError` degrading suggest to substring-only); `post_subscription` is race-safe via `SELECT ... FOR UPDATE` plus a partial unique index on `posted_txn_id`, with `IntegrityError → 409`; and a savepoint-rollback test proves a partial failure mid-post leaves no orphan transaction.**

## Performance

- 3 tasks, 4 atomic commits (RED test + GREEN fix for P1-1, fix+migration for P1-2, tests for P1-2/P2-13).
- pytest for touched modules green (30 passed, 1 skipped) excluding one pre-existing out-of-scope failure (see Deferred Issues).
- Migration 0025 applies cleanly; partial unique index confirmed present in DB.

## What Was Built

### Task 1 — P1-1 `_refresh_embedding` (categories.py)
- Signature changed to `_refresh_embedding(category_id, name, user_id)`; both call sites (`create_category`, `update_category`) now pass `user_id`.
- Background session calls `await set_tenant_scope(session, user_id)` before the upsert (RLS context).
- Upsert now passes kw-only `user_id=user_id` (previously omitted → `TypeError`, swallowed by the `except`).
- RED test `test_refresh_embedding_persists_row_for_user_category` asserts a `category_embedding` row is persisted for a freshly created user category (embed_text mocked, real DB write).

### Task 2 — P1-2 double-post race (subscriptions.py + migration 0025)
- `post_subscription` SELECT now `.with_for_update()` — concurrent posts serialise on the row.
- `db.flush()` wrapped: `IntegrityError` → rollback → `SubscriptionAlreadyPostedError` (mapped to 409 by the route).
- Migration `0025_subscription_posted_txn_unique.py`: `CREATE UNIQUE INDEX uq_subscription_posted_txn_id ON subscription (posted_txn_id) WHERE posted_txn_id IS NOT NULL` with a clean downgrade.

### Task 3 — P1-2 / P2-13 tests (test_subscriptions.py)
- `test_double_post_yields_single_txn_and_409`: second POST → 409 (`already_posted`, echoing first txn id), exactly one `ActualTransaction`, `posted_txn_id` set once.
- `test_post_partial_failure_savepoint_rollback_no_orphan`: `create_actual_v10` monkeypatched to insert-then-raise; after rollback, zero orphan transactions and `posted_txn_id` NULL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Alembic revision id exceeded varchar(32)**
- **Found during:** Task 2 (api container failed `alembic upgrade head` on boot)
- **Issue:** revision id `0025_subscription_posted_txn_unique` (35 chars) overflowed `alembic_version.version_num varchar(32)` → `StringDataRightTruncationError`, api unhealthy. The failing migration ran in a transaction so it rolled back cleanly (version stayed at 0024, index absent) — no manual DB repair needed.
- **Fix:** shortened revision id to `0025_sub_posted_txn_uq` (filename retained); rebuilt api → migration applied, index present.
- **Files modified:** alembic/versions/0025_subscription_posted_txn_unique.py
- **Commit:** 126178d

**2. [Rule 3 - Blocking] Test seed missing NOT NULL `code` / `ord`-format columns**
- **Found during:** Task 1 (RED test setup)
- **Issue:** `seed_category` helper does not set `code` (NOT NULL) or `ord` (CHECK `~ '^[0-9]{2}$'`) — IntegrityError on insert.
- **Fix:** test constructs `Category(... code="coffee", ord="00")` directly (mirrors `seed_categories` in test_subscriptions.py).
- **Files modified:** tests/test_categories.py
- **Commit:** eefefb8 (RED) / fc0021f (GREEN)

## Deferred Issues

- `tests/test_categories.py::test_seed_creates_14_categories` fails (`POST /onboarding/complete` → 422). **Pre-existing baseline failure**, unrelated to this plan's files (embedding refresh / double-post). Out of scope per SCOPE BOUNDARY; logged to `.planning/phases/67-remediation-cleanup/deferred-items.md`.

## TDD Gate Compliance

- P1-1: `test(67-04)` RED commit eefefb8 (TypeError) → `fix(67-04)` GREEN commit fc0021f. Gate sequence satisfied.
- P1-2/P2-13 (Task 3, non-tdd task): tests added after the fix (impl from Task 2 already present); both pass on first run.

## Verification

- `pytest tests/test_subscriptions.py -q` → 19 passed, 1 skipped.
- `pytest tests/test_categories.py -k "embed or refresh"` → 1 passed.
- `pytest -k "double or idempot or savepoint or rollback or orphan"` → 2 passed.
- `grep with_for_update app/services/subscriptions.py` → present (line 402).
- DB: `alembic_version = 0025_sub_posted_txn_uq`; `uq_subscription_posted_txn_id` partial unique index present.
- Stack restored to base+dev (api healthy, tests/ bind-mount removed).

## Self-Check: PASSED

All key files exist (categories.py, subscriptions.py, migration 0025, both test files, SUMMARY) and all 4 commits (eefefb8, fc0021f, 126178d, 0dc8041) are present in git history.
