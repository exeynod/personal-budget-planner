---
phase: 67-remediation-cleanup
plan: 01
subsystem: api
tags: [fastapi, pydantic, subscriptions, response_model, v10-contract, integration-test]

# Dependency graph
requires:
  - phase: 22-backend-schema-logic
    provides: "SubscriptionV10Extension mixin + ORM day_of_month/account_id/posted_txn_id columns (migration 0014)"
  - phase: 63-subscriptions
    provides: "iOS SubscriptionsViewModel writing day_of_month/account_id via V10 PATCH"
provides:
  - "SubscriptionReadV10 read schema (legacy SubscriptionRead + day_of_month/account_id/posted_txn_id)"
  - "GET/POST/PATCH /subscriptions return the V10 read shape (P0-1 / BE-F1 closed)"
  - "Integration test proving the three V10 fields round-trip on GET/POST"
affects: [63-subscriptions, ios-subscriptions-end-to-end]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only response_model widening via mixin inheritance (SubscriptionRead + V10Extension) — no new writable surface"

key-files:
  created: []
  modified:
    - app/api/schemas/subscriptions.py
    - app/api/routes/subscriptions.py
    - tests/test_subscriptions.py

key-decisions:
  - "SubscriptionReadV10 inherits both SubscriptionRead and SubscriptionV10Extension; from_attributes proxies the 3 ORM scalar columns directly (no relationship eager-load needed for posted_txn_id)"
  - "Test sets day_of_month/account_id on the ORM row directly (not via legacy PATCH, which has extra=forbid and rejects them) — mirrors the v1.0 PATCH path"

patterns-established:
  - "Pattern: widen public read contracts by composing the legacy read model with a from_attributes mixin, leaving request bodies (extra=forbid) untouched"

requirements-completed: [P0-1]

# Metrics
duration: 3min
completed: 2026-05-20
---

# Phase 67 Plan 01: SubscriptionReadV10 response_model Summary

**`/subscriptions` GET/POST/PATCH now return the v1.0 read shape (day_of_month / account_id / posted_txn_id), unblocking iOS phase 63 end-to-end.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-20T16:37:44Z
- **Completed:** 2026-05-20T16:43:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Defined `SubscriptionReadV10(SubscriptionRead, SubscriptionV10Extension)` — the read model the codebase already gestured at (the mixin existed since Phase 22 but the combined class was never created).
- Switched the three public routes (`GET ""`, `POST ""`, `PATCH "/{sub_id}"`) to `response_model=SubscriptionReadV10` and `SubscriptionReadV10.model_validate(...)`.
- DELETE / charge-now / post / unpost left unchanged.
- Added 3 integration tests proving day_of_month/account_id echo back on GET and posted_txn_id surfaces after `/post`; full module green (19 passed, 1 skipped).

## Task Commits

1. **Task 1: Define SubscriptionReadV10 and wire list/post/patch** - `4bf7b37` (feat)
2. **Task 2: Integration test — V10 fields round-trip** - `0670c84` (test)

**Plan metadata:** see final docs commit.

## Files Created/Modified
- `app/api/schemas/subscriptions.py` - Added `SubscriptionReadV10` class (legacy read + V10 extension mixin, `from_attributes=True`).
- `app/api/routes/subscriptions.py` - Imported `SubscriptionReadV10`; list/post/patch use it as `response_model` and return value; other endpoints untouched.
- `tests/test_subscriptions.py` - Added `seed_account` fixture + 3 round-trip tests; fixed `seed_categories` for NOT-NULL `code`/`ord` drift.

## Decisions Made
- `posted_txn_id` is a scalar FK column on the ORM `Subscription`, so `from_attributes` reads it without loading the `posted_txn` relationship — no change to `list_subscriptions` / `update_subscription` eager-loading needed.
- Legacy `SubscriptionUpdate` has `extra="forbid"` and no day_of_month/account_id, so the test sets those columns directly on the ORM session (the v1.0 PATCH path's behavior) rather than through the legacy PATCH body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed `seed_categories` fixture for NOT-NULL `Category.code`/`ord`**
- **Found during:** Task 2 (integration test run)
- **Issue:** The `category` table gained NOT-NULL `code` (String 40) and `ord` (String 2) columns (Phase 22 schema drift), but the `seed_categories` fixture in `tests/test_subscriptions.py` never set them. Every DB-backed test in the module failed with `NotNullViolationError: null value in column "code"` — a pre-existing break, but it blocked all P0-1 verification.
- **Fix:** Set `code="subs"/"archived"` and `ord="10"/"99"` on the two seeded categories (distinct codes respect the partial unique index `uq_category_user_code`).
- **Files modified:** tests/test_subscriptions.py
- **Verification:** Full `tests/test_subscriptions.py` run: 19 passed, 1 skipped (was 0 passing / all erroring before).
- **Committed in:** `0670c84` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fixture fix was required to verify P0-1 at all — without it the integration test could not run. Contained to the same test file; no production scope creep.

## Issues Encountered
- Local `.venv` had broken symlinks (underlying `/usr/local/bin/python3` interpreter removed), so host-side pytest was impossible. Resolved by running pytest inside the docker `api` container (the project's documented integration-test path, `scripts/run-integration-tests.sh`). Rebuilt the `api` image (`up -d --build api`) since the dev override does not bind-mount `./app`, then restored the api container to its non-test (base+dev) configuration afterward.

## Threat Flags
None — read-only response widening. Request bodies keep `extra="forbid"`; the three new fields are the caller's own tenant rows (RLS + `user_id` filter in `list_subscriptions` already scope them). Matches threat register T-67-01-01 (accept) / T-67-01-02 (mitigate).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- P0-1 closed: iOS phase 63 round-trips day_of_month/account_id and the posted-badge (`posted_txn_id`) can now render. Remaining Phase 67 P0s (P0-2 web tsc build, P0-3 iOS suppressForbiddenHandler) are independent and unblocked.

## Self-Check: PASSED

---
*Phase: 67-remediation-cleanup*
*Completed: 2026-05-20*
