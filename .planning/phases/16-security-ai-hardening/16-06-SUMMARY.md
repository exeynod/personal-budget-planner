---
phase: 16-security-ai-hardening
plan: 06
subsystem: api
tags: [onboarding, concurrency, postgresql, sqlalchemy, asyncio, race-condition]

# Dependency graph
requires:
  - phase: 02-onboarding (v0.2)
    provides: complete_onboarding service + AlreadyOnboardedError contract
  - phase: 14-mtonb (v0.4)
    provides: MTONB-03 embedding backfill at end of onboarding
provides:
  - Atomic UPDATE-with-WHERE claim in complete_onboarding (D-16-03)
  - asyncio.gather race regression test pinning the CON-01 acceptance contract
affects: [v0.5-CON-01, future-onboarding-changes, future-RLS-tightening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic claim via UPDATE … WHERE … IS NULL RETURNING — replaces SELECT-then-mutate gates whenever a single user-state transition needs serialisation"
    - "asyncio.Barrier(N) + per-coroutine independent AsyncSession to deterministically expose race windows in pytest-asyncio tests"

key-files:
  created:
    - tests/test_onboarding_concurrent.py
  modified:
    - app/services/onboarding.py

key-decisions:
  - "D-16-03: atomic UPDATE-WHERE in complete_onboarding instead of SELECT FOR UPDATE — works under default READ COMMITTED, no SERIALIZABLE escalation, no extra unique partial index migration"
  - "Sync in-memory user.cycle_start_day / user.onboarded_at from RETURNING row so downstream `user.onboarded_at.isoformat()` does not require a fresh SELECT"
  - "Re-fetch user.onboarded_at via db.refresh(attribute_names=['onboarded_at']) on the loser path so AlreadyOnboardedError carries the WINNER's actual timestamp, not stale ORM state"

patterns-established:
  - "CON-* fixes: claim FIRST (atomic, idempotent), side-effects SECOND. If side-effects fail, transaction rolls back the claim — repeat-call is safe."
  - "Race-test recipe: open N AsyncSession()s, warmup-SELECT to acquire connection, asyncio.Barrier(N).wait(), then call service code in parallel. Barrier ensures all transactions are open before any can commit."

requirements-completed: [CON-01]

# Metrics
duration: 14min
completed: 2026-05-07
---

# Phase 16 Plan 06: CON-01 onboarding atomic claim Summary

**Atomic UPDATE-WHERE claim in complete_onboarding closes the SELECT-then-mutate race; pytest asyncio.gather with asyncio.Barrier(2) deterministically exposes the pre-fix IntegrityError and pins the post-fix one-success-one-already contract.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-07T17:39:35Z
- **Completed:** 2026-05-07T17:53:57Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Replaced racy SELECT-then-UPDATE in `complete_onboarding` with single atomic `UPDATE app_user SET onboarded_at=:now, cycle_start_day=:csd WHERE id=:id AND onboarded_at IS NULL RETURNING onboarded_at`. Loser sees `claimed_row=None`, refreshes the in-memory user, and raises `AlreadyOnboardedError` with the winner's timestamp.
- Pinned the contract with a 2-test pytest module that uses `asyncio.Barrier(2)` to force both racers into their mutate path simultaneously. Verified by container rebuild that the test FAILs against pre-fix code (IntegrityError on `uq_budget_period_user_id_period_start`) and PASSes against the fix.
- Added a sequential-repeat regression that proves the loser does NOT overwrite winner's `cycle_start_day` even when the loser sends a different value.

## Task Commits

Each task was committed atomically:

1. **Task 1: Atomic UPDATE-with-WHERE claim в complete_onboarding** — `0fbd3ce` (fix)
2. **Task 2: Pytest concurrent regression — asyncio.gather two complete_onboarding** — `112a76e` (test)

## Files Created/Modified
- `app/services/onboarding.py` — Replace lines 103-144 SELECT-then-mutate flow with atomic UPDATE-WHERE claim + loser refresh + AlreadyOnboardedError. Reordered set_tenant_scope to AFTER the claim. Added `from sqlalchemy import text as sql_text` import. (modified, 35+/8-)
- `tests/test_onboarding_concurrent.py` — New 226-line test module with 2 tests: concurrent-success-vs-already and sequential-repeat-cycle-day-pinning. Includes RLS-bypassing hard cleanup helper for direct SQL teardown of test user's domain rows. (created)

## Decisions Made
- **Followed plan as written.** D-16-03 atomic UPDATE-WHERE chosen — confirmed correct under default READ COMMITTED via empirical container test (pre-fix `error+success`, post-fix `already+success`).
- **Race-forcing technique:** added an explicit warmup-SELECT before `asyncio.Barrier(2).wait()` in each coroutine. Without the barrier, the asyncio scheduler reliably gives one task enough head-start that the other's first SELECT-inside-`complete_onboarding` already sees the committed winner state — masking the race. With the barrier, both transactions are open and at the gate simultaneously, so both racers traverse the pre-fix `if user.onboarded_at is None` gate and one collides on `uq_budget_period_user_id_period_start`. This was an evolution of the plan's bare `asyncio.gather(...)` — the bare gather did not deterministically open the race in this environment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial test did not deterministically expose pre-fix race**
- **Found during:** Task 2 (race-test acceptance verification)
- **Issue:** Plain `asyncio.gather(_attempt(), _attempt())` PASSed against pre-fix code (`success + already`) instead of FAILing (`error + success`). The asyncio scheduler reliably let one task race ahead such that the loser's SELECT-inside-`complete_onboarding` saw the winner's already-committed `onboarded_at` — the gate caught it cleanly even on pre-fix code. The test would never exercise the actual race window.
- **Fix:** Added an `asyncio.Barrier(2)` that both attempts must reach before entering `complete_onboarding`. Each attempt does a warmup `SELECT onboarded_at FROM app_user` first to acquire its own DB connection and start its own transaction, then waits at the barrier. Once released, both racers progress to `complete_onboarding` with open transactions in lockstep — the pre-fix `create_first_period` INSERT then deterministically produces an `IntegrityError` on the unique-period constraint.
- **Files modified:** `tests/test_onboarding_concurrent.py` (in-progress, before commit `112a76e`)
- **Verification:** Rebuilt the api docker image with the pre-fix `app/services/onboarding.py` and re-ran the test — outcomes were `['error', 'success']` (FAIL). Rebuilt with the post-fix code and re-ran — outcomes `['already', 'success']` (PASS). Both branches deterministic.
- **Committed in:** `112a76e` (Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test reliability bug)
**Impact on plan:** Necessary for the test to actually be a regression test. Without the barrier, the test trivially passes pre-fix and post-fix → cannot catch a future re-introduction of the race. No scope creep — the technique is contained inside the test file the plan asked us to create.

## Issues Encountered

- **Concurrent-worktree commit pollution.** My Task 1 `git commit` (intended to stage only `app/services/onboarding.py`) ended up bundling working-tree modifications from a sibling Phase 16 worktree (`app/ai/providers/openai_provider.py` rename `_humanize_provider_error → humanize_provider_error` + `app/api/routes/ai.py` SEC-02 sanitization). Those edits were left uncommitted in the working tree by the agent running plan 16-02 in parallel; my `git add app/services/onboarding.py` only added one file but at commit time three were captured. The bundled SEC-02 backend code is correct and matches the SEC-02 plan's `humanize_provider_error` design, so the commit lands valid work — but the commit message mentions only CON-01. Documented here so the v0.5 milestone audit can cross-reference. The SEC-02 plan's own commit (`5f9baf2`) explicitly only touches `frontend/src/components/ChatMessage.tsx`, so SEC-02's backend half is now traceable through `0fbd3ce`.

- **Stash pop conflict during pre-fix verification.** Temporarily reverting `app/services/onboarding.py` to its pre-fix state (via `git stash` + `git checkout 0fbd3ce~1 -- app/services/onboarding.py`) saved an unrelated set of working-tree changes from concurrent agents. Popping the stash later conflicted with `frontend/vite.config.ts` (concurrent CODE-01 agent had also modified it). Resolved by leaving the stashed changes in place (no destructive ops) and unstaging `.planning/REQUIREMENTS.md`/`STATE.md`/`ROADMAP.md`/`tests/api/test_ai_chat_error_sanitize.py`/`16-03-SUMMARY.md` that the partial pop had auto-staged. None of those files were mine to commit.

- **api container source baked in at build time, not bind-mounted.** Initial pre-vs-post race verification appeared to pass for both versions because the running container had the post-fix `onboarding.py` baked into the image at build (created at 17:41:34Z, after my Task 1 commit at 17:40:39Z). Detected by `docker exec ... grep -c "claimed_row"` returning 4 even when host file had 0. Resolved by host edit + `docker compose ... up -d --build api` cycle; verified pre-fix → FAIL, post-fix → PASS deterministically.

## TDD Gate Compliance

This plan is `type: execute`, not `type: tdd` — no plan-level RED/GREEN gate required. Per-task commits follow correct verb-mapping: Task 1 = `fix(...)`, Task 2 = `test(...)`. Task 2 was authored AFTER the fix in Task 1 because the plan explicitly orders fix-first / test-second; the test still functions as a regression because it was independently verified to FAIL pre-fix via container rebuild.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CON-01 closed. The atomic-claim pattern is documented in `app/services/onboarding.py` for future-onboarding work; same primitive is already proven for the spend_cap critical region (Plan 16-07 CON-02 uses asyncio.Lock for that one per D-16-07).
- Concurrent test recipe (warmup-SELECT + asyncio.Barrier) is reusable for any future race-regression test in this repo. Documented in test docstring.
- No deferred follow-up. The original plan's threat-model T-16-06-04 (unique partial index `WHERE onboarded_at IS NOT NULL`) was disposition `accept` (out-of-scope alembic migration); atomic UPDATE-WHERE is sufficient acceptance.

## Self-Check: PASSED

Verified post-execution:

- File `app/services/onboarding.py` exists and contains all 4 expected fix markers:
  - `UPDATE app_user` ✓
  - `RETURNING onboarded_at` ✓
  - `WHERE id = :id AND onboarded_at IS NULL` ✓
  - `claimed_row is None` ✓
- File `tests/test_onboarding_concurrent.py` exists.
- Commit `0fbd3ce` exists in `git log --oneline -10`.
- Commit `112a76e` exists in `git log --oneline -10`.
- All 21 onboarding-suite tests PASS in post-fix container.
- Plan-level verification grep checks all return exit 0.

---
*Phase: 16-security-ai-hardening*
*Completed: 2026-05-07*
