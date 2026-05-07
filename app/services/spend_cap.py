"""Per-user AI spend aggregation + 60s TTL cache (Phase 15 AICAP-03).

Used by:
- enforce_spending_cap dependency (Plan 15-03) — gate /ai/chat + /ai/suggest-category
- PATCH /admin/users/{id}/cap (Plan 15-04) — invalidates cache so next request honours new cap
- GET /me (Plan 15-05) — surfaces ai_spend_cents to Settings UI

Design (CONTEXT D-15-02):
- Spend = SUM(ai_usage_log.est_cost_usd) WHERE user_id=X
  AND created_at >= month_start_msk (converted to UTC for DB filter).
- Cents = ceil(usd * 100).
- Cache: cachetools.TTLCache(128, ttl=60), key=user_id, value=int cents.
- Concurrency: asyncio.Lock around fetch — prevent thundering-herd on cache miss.
- Month boundary: Europe/Moscow truncated to 1st 00:00 MSK; no DST edge (MSK MSK+3 fixed).
- est_cost_usd is Float (legacy from Phase 13/v0.3); migration to BIGINT cost_cents
  deferred per CONTEXT.md.
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from cachetools import TTLCache
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AiUsageLog

_MSK = ZoneInfo("Europe/Moscow")

_spend_cache: TTLCache[int, int] = TTLCache(maxsize=128, ttl=60)
_cache_lock = asyncio.Lock()

# CON-02 (Plan 16-07): per-user serialization for "check spend → LLM call →
# record usage". Distinct from _cache_lock (which is short-held around
# TTLCache miss). _user_locks is held across the LLM streaming call to
# prevent two concurrent requests from both passing a cap-1¢ check.
#
# Pet-app scope: 5-50 users (PROJECT.md). Lock objects are ~200 bytes;
# grow-forever is acceptable. LRU eviction deferred (CONTEXT D-16-07).
_user_locks: dict[int, asyncio.Lock] = {}
_user_locks_guard = asyncio.Lock()


async def acquire_user_spend_lock(user_id: int) -> asyncio.Lock:
    """Get-or-create the per-user spend lock and return it.

    Caller is responsible for ``async with`` usage::

        lock = await acquire_user_spend_lock(user_id)
        async with lock:
            # check cap, run LLM, record usage

    The dict is mutated under ``_user_locks_guard`` so two concurrent
    callers requesting the same ``user_id`` race-create exactly one Lock.
    """
    lock = _user_locks.get(user_id)
    if lock is not None:
        return lock
    async with _user_locks_guard:
        lock = _user_locks.get(user_id)
        if lock is None:
            lock = asyncio.Lock()
            _user_locks[user_id] = lock
        return lock


def _month_start_msk(now: datetime | None = None) -> datetime:
    """Return MSK-aware datetime truncated to 1st of current month at 00:00."""
    n = now if now is not None else datetime.now(_MSK)
    if n.tzinfo is None:
        n = n.replace(tzinfo=_MSK)
    return n.astimezone(_MSK).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next_month_start_msk(now: datetime | None = None) -> datetime:
    """1st of NEXT month at 00:00 MSK (boundary for Retry-After)."""
    cur = _month_start_msk(now)
    # Add ~32 days then truncate again to 1st (handles 28/30/31 days uniformly).
    return _month_start_msk(cur + timedelta(days=32))


def seconds_until_next_msk_month(now: datetime | None = None) -> int:
    """Seconds remaining until next 1st 00:00 MSK; min 1.

    Used as `Retry-After` header value in 429 responses (Plan 15-03).
    """
    n = now if now is not None else datetime.now(_MSK)
    if n.tzinfo is None:
        n = n.replace(tzinfo=_MSK)
    n = n.astimezone(_MSK)
    nxt = _next_month_start_msk(n)
    return max(1, int((nxt - n).total_seconds()) + 1)


async def _fetch_spend_cents_from_db(db: AsyncSession, user_id: int) -> int:
    """Aggregate SUM(est_cost_usd) for current MSK month -> ceil(usd*100) cents.

    Tests may monkeypatch this to assert cache hit count. Plan 15-02 keeps
    it module-level so monkeypatch.setattr works without ORM dancing.

    NOTE: est_cost_usd is Float (Phase 13 legacy); we sum as Float and
    convert to int cents only at the end. Migration to BIGINT cost_cents
    is deferred (CONTEXT out-of-scope).

    RLS note: ai_usage_log has row-level security policy that filters by
    app.current_user_id. We call set_tenant_scope() (shared helper from
    app/db/session.py) so the runtime budget_app role can read only the
    target user's rows. set_config() is scoped to the current transaction.
    """
    month_start = _month_start_msk()
    month_start_utc = month_start.astimezone(timezone.utc)
    # DB-01 (Plan 16-08): unified RLS-context helper. Equivalent to the
    # previous f-string SET LOCAL but uses set_config() with a bind-parameter,
    # matching app/db/session.py:30 (set_tenant_scope).
    from app.db.session import set_tenant_scope  # local import: avoid cycle
    await set_tenant_scope(db, user_id)
    stmt = select(func.coalesce(func.sum(AiUsageLog.est_cost_usd), 0.0)).where(
        AiUsageLog.user_id == user_id,
        AiUsageLog.created_at >= month_start_utc,
    )
    total_usd = await db.scalar(stmt) or 0.0
    return int(math.ceil(float(total_usd) * 100.0))


async def get_user_spend_cents(db: AsyncSession, *, user_id: int) -> int:
    """Cached per-user monthly spend (cents). 60s TTL.

    Concurrency: asyncio.Lock prevents thundering-herd on miss. Within TTL,
    the cache returns the same int even after new INSERTs to ai_usage_log;
    callers tolerating up-to-60s staleness — acceptable per CONTEXT D-15-02
    (cap edits via PATCH actively invalidate; chat replenish < 60s rare).
    """
    cached = _spend_cache.get(user_id)
    if cached is not None:
        return cached
    async with _cache_lock:
        # Double-check under lock (другой coroutine мог уже заполнить).
        cached = _spend_cache.get(user_id)
        if cached is not None:
            return cached
        value = await _fetch_spend_cents_from_db(db, user_id)
        _spend_cache[user_id] = value
        return value


async def invalidate_user_spend_cache(user_id: int) -> None:
    """Remove cache entry; next get_user_spend_cents fetches fresh DB row.

    Async signature for parallelism with other service helpers; no actual
    awaiting needed — TTLCache supports sync ops. Async preserved so callers
    don't have to remember which is sync.
    """
    _spend_cache.pop(user_id, None)
