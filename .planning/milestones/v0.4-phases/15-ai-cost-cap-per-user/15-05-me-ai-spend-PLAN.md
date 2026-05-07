---
phase: 15-ai-cost-cap-per-user
plan: 05
type: execute
wave: 2
depends_on: [15-02]
files_modified:
  - app/api/router.py
autonomous: true
requirements: [AICAP-04]

must_haves:
  truths:
    - "GET /api/v1/me возвращает дополнительное поле ai_spend_cents: int"
    - "ai_spend_cents = текущий MSK month spend (cents) для current_user"
    - "Отсутствие логов → ai_spend_cents == 0"
    - "Поле ВСЕГДА присутствует (int, не Optional) — frontend получает чёткий контракт"
    - "Существующие поля /me (tg_user_id, role, onboarded_at, ...) сохранены"
    - "Tests из tests/test_me_ai_spend.py становятся GREEN"
  artifacts:
    - path: "app/api/router.py"
      provides: "MeResponse extended with ai_spend_cents; /me handler reads spend"
      contains: "ai_spend_cents"
  key_links:
    - from: "app/api/router.py:get_me"
      to: "app/services/spend_cap.py:get_user_spend_cents"
      via: "import + await call"
      pattern: "get_user_spend_cents"
---

<objective>
Расширить `MeResponse` Pydantic-модель полем `ai_spend_cents: int` и обновить `/me` handler чтобы читать `await spend_cap_svc.get_user_spend_cents(db, user_id=current_user.id)` и включать в ответ.

Cap НЕ показывается через /me (тривиальный read из current_user.spending_cap_cents через frontend access — но решено в CONTEXT D-15-04: frontend читает spending_cap_cents from MeResponse тоже). **Обновляем CONTEXT-расширение**: в добавок к ai_spend_cents мы тоже отдаём `ai_spending_cap_cents: int` чтобы frontend не делал отдельный запрос. (Контекст D-15-04: «Settings показывает self-spend / cap (например $2.30 / $5.00)» — фронту нужен и spend и cap.)

Purpose: Реализует backend-часть AICAP-04 для frontend Settings UI (Plan 15-06). 

Output: Patch одного файла `app/api/router.py`: расширение MeResponse + handler.
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

@app/api/router.py
@app/services/spend_cap.py
@app/db/models.py
@tests/test_me_ai_spend.py
@tests/test_me_returns_role.py

<interfaces>
<!-- Existing /me (app/api/router.py:73-104) -->
class MeResponse(BaseModel):
    tg_user_id: int
    tg_chat_id: int | None
    cycle_start_day: int
    onboarded_at: str | None
    chat_id_known: bool
    role: Literal["owner", "member", "revoked"]

# After Plan 15-05:
class MeResponse(BaseModel):
    tg_user_id: int
    tg_chat_id: int | None
    cycle_start_day: int
    onboarded_at: str | None
    chat_id_known: bool
    role: Literal["owner", "member", "revoked"]
    ai_spend_cents: int                    # NEW (Plan 15-05) — current MSK month spend
    ai_spending_cap_cents: int             # NEW (Plan 15-05) — current cap for self

# Plan 15-02 module:
from app.services.spend_cap import get_user_spend_cents

# get_db dependency must be added to handler signature for spend_cap query.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend MeResponse + /me handler to include ai_spend_cents and ai_spending_cap_cents</name>
  <files>app/api/router.py</files>
  <read_first>
    - app/api/router.py:1-105 (entire file — small)
    - app/services/spend_cap.py (signatures from Plan 15-02)
    - tests/test_me_ai_spend.py (4 tests pin contract)
    - tests/test_me_returns_role.py (existing /me test pattern still passes)
  </read_first>
  <behavior>
    - GET /me для onboarded owner без логов → response JSON: `{ ..., "ai_spend_cents": 0, "ai_spending_cap_cents": 46500 }`.
    - С 3 логами (sum est_cost_usd = 0.018 USD) → ai_spend_cents == 2 (ceil(1.8)).
    - Логи в прошлом MSK месяце игнорируются.
    - ai_spending_cap_cents == current_user.spending_cap_cents (raw int).
    - Существующие тесты test_me_returns_role.py НЕ ломаются (поле просто добавилось).
  </behavior>
  <action>
В `app/api/router.py` сделать 4 правки:

**1. Импорт `get_db` и AsyncSession + spend_cap service** (после существующих импортов):

```python
# Добавить к существующим импортам в начало файла (после строки 51)
from sqlalchemy.ext.asyncio import AsyncSession

# При расширении импорта dependencies:
from app.api.dependencies import get_current_user, get_db, verify_internal_token
```

`get_db` уже определён в `app/api/dependencies.py` (строка 33 — `async def get_db()`).

**2. Расширить `MeResponse`** (строки 73-79):

