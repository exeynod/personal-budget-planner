---
phase: 15-ai-cost-cap-per-user
plan: 03
type: execute
wave: 2
depends_on: [15-02]
files_modified:
  - app/api/dependencies.py
  - app/api/routes/ai.py
  - app/api/routes/ai_suggest.py
autonomous: true
requirements: [AICAP-02]

must_haves:
  truths:
    - "POST /api/v1/ai/chat при spend >= cap → 429 + Retry-After header"
    - "GET /api/v1/ai/suggest-category при spend >= cap → 429 + Retry-After header"
    - "При spend < cap → запрос проходит как обычно (200 / SSE)"
    - "cap_cents == 0 блокирует любой запрос (spend = 0 >= 0)"
    - "429 detail = {error, spent_cents, cap_cents}; Retry-After = seconds_until_next_msk_month"
    - "Tests из tests/test_enforce_spending_cap_dep.py становятся GREEN"
    - "Tests из tests/test_ai_cap_integration.py становятся GREEN (chat/suggest blocked + unblocked после PATCH)"
  artifacts:
    - path: "app/api/dependencies.py"
      provides: "enforce_spending_cap dependency"
      contains: "async def enforce_spending_cap"
    - path: "app/api/routes/ai.py"
      provides: "router-level Depends(enforce_spending_cap) добавлен"
      contains: "Depends(enforce_spending_cap)"
    - path: "app/api/routes/ai_suggest.py"
      provides: "router-level Depends(enforce_spending_cap) добавлен"
      contains: "Depends(enforce_spending_cap)"
  key_links:
    - from: "app/api/dependencies.py:enforce_spending_cap"
      to: "app/services/spend_cap.py:get_user_spend_cents"
      via: "import + call"
      pattern: "from app.services.spend_cap import get_user_spend_cents|spend_cap_svc"
    - from: "app/api/dependencies.py:enforce_spending_cap"
      to: "seconds_until_next_msk_month for Retry-After"
      via: "header value"
      pattern: "seconds_until_next_msk_month"
    - from: "app/api/routes/ai.py router dependencies"
      to: "enforce_spending_cap"
      via: "router-level Depends list"
      pattern: "dependencies=\\[.*enforce_spending_cap"
    - from: "app/api/routes/ai_suggest.py router dependencies"
      to: "enforce_spending_cap"
      via: "router-level Depends list"
      pattern: "dependencies=\\[.*enforce_spending_cap"
---

<objective>
Создать dependency `enforce_spending_cap` в `app/api/dependencies.py` и подключить её на router-level двух AI-роутеров: `app/api/routes/ai.py` (POST /ai/chat, и заодно остальные endpoints — /history /conversation /usage остаются под dep но они не дорогие) и `app/api/routes/ai_suggest.py` (GET /ai/suggest-category).

Контракт dependency (D-15-01):
- При `current_user.spending_cap_cents == 0` или `spend_cents >= cap_cents` → `HTTPException(429)` с body `{"error": "spending_cap_exceeded", "spent_cents": int, "cap_cents": int}` и header `Retry-After: <int>` где int = `seconds_until_next_msk_month()`.
- Иначе — passthrough (return None).

Purpose: Реализует AICAP-02 (gate enforcement) на уровне FastAPI dependency, без вмешательства в endpoint-логику. cap=0 семантика (D-15-01) реализуется натурально через `>=` сравнение.

Output: Один новый dependency в shared module + router-level wiring двух файлов.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md
@.planning/phases/15-ai-cost-cap-per-user/15-02-SUMMARY.md

@app/api/dependencies.py
@app/api/routes/ai.py
@app/api/routes/ai_suggest.py
@app/services/spend_cap.py
@app/db/models.py
@tests/test_enforce_spending_cap_dep.py
@tests/test_ai_cap_integration.py

<interfaces>
<!-- Plan 15-02 already shipped (dependency: ../15-02-SUMMARY.md): -->
from app.services.spend_cap import (
    get_user_spend_cents,
    seconds_until_next_msk_month,
)

