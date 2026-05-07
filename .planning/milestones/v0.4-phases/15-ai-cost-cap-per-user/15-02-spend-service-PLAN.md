---
phase: 15-ai-cost-cap-per-user
plan: 02
type: execute
wave: 1
depends_on: [15-01]
files_modified:
  - app/services/spend_cap.py
  - pyproject.toml
autonomous: true
requirements: [AICAP-03]

must_haves:
  truths:
    - "get_user_spend_cents(db, user_id) возвращает int cents за текущий MSK месяц"
    - "Повторный вызов в течение 60 сек берёт из cache, не из БД"
    - "seconds_until_next_msk_month() возвращает положительный int"
    - "invalidate_user_spend_cache(user_id) сбрасывает запись"
    - "Tests из tests/test_spend_cap_service.py становятся GREEN после этого плана"
  artifacts:
    - path: "app/services/spend_cap.py"
      provides: "get_user_spend_cents, invalidate_user_spend_cache, seconds_until_next_msk_month, _spend_cache (TTLCache)"
      min_lines: 80
      contains: "async def get_user_spend_cents"
    - path: "pyproject.toml"
      provides: "cachetools dependency"
      contains: "cachetools"
  key_links:
    - from: "app/services/spend_cap.py"
      to: "app/db/models.py:AiUsageLog"
      via: "SELECT SUM(est_cost_usd) WHERE user_id AND created_at >= month_start"
      pattern: "AiUsageLog.user_id|ai_usage_log"
    - from: "app/services/spend_cap.py"
      to: "ZoneInfo Europe/Moscow"
      via: "month boundary calculation"
      pattern: "ZoneInfo.*Europe/Moscow"
---

<objective>
Создать service `app/services/spend_cap.py` с тремя публичными функциями:
- `async get_user_spend_cents(db, *, user_id) -> int` — агрегирует SUM(est_cost_usd) для текущего MSK-месяца, возвращает cents (ceil), кеширует на 60 сек.
- `async invalidate_user_spend_cache(user_id) -> None` — сбрасывает entry для user_id (вызывается из PATCH cap endpoint).
- `seconds_until_next_msk_month(now=None) -> int` — секунд до следующего 1-го числа 00:00 MSK (для Retry-After header в Plan 15-03).

Cache layer: in-process `cachetools.TTLCache(maxsize=128, ttl=60)` с `asyncio.Lock` для concurrent безопасности. Если `cachetools` отсутствует в pyproject.toml — добавить (per D-15-02).

Purpose: Per-user spend aggregation реализует AICAP-03; backing service для enforce_spending_cap dependency (Plan 15-03), для PATCH cap (Plan 15-04 invalidates cache), для /me ai_spend_cents (Plan 15-05).

Output: Один новый сервисный модуль + патч pyproject.toml (если требуется).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md
@.planning/phases/15-ai-cost-cap-per-user/15-01-SUMMARY.md

@app/db/models.py
@app/services/admin_ai_usage.py
@app/bot/commands.py
@pyproject.toml
@tests/test_spend_cap_service.py

<interfaces>
<!-- Точные сигнатуры, которые pинят tests/test_spend_cap_service.py -->

# Public API (must be importable as `from app.services.spend_cap import ...`):

async def get_user_spend_cents(db: AsyncSession, *, user_id: int) -> int:
    """Sum AI cost for current MSK month, return cents (ceil)."""

async def invalidate_user_spend_cache(user_id: int) -> None:
    """Drop cache entry for user_id (called by PATCH /admin/users/{id}/cap)."""

def seconds_until_next_msk_month(now: datetime | None = None) -> int:
    """Seconds until next month 00:00 MSK; returns int > 0."""

# Internals (private):
_spend_cache: TTLCache  # maxsize=128, ttl=60
_cache_lock: asyncio.Lock

async def _fetch_spend_cents_from_db(db, user_id) -> int:
    """SELECT SUM(est_cost_usd) WHERE user_id AND created_at >= month_start_utc;
       return ceil(total_usd * 100). Tests may monkeypatch this for cache assertions."""

def _month_start_msk(now: datetime | None = None) -> datetime:
    """Truncate to 1st 00:00 MSK; returns timezone-aware MSK datetime."""

def _msk_to_utc(dt_msk: datetime) -> datetime:
    """Convert MSK-aware → UTC-aware (for created_at >= comparison; DB stores UTC)."""
</interfaces>

<reference_implementation>
# Pattern from app/bot/commands.py:22 (existing ZoneInfo usage)
from zoneinfo import ZoneInfo

