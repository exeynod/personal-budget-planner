---
phase: 13-admin-ui-whitelist-ai-usage
plan: "03"
subsystem: ai-usage-persistence
tags: [ai, usage-tracking, persistence, hook, sse]
requires:
  - "Plan 13-02: ai_usage_log table + AiUsageLog ORM model on alembic 0008"
  - "Plan 11-06: _event_stream already passes user_id (app_user.id) end-to-end"
  - "AsyncSessionLocal global from app/db/session.py"
provides:
  - "_record_usage now async with kwargs (user_id, session_factory)"
  - "Per-call INSERT into ai_usage_log on every completed /ai/chat usage event"
  - "Resilient telemetry: DB failure logged as ai.usage_log_persist_failed, SSE stream stays alive"
  - "Defensive guard: user_id None/0 or session_factory None → no-op (no crash)"
affects:
  - "Plan 13-05 (admin /ai-usage breakdown): table now populated by real /ai/chat traffic"
  - "Phase 15 (AI cost cap enforcement): can read current-month aggregate from ai_usage_log to compare vs spending_cap_cents"
tech-stack-added:
  - "Persistent AI usage logging (replacing in-memory ring buffer as the source of truth for per-user breakdown)"
patterns:
  - "Telemetry hook MUST swallow DB failures (logger.warning + continue) — never block user-facing SSE stream"
  - "Short-lived AsyncSession opened via session_factory() inside hook — separate transaction from parent SSE handler (no shared locks)"
  - "Backwards-compat signature widening via keyword-only args + None defaults — old call sites without DB context degrade to ring-buffer-only"
key-files-created:
  - "tests/test_ai_usage_log_hook.py"
key-files-modified:
  - "app/api/routes/ai.py"
decisions:
  - "Hook writes inside SSE event loop (not in a background task / queue) — pet-scale traffic doesn't justify a queue, and a synchronous INSERT keeps the data path simple to reason about"
  - "session_factory parameterised (vs hard-coding AsyncSessionLocal) — enables tests to inject broken/fresh factories without monkey-patching module globals"
  - "Use AsyncSessionLocal directly (no get_db_with_tenant_scope) — hook does NOT need RLS scoping for INSERT because user_id is supplied explicitly; admin SELECT path (Plan 13-05) handles RLS bypass on the read side"
  - "Catch broad Exception (BLE001) — telemetry failures must be invisible to the user; any exception (OperationalError, IntegrityError, network drop) gets the same swallow-and-log treatment"
metrics:
  duration: "~5m"
  completed: "2026-05-07"
---

# Phase 13 Plan 03: AI Usage Persistence Hook Summary

Wire `_record_usage` in `app/api/routes/ai.py` to persist a row in `ai_usage_log` (created by Plan 13-02) on every completed `/ai/chat` usage event — converting AI usage telemetry from per-process ring buffer into durable per-user storage that the upcoming admin `GET /admin/ai-usage` endpoint (Plan 13-05) will aggregate.

## What Was Implemented

### Task 1: tests/test_ai_usage_log_hook.py (commit `a05a88e`)

Three DB-backed tests written RED-first, all skip when `DATABASE_URL` is unset:

- **`test_ai_usage_log_hook_writes_row`** — happy path. Seeds an `AppUser`, calls `await _record_usage(usage_event, user_id=user.id, session_factory=fresh_db)` directly (bypassing HTTP to isolate the hook), then SELECTs from `ai_usage_log` and asserts user_id / model / token columns / est_cost_usd round-trip exactly.
- **`test_ai_usage_log_hook_db_failure_swallowed`** — resilience. Injects a `BrokenFactory` whose `__call__` raises `OperationalError("simulated", ...)`. The hook MUST NOT propagate the exception; `caplog` is asserted to contain `ai.usage_log_persist_failed` (structured log line key).
- **`test_ai_usage_log_hook_skips_when_user_id_missing`** — defensive. `user_id=None` and `user_id=0` both call the hook without raising; final `count(*) FROM ai_usage_log` is 0.

A fresh `fresh_db` fixture truncates the Phase 13 table set (`_PHASE13_TRUNCATE_TABLES` from `tests/helpers/seed.py`) using `ADMIN_DATABASE_URL` (or `DATABASE_URL` fallback) and yields a fresh `async_sessionmaker` for both seeding and hook calls.

Confirmed RED on the pre-Task-2 code: `TypeError: _record_usage() got an unexpected keyword argument 'user_id'`.

### Task 2: app/api/routes/ai.py (commit `4bb4fb3`)

Three changes in one file:

1. **Imports** — added at the top alongside the existing SQLAlchemy / app imports:
   ```python
   from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
   from app.db.models import AiUsageLog
   from app.db.session import AsyncSessionLocal
   ```
   `async_sessionmaker` is added to the existing `from sqlalchemy.ext.asyncio import AsyncSession` line.

2. **`_record_usage` rewritten as async** with keyword-only `user_id` + `session_factory` parameters and full docstring covering all three behaviours (ring buffer append, log line, DB persist with failure-swallowing). Body:
   - First two steps preserved verbatim (ring buffer + `logger.info` line for legacy `/ai/usage` aggregator)
   - Early return when `not user_id or session_factory is None` — both cases are no-ops by design
   - `async with session_factory() as session:` opens a fresh short-lived session, builds an `AiUsageLog(...)` ORM row with explicit `int(...)` / `float(...)` coercion + `or 0` / `or 0.0` fallbacks, calls `session.add(row)` + `await session.commit()`
   - `except Exception as exc:` wraps the entire DB block with `# noqa: BLE001 — telemetry must not break SSE` and emits `logger.warning("ai.usage_log_persist_failed user_id=%s model=%s err=%s", ...)`

