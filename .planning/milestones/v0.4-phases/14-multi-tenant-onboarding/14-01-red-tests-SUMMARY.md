---
phase: 14-multi-tenant-onboarding
plan: 01
subsystem: testing
tags: [pytest, tdd, red-tests, fastapi, aiogram, embeddings, onboarding]

# Dependency graph
requires:
  - phase: 12-auth-refactor
    provides: require_owner pattern — mirrored for require_onboarded in test stubs
  - phase: 11-db-foundation
    provides: AppUser.onboarded_at nullable field, CategoryEmbedding with user_id FK
provides:
  - RED test suite for Phase 14 GREEN targets (require_onboarded, backfill_user_embeddings, cmd_start invite branch)
  - seed_member_not_onboarded factory in tests/helpers/seed.py
affects:
  - 14-02-require-onboarded-dep
  - 14-03-backfill-embeddings
  - 14-04-bot-handler-onboarding

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RED test with top-level import for ModuleNotFoundError at collection time (test_embedding_backfill.py)
    - Stub route registration pattern with guard (already-registered check) mirroring test_require_owner.py

key-files:
  created:
    - tests/test_require_onboarded.py
    - tests/test_embedding_backfill.py
  modified:
    - tests/helpers/seed.py
    - tests/test_bot_handlers.py

key-decisions:
  - "bot_resolve_user_role also patched in test_cmd_start_member_not_onboarded to prevent real DB hit; plan said create=True on bot_resolve_user_status alone, but without patching bot_resolve_user_role the test hit a stale local schema instead of the assertion line (Rule 1 auto-fix)"

patterns-established:
  - "Phase 14 RED pattern: top-level import for service modules (ModuleNotFoundError at collect-time); function-level import for dependency stubs (ImportError at test runtime)"

requirements-completed: [MTONB-01, MTONB-02, MTONB-03, MTONB-04]

# Metrics
duration: 3min
completed: 2026-05-07
---

# Phase 14 Plan 01: RED Tests Summary

**11 RED tests (4 require_onboarded + 6 backfill_user_embeddings + 1 bot handler) defining GREEN targets for Phase 14 onboarding implementation plans**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-07T10:02:44Z
- **Completed:** 2026-05-07T10:05:50Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `seed_member_not_onboarded(session, *, tg_user_id, tg_chat_id=None)` factory added to `tests/helpers/seed.py` — reusable by Plans 14-02, 14-03, 14-04
- 4 RED tests for `require_onboarded` dependency (D-14-01 contract: owner/member+onboarded_at→200, owner/member+null→409 `{"detail": {"error": "onboarding_required"}}`)
- 6 RED tests for `backfill_user_embeddings` helper (D-14-03: creates, skips-existing, skips-archived, empty, swallows-exception, tenant-scoped)
- 1 RED test for `cmd_start` not-onboarded branch (D-14-02 invite copy assertion)
- All 8 pre-existing bot handler tests still pass (no regression)

## Task Commits

1. **Task 1: seed_member_not_onboarded factory + RED tests for require_onboarded** - `44f6618` (test)
2. **Task 2: RED test file for backfill_user_embeddings helper** - `8ff6cf1` (test)
3. **Task 3: RED test for cmd_start member-not-onboarded greeting branch** - `2eddd3f` (test)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `tests/test_require_onboarded.py` - 4 RED tests for require_onboarded FastAPI dependency; fails with ImportError until Plan 14-02
- `tests/test_embedding_backfill.py` - 6 RED tests for backfill_user_embeddings service; fails with ModuleNotFoundError until Plan 14-03
- `tests/test_bot_handlers.py` - +1 RED test for cmd_start not-onboarded branch; fails with AssertionError until Plan 14-04
- `tests/helpers/seed.py` - Added seed_member_not_onboarded factory (role=member, onboarded_at=None)

## Decisions Made
- Patched `bot_resolve_user_role` in Task 3 test (alongside `bot_resolve_user_status`) to prevent the local stale schema from masking the intended AssertionError RED gate. This is consistent with all other `cmd_start` tests in the file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Also patch bot_resolve_user_role in test_cmd_start_member_not_onboarded_uses_invite_copy**
- **Found during:** Task 3 (RED test for cmd_start member-not-onboarded)
- **Issue:** Plan said only patch `bot_resolve_user_status` with `create=True`. But `cmd_start` still calls the existing `bot_resolve_user_role`, which hit the local stale DB (no `role` column) before reaching the assertion line.
- **Fix:** Added `patch.object(handlers, "bot_resolve_user_role", new=AsyncMock(return_value=UserRole.member))` so test reaches assertion line and fails with the intended AssertionError.
- **Files modified:** tests/test_bot_handlers.py
- **Verification:** Test now fails with `AssertionError: Expected not-onboarded invite copy, got: 'Бот запущен и готов к работе...'` — correct RED state.
- **Committed in:** 2eddd3f (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug fix ensuring correct RED failure mode)
**Impact on plan:** Auto-fix necessary for correct RED state. No scope creep.

## Issues Encountered
- Local dev DB schema is older (missing `ai_message`, `role` column). This is pre-existing infrastructure — tests are designed for full docker-compose stack. The `_require_db()` pattern doesn't prevent this since conftest.py always sets `DATABASE_URL` via setdefault. This is the same situation as all existing integration tests in the project.

## Known Stubs
None — this plan only writes test code; no production code stubs.

## Threat Flags
None — test-only code, no new production endpoints or data access paths.

## Next Phase Readiness
- Plan 14-02 can now implement `require_onboarded` in `app/api/dependencies.py` and go GREEN on 4 tests.
- Plan 14-03 can implement `app/services/ai_embedding_backfill.py:backfill_user_embeddings` and go GREEN on 6 tests.
- Plan 14-04 can add `bot_resolve_user_status` to `app/bot/auth.py` and update `cmd_start` branching, going GREEN on 1 test.
- `seed_member_not_onboarded` factory is available immediately for all downstream plans.

## Self-Check: PASSED
- tests/test_require_onboarded.py: exists, 4 async def test_ functions, ImportError on require_onboarded confirmed
- tests/test_embedding_backfill.py: exists, 6 async def test_ functions, ModuleNotFoundError on ai_embedding_backfill confirmed
- tests/test_bot_handlers.py: 1 new test added (9 total), RED AssertionError confirmed
- tests/helpers/seed.py: seed_member_not_onboarded function present
- Commits: 44f6618, 8ff6cf1, 2eddd3f all verified in git log

---
*Phase: 14-multi-tenant-onboarding*
*Completed: 2026-05-07*