# Pattern from app/services/admin_ai_usage.py (existing aggregation in this codebase) —
# read it to mirror the SUM pattern; spend_cap repeats per-user-only aggregation.

# Cache library check (Bash): cachetools NOT in pyproject.toml.
# Action: add `cachetools>=5.3,<6.0` to project.dependencies (D-15-02 first option).
# Don't add to optional-dependencies — runtime needs it.
</reference_implementation>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add cachetools dep + create app/services/spend_cap.py skeleton + boundary helpers</name>
  <files>pyproject.toml, app/services/spend_cap.py</files>
  <read_first>
    - pyproject.toml (project.dependencies list at lines 6-23)
    - app/bot/commands.py:1-30 (ZoneInfo("Europe/Moscow") import pattern, settings.APP_TZ usage)
    - app/services/periods.py:1-30 (now-in-MSK pattern via ZoneInfo)
    - tests/test_spend_cap_service.py (collected expectations, especially test_seconds_until_next_msk_month_positive)
  </read_first>
  <behavior>
    - cachetools imported successfully after pyproject.toml update
    - `from app.services.spend_cap import seconds_until_next_msk_month` works
    - `seconds_until_next_msk_month()` returns positive int
    - `seconds_until_next_msk_month()` < 32 days in seconds
    - For known-fixed `now=datetime(2026, 1, 15, 12, 0, tzinfo=ZoneInfo("Europe/Moscow"))`,
      returns seconds until 2026-02-01 00:00 MSK (~17.5 days; ~1_512_000)
  </behavior>
  <action>
**1.1 Add cachetools to pyproject.toml** (D-15-02): в `project.dependencies` (lines 6-23) добавить строку `"cachetools>=5.3,<6.0",` после `"openai>=1.50.0",` и до `"pgvector>=0.3.0",` (alphabetical-ish). Используйте Edit tool. После правки — `pip install -e .` (или просто положиться на rebuild — но Plan 15-07 обновит контейнер, тут только pyproject.toml).

**1.2 Создать `app/services/spend_cap.py`** с module docstring + helper'ами без `get_user_spend_cents` (это в Task 2 — TDD GREEN cycle для cache):

```python
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
```

Импортируйте `func, select` от sqlalchemy для последующих запросов (Task 2). Поместите модуль рядом с `app/services/admin_ai_usage.py`.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "from app.services.spend_cap import seconds_until_next_msk_month, _month_start_msk, _next_month_start_msk; from datetime import datetime; from zoneinfo import ZoneInfo; n = datetime(2026, 1, 15, 12, 0, tzinfo=ZoneInfo('Europe/Moscow')); s = seconds_until_next_msk_month(n); assert 0 < s < 32*86400, s; assert _month_start_msk(n).day == 1; assert _next_month_start_msk(n).month == 2; print('OK', s)"</automated>
  </verify>
  <acceptance_criteria>
    - `pyproject.toml` line containing `"cachetools>=5.3,<6.0"` exists in `project.dependencies`
    - `grep -c "cachetools" pyproject.toml` >= 1
    - File `app/services/spend_cap.py` exists with module docstring referencing AICAP-03
    - `python -c "from app.services.spend_cap import seconds_until_next_msk_month"` succeeds
    - `seconds_until_next_msk_month(datetime(2026, 1, 15, 12, 0, tzinfo=ZoneInfo('Europe/Moscow')))` returns int in (0, 32*86400)
    - `_month_start_msk(...)` returns datetime with day=1, hour=0, minute=0
    - Module ~50 lines (helpers only; no get_user_spend_cents yet)
  </acceptance_criteria>
  <done>cachetools available; boundary helpers callable + verified; module ready for Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement get_user_spend_cents + invalidate_user_spend_cache (cache + DB)</name>
  <files>app/services/spend_cap.py</files>
  <read_first>
    - app/services/spend_cap.py (current state from Task 1)
    - app/db/models.py:AiUsageLog (lines 396-446 — table + indexes)
    - app/services/admin_ai_usage.py (existing SUM pattern для aggregation)
    - tests/test_spend_cap_service.py (тесты для контрактов)
  </read_first>
  <behavior>
    - `get_user_spend_cents(db, user_id=X)` для нового user возвращает 0 (нет логов).
    - С 3 логами в текущем MSK месяце (est_cost_usd 0.005, 0.012, 0.001) → возвращает ceil(1.8) == 2 cents.
    - Лог с created_at < month_start_msk → не учитывается.
    - Два юзера → разные значения; не путаются между собой в кеше.
    - Повторный вызов в TTL → НЕ обращается в БД (counter check через monkeypatch _fetch_spend_cents_from_db).
    - `invalidate_user_spend_cache(123)` → следующий get_user_spend_cents идёт в БД заново.
  </behavior>
  <action>