3. **Call site in `_event_stream` updated** (around line 207):
   ```python
   elif etype == "usage":
       await _record_usage(
           event["data"],
           user_id=user_id,
           session_factory=AsyncSessionLocal,
       )
   ```
   `user_id` is the parameter declared on `_event_stream` itself (sourced from `Depends(get_current_user_id)` upstream — never client-supplied, mitigates T-13-03-03).

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| pytest collect | `docker compose exec api pytest tests/test_ai_usage_log_hook.py --collect-only -q` | 3 tests collected |
| pytest run (after rebuild) | `docker compose exec api pytest tests/test_ai_usage_log_hook.py -v` | 3 passed in 0.46s |
| Signature is async | `inspect.iscoroutinefunction(_record_usage)` | True |
| Signature has new kwargs | `inspect.signature(_record_usage).parameters` | `user_id`, `session_factory` present |
| Whole suite collect (regression) | `pytest tests/ -k "not test_postgres_role_runtime" --collect-only` | 311/314 collected, no errors |
| `grep -c "async def _record_usage"` | | 1 |
| `grep -c "ai.usage_log_persist_failed"` | | 2 (warning log call + docstring mention) |
| `grep -c "AiUsageLog"` | | 2 (import + INSERT site) |
| `grep -c "AsyncSessionLocal"` | | 2 (import + call site) |
| `grep -c "await _record_usage"` | | 1 (event-loop call site updated) |
| Existing admin AI usage tests still RED-collected (sanity) | `pytest tests/test_admin_ai_usage_api.py --collect-only -q` | 5 tests collected (RED until Plan 13-05) |

## Deviations from Plan

None — plan executed exactly as written. The `interfaces` block in 13-03-PLAN.md spelled the new signature, body, and call-site replacement verbatim; both tasks shipped as specified.

## Auto-fixed Issues

None.

## Threat Mitigations Applied

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-13-03-01 (malformed usage dict crashes hook) | ✓ mitigated | All field accesses use `usage.get(key, default)`; `int(... or 0)` / `float(... or 0.0)` coerces None to safe defaults; `str(... or "unknown")` for model |
| T-13-03-02 (DB outage cascades to SSE failure) | ✓ mitigated | `try/except Exception` wraps entire DB block; `logger.warning("ai.usage_log_persist_failed ...")` records failure; SSE generator continues on next iteration. `test_ai_usage_log_hook_db_failure_swallowed` proves this |
| T-13-03-03 (cross-tenant user_id leak) | ✓ mitigated | `user_id` sourced from `_event_stream` parameter (which comes from `Depends(get_current_user_id)`); LLM-supplied data never touches the hook's `user_id`. Plus alembic 0008 RLS policy on `ai_usage_log` adds defence-in-depth |
| T-13-03-04 (long transaction holding locks) | ✓ mitigated | `session_factory()` opens a fresh `AsyncSession` independent of the parent SSE handler's session; `await session.commit()` immediately after `session.add(row)` releases the row-level lock |

## Threat Flags

None — no new attack surface introduced beyond what was planned. The DB write happens in a fresh short-lived transaction with explicit user_id from a trusted source; no client-supplied data ever reaches the user_id field.

## Deferred Issues

**Pre-existing, not related to this plan:**
- `bot` container is in `restarting` state due to `TelegramUnauthorizedError` — invalid TG bot token in dev `.env`. Predates this plan (also flagged in 13-02-SUMMARY.md). Out of scope per CLAUDE.md scope-boundary rule.

## Files Changed

```
app/api/routes/ai.py                    |  62 ++++++++++++++++++++++++++--- (+57/-5)
tests/test_ai_usage_log_hook.py         | 143 +++++++++++++++++++++++++++ (new)
```

## Commits

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `a05a88e` | test(13-03): add RED tests for _record_usage DB hook |
| 2    | `4bb4fb3` | feat(13-03): persist /ai/chat usage events to ai_usage_log |

## TDD Gate Compliance

Both gates present in git history:
- RED gate: `a05a88e test(13-03): add RED tests for _record_usage DB hook` — 3 failing tests committed first
- GREEN gate: `4bb4fb3 feat(13-03): persist /ai/chat usage events to ai_usage_log` — implementation immediately after, 3 tests pass

No REFACTOR commit needed — implementation arrived clean (matched plan body verbatim).

## Self-Check: PASSED

- File `tests/test_ai_usage_log_hook.py` exists ✓
- File `app/api/routes/ai.py` modified (verified via `git diff HEAD~2 -- app/api/routes/ai.py`) ✓
- Commit `a05a88e` exists in git log ✓
- Commit `4bb4fb3` exists in git log ✓
- 3 hook tests pass inside docker (pytest output: `3 passed in 0.46s`) ✓
- `_record_usage` is async with `user_id` + `session_factory` kwargs (verified via `inspect`) ✓
- No regression in suite collection (`311/314 collected`, deselected count unchanged) ✓
