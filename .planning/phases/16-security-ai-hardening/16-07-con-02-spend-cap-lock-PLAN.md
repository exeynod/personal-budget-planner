---
plan_id: 16-07-con-02-spend-cap-lock
phase: 16
plan: 07
type: execute
wave: 2
depends_on: [16-02-sec-02-sse-error-sanitize]
requirements: [CON-02]
files_modified:
  - app/services/spend_cap.py
  - app/api/dependencies.py
  - app/api/routes/ai.py
  - tests/test_spend_cap_concurrent.py
autonomous: true
must_haves:
  truths:
    - "Два параллельных /ai/chat при cap-1¢ → ровно один проходит (200), второй блокируется (429)"
    - "ai_usage_log получает РОВНО ОДНУ запись для прошедшего запроса (не две — race не позволяет обоим логировать)"
    - "Per-user lock не блокирует параллельные запросы РАЗНЫХ пользователей (test: user A и user B параллельно — оба проходят независимо)"
    - "Existing single-user spend-cap tests (test_spend_cap_service.py, test_enforce_spending_cap_dep.py) продолжают работать"
  artifacts:
    - path: "app/services/spend_cap.py"
      provides: "Per-user asyncio.Lock dict + acquire helper"
      exports: ["acquire_user_spend_lock"]
      contains: "_user_locks"
    - path: "app/api/dependencies.py"
      provides: "enforce_spending_cap acquires lock around check"
      contains: "acquire_user_spend_lock"
    - path: "app/api/routes/ai.py"
      provides: "Lock держится до конца _record_usage (release after usage event)"
      contains: "acquire_user_spend_lock"
    - path: "tests/test_spend_cap_concurrent.py"
      provides: "Pytest async — два параллельных запроса при cap-1¢, проверка count в ai_usage_log"
      exports: []
  key_links:
    - from: "app/services/spend_cap.py::acquire_user_spend_lock"
      to: "_user_locks dict[int, asyncio.Lock] (module-level)"
      via: "get-or-create per user_id"
      pattern: "_user_locks"
    - from: "enforce_spending_cap dependency"
      to: "acquire lock BEFORE check, release AFTER record_usage"
      via: "FastAPI dependency-yield pattern"
      pattern: "yield"
---

<objective>
Закрыть CON-02 (HIGH financial risk): `enforce_spending_cap` (`app/api/dependencies.py`) делает check-then-act с TTL-кэшем 60s. Два параллельных `/ai/chat` запроса в одну секунду оба видят cached spend < cap → оба запускают LLM → оба пишут лог. Cap превышается в 2×.

Purpose: Per D-16-07 — per-user `asyncio.Lock` через словарь `dict[int, asyncio.Lock]` (module-level в `spend_cap.py`, get-or-create) вокруг блока «check cap → LLM call → record_usage». Pre-charge reservation отвергнут — overkill для pet-app. Lock-словарь GC отложен (D-16-07 deferred).

Output: Lock-helper в spend_cap.py, integration в enforce_spending_cap (acquire) + ai.py route (release after record_usage), pytest concurrent test проверяющий counts в ai_usage_log.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/16-security-ai-hardening/16-CONTEXT.md
@.planning/phases/16-security-ai-hardening/16-02-SUMMARY.md
@/Users/exy/.claude/plans/serialized-prancing-spark.md

@app/services/spend_cap.py
@app/api/dependencies.py
@app/api/routes/ai.py
@tests/test_spend_cap_service.py
@tests/test_enforce_spending_cap_dep.py
@tests/test_ai_cap_integration.py

<interfaces>
Existing pattern in app/services/spend_cap.py (already uses asyncio.Lock for cache thundering-herd):
- `_cache_lock = asyncio.Lock()` (module-level, single global)
- `get_user_spend_cents()` acquires `_cache_lock` for cache miss

We need DIFFERENT lock semantics: per-user, held longer (across LLM call), so cannot reuse `_cache_lock`.

enforce_spending_cap dependency lives in app/api/dependencies.py — read its signature to determine acquire/release placement. FastAPI yield-based deps are typical pattern.

