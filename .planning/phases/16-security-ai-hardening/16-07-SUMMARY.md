---
phase: 16
plan: 07
plan_id: 16-07-con-02-spend-cap-lock
subsystem: backend/ai
tags: [security, concurrency, ai-cost, race-condition, regression-guard, hotfix]
requirements: [CON-02]
dependency-graph:
  requires:
    - "app/services/spend_cap.py::asyncio.Lock pattern (Phase 15)"
    - "enforce_spending_cap dependency (Phase 15 AICAP-02)"
    - "ai_usage_log table + RLS policy (Phase 15)"
    - "_record_usage hook (Phase 13 AIUSE-02)"
  provides:
    - "Per-user serialization for /ai/chat check-then-act"
    - "Lock-protected re-check helper for in-route cap enforcement"
    - "Concurrent regression guard against cap doubling"
  affects:
    - "app/api/routes/ai.py::chat (now wraps stream in per-user lock)"
    - "app/api/dependencies.py (adds enforce_spending_cap_for_user helper)"
    - "app/services/spend_cap.py (adds _user_locks dict + acquire helper)"
tech-stack:
  added: []
  patterns:
    - "Per-user asyncio.Lock dict (get-or-create under guard) for fine-grained serialization"
    - "Acquire-before-yield + release-in-generator-finally to hold lock across StreamingResponse lifecycle"
    - "Router-level fast-path dep + in-lock re-check (defence-in-depth: cached pre-check, fresh post-check)"
key-files:
  created:
    - tests/test_spend_cap_concurrent.py
  modified:
    - app/services/spend_cap.py
    - app/api/dependencies.py
    - app/api/routes/ai.py
decisions:
  - "D-16-07 applied: per-user asyncio.Lock dict instead of pre-charge reservation row (overkill for pet-app)"
  - "Lock acquire/release in route handler, not in dependency — clean ownership + try/finally guarantees release on stream-close, mid-stream exception or cancellation"
  - "Router-level enforce_spending_cap kept as fast-path; in-lock enforce_spending_cap_for_user added for race-closure (defence-in-depth)"
  - "Lock dict GC deferred (5-50 user pet-app scope per PROJECT.md; ~200 bytes per Lock; LRU/weakref deferred to backlog)"
metrics:
  duration_sec: 600
  duration_human: "~10 min"
  completed_date: "2026-05-07"
  tasks_completed: 3
  files_changed: 4
commits:
  - "d4be381 feat(16-07): CON-02 add per-user asyncio.Lock dict in spend_cap (D-16-07)"
  - "86cfdea fix(16-07): CON-02 acquire per-user lock around /ai/chat stream lifecycle"
  - "bab91c6 test(16-07): CON-02 concurrent /ai/chat regression at cap-1¢"
---

# Phase 16 Plan 07: CON-02 — Per-user Lock around /ai/chat spend-cap check

Per-user `asyncio.Lock` (D-16-07) closes the check-then-act race in `enforce_spending_cap` so two concurrent `/ai/chat` requests for one user at cap-1¢ no longer both run an LLM call. Without the lock both requests would pass the cached spend check (`spend < cap` because TTLCache holds the pre-INSERT value), both would stream LLM tokens, both would write to `ai_usage_log` — burning ~2× the configured cap.

## What changed

### `app/services/spend_cap.py` — per-user Lock dict

Adds two module-level state objects + one helper:

```python
_user_locks: dict[int, asyncio.Lock] = {}
_user_locks_guard = asyncio.Lock()


async def acquire_user_spend_lock(user_id: int) -> asyncio.Lock:
    lock = _user_locks.get(user_id)
    if lock is not None:
        return lock
    async with _user_locks_guard:
        lock = _user_locks.get(user_id)
        if lock is None:
            lock = asyncio.Lock()
            _user_locks[user_id] = lock
        return lock
```

Distinct from the existing module-level `_cache_lock` (short-held around TTLCache miss, single global). `_user_locks` is keyed per `user_id` and held across the entire LLM streaming call. `_user_locks_guard` ensures two concurrent first-time callers for one user race-create exactly one Lock object.

### `app/api/dependencies.py` — `enforce_spending_cap_for_user`

New imperative helper (not a FastAPI Depends), designed to run *inside* the per-user lock from the route handler:

```python
async def enforce_spending_cap_for_user(db: AsyncSession, *, user_id: int) -> None:
    await invalidate_user_spend_cache(user_id)            # force fresh DB read
    user = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    cap = int((user.spending_cap_cents if user else None) or 0)
    spend = await get_user_spend_cents(db, user_id=user_id)
    if spend >= cap:
        raise HTTPException(429, detail={...}, headers={"Retry-After": ...})
```

