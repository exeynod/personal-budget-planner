---
phase: 15-ai-cost-cap-per-user
plan: 04
type: execute
wave: 2
depends_on: [15-02]
files_modified:
  - app/api/schemas/admin.py
  - app/services/admin_users.py
  - app/api/routes/admin.py
autonomous: true
requirements: [AICAP-04]

must_haves:
  truths:
    - "PATCH /api/v1/admin/users/{user_id}/cap под Depends(require_owner) → 403 для member"
    - "Body Pydantic CapUpdate {spending_cap_cents: int Field(ge=0)} → 422 при отрицательном"
    - "Обновляет AppUser.spending_cap_cents в БД и возвращает AdminUserResponse snapshot включающий поле spending_cap_cents"
    - "GET /api/v1/admin/users (existing, list) тоже теперь возвращает spending_cap_cents в каждом row"
    - "404 при unknown user_id"
    - "После update вызывается invalidate_user_spend_cache(user_id) — следующий запрос видит новый лимит"
    - "Tests из tests/test_admin_cap_endpoint.py становятся GREEN"
    - "Test test_chat_unblocked_after_admin_patches_cap_higher (Plan 15-01 Task 3) становится GREEN"
  artifacts:
    - path: "app/api/schemas/admin.py"
      provides: "CapUpdate Pydantic schema + AdminUserResponse extension"
      contains: "class CapUpdate"
    - path: "app/services/admin_users.py"
      provides: "update_user_cap service"
      contains: "async def update_user_cap"
    - path: "app/api/routes/admin.py"
      provides: "PATCH /admin/users/{user_id}/cap endpoint"
      contains: "/users/{user_id}/cap"
  key_links:
    - from: "app/api/routes/admin.py"
      to: "app/services/admin_users.py:update_user_cap"
      via: "import + call"
      pattern: "admin_svc.update_user_cap|update_user_cap"
    - from: "app/services/admin_users.py:update_user_cap"
      to: "app/services/spend_cap.py:invalidate_user_spend_cache"
      via: "post-update cache invalidation"
      pattern: "invalidate_user_spend_cache"
    - from: "app/api/routes/admin.py"
      to: "app/api/schemas/admin.py:CapUpdate"
      via: "request body schema"
      pattern: "CapUpdate"
---

<objective>
Создать endpoint `PATCH /api/v1/admin/users/{user_id}/cap` под `Depends(require_owner)`. Body — Pydantic `CapUpdate {spending_cap_cents: int = Field(ge=0)}`. Owner может редактировать cap для self или other user. Endpoint:
1. Validates user_id exists (404 если нет).
2. Updates AppUser.spending_cap_cents.
3. Invalidates spend cache для этого user_id.
4. Returns updated AdminUserResponse snapshot.

Дополнительно: Расширить существующий `AdminUserResponse` schema полем `spending_cap_cents: int = 0` чтобы UI (Plan 15-06) мог prefill cap-edit input без отдельного запроса. Затронет existing GET /admin/users response (gracefully — поле добавлено, не убрано).

Purpose: Реализует AICAP-04 (admin edit) + закрывает контракт для frontend (Plan 15-06).

Output: Pydantic schema (с extension) + service function + route handler.
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

@app/api/schemas/admin.py
@app/services/admin_users.py
@app/api/routes/admin.py
@app/services/spend_cap.py
@tests/test_admin_cap_endpoint.py
@tests/test_admin_users_api.py

<interfaces>
<!-- Existing patterns to mirror: -->

# app/api/schemas/admin.py:AdminUserCreateRequest (строки 38-51) использует
#   ConfigDict(extra="forbid"), Field(..., ge=10_000)
# Mirror for CapUpdate:
class CapUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spending_cap_cents: int = Field(..., ge=0, le=100_000_00)

# app/services/admin_users.py:invite_user (строки 59-90) — pattern для lookup + raise UserNotFoundError.

# app/api/routes/admin.py:create_admin_user (строки 56-84) — handler shape.

# Plan 15-02 module:
from app.services.spend_cap import invalidate_user_spend_cache