```python
class MeResponse(BaseModel):
    tg_user_id: int
    tg_chat_id: int | None
    cycle_start_day: int
    onboarded_at: str | None
    chat_id_known: bool
    role: Literal["owner", "member", "revoked"]  # Phase 12 ROLE-05
    # Phase 15 AICAP-04 (D-15-04): SettingsScreen + AccessScreen self-cap UI.
    ai_spend_cents: int          # current MSK month spend in USD-cents
    ai_spending_cap_cents: int   # active cap in USD-cents (0 = AI off)
```

**3. Обновить `/me` handler** (строки 82-104):

```python
@public_router.get("/me", response_model=MeResponse)
async def get_me(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeResponse:
    """Return current user info (Phase 12 ROLE-05, Phase 15 AICAP-04).

    Phase 15 (AICAP-04, D-15-04): adds `ai_spend_cents` (current MSK month
    spend) and `ai_spending_cap_cents` (raw cap from app_user) so SettingsScreen
    can render `$X.XX / $Y.YY` без дополнительного запроса. spend читается через
    cached service (60s TTL).
    """
    from app.services.spend_cap import get_user_spend_cents

    spend_cents = await get_user_spend_cents(db, user_id=current_user.id)
    return MeResponse(
        tg_user_id=current_user.tg_user_id,
        tg_chat_id=current_user.tg_chat_id,
        cycle_start_day=current_user.cycle_start_day,
        onboarded_at=current_user.onboarded_at.isoformat()
            if current_user.onboarded_at else None,
        chat_id_known=current_user.tg_chat_id is not None,
        role=current_user.role.value,
        ai_spend_cents=int(spend_cents),
        ai_spending_cap_cents=int(current_user.spending_cap_cents or 0),
    )
```

`AsyncSession` import нужен только если он ещё нет — проверьте текущие импорты в файле. Если `from sqlalchemy.ext.asyncio import AsyncSession` отсутствует, добавьте.

**4. Тестируйте**:

После изменений запустите:
```bash
pytest tests/test_me_ai_spend.py tests/test_me_returns_role.py -x
```

Должны GREEN'нуть оба файла (4 + N existing tests).

ОПАСНОСТЬ: `get_db` open's session отдельно от любой tenant-scope session. Поскольку /me не gated `require_onboarded`, юзер БЕЗ onboarded_at тоже его дернёт; и для ТАКОГО юзера `get_user_spend_cents` будет работать (просто 0 если нет логов). Это OK.

ОПАСНОСТЬ: `current_user.spending_cap_cents` имеет server_default=46500; для existing rows значение must be set. Проверка: alembic 0008 (Phase 13) добавил эту колонку с server_default — verified в STATE.md и в db/models.py:99-104. Никаких NULL'ов не должно быть.

frontend types в Plan 15-06 будут обновлены параллельно; backend ↔ frontend контракт надо координировать (новые ОБЯЗАТЕЛЬНЫЕ поля), Frontend нужно ОБЯЗАТЕЛЬНО обновить one wave later. Plan 15-06 frontend depends on Plan 15-05.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "from app.api.router import MeResponse; m = MeResponse(tg_user_id=1, tg_chat_id=None, cycle_start_day=5, onboarded_at=None, chat_id_known=False, role='owner', ai_spend_cents=0, ai_spending_cap_cents=46500); assert m.ai_spend_cents == 0; assert m.ai_spending_cap_cents == 46500; print('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `app/api/router.py` MeResponse имеет ровно 8 полей (6 старых + 2 новых)
    - `grep -c "ai_spend_cents:" app/api/router.py` >= 2 (определение в схеме + использование в handler)
    - `grep -c "ai_spending_cap_cents:" app/api/router.py` >= 2
    - `grep -c "from app.services.spend_cap import" app/api/router.py` >= 1
    - `grep -c "get_user_spend_cents" app/api/router.py` >= 1
    - get_me handler signature добавляет `db: Annotated[AsyncSession, Depends(get_db)]`
    - In container w/ DB: `pytest tests/test_me_ai_spend.py tests/test_me_returns_role.py -x` → all pass
  </acceptance_criteria>
  <done>/me extended; 4 new tests + N existing tests pass; frontend ready to consume.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /me | Auth via initData → returns own user data including spend |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-05-01 | Information disclosure | own ai_spend_cents/cap exposure | accept | self-data; frontend нужно для UX; cap уже visible через UI Settings |
| T-15-05-02 | Performance | DB hit на каждый /me | mitigate | get_user_spend_cents имеет 60s TTL cache; /me hit ≤ 1 раз / сессия typically; cache hit cheap |
| T-15-05-03 | Information disclosure | leak других user spend через /me для owner | mitigate | /me reads `current_user.id` — owner видит только свой spend через /me; admin endpoint /admin/ai-usage для cross-user (separate concern) |
</threat_model>

<verification>
- 4/4 test_me_ai_spend tests pass.
- All existing tests test_me_returns_role.py pass (no regression).
- Manual: GET /api/v1/me header + initData → response JSON содержит ai_spend_cents и ai_spending_cap_cents.
</verification>

<success_criteria>
- MeResponse extended cleanly (no breaking renames).
- /me handler async-call'aет spend service.
- Все 4 теста + регрессия 0.
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-05-SUMMARY.md`.
</output>