The `invalidate_user_spend_cache` call is the load-bearing line — without it the in-lock re-check would still see the stale pre-INSERT value from the TTLCache and let the second request through.

### `app/api/routes/ai.py` — lock-wrapped chat handler

```python
lock = await acquire_user_spend_lock(user_id)
await lock.acquire()
try:
    await enforce_spending_cap_for_user(db, user_id=user_id)

    async def _wrapped() -> AsyncGenerator[str, None]:
        try:
            async for chunk in _event_stream(db, user_id, body.message):
                yield chunk
        finally:
            if lock.locked():
                lock.release()

    return StreamingResponse(_wrapped(), media_type="text/event-stream", ...)
except BaseException:
    if lock.locked():
        lock.release()
    raise
```

Three release paths cover everything:

1. **Normal completion** — `_wrapped` generator runs to exhaustion; `finally` releases.
2. **Mid-stream exception / client disconnect** — generator-cleanup triggers `finally`; releases.
3. **Pre-StreamingResponse 429 / cancellation** — outer `except BaseException` releases before re-raise.

The router-level `enforce_spending_cap` Depends (Phase 15) is **kept** as a no-lock fast-path. Two-layer defence:

- **Outer (cached, no lock):** trivial over-cap requests 429 without queuing on the user's lock.
- **Inner (DB-fresh, in lock):** closes the race when both requests pass the outer check at cached `spend < cap`.

### `tests/test_spend_cap_concurrent.py` — 2 pytest cases

| # | Case | Pre-fix | Post-fix |
|---|------|--------|----------|
| 1 | `test_concurrent_ai_chat_at_cap_yields_one_pass_one_429` — one user, cap=100¢, pre-spend=99¢, two parallel POSTs | `[200, 200]` + `ai_usage_log SUM = 1.01 USD` (race wins twice) | `[200, 429]` + `SUM = 1.00 USD` (one passer + 99¢ pre) |
| 2 | `test_concurrent_ai_chat_different_users_both_pass` — two users at cap-1¢, parallel POSTs | A single global Lock would 429 the second user → fail | Per-user dict isolates → both 200 |

Stub LLM (`_MeteredLLM`) emits a single 0.01-USD usage event with a 50ms hold so the parallel `asyncio.gather` actually contends. Test fixture also clears `_user_locks` between tests so a stale lock from one test cannot leak into another.

**Verified pre-fix** by stashing the route changes + rebuilding the container: case 1 fails with `[200, 200]`. After re-applying the lock: passes with `[200, 429]`.

## Why

The `enforce_spending_cap` Depends from Phase 15 reads spend through a 60s TTLCache. Two `/ai/chat` requests landing in the same second both see cached `spend = 99¢ < cap = 100¢`, both pass the gate, both run an LLM streaming call, both INSERT `0.01 USD` to `ai_usage_log` via `_record_usage`. End state: spend = 101¢, cap = 100¢, the in-process rate-limit (10/min) is the only remaining brake — it does not stop kratny cap doublings within a single window.

D-16-07 picks per-user `asyncio.Lock` (vs. pre-charge reservation row) per the pet-app cost/scope tradeoff: one lock per user, ~200 bytes, no DB schema change, no reconcile path. Implementation choice (acquire in dep yield-pattern vs. route handler) was Claude's discretion in the plan — went with **route handler** so:

1. Existing dep signature stays unchanged (no breaking change for any other test or call site).
2. `try / finally` around the StreamingResponse generator guarantees release on stream close, client disconnect, mid-stream exception or cancellation.
3. Ownership is local — easy to audit "where does this lock get released?" by reading one function.

## Verification

| Check | Result |
|-------|--------|
| `grep -q "_user_locks: dict\[int, asyncio.Lock\]" app/services/spend_cap.py` | match ✓ |
| `grep -q "async def acquire_user_spend_lock" app/services/spend_cap.py` | match ✓ |
| `grep -q "acquire_user_spend_lock" app/api/routes/ai.py` | match ✓ |
| `grep -q "lock.release" app/api/routes/ai.py` | match ✓ |
| `grep -q "enforce_spending_cap_for_user" app/api/dependencies.py` | match ✓ |
| `pytest tests/test_spend_cap_concurrent.py -v` | 2 passed ✓ |
| `pytest tests/test_spend_cap_service.py tests/test_enforce_spending_cap_dep.py tests/test_ai_cap_integration.py` | 17 passed (no regression) ✓ |