Дополнить `app/services/spend_cap.py` после `seconds_until_next_msk_month`:

```python
async def _fetch_spend_cents_from_db(db: AsyncSession, user_id: int) -> int:
    """Aggregate SUM(est_cost_usd) for current MSK month → ceil(usd*100) cents.

    Tests may monkeypatch this to assert cache hit count. Plan 15-02 keeps
    it module-level so monkeypatch.setattr works without ORM dancing.

    NOTE: est_cost_usd is Float (Phase 13 legacy); we sum as Float and
    convert to int cents only at the end. Migration to BIGINT cost_cents
    is deferred (CONTEXT out-of-scope).
    """
    month_start = _month_start_msk()
    month_start_utc = month_start.astimezone(timezone.utc)
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
```

После добавления:
1. Запустите `pytest tests/test_spend_cap_service.py -x` ВНУТРИ docker (или через `scripts/run-integration-tests.sh` если есть DB) — все 7 тестов должны GREEN'нуть.
2. Если test_spend_cents_cache_hits_within_ttl падает (т.к. monkeypatch на `_fetch_spend_cents_from_db` не сработал, потому что тест ожидает другой attribute name), скорректируйте имя attribute (тест сам диктует имя — поправьте сервис под тест, а НЕ наоборот).

Не трогайте Plan 15-03/04/05 здесь — только сервис.

CRITICAL guard:
- НЕ используйте `Float` напрямую с `Decimal`-операциями.
- Cast `total_usd` в `float()` явно (asdecimal=False в модели гарантирует float, но защита).
- `math.ceil(0.0 * 100.0) == 0` — корректно для пустого результата.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "import asyncio; from app.services.spend_cap import get_user_spend_cents, invalidate_user_spend_cache, _spend_cache; _spend_cache[42]=999; r = asyncio.run(invalidate_user_spend_cache(42)); assert 42 not in _spend_cache; print('cache invalidate OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `app/services/spend_cap.py` exports get_user_spend_cents, invalidate_user_spend_cache, _fetch_spend_cents_from_db
    - `grep -c "async def get_user_spend_cents" app/services/spend_cap.py` == 1
    - `grep -c "async def invalidate_user_spend_cache" app/services/spend_cap.py` == 1
    - `grep -c "TTLCache" app/services/spend_cap.py` >= 1
    - `grep -c "asyncio.Lock\|_cache_lock" app/services/spend_cap.py` >= 1
    - `grep -c "math.ceil" app/services/spend_cap.py` >= 1
    - `grep -c "AiUsageLog" app/services/spend_cap.py` >= 1
    - In container with DB: `pytest tests/test_spend_cap_service.py -x` → 7 passed
  </acceptance_criteria>
  <done>get_user_spend_cents работает; tests/test_spend_cap_service.py 7/7 passing.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| service ← caller (route) | Caller passes user_id; service trusts it (caller already auth'd) |
| service → DB | Read-only SELECT; no SQL injection (parameterised) |
| service ↔ cache | In-process; no cross-process leak |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-02-01 | Tampering | user_id from caller — read другого юзера? | mitigate | Caller (route) ALREADY resolves AppUser via get_current_user; service не валидирует user_id вторично; defence in depth — `enforce_spending_cap` (Plan 15-03) и /me (Plan 15-05) используют `current_user.id` strictly. |
| T-15-02-02 | Information disclosure | cache leaks across users via key collision | mitigate | TTLCache key — pure int user_id (PK); no collisions possible. |
| T-15-02-03 | Denial of service | thundering herd on cache miss | mitigate | asyncio.Lock around miss-path; double-check under lock; max 1 DB query per (key, TTL). |
| T-15-02-04 | DoS via cache flood | malicious user_ids fill TTLCache | accept | maxsize=128 with LRU/TTL eviction; can't OOM. user_ids в auth-pipeline ограничены whitelist (5-50 юзеров), edge case не realistic. |
</threat_model>

<verification>
- `pytest tests/test_spend_cap_service.py -x` returns 7 passed (Plan 15-01 RED → Plan 15-02 GREEN).
- Module имеет ~80-120 строк, покрывает все 4 helpers + cache primitives.
- pyproject.toml содержит cachetools dependency.
</verification>

<success_criteria>
- All 7 tests in tests/test_spend_cap_service.py pass.
- cachetools imported successfully on Python 3.12.
- Module внутри 150 строк (lean).
- Никаких side-effects при импорте кроме инстанциации TTLCache + Lock.
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-02-SUMMARY.md`.
</output>