The release point is critical: must release AFTER `_record_usage` writes to ai_usage_log; else Lock A releases before A's INSERT, B sees stale cache (still reads pre-A spend), passes check incorrectly.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Concurrent /ai/chat requests for one user -> spend-cap check -> LLM token spend | check-then-act window allows >1 in-flight LLM calls per user. Cap = $1; race-bypass means real spend can hit 2-3× cap. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-07-01 | DoS / cost | enforce_spending_cap check-then-act race | mitigate | Per D-16-07: per-user asyncio.Lock в spend_cap.py. acquire BEFORE TTLCache lookup, release AFTER _record_usage INSERT to ai_usage_log. |
| T-16-07-02 | DoS | Lock-словарь grow-forever | accept | Pet-app, 5-50 users (PROJECT.md). Per-user Lock объект ~200 bytes; grow-forever совместим с runtime memory. LRU eviction — backlog. |
| T-16-07-03 | Liveness / hang | Lock не освобождается при exception в LLM call | mitigate | Использовать `async with` контекст-менеджер вместо ручного acquire/release; гарантирует release при любом исключении. FastAPI yield-based dep + try/finally в route. |
| T-16-07-04 | Cross-user blocking | Один user'а Lock не должен блокировать others | mitigate | Per-user dict — keys изолируют. Тест явно проверяет: A + B параллельно проходят независимо. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Per-user asyncio.Lock в spend_cap.py</name>
  <files>app/services/spend_cap.py</files>
  <action>
Per D-16-07: добавить module-level `_user_locks: dict[int, asyncio.Lock]` и helper `acquire_user_spend_lock(user_id)`.

Точные шаги:

1. В `app/services/spend_cap.py`, после строки 34 (`_cache_lock = asyncio.Lock()`), добавить:
```
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

    Caller is responsible for `async with` usage:

        lock = await acquire_user_spend_lock(user_id)
        async with lock:
            # check cap, run LLM, record usage

    The dict is mutated under _user_locks_guard so two concurrent
    callers requesting the same user_id race-create exactly one Lock.
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
```

2. НЕ удалять existing `_cache_lock` — он используется в `get_user_spend_cents` для thundering-herd, отдельная цель.

3. Убедиться, что `import asyncio` уже на верху файла (строка 20 — да).
  </action>
  <verify>
    <automated>grep -q "_user_locks: dict\[int, asyncio.Lock\]" app/services/spend_cap.py && grep -q "async def acquire_user_spend_lock" app/services/spend_cap.py && python -c "import asyncio; from app.services.spend_cap import acquire_user_spend_lock; print(asyncio.run(acquire_user_spend_lock(1)).__class__.__name__)" 2>&1 | grep -E "^Lock"</automated>
  </verify>
  <done>Module-level dict + helper добавлены; smoke-import работает; helper возвращает asyncio.Lock-instance.</done>
</task>

<task type="auto">
  <name>Task 2: Acquire lock в enforce_spending_cap + release после _record_usage</name>
  <files>app/api/dependencies.py, app/api/routes/ai.py</files>
  <action>
Per D-16-07: lock acquired в `enforce_spending_cap` (FastAPI yield-based dep), released после `_record_usage`. Это требует переноса release-сигнала из dependency в route.