All phase-level acceptance criteria from the plan's `<verification>` block met.

## Tasks Executed

| # | Task | Status | Commit | Files |
|---|------|--------|--------|-------|
| 1 | Per-user `asyncio.Lock` dict + `acquire_user_spend_lock` | done | `d4be381` | `app/services/spend_cap.py` |
| 2 | Acquire lock around `chat()` stream + `enforce_spending_cap_for_user` helper | done | `86cfdea` | `app/api/routes/ai.py`, `app/api/dependencies.py` |
| 3 | Pytest concurrent regression — same-user race + cross-user isolation | done | `bab91c6` | `tests/test_spend_cap_concurrent.py` |

## Deviations from Plan

**Implementation choice (plan-explicit Claude's discretion):** Plan offered two routes for the lock acquire/release wiring — (A) FastAPI dependency yield-pattern, (B) acquire/release in `chat()` route handler with `try/finally`. Picked **(B)** as the plan recommended ("АЛЬТЕРНАТИВУ — acquire/release в route handler chat()"). Reasoning recorded in the route-level docstring + the "Why" section above.

**`enforce_spending_cap_for_user` placement:** Plan suggested either `app/api/dependencies.py` or extracting from existing dep. Placed it as a *standalone* `async def` in `dependencies.py` (alongside `enforce_spending_cap`), reusing the existing imports (`select(AppUser)`, `HTTPException`). Did NOT extract or modify the existing `enforce_spending_cap` Depends — that remains the no-lock fast-path. Two functions with similar bodies is intentional (different concurrency contracts).

**No `BaseException` change to existing handlers:** the new `except BaseException` catch is scoped to the lock-acquire path only (route handler), not propagated to `_event_stream` or `_record_usage`. Existing exception flow is unchanged.

## Authentication Gates

None — pure backend concurrency change. No auth surface touched.

## Threat Flags

None — change reduces attack surface (closes T-16-07-01 race-bypass + T-16-07-03 hang-on-exception via guaranteed lock release). No new endpoints, auth paths, schema changes, or trust-boundary additions.

The `_user_locks` dict grow-forever pattern (T-16-07-02 in the plan's threat register) is `accept`ed per CONTEXT D-16-07; LRU/weakref eviction is in `deferred-items` for Phase 17+.

## Known Stubs

None — all wiring connects real code paths to real DB rows. The test file uses a stub LLM but that is test-scope only (no production code path uses it).

## Deferred Issues

- **`tests/test_admin_cap_endpoint.py::test_member_forbidden_403`** — pre-existing failure on `master` (verified by stashing 16-07 changes + re-running: still fails). The `PATCH /admin/users/{id}/cap` route is missing `Depends(require_owner)` → member can patch other users' caps. Out of scope for CON-02 (concurrency, not RBAC). Logged in `.planning/phases/16-security-ai-hardening/deferred-items.md`.

## Decisions Made

- **D-16-07 applied verbatim:** per-user `asyncio.Lock` dict via get-or-create under a short-held guard. Pre-charge reservation row deferred (overkill for pet-app per CONTEXT).
- **Route handler over dep yield-pattern:** for clean ownership + try/finally semantics.
- **Router-level fast-path dep retained:** in-lock re-check is the actual race-closure; the no-lock outer check remains as a fast 429 path that avoids unnecessary lock contention for clearly over-cap requests.
- **`BaseException` on the acquire path:** so cancellation (CancelledError) still releases the lock. Production cancellation can fire when a client disconnects during request body upload — without `BaseException` the lock would leak.
- **Lock dict GC deferred:** pet-app scope (5-50 users, ~200 bytes per Lock) makes grow-forever acceptable. CONTEXT.md and the plan threat register both `accept` this trade-off.

## Self-Check: PASSED

- `app/services/spend_cap.py` — modified, present (`grep _user_locks` → 5 hits, `acquire_user_spend_lock` defined)
- `app/api/dependencies.py` — modified, present (`enforce_spending_cap_for_user` defined)
- `app/api/routes/ai.py` — modified, present (`acquire_user_spend_lock` import + call, `lock.release` in 2 places)
- `tests/test_spend_cap_concurrent.py` — created, present (2 tests, both pass in container)
- Commits `d4be381`, `86cfdea`, `bab91c6` — all present in `git log`
- All 4 phase-level acceptance criteria green