# Existing AdminUserResponse — нужно ВКЛЮЧИТЬ spending_cap_cents:
# (Plan 15-04 Task 1 расширяет schema; existing list/invite endpoints
# автоматически начнут возвращать поле через from_attributes=True.)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend AdminUserResponse + add CapUpdate schema + update_user_cap service</name>
  <files>app/api/schemas/admin.py, app/services/admin_users.py</files>
  <read_first>
    - app/api/schemas/admin.py (existing AdminUserResponse lines 19-35, AdminUserCreateRequest pattern)
    - app/services/admin_users.py (existing invite_user/purge_user/UserNotFoundError patterns)
    - app/services/spend_cap.py (invalidate_user_spend_cache signature)
    - tests/test_admin_cap_endpoint.py (7 tests pin contract)
    - tests/test_admin_users_api.py (verify existing list/invite tests не сломаются — они проверяют существующие поля без spending_cap_cents)
  </read_first>
  <behavior>
    - `AdminUserResponse(...)` теперь требует ИЛИ имеет default для spending_cap_cents.
    - GET /admin/users теперь включает spending_cap_cents в каждом row (existing tests test_admin_users_api.py не должны сломаться — они не assert'ят отсутствие поля).
    - `CapUpdate(spending_cap_cents=0)` валидно.
    - `CapUpdate(spending_cap_cents=-1)` → ValidationError.
    - `CapUpdate(spending_cap_cents=46500, role="owner")` → ValidationError (extra="forbid").
    - `update_user_cap(db, user_id=999_999, spending_cap_cents=100)` → raises UserNotFoundError.
    - `update_user_cap(db, user_id=valid, spending_cap_cents=200000)` → returns AppUser с обновлённым полем; БД содержит 200000.
    - После update вызывается `invalidate_user_spend_cache(user_id)`.
  </behavior>
  <action>
**1.1 В `app/api/schemas/admin.py`** расширить existing `AdminUserResponse` (lines 19-35) добавив поле `spending_cap_cents`:

```python
class AdminUserResponse(BaseModel):
    """One whitelist row для GET /admin/users (ADM-03 + ADM-06).

    `last_seen_at` пока NULL для всех existing rows — Phase 14 обновит при
    bot bind / first /me. Поле добавлено заранее в alembic 0008 чтобы UI
    мог рендерить «Xd назад» как только данные начнут поступать.

    `spending_cap_cents` (Phase 15 AICAP-04) — текущий AI-расходный лимит
    юзера. Используется CapEditSheet (Plan 15-06) для prefill. Default
    в БД 46500 (alembic 0008 stub). Scale: USD-cents (USD * 100 per
    CONTEXT D-15-02 explicit code).
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    tg_user_id: int
    tg_chat_id: Optional[int] = None
    role: Literal["owner", "member", "revoked"]
    last_seen_at: Optional[datetime] = None
    onboarded_at: Optional[datetime] = None
    created_at: datetime
    spending_cap_cents: int = 0   # Phase 15 AICAP-04 — D-15-04 frontend cap-edit
```

`from_attributes=True` уже стоит → AppUser ORM имеет `spending_cap_cents` (db/models.py:99-104), сериализация автоматическая.

**1.2** Добавить новый класс `CapUpdate` после `AdminUserCreateRequest` (после строки 51):

```python
class CapUpdate(BaseModel):
    """Body для PATCH /admin/users/{user_id}/cap (AICAP-04, D-15-03).

    `spending_cap_cents` — USD копейки (1 USD = 100 cents storage units, как
    `app_user.spending_cap_cents` BIGINT) per CONTEXT D-15-02 explicit code.

    Bounds:
      - ge=0: 0 разрешено = AI off (D-15-01 cap=0 semantics).
      - le=100_000_00: $100k, sanity-cap.

    `extra="forbid"` блокирует случайные/злонамеренные доп-поля.
    """
    model_config = ConfigDict(extra="forbid")
    spending_cap_cents: int = Field(..., ge=0, le=100_000_00)
```

**1.3 В `app/services/admin_users.py`** добавить новый async function `update_user_cap` после `purge_user` (после строки 161):

```python
async def update_user_cap(
    db: AsyncSession,
    *,
    user_id: int,
    spending_cap_cents: int,
) -> AppUser:
    """AICAP-04: update AppUser.spending_cap_cents + invalidate cache.

    Per CONTEXT D-15-03: owner-only endpoint (handler enforces via
    Depends(require_owner)); service signature не валидирует caller —
    handler гарантирует.

    Behaviour:
    - 404 (UserNotFoundError) если user_id не существует.
    - SET app_user.spending_cap_cents = :new в WHERE id = :user_id.
    - Returns refreshed AppUser ORM (для AdminUserResponse snapshot в handler).
    - Invalidates spend-cache для user_id (so следующий enforce_spending_cap
      запрос видит новый лимит без 60s TTL задержки).
    """
    from app.services.spend_cap import invalidate_user_spend_cache

    result = await db.execute(
        select(AppUser).where(AppUser.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise UserNotFoundError(f"user_id={user_id} not found")

    user.spending_cap_cents = int(spending_cap_cents)
    await db.flush()
    await db.refresh(user)
    await invalidate_user_spend_cache(user_id)
    logger.info(
        "audit.cap_updated user_id=%s new_cap_cents=%s",
        user_id, spending_cap_cents,
    )
    return user
```

`select` уже импортирован в этом модуле (строка 21). `logger` уже инициализирован (строка 27).

**Регрессия check**: после правки AdminUserResponse запустить `pytest tests/test_admin_users_api.py -x` — все existing tests должны GREEN'нуть (новое поле default=0 не ломает существующие assertions).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "from app.api.schemas.admin import CapUpdate, AdminUserResponse; from app.services.admin_users import update_user_cap; import inspect; sig = inspect.signature(update_user_cap); assert 'user_id' in sig.parameters and 'spending_cap_cents' in sig.parameters; CapUpdate(spending_cap_cents=0); CapUpdate(spending_cap_cents=46500); fields = AdminUserResponse.model_fields; assert 'spending_cap_cents' in fields; print('OK', list(fields))"</automated>
  </verify>
  <acceptance_criteria>
    - `app/api/schemas/admin.py` AdminUserResponse имеет поле `spending_cap_cents`
    - `app/api/schemas/admin.py` exports `class CapUpdate(BaseModel)`
    - `grep -c "class CapUpdate" app/api/schemas/admin.py` == 1
    - `grep -c "spending_cap_cents" app/api/schemas/admin.py` >= 2 (response field + CapUpdate field)
    - `grep -c "spending_cap_cents.*Field.*ge=0" app/api/schemas/admin.py` >= 1
    - `app/services/admin_users.py` defines `async def update_user_cap`
    - `grep -c "async def update_user_cap" app/services/admin_users.py` == 1
    - `grep -c "invalidate_user_spend_cache" app/services/admin_users.py` >= 1
    - `python -c "from app.api.schemas.admin import CapUpdate; CapUpdate(spending_cap_cents=-1)"` raises ValidationError
    - `python -c "from app.api.schemas.admin import CapUpdate; CapUpdate(spending_cap_cents=100, role='owner')"` raises ValidationError
    - In container: `pytest tests/test_admin_users_api.py -x` → all existing tests still pass
  </acceptance_criteria>
  <done>Schema/service shipped; AdminUserResponse extended; existing tests no regression.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add PATCH /admin/users/{user_id}/cap route handler</name>
  <files>app/api/routes/admin.py</files>
  <read_first>
    - app/api/routes/admin.py (existing handlers create_admin_user lines 56-84, delete_admin_user lines 87-120)
    - app/api/schemas/admin.py (CapUpdate from Task 1, AdminUserResponse with new spending_cap_cents)
    - app/services/admin_users.py (update_user_cap from Task 1, UserNotFoundError)
    - tests/test_admin_cap_endpoint.py (7 tests pin URL + body + response)
  </read_first>
  <behavior>
    - `PATCH /api/v1/admin/users/123/cap` body `{"spending_cap_cents": 100000}` от owner → 200; response = AdminUserResponse JSON включая spending_cap_cents=100000.
    - От member → 403 (require_owner).
    - От owner с body `{"spending_cap_cents": -1}` → 422.
    - От owner с body `{"spending_cap_cents": 100000}` для несуществующего id → 404.
    - От owner с body `{}` (missing field) → 422.
    - Тесты test_admin_cap_endpoint.py 7/7 GREEN.
    - Test test_chat_unblocked_after_admin_patches_cap_higher тоже GREEN.
  </behavior>
  <action>
В `app/api/routes/admin.py` сделать:

1. Импорт `CapUpdate` (строки 26-30 — расширить):
```python
from app.api.schemas.admin import (
    AdminAiUsageResponse,
    AdminUserCreateRequest,
    AdminUserResponse,
    CapUpdate,
)
```

2. Новый handler ПОСЛЕ `delete_admin_user` (после строки 120, перед `# ---------- AI Usage breakdown` block):

```python
@admin_router.patch(
    "/users/{user_id}/cap",
    response_model=AdminUserResponse,
)
async def patch_admin_user_cap(
    user_id: int,
    payload: CapUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[AppUser, Depends(require_owner)],
) -> AppUser:
    """AICAP-04 + D-15-03: update spending_cap_cents для self или other user.

    - require_owner: 403 для member.
    - 404: unknown user_id.
    - 422: spending_cap_cents < 0 (Pydantic Field bound).
    - 200: returns updated AdminUserResponse snapshot.

    Self-edit разрешён (id=current_user.id) — owner adjusts own cap. DRY:
    нет separate /me/cap endpoint; admin endpoint обрабатывает both.

    Side-effect: cache invalidation для user_id (Plan 15-02
    invalidate_user_spend_cache); следующий enforce_spending_cap читает
    новый лимит без 60s задержки.
    """
    try:
        updated = await admin_svc.update_user_cap(
            db,
            user_id=user_id,
            spending_cap_cents=payload.spending_cap_cents,
        )
    except admin_svc.UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user_id not found",
        ) from exc
    logger.info(
        "audit.cap_patched target_user=%s new_cap=%s by_owner=%s",
        user_id, payload.spending_cap_cents, current_user.id,
    )
    return updated
```

После — запустите `pytest tests/test_admin_cap_endpoint.py tests/test_ai_cap_integration.py::test_chat_unblocked_after_admin_patches_cap_higher -x`. Все 8 тестов (7 + 1) должны GREEN.

ВАЖНО: `response_model=AdminUserResponse` использует `from_attributes=True` — handler возвращает AppUser ORM, FastAPI конвертирует включая новое поле spending_cap_cents.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -c "from app.api.routes.admin import patch_admin_user_cap; print('OK', patch_admin_user_cap.__name__)" && grep -c "users/{user_id}/cap" app/api/routes/admin.py</automated>
  </verify>
  <acceptance_criteria>
    - `app/api/routes/admin.py` defines `async def patch_admin_user_cap`
    - `grep -c "async def patch_admin_user_cap" app/api/routes/admin.py` == 1
    - `grep -c "@admin_router.patch.*users/{user_id}/cap" app/api/routes/admin.py` == 1
    - `grep -c "CapUpdate" app/api/routes/admin.py` >= 2 (import + body annotation)
    - `grep -c "audit.cap_patched" app/api/routes/admin.py` >= 1
    - In container w/ DB: `pytest tests/test_admin_cap_endpoint.py -x` → 7 passed
    - In container w/ DB: `pytest tests/test_ai_cap_integration.py::test_chat_unblocked_after_admin_patches_cap_higher -x` → 1 passed
    - In container w/ DB: `pytest tests/test_admin_users_api.py -x` → all existing tests still pass (regression)
  </acceptance_criteria>
  <done>PATCH endpoint shipped; 7+1 tests GREEN; cache invalidation подтверждена; existing admin tests no regression.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /admin/users/{id}/cap | Owner-only via require_owner; PATCH body validated by Pydantic |
| handler → service | Service trusts handler-resolved user_id |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-04-01 | Spoofing | member-as-owner attempts cap edit | mitigate | router-level `Depends(require_owner)` уже в admin_router; PATCH inherits |
| T-15-04-02 | Tampering | extra fields injection (e.g. role, tg_user_id) | mitigate | `model_config = ConfigDict(extra="forbid")` на CapUpdate → 422 |
| T-15-04-03 | Tampering | client sends huge cap (overflow attack) | mitigate | `Field(le=100_000_00)` каппит на $100k |
| T-15-04-04 | Information disclosure | 404 leaks "user_id not found" | accept | owner has access ко всем user_ids в whitelist anyway |
| T-15-04-05 | Privilege escalation | owner cap=0 для self → admin lockout? | accept | cap=0 only blocks AI features; admin/whitelist endpoints не gated by spend_cap; owner remains operational |
| T-15-04-06 | Repudiation | no audit log | mitigate | `logger.info("audit.cap_patched ...")` минимально достаточно |
</threat_model>

<verification>
- 7/7 admin_cap_endpoint tests pass.
- 1/1 chat_unblocked_after_patch integration test passes.
- 0 regressions в test_admin_users_api.py (новое поле в response не ломает existing assertions).
- Manual: PATCH cap=0 → /me ai_spend_cents возвращает (Plan 15-05) корректный 0; /ai/chat → 429.
</verification>

<success_criteria>
- All 8 new tests pass; 0 регрессий.
- Schema CapUpdate enforces ge=0, le=100_000_00, extra="forbid".
- AdminUserResponse теперь экспонирует spending_cap_cents для всех endpoints (list, invite, patch).
- Service update_user_cap → invalidates cache → следующий request видит новый cap.
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-04-SUMMARY.md`.
</output>