Стратегия (D-16-07 Claude's discretion: либо dep yield-pattern либо явная обёртка вокруг _event_stream):
- Принимаем подход: dependency `enforce_spending_cap` acquires lock и НЕ освобождает; в route `chat()` явно release ПОСЛЕ stream завершён. Это требует pass'ить lock как dependency value.
- Альтернатива: route handler сам acquires lock вокруг StreamingResponse generator. Чище, легче тестировать.

Выбираем АЛЬТЕРНАТИВУ — acquire/release в route handler `chat()`, не в dependency. Это:
1. Не ломает existing dep-сигнатуру.
2. Гарантирует release через try/finally вокруг StreamingResponse.
3. Cleaner ownership.

Точные шаги:

1. В `app/api/routes/ai.py`, импорт:
```
from app.services.spend_cap import acquire_user_spend_lock
```

2. В функции `chat()` (def line 385), переписать тело:
```
@router.post("/chat")
async def chat(
    body: ChatRequest,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> StreamingResponse:
    """POST /ai/chat — streaming SSE ответ (AI-03)."""
    if _is_rate_limited(user_id):
        raise HTTPException(
            status_code=429,
            detail="Превышен лимит запросов. Попробуй через минуту.",
            headers={"Retry-After": "60"},
        )

    # CON-02 (Plan 16-07): per-user lock around the entire stream.
    # _event_stream calls _record_usage as part of its `usage` event handling;
    # the lock is held until the stream generator finishes (incl. _record_usage).
    lock = await acquire_user_spend_lock(user_id)
    await lock.acquire()
    try:
        # CON-02: re-check spend AFTER lock acquired so we serialize against
        # any earlier in-flight request that just finished _record_usage and
        # released the lock (cache may already be invalidated by that path).
        # Cheap when cap not configured (returns immediately).
        from app.api.dependencies import enforce_spending_cap_for_user
        await enforce_spending_cap_for_user(db, user_id=user_id)

        async def _wrapped() -> AsyncGenerator[str, None]:
            try:
                async for chunk in _event_stream(db, user_id, body.message):
                    yield chunk
            finally:
                lock.release()

        return StreamingResponse(
            _wrapped(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception:
        # If anything between acquire and StreamingResponse construction throws
        # (incl. enforce_spending_cap_for_user → 429), release before re-raise.
        if lock.locked():
            lock.release()
        raise
```

3. В `app/api/dependencies.py`: добавить функцию `enforce_spending_cap_for_user(db, *, user_id)` — синхронный (без Request) helper, аналог `enforce_spending_cap` dependency, но callable из route после lock acquired. Если `enforce_spending_cap` уже принимает только `(db, user_id)`-style без Request — переиспользовать as-is. Иначе extract'ить inner-logic.

   Пример (если existing dep — class-based):
```
async def enforce_spending_cap_for_user(
    db: AsyncSession, *, user_id: int,
) -> None:
    """Imperative variant of enforce_spending_cap — for use INSIDE a lock.

    Re-fetches spend (bypassing TTLCache by calling invalidate first), checks
    against cap, raises HTTPException 429 if exceeded.
    """
    from app.services.spend_cap import (
        get_user_spend_cents, invalidate_user_spend_cache,
        seconds_until_next_msk_month,
    )
    from app.db.models import AppUser
    from sqlalchemy import select

    # Force fresh read post-lock (other request may just have INSERTed).
    await invalidate_user_spend_cache(user_id)
    spend = await get_user_spend_cents(db, user_id=user_id)

    user = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    cap = (user.spending_cap_cents if user else None) or 0
    if cap and spend >= cap:
        raise HTTPException(
            status_code=429,
            detail={"error": "ai_spend_cap_exceeded", "cap_cents": cap, "spend_cents": spend},
            headers={"Retry-After": str(seconds_until_next_msk_month())},
        )
```
(Если existing `enforce_spending_cap` dep уже работает как FastAPI Depends — оставить, но extract'ить чистую функцию для прямого вызова. Если signature spending_cap_cents в AppUser отсутствует — посмотреть Phase 15 миграцию (alembic 0009) и взять верный column.)

4. УДАЛИТЬ `Depends(enforce_spending_cap)` из router-level deps в `ai.py` (line 60-61) — теперь cap-check делается ВНУТРИ lock, dependency-вариант делает duplicate work. Это БОЛЬШОЕ изменение для existing tests; альтернативно оставить router-level dep И добавить in-lock re-check. Выбираем КОНСЕРВАТИВНОЕ: оставить router-level dep (быстрый pre-check без lock — fail-fast при явном превышении), добавить in-lock re-check (защита от race).

   То есть БЕЗ удаления dep — финальный код route как описано в шаге 2: lock acquired → invalidate cache → re-check `enforce_spending_cap_for_user`. Router-level dep делает initial check (fast 429 без lock), in-lock check ловит race.

5. Тесты `test_enforce_spending_cap_dep.py` НЕ должны ломаться — они тестируют router-level dep, который сохранён.
  </action>
  <verify>
    <automated>grep -q "acquire_user_spend_lock" app/api/routes/ai.py && grep -q "lock.release" app/api/routes/ai.py && grep -q "enforce_spending_cap_for_user" app/api/dependencies.py</automated>
  </verify>
  <done>Lock acquired в chat(); release в _wrapped finally + exception path; enforce_spending_cap_for_user helper определён в dependencies.py.</done>
</task>

<task type="auto">
  <name>Task 3: Pytest concurrent regression — два /ai/chat при cap-1¢</name>
  <files>tests/test_spend_cap_concurrent.py</files>
  <action>
Создать тест с предзаряженной spend ≈ cap-1¢ (например cap=100¢, spend=99¢). Запустить два запроса параллельно — один проходит, второй 429.

Точный код:
```
"""CON-02 regression: enforce_spending_cap atomic against concurrent /ai/chat.

Setup: AppUser with spending_cap_cents=100, pre-existing ai_usage_log totalling
99 cents. Two concurrent /ai/chat requests:
  - Pre-fix: both pass check (read same cached 99 < 100), both spend tokens,
    both INSERT to ai_usage_log → 2× cap exceeded.
  - Post-fix: lock serializes; first acquires, runs LLM, INSERTs to bring
    spend to e.g. 100¢, releases. Second acquires, invalidate_user_spend_cache
    → fresh spend=100, raises 429.
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.db.models import AiUsageLog, AppUser
from app.db.session import AsyncSessionLocal
from app.services.spend_cap import invalidate_user_spend_cache


class _MetredLLM:
    """Stub LLM that emits a single 'usage' event causing cost ~ 1¢."""

    async def chat(self, messages, tools=None):
        yield {"type": "token", "data": "ok"}
        yield {
            "type": "usage",
            "data": {
                "model": "gpt-4.1-nano",
                "prompt_tokens": 100,
                "cached_tokens": 0,
                "completion_tokens": 50,
                "total_tokens": 150,
                # Force cost ~$0.01 = 1 cent regardless of pricing config.
                "est_cost_usd": 0.01,
            },
        }
        yield {"type": "done", "data": ""}


@pytest.fixture
async def user_at_cap_minus_one(db_session, monkeypatch):
    """Create AppUser with spending_cap_cents=100 + pre-existing 99¢ spend."""
    u = AppUser(
        tg_user_id=999_002_111, role="user",
        onboarded_at=datetime.now(timezone.utc), cycle_start_day=1,
        spending_cap_cents=100,
    )
    db_session.add(u)
    await db_session.flush()

    # Insert pre-existing usage so SUM = 0.99 USD = 99 cents.
    pre = AiUsageLog(
        user_id=u.id, model="gpt-4.1-nano",
        prompt_tokens=0, completion_tokens=0, cached_tokens=0, total_tokens=0,
        est_cost_usd=0.99,
    )
    db_session.add(pre)
    await db_session.commit()
    await invalidate_user_spend_cache(u.id)
    yield u


@pytest.mark.asyncio
async def test_concurrent_ai_chat_at_cap_yields_one_pass_one_429(
    db_client, monkeypatch, user_at_cap_minus_one,
):
    """Two parallel /ai/chat: exactly one 200, exactly one 429."""
    from app.api.routes import ai as ai_route
    from app.api.dependencies import get_current_user_id

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _MetredLLM())
    # Override auth to use our fixture user_id. Adjust per existing test pattern.

    # If existing tests use auth_headers fixture for the test user, you must
    # match user_at_cap_minus_one to that user — typically auth_headers points
    # at app_user fixture. Cross-check tests/conftest.py for naming.

    async def _hit():
        # Use independent client per task to truly parallelize.
        return await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "ping"},
            headers={"X-Test-User-Id": str(user_at_cap_minus_one.id)},
        )

    a, b = await asyncio.gather(_hit(), _hit(), return_exceptions=True)

    statuses = sorted([
        getattr(a, "status_code", None) or 500,
        getattr(b, "status_code", None) or 500,
    ])
    assert statuses == [200, 429], f"Expected [200, 429]; got {statuses!r}"

    # Verify exactly ONE additional ai_usage_log row was inserted (sum +0.01).
    async with AsyncSessionLocal() as session:
        total = await session.scalar(
            select(func.coalesce(func.sum(AiUsageLog.est_cost_usd), 0.0))
            .where(AiUsageLog.user_id == user_at_cap_minus_one.id)
        )
        # 0.99 (pre) + 0.01 (one passed request) = 1.00
        assert math.isclose(float(total), 1.00, abs_tol=0.001), (
            f"Expected total=1.00 USD (one passed); got {total}"
        )


@pytest.mark.asyncio
async def test_concurrent_ai_chat_different_users_both_pass(
    db_client, monkeypatch,
):
    """Per-user lock isolation: two DIFFERENT users at cap-1¢ both pass independently."""
    from app.api.routes import ai as ai_route

    monkeypatch.setattr(ai_route, "_get_llm_client", lambda: _MetredLLM())

    async with AsyncSessionLocal() as s:
        users = []
        for tg in (999_002_222, 999_002_333):
            u = AppUser(
                tg_user_id=tg, role="user",
                onboarded_at=datetime.now(timezone.utc), cycle_start_day=1,
                spending_cap_cents=100,
            )
            s.add(u)
            await s.flush()
            s.add(AiUsageLog(
                user_id=u.id, model="gpt-4.1-nano",
                prompt_tokens=0, completion_tokens=0, cached_tokens=0, total_tokens=0,
                est_cost_usd=0.99,
            ))
            users.append(u)
        await s.commit()
        for u in users:
            await invalidate_user_spend_cache(u.id)

    async def _hit(user_id: int):
        return await db_client.post(
            "/api/v1/ai/chat",
            json={"message": "hi"},
            headers={"X-Test-User-Id": str(user_id)},
        )

    a, b = await asyncio.gather(_hit(users[0].id), _hit(users[1].id))
    assert a.status_code == 200
    assert b.status_code == 200
```

Note: точное wiring auth для test (`X-Test-User-Id` или существующая `auth_headers` фикстура multi-user) зависит от паттерна в существующих тестах. Посмотреть `tests/test_e2e_multi_user_lifecycle.py` для multi-user паттерна и адаптировать.

FAIL до Task 2: оба запроса проходят → total = 1.01 USD; statuses == [200, 200].
PASS после Task 2: lock + cache invalidate в in-lock re-check → второй ловит cap → 429.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && pytest tests/test_spend_cap_concurrent.py -v</automated>
  </verify>
  <done>2 теста (same-user race + cross-user isolation) PASS; pytest exit 0; ai_usage_log sum = exactly 1.00 USD.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `pytest tests/test_spend_cap_concurrent.py -v` → 2 passed.
2. `pytest tests/test_spend_cap_service.py tests/test_enforce_spending_cap_dep.py tests/test_ai_cap_integration.py` → no regress.
3. `grep -q "_user_locks" app/services/spend_cap.py` → exit 0.
4. `grep -q "acquire_user_spend_lock" app/api/routes/ai.py` → exit 0.
</verification>

<success_criteria>
CON-02 закрыт:
- Per-user asyncio.Lock сериализует check cap → LLM call → record_usage.
- Два параллельных запроса при cap-1¢ → 200 + 429.
- Two different users параллельно — оба 200 (lock isolation).
- ai_usage_log имеет ровно одну запись от прошедшего запроса.
- Existing single-user tests PASS.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-07-SUMMARY.md`
</output>

## Commit Message
fix(16): CON-02 per-user asyncio.Lock around spend-cap check + LLM call + record_usage; pytest concurrent regression
