---
phase: 68-tech-debt-cleanup
plan: 01
subsystem: api
tags: [pytest, ai-spend-cap, pro-gating, fixtures, tdd, 402-vs-429]

# Dependency graph
requires:
  - phase: 35-tier-paywall
    provides: "require_pro (402 PRO_TIER_REQUIRED) + effective_tier/is_pro (pro_active_until / trial_ends_at)"
  - phase: 15-ai-spend-cap
    provides: "enforce_spending_cap (429 spending_cap_exceeded) wired to /ai/* routers"
  - phase: 16-concurrency
    provides: "per-user spend lock + enforce_spending_cap_for_user (CON-02)"
provides:
  - "seed_user(... pro_active_until=, trial_ends_at=) — test fixture can mint a Pro user"
  - "6 AI spend-cap tests asserting and receiving 429 for Pro-over-cap (was 402)"
  - "Green baseline for tests/test_ai_cap_integration.py + tests/test_spend_cap_concurrent.py (gate for Phase 69)"
affects: [69-backend-baseline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cap/tier test fixtures seed Pro tier explicitly so the test exercises the cap gate (429), not the tier gate (402)"

key-files:
  created: []
  modified:
    - tests/helpers/seed.py
    - tests/test_ai_cap_integration.py
    - tests/test_spend_cap_concurrent.py

key-decisions:
  - "Fixture-fix, NOT a DI-reorder: the router gate order require_pro (402) → enforce_spending_cap (429) is intentional and correct. app/api/dependencies.py left untouched."
  - "Pro minted via pro_active_until = now + 30d (paid Pro). trial_ends_at left available for reverse-trial tests but not needed here."
  - "seed_user Pro/trial params default to None (free tier) — fully backward-compatible; no existing caller changed."

patterns-established:
  - "Pattern: any test asserting an AI spend-cap 429 must seed a Pro user, else require_pro short-circuits with 402 before the cap is evaluated."

requirements-completed: [A1]

# Metrics
duration: 4min
completed: 2026-05-20
---

# Phase 68 Plan 01: Backend Pro-Gating 402-vs-429 (A1) Summary

**The 6 AI spend-cap tests seeded free-tier users and hit `require_pro` (402) before `enforce_spending_cap` (429) ever ran; seeding them as Pro lets the cap gate fire, turning all six green and unblocking a clean backend pytest baseline.**

## Performance

- **Duration:** ~4 min
- **Tasks:** 2
- **Files modified:** 3

## Root Cause (confirmed empirically)

Captured a baseline run before editing — **5 failed, 1 passed**:

```
FAILED test_chat_unblocked_after_admin_patches_cap_higher  → got 402 (current_tier:"free")
FAILED test_suggest_category_blocked_when_at_cap           → got 402 (current_tier:"free")
FAILED test_cap_zero_blocks_chat_and_suggest               → got 402 (current_tier:"free")
FAILED test_concurrent_ai_chat_at_cap_yields_one_pass_one_429
FAILED test_concurrent_ai_chat_different_users_both_pass   → User A got 402
```

Every failure was `402 PRO_TIER_REQUIRED / current_tier:"free"` where 429 was expected
— exactly the planned hypothesis. The seeded users had `pro_active_until` / `trial_ends_at`
both NULL, so `app.services.tier.is_pro` → False → `require_pro` raised 402 before the cap
check ran.

The one test that "passed" (`test_chat_blocked_when_at_cap_returns_429`) did so because the
`/ai/chat` router applies `enforce_spending_cap` at **router** level while `require_pro` sits
at the **POST handler** level — so for `/ai/chat` the cap (429) fires before the tier gate.
For `/ai/suggest-category` the router declares `require_pro` *before* `enforce_spending_cap`,
so its tests got 402. Seeding Pro makes both endpoints behave identically (cap → 429), which
is what the spec intends.

## Accomplishments

- **Task 1 — `seed_user` extension:** added optional `pro_active_until` / `trial_ends_at`
  parameters (default `None` = free tier), passed through to the `AppUser(...)` constructor.
  Backward-compatible; verified via `inspect.signature`.
- **Task 2 — seed Pro in the 6 cap tests:**
  - All 4 cap tests in `tests/test_ai_cap_integration.py` now seed
    `pro_active_until = now + 30d` (including `test_chat_blocked_when_at_cap_returns_429`).
  - Both concurrent tests in `tests/test_spend_cap_concurrent.py` seed Pro for the owner
    (and the second member in the cross-user isolation test).
  - Existing `spending_cap_cents` UPDATE statements untouched. No assertion weakened —
    pro-over-cap still asserts 429; non-pro path remains 402 (unchanged).

## Verification

Final run (both files, twice for stability incl. the concurrent race tests):

```
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml \
  exec -T api /app/.venv/bin/python -m pytest \
  tests/test_ai_cap_integration.py tests/test_spend_cap_concurrent.py -q
→ 6 passed
```

- `seed_user` signature exposes `pro_active_until` + `trial_ends_at` (inspect check passed).
- No alembic migration added; no float introduced (money stays BIGINT cents).
- Stack restored to base+dev (`docker compose up -d`) after testing.

## Deviations from Plan

None — plan executed exactly as written. `app/api/dependencies.py` was listed in
`files_modified` only in case investigation surfaced a real ordering bug; the investigation
confirmed the gate order is intentional and correct, so `dependencies.py` was left untouched
(this matches the plan's default expectation: fixture-fix, not DI-reorder).

## Environment note

The local `.venv` is broken; tests run inside the docker `api` container via the project's
test stack (`docker-compose.test.yml`, `/app/.venv/bin/python -m pytest`). The earlier
`docker compose exec api python` invocation failed with "No module named pytest" because the
runtime image is built `--no-dev`; the correct interpreter is `/app/.venv/bin/python` under
the test override (pytest present there).

## Self-Check: PASSED
- FOUND: tests/helpers/seed.py (seed_user Pro params)
- FOUND: tests/test_ai_cap_integration.py (4 Pro seeds)
- FOUND: tests/test_spend_cap_concurrent.py (Pro seeds)
- FOUND commit: eece9ae (Task 1 — seed_user extension)
- FOUND commit: 0287eda (Task 2 — Pro seeding)