# Existing pattern (mirror):
# app/api/dependencies.py:require_owner / require_onboarded:
#   async def require_owner(current_user: Annotated[AppUser, Depends(get_current_user)]) -> AppUser
# Both raise HTTPException(403/409) on rejection.

# enforce_spending_cap will follow the same shape but injects db too:
async def enforce_spending_cap(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    ...

# Router pattern in app/api/routes/ai.py (lines 53-57):
# router = APIRouter(
#     prefix="/ai", tags=["ai"],
#     dependencies=[Depends(get_current_user), Depends(require_onboarded)],
# )
# Plan 15-03 will append Depends(enforce_spending_cap) to this list.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement enforce_spending_cap dependency in app/api/dependencies.py</name>
  <files>app/api/dependencies.py</files>
  <read_first>
    - app/api/dependencies.py (existing require_owner / require_onboarded patterns lines 168-213)
    - app/services/spend_cap.py (signatures from Plan 15-02)
    - tests/test_enforce_spending_cap_dep.py (6 tests pin contract)
  </read_first>
  <behavior>
    - При cap > 0 и spend < cap → return None.
    - При cap > 0 и spend >= cap → raise HTTPException(429, detail={error, spent_cents, cap_cents}, headers={Retry-After: str(seconds)}).
    - При cap == 0 → raise 429 (spend (>=0) >= cap=0 trivially holds).
    - Detail dict: keys = "error", "spent_cents", "cap_cents"; values — int, int, и string "spending_cap_exceeded".
    - Retry-After header — string of `seconds_until_next_msk_month()` (positive int).
  </behavior>
  <action>
В `app/api/dependencies.py` добавить новую async dependency после `require_onboarded` (после строки 213, перед `get_db_with_tenant_scope`):

```python
async def enforce_spending_cap(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Gate AI endpoints behind monthly spend cap (Phase 15 AICAP-02).

    Per CONTEXT D-15-01: applied as router-level dependency on
    /api/v1/ai/* (chat) and /api/v1/ai/suggest-category. Aggregates
    monthly spend (cents) for current MSK month, compares to
    current_user.spending_cap_cents. On `spend >= cap` raises
    HTTPException(429) with structured detail and Retry-After.

    cap=0 semantics: any spend (>=0) trivially exceeds 0; AI fully off.
    Retry-After: seconds until next 1st 00:00 Europe/Moscow.

    NB: this dependency intentionally does NOT replace get_current_user
    or require_onboarded — chains are explicit at router level so each
    role-and-onboarding constraint surfaces independently.

    NOTE on db param: get_db (untenant-scoped) — мы агрегируем по user_id
    explicitly без RLS scope; ai_usage_log запрос filtered WHERE user_id=X.
    Альтернативно можно использовать get_db_with_tenant_scope, но это
    поведение дублирует фильтр и плохо ладит с running this BEFORE
    get_db_with_tenant_scope в той же chain. Plain get_db чище.
    """
    from app.services.spend_cap import (
        get_user_spend_cents,
        seconds_until_next_msk_month,
    )

    cap = int(current_user.spending_cap_cents or 0)
    spend = await get_user_spend_cents(db, user_id=current_user.id)
    if spend >= cap:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "spending_cap_exceeded",
                "spent_cents": int(spend),
                "cap_cents": int(cap),
            },
            headers={"Retry-After": str(seconds_until_next_msk_month())},
        )
```

Импорт в module top или внутри функции — выбирайте локальный, чтобы избежать cyclic imports (`app.services.spend_cap` -> `app.db.models` ОК, но если spend_cap начнёт импортить что-то из api/, локальный импорт безопаснее). Рекомендация: локальный импорт внутри функции (как сделано в snippet).

Учтите: `current_user.spending_cap_cents` в моделях имеет default=46500; для legacy rows должно быть Not None (server_default). На случай — `or 0` в snippet.

`status.HTTP_429_TOO_MANY_REQUESTS` уже импортирован в dependencies.py (строка 22 — `from fastapi import ... status`).

После добавления — запустите `pytest tests/test_enforce_spending_cap_dep.py -x`. 6 тестов должны GREEN.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "from app.api.dependencies import enforce_spending_cap; import inspect; sig = inspect.signature(enforce_spending_cap); assert 'current_user' in sig.parameters and 'db' in sig.parameters; print('OK', list(sig.parameters))"</automated>
  </verify>
  <acceptance_criteria>
    - `app/api/dependencies.py` defines `async def enforce_spending_cap`
    - `grep -c "async def enforce_spending_cap" app/api/dependencies.py` == 1
    - `grep -c "spending_cap_exceeded" app/api/dependencies.py` >= 1
    - `grep -c "HTTP_429_TOO_MANY_REQUESTS\|status_code=429" app/api/dependencies.py` >= 1
    - `grep -c "Retry-After" app/api/dependencies.py` >= 1
    - `grep -c "from app.services.spend_cap" app/api/dependencies.py` >= 1
    - In container w/ DB: `pytest tests/test_enforce_spending_cap_dep.py -x` → 6 passed
  </acceptance_criteria>
  <done>enforce_spending_cap shipped; 6/6 enforce-dep tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Apply enforce_spending_cap to /ai router and /ai-suggest router</name>
  <files>app/api/routes/ai.py, app/api/routes/ai_suggest.py</files>
  <read_first>
    - app/api/routes/ai.py:34-57 (existing imports + router definition)
    - app/api/routes/ai_suggest.py:17-30 (existing imports + router)
    - tests/test_ai_cap_integration.py (4 tests pin behavior)
  </read_first>
  <action>
**В `app/api/routes/ai.py`**:

1. Импорт: расширить existing `from app.api.dependencies import (...)` (строки 34-39) добавив `enforce_spending_cap`:
```python
from app.api.dependencies import (
    enforce_spending_cap,        # NEW Plan 15-03
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
```

2. Router-level dependencies (строки 53-57): добавить `Depends(enforce_spending_cap)` ПОСЛЕ `require_onboarded`:
```python
router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_onboarded),
        Depends(enforce_spending_cap),   # Plan 15-03 AICAP-02
    ],
)
```

ВАЖНО: enforce_spending_cap привязан router-level, поэтому затронет ВСЕ endpoints в /ai/* (chat, history, conversation, usage). Это ОК per D-15-01: даже /ai/history можно блокировать когда юзер не платит, чтобы не давать ему доступ к старым AI-данным. Если решите эксклюдить read-only endpoints — переместите Depends на конкретные endpoints (`@router.post("/chat", dependencies=[Depends(enforce_spending_cap)])`). **Решение**: оставить router-level (proще, отвечает контракту "AI off when cap=0"). История = AI-feature, тоже off.

**В `app/api/routes/ai_suggest.py`**:

1. Импорт (строки 17-22) — добавить enforce_spending_cap:
```python
from app.api.dependencies import (
    enforce_spending_cap,        # NEW Plan 15-03
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
```

2. Router-level dependencies (строки 26-30) — добавить:
```python
router = APIRouter(
    prefix="",
    tags=["ai-categorization"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_onboarded),
        Depends(enforce_spending_cap),   # Plan 15-03 AICAP-02
    ],
)
```

После правок — запустите `pytest tests/test_ai_cap_integration.py -x`. Все 4 теста должны GREEN'нуть (chat blocked, suggest blocked, unblocked после PATCH).

ВНИМАНИЕ: `tests/test_ai_cap_integration.py` содержит test_chat_unblocked_after_admin_patches_cap_higher который требует Plan 15-04 (PATCH endpoint). Если Plan 15-04 ещё не задеплоен, этот тест fall-through останется RED. Plan 15-03 ДОЛЖЕН проверить только #1 (chat blocked) + #3 (suggest blocked) + #4 (cap=0 blocks). Test #2 GREEN-ем после Plan 15-04.

`enforce_spending_cap` использует `get_db` (Plan 15-03 Task 1), это может иметь nuance: dependency-цепочка для `/ai/chat` теперь:
1. `Depends(get_current_user)` (через Header) → resolves AppUser
2. `Depends(require_onboarded)` → checks onboarded_at
3. `Depends(enforce_spending_cap)` → reads spend_cap from current_user, queries via get_db
4. handler signature: `db: Depends(get_db_with_tenant_scope)`, `user_id: Depends(get_current_user_id)` — открывает ВТОРУЮ session с RLS scope

Это OK: FastAPI использует separate session для enforce vs handler. Никаких deadlock'ов — обе session короткие.

Не трогать `app/api/router.py` (mount routers) — там никаких изменений.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && grep -c "Depends(enforce_spending_cap)" app/api/routes/ai.py app/api/routes/ai_suggest.py | grep -E ":1$" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Depends(enforce_spending_cap)" app/api/routes/ai.py` == 1
    - `grep -c "Depends(enforce_spending_cap)" app/api/routes/ai_suggest.py` == 1
    - `grep -c "from app.api.dependencies import" app/api/routes/ai.py | grep enforce_spending_cap` shows match
    - In container: `pytest tests/test_enforce_spending_cap_dep.py tests/test_ai_cap_integration.py::test_chat_blocked_when_at_cap_returns_429 tests/test_ai_cap_integration.py::test_suggest_category_blocked_when_at_cap tests/test_ai_cap_integration.py::test_cap_zero_blocks_chat_and_suggest -x` → all pass
    - `pytest tests/test_ai_cap_integration.py -x` may have 1 still-RED test (test_chat_unblocked_after_admin_patches_cap_higher) blocking on PATCH endpoint from Plan 15-04 — это OK, документировать в SUMMARY.
  </acceptance_criteria>
  <done>Both AI routers gated; 6/6 enforce-dep tests + 3/4 integration tests GREEN; PATCH-cycle test depends on Plan 15-04.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /api/v1/ai/* | Untrusted; gate is enforce_spending_cap |
| client → /api/v1/ai/suggest-category | Untrusted; same gate |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-03-01 | Information disclosure | 429 detail leaks own spent_cents/cap_cents | accept | per-user data; user has right to know own state |
| T-15-03-02 | Spoofing | bypass through different endpoint | mitigate | router-level dep covers ALL /ai/* + /ai-suggest/* uniformly |
| T-15-03-03 | DoS via spend-cap exhaustion attack | малicious user spam → fast 429 без OpenAI cost | accept | существующий rate-limit (10 req/мин в ai.py) уже в place; cap-check ~ms, no DB hot-path |
| T-15-03-04 | Tampering | client modifies cap_cents header | mitigate | cap читается из current_user (DB-backed AppUser ORM); client не контролирует |
| T-15-03-05 | Elevation of privilege | member bypasses cap by hitting `/admin/ai-usage` for hopefully cheaper | accept | admin endpoint require_owner; member 403; не AI cost |
</threat_model>

<verification>
- 6/6 enforce-dep tests pass.
- 3/4 integration tests pass (test_chat_unblocked_after_admin_patches_cap_higher requires Plan 15-04).
- Manual: с правильным dev_seed user (cap=46500), POST /ai/chat — успешен (200 SSE). Поменяйте cap=0 в БД руками, перезапустите api container — POST /ai/chat → 429.
</verification>

<success_criteria>
- enforce_spending_cap имплементирован, протестирован.
- Both AI routers (chat + suggest) карьят dependency.
- Cap=0 блокирует обоих.
- Tests RED Plan 15-01 → GREEN после этого Plan, кроме одного теста на patch-cycle (закроется в Plan 15-04).
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-03-SUMMARY.md`.
</output>
