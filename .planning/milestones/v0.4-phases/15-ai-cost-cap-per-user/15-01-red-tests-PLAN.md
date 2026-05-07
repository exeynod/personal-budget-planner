---
phase: 15-ai-cost-cap-per-user
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - tests/test_spend_cap_service.py
  - tests/test_enforce_spending_cap_dep.py
  - tests/test_admin_cap_endpoint.py
  - tests/test_me_ai_spend.py
  - tests/test_ai_cap_integration.py
  - tests/helpers/seed.py
autonomous: true
requirements: [AICAP-01, AICAP-02, AICAP-03, AICAP-04, AICAP-05]

must_haves:
  truths:
    - "All 5 new test modules import without ModuleNotFoundError once Plans 15-02..15-06 land"
    - "Each new test asserts a single behaviour from CONTEXT decisions D-15-01..04"
    - "Tests RED before Plan 15-02 (service module missing); GREEN after Plans 15-02..06 implement"
  artifacts:
    - path: "tests/test_spend_cap_service.py"
      provides: "Unit tests for get_user_spend_cents + cache + month boundary"
      contains: "from app.services.spend_cap import"
    - path: "tests/test_enforce_spending_cap_dep.py"
      provides: "Dependency-level tests for enforce_spending_cap"
      contains: "from app.api.dependencies import enforce_spending_cap"
    - path: "tests/test_admin_cap_endpoint.py"
      provides: "PATCH /admin/users/{id}/cap RBAC + body validation"
      contains: "/admin/users/"
    - path: "tests/test_me_ai_spend.py"
      provides: "/me extension with ai_spend_cents"
      contains: "ai_spend_cents"
    - path: "tests/test_ai_cap_integration.py"
      provides: "End-to-end: cap exceeded → 429 → patch → 200 cycle"
      contains: "Retry-After"
    - path: "tests/helpers/seed.py"
      provides: "seed_ai_usage_log gains explicit ts param (already supports)"
      contains: "seed_ai_usage_log"
  key_links:
    - from: "tests/test_spend_cap_service.py"
      to: "app/services/spend_cap.py (Plan 15-02)"
      via: "import path"
      pattern: "from app.services.spend_cap import (get_user_spend_cents|seconds_until_next_msk_month)"
    - from: "tests/test_enforce_spending_cap_dep.py"
      to: "app/api/dependencies.py::enforce_spending_cap (Plan 15-03)"
      via: "import path"
      pattern: "enforce_spending_cap"
    - from: "tests/test_admin_cap_endpoint.py"
      to: "app/api/routes/admin.py PATCH /users/{id}/cap (Plan 15-04)"
      via: "HTTP PATCH"
      pattern: "PATCH.*admin/users/.*cap"
    - from: "tests/test_me_ai_spend.py"
      to: "app/api/router.py /me (Plan 15-05)"
      via: "HTTP GET /me"
      pattern: "ai_spend_cents"
    - from: "tests/test_ai_cap_integration.py"
      to: "ai router enforce + admin PATCH"
      via: "HTTP cycle"
      pattern: "(429|spending_cap_exceeded)"
---

<objective>
Wave 0 RED phase. Создать 5 новых тестовых модулей покрывающих AICAP-01..05 и одно мелкое расширение `tests/helpers/seed.py` (только если требуется). Каждый тест **ДОЛЖЕН падать** на текущей кодовой базе (ImportError / 404 / 405) до реализации Plans 15-02..06; после Plans 15-02..06 — GREEN.

Purpose: Закрепить контракты `enforce_spending_cap` / `get_user_spend_cents` / PATCH `/admin/users/{id}/cap` / `/me ai_spend_cents` в виде тестов **до** написания кода. Это пинит API-сигнатуры и предотвращает дрейф.

Output: 5 новых файлов в `tests/` + патч `tests/helpers/seed.py` (по необходимости).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md
@.planning/REQUIREMENTS.md

# Existing test patterns to mirror
@tests/test_admin_users_api.py
@tests/test_admin_ai_usage_api.py
@tests/test_ai_usage_log_hook.py
@tests/test_require_onboarded.py
@tests/test_require_owner.py
@tests/conftest.py
@tests/helpers/seed.py

# Models + endpoints under test
@app/db/models.py
@app/api/dependencies.py
@app/api/routes/admin.py
@app/api/router.py

<interfaces>
<!-- Контракты, которые тесты пинят. Plans 15-02..06 ДОЛЖНЫ им соответствовать. -->

# Service (Plan 15-02 will create app/services/spend_cap.py):
async def get_user_spend_cents(db: AsyncSession, *, user_id: int) -> int
async def invalidate_user_spend_cache(user_id: int) -> None  # для PATCH cap
def seconds_until_next_msk_month(now_msk: datetime | None = None) -> int

# Dependency (Plan 15-03 will add to app/api/dependencies.py):
async def enforce_spending_cap(
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None
# Behaviour:
#   spend < cap          → return None (passthrough)
#   spend >= cap         → raise HTTPException(429, detail={"error":"spending_cap_exceeded",
#                              "spent_cents": int, "cap_cents": int}, headers={"Retry-After": "..."})
#   cap_cents == 0       → always 429 (any spend >= 0 triggers)

# Admin endpoint (Plan 15-04):
PATCH /api/v1/admin/users/{user_id}/cap
  Body: {"spending_cap_cents": int}      # ge=0; разумный upper bound
  Returns: AdminUserResponse              # обновлённый snapshot
  Auth: Depends(require_owner) → 403 для member; 404 если user_id не существует

# /me extension (Plan 15-05):
GET /api/v1/me
Response: MeResponse {
  ..., role, onboarded_at,
  ai_spend_cents: int     # NEW; всегда int (0 если нет логов); current MSK month
}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: tests/test_spend_cap_service.py + helper-extension</name>
  <files>tests/test_spend_cap_service.py, tests/helpers/seed.py</files>
  <read_first>
    - tests/test_admin_ai_usage_api.py (db_client fixture pattern, seed_ai_usage_log usage)
    - tests/helpers/seed.py (seed_user, seed_ai_usage_log already supports `ts: Optional[datetime]`)
    - tests/conftest.py (db_session fixture, two_tenants pattern)
    - .planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md (D-15-02 spend definition)
    - app/db/models.py:AiUsageLog (est_cost_usd Float, created_at TIMESTAMPTZ)
  </read_first>
  <action>
Создать `tests/test_spend_cap_service.py` с 6 unit-тестами на сервис `app/services/spend_cap.py` (будет создан в Plan 15-02). Все тесты — integration (real DB), используют существующую `db_session` fixture + `tests.helpers.seed.seed_user` + `seed_ai_usage_log`.

ИЗ CONTEXT D-15-02 (zafiksiruem контракт):
- `get_user_spend_cents(db, *, user_id) -> int` агрегирует `SUM(est_cost_usd)` по user_id WHERE created_at >= месяц-старт-MSK; затем `ceil(usd * 100)`.
- Месяц-старт = `datetime.now(ZoneInfo("Europe/Moscow")).replace(day=1, hour=0, minute=0, second=0, microsecond=0)`; для query конвертируется в UTC.
- TTLCache key=user_id; TTL=60.
- `seconds_until_next_msk_month()` возвращает `int((next_month_msk - now_msk).total_seconds()) + 1`.

Тесты (используя `from app.services.spend_cap import get_user_spend_cents, invalidate_user_spend_cache, seconds_until_next_msk_month`):

1. `test_spend_cents_zero_when_no_logs` — seed user без логов → `get_user_spend_cents == 0`.
2. `test_spend_cents_aggregates_current_month` — seed 3 логов в текущем MSK-месяце с est_cost_usd=[0.005, 0.0123, 0.001] → ожидаем `ceil((0.005+0.0123+0.001)*100) = ceil(1.83) = 2` (cents).
3. `test_spend_cents_excludes_previous_month` — seed логов с `ts=` явно ДО 1-го числа текущего MSK месяца (например, 25-е прошлого месяца UTC = ~25-е MSK прошлого месяца) → не должны учитываться. Используйте `datetime.now(ZoneInfo("Europe/Moscow"))` чтобы вычислить boundary, потом отнимите 5 дней. Use `seed_ai_usage_log(... ts=...)`.
4. `test_spend_cents_isolated_per_user` — два юзера, разные суммы; `get_user_spend_cents(user_a) != get_user_spend_cents(user_b)`.
5. `test_spend_cents_cache_hits_within_ttl` — first call → DB hit; mock-patch `func.coalesce` или `db.scalar` через monkeypatch на сервисный модуль → second call within TTL должен НЕ задействовать БД (счётчик вызовов = 1). Допустимый шаблон: monkeypatch `app.services.spend_cap._fetch_spend_cents_from_db` (внутренняя функция, см. Plan 15-02 предполагает её наличие). Если не существует — тест assert (`get_user_spend_cents` второй вызов возвращает закэшированное значение даже после INSERT нового лога).
6. `test_seconds_until_next_msk_month_positive` — функция возвращает `int > 0` и `< 32 * 86400` (32 дня — заведомо больше любого месяца).
7. `test_invalidate_cache_drops_user_entry` — заполнить кеш get_user_spend_cents, вызвать `invalidate_user_spend_cache(user_id)`, повторный get_user_spend_cents должен снова обратиться в БД (новое значение если данные изменились).

Структура файла — модель из `tests/test_ai_usage_log_hook.py`: `from sqlalchemy import text` для INSERT-cleanup, импорт `seed_user, seed_ai_usage_log`. ВАЖНО: каждый тест self-contained — seed + assert; truncate-cleanup через _PHASE13_TRUNCATE_TABLES перед seed (см. test_admin_ai_usage_api.db_client). Используйте `db_session` fixture напрямую — он уже даёт engine, фикстура truncate'ит как нужно перед seed_user.

Header-блок файла: docstring с пунктами:
```
"""RED tests for AICAP-03 — get_user_spend_cents service.

All tests RED until Plan 15-02 creates app/services/spend_cap.py with:
  - get_user_spend_cents(db, *, user_id) -> int
  - invalidate_user_spend_cache(user_id) -> None
  - seconds_until_next_msk_month(now=None) -> int

After Plan 15-02 lands, all 7 tests must pass.
"""
```

Не модифицируйте `tests/helpers/seed.py` — `seed_ai_usage_log` уже поддерживает `ts` параметр (строки 241-284 сидера). Если этого ts недостаточно (например, нужен MSK-aware param), оставьте как есть — конвертируйте на стороне теста.

Per D-15-02: Если `cachetools` не установлен в pyproject.toml (verified: `cachetools` отсутствует в pyproject.toml — Plan 15-02 ИЛИ добавит cachetools в deps, ИЛИ реализует свой dict+lock), тест #5/#7 не привязан к конкретной реализации; контракт = "повторный вызов в TTL возвращает то же значение".
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -m pytest tests/test_spend_cap_service.py --collect-only -q 2>&1 | grep -E "(error|test_)" | head -20</automated>
  </verify>
  <acceptance_criteria>
    - File `tests/test_spend_cap_service.py` exists; pytest collects 7 tests
    - First run: tests FAIL with `ModuleNotFoundError: app.services.spend_cap` (RED state)
    - `grep -c "from app.services.spend_cap import" tests/test_spend_cap_service.py` >= 1
    - `grep -c "^def test_\|^async def test_" tests/test_spend_cap_service.py` == 7
    - Each test name matches one of the 7 listed above
    - tests/helpers/seed.py NOT modified (seed_ai_usage_log already supports ts)
  </acceptance_criteria>
  <done>7 RED tests collected, all failing with import-error (по spend_cap module).</done>
</task>

<task type="auto">
  <name>Task 2: tests/test_enforce_spending_cap_dep.py + tests/test_admin_cap_endpoint.py</name>
  <files>tests/test_enforce_spending_cap_dep.py, tests/test_admin_cap_endpoint.py</files>
  <read_first>
    - tests/test_admin_users_api.py (db_client fixture, make_init_data pattern, AppUser PATCH-style requests)
    - tests/test_require_owner.py (RBAC 403/200 split tests)
    - tests/test_ai_usage_log_hook.py (SSE-stub mocking pattern если нужно)
    - .planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md (D-15-01, D-15-03)
    - app/api/dependencies.py:require_owner (existing pattern)
    - app/api/routes/admin.py (existing PATCH-style — нет PATCH yet, есть POST/DELETE)
    - app/api/schemas/admin.py:AdminUserResponse
  </read_first>
  <action>
**Файл 1: `tests/test_enforce_spending_cap_dep.py`** — 6 тестов на dependency `enforce_spending_cap`.

Контракт (CONTEXT D-15-01):
- `enforce_spending_cap` — async dependency; depends on `current_user: AppUser = Depends(get_current_user)`, `db: AsyncSession = Depends(get_db)`.
- При spend < cap → return None (тестируется через apply на mock-route и проверку 200).
- При spend >= cap → `HTTPException(429, detail={"error":"spending_cap_exceeded","spent_cents":S,"cap_cents":C}, headers={"Retry-After": str(seconds)})`.
- cap=0 → всегда 429.

Тесты (integration с реальным FastAPI app + `async_client`+`db_client` fixture pattern из test_admin_users_api):

1. `test_under_cap_passes_through` — owner с cap=46500, ai_usage_log на 0.01 USD (= 1 cent) → POST /api/v1/ai/chat (или mock-route с `Depends(enforce_spending_cap)`) проходит (НЕ 429). Так как `/ai/chat` это SSE stream который требует OPENAI mock, проще: создать в тесте `_mount_protected_route(app, '/_test_cap_check')` через `from fastapi import APIRouter` и monkey-add к `app.main_api.app.include_router(...)` ДО async_client'а. ИЛИ использовать `httpx.ASGITransport` напрямую с минимальным wrapper-app в тесте. **Простой подход (mirror test_require_onboarded.py)**: использовать существующий `/ai/chat` endpoint с monkey-patch'ом `_get_llm_client` и `_event_stream` (или `client.chat`) через `app.api.routes.ai._get_llm_client`. Но это hard-couples к Plan 15-03. **Рекомендация**: построить пет-route в тесте через FastAPI sub-app, с `dependencies=[Depends(enforce_spending_cap)]`, GET-handler возвращает 200 OK. Каждый тест устанавливает `app.dependency_overrides[get_db] = real_get_db` (уже сделано в db_client fixture), seed AppUser+ai_usage_log, затем GET /test-route. Сразу после теста — pop override.

2. `test_at_cap_returns_429` — owner cap=100 cents, ai_usage_log с est_cost_usd=1.0 (= 100 cents точно) → 429.
3. `test_over_cap_returns_429_with_retry_after` — owner cap=100 cents, est_cost_usd=2.5 (= 250 cents) → 429; response.headers["Retry-After"] is digit string > 0; response JSON detail == {"error":"spending_cap_exceeded","spent_cents":250,"cap_cents":100}.
4. `test_cap_zero_blocks_immediately` — owner cap=0, никаких логов → 429 (because spend=0 >= cap=0).
5. `test_cap_zero_blocks_with_logs` — owner cap=0, есть логи → 429.
6. `test_member_with_own_cap_under_limit` — member cap=46500, est=0.005 → 200 (cap is checked per-user, not owner-only).

Структура: используйте `db_client` fixture mirror'ом из `tests/test_admin_users_api.py`; в каждом тесте — внутри test body — поднимите test-route на `app` через `app.include_router` и в finally — `app.routes.pop()` (или храните routes до setup и восстановите). Альтернатива: создать модульного-уровня helper `_install_cap_test_route(app)` идемпотентный, который добавляет route только если ещё нет.

**Файл 2: `tests/test_admin_cap_endpoint.py`** — 7 тестов на PATCH /api/v1/admin/users/{user_id}/cap (Plan 15-04).

1. `test_owner_patches_member_cap_returns_updated_snapshot` — owner PATCH'ит cap member'а на 100000 → 200, response body is AdminUserResponse, `spending_cap_cents` field читается через DB (verify в БД через SessionLocal).
2. `test_owner_patches_self_cap` — owner PATCH'ит свой cap (id=self.id) на 200000 → 200.
3. `test_member_forbidden_403` — member вызывает PATCH → 403 (require_owner).
4. `test_unknown_user_returns_404` — owner PATCH'ит несуществующий user_id (например 999_999) → 404.
5. `test_negative_cap_validation_422` — owner PATCH с body `{"spending_cap_cents": -1}` → 422 (Pydantic Field(ge=0)).
6. `test_cap_zero_accepted` — owner PATCH с body `{"spending_cap_cents": 0}` → 200 (D-15-03: ge=0, не gt=0).
7. `test_extra_fields_rejected_422` — owner PATCH с body `{"spending_cap_cents": 1000, "role": "owner"}` → 422 IF schema использует `extra="forbid"` (это не обязательно но желательно — пометьте как `pytest.mark.xfail` если Plan 15-04 решит не enforced extra=forbid; финальное поведение должен решить плэн 15-04).

URL pattern: `/api/v1/admin/users/{id}/cap` (под admin_router который уже /admin prefix-ed).

Mirror точно структуру `tests/test_admin_users_api.py`: `db_client` fixture, `make_init_data`, `client.patch(url, headers={"X-Telegram-Init-Data": init_data}, json=body)`.

Header-блоки файлов с pinning контрактов (как в test_admin_users_api).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -m pytest tests/test_enforce_spending_cap_dep.py tests/test_admin_cap_endpoint.py --collect-only -q 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - File `tests/test_enforce_spending_cap_dep.py` exists; pytest collects 6 tests
    - File `tests/test_admin_cap_endpoint.py` exists; pytest collects 7 tests
    - First run: tests FAIL (import error for enforce_spending_cap OR 404 for PATCH endpoint)
    - `grep -c "from app.api.dependencies import enforce_spending_cap" tests/test_enforce_spending_cap_dep.py` >= 1
    - `grep -c "/admin/users/" tests/test_admin_cap_endpoint.py` >= 1
    - `grep -c "Retry-After" tests/test_enforce_spending_cap_dep.py` >= 1
    - `grep -c "spending_cap_exceeded" tests/test_enforce_spending_cap_dep.py` >= 1
  </acceptance_criteria>
  <done>13 RED tests collected, all failing with import-error or 404/405.</done>
</task>

<task type="auto">
  <name>Task 3: tests/test_me_ai_spend.py + tests/test_ai_cap_integration.py</name>
  <files>tests/test_me_ai_spend.py, tests/test_ai_cap_integration.py</files>
  <read_first>
    - tests/test_me_returns_role.py (existing /me test pattern)
    - tests/test_admin_users_api.py (db_client fixture, end-to-end pattern)
    - tests/test_admin_ai_usage_api.py (seeded ai_usage_log + admin endpoint dance)
    - .planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md (D-15-04 frontend, AICAP-05 test matrix)
    - app/api/router.py:MeResponse (нужно добавить ai_spend_cents)
  </read_first>
  <action>
**Файл 1: `tests/test_me_ai_spend.py`** — 4 теста на extension `/me` response.

1. `test_me_returns_ai_spend_cents_zero_for_new_user` — onboarded owner без логов → response.json()["ai_spend_cents"] == 0.
2. `test_me_returns_ai_spend_cents_for_owner_with_logs` — onboarded owner + 3 ai_usage_log в current MSK month с est_cost_usd=[0.005, 0.012, 0.001] → ai_spend_cents == ceil((0.005+0.012+0.001)*100) == 2 (since 1.8 cents ceil → 2).
3. `test_me_excludes_previous_month_logs` — seed log с ts=ДО month-start MSK → ai_spend_cents == 0.
4. `test_me_isolated_per_user` — owner + member, разные логи → response /me для каждого возвращает свой spend.

Контракт: response JSON содержит ключ `ai_spend_cents: int`. Все остальные поля (`tg_user_id, tg_chat_id, cycle_start_day, onboarded_at, chat_id_known, role`) сохранены — добавьте sanity-check на их наличие в test #1.

Mirror tests/test_me_returns_role.py: `db_client` fixture pattern, `make_init_data`, GET `/api/v1/me`.

**Файл 2: `tests/test_ai_cap_integration.py`** — 4 интеграционных теста: end-to-end cap exceeded → 429 → admin PATCH → 200.

Эти тесты комбинируют все компоненты (Plans 15-02..15-04, 15-05). Mock OpenAI: monkeypatch `app.api.routes.ai._get_llm_client` чтобы возвращать stub client с `.chat()` методом который yields один token-event и один done-event (`async def chat(messages, tools): yield {"type": "token", "data": "ok"}; yield {"type": "done", "data": ""}`).

1. `test_chat_blocked_when_at_cap_returns_429` — owner cap=100 cents, seed ai_usage_log est_cost_usd=1.0 → POST /api/v1/ai/chat with valid initData → 429; headers["Retry-After"] is positive int string.
2. `test_chat_unblocked_after_admin_patches_cap_higher` — owner cap=100 cents, seed est=1.0 → POST /ai/chat → 429. Затем PATCH /api/v1/admin/users/{owner_id}/cap body={"spending_cap_cents": 1000000} → 200. Wait for cache TTL: вызвать `from app.services.spend_cap import invalidate_user_spend_cache; await invalidate_user_spend_cache(owner_id)` напрямую (Plan 15-04 СЛЕДУЕТ инвалидировать кеш в endpoint, но если не инвалидирует — тест задокументирует через explicit call). Затем POST /ai/chat → 200 (StreamingResponse).
3. `test_suggest_category_blocked_when_at_cap` — cap=10, est=0.50 (=50 cents > 10) → GET /api/v1/ai/suggest-category?q=кофе с initData → 429.
4. `test_cap_zero_blocks_chat_and_suggest` — cap=0 → POST /ai/chat → 429; GET /ai/suggest-category?q=кофе → 429.

CRITICAL: тесты #1-#3 require `enable_ai_categorization=True` в settings (already default) и `ENABLE_AI_CATEGORIZATION=True` в env (добавьте `monkeypatch.setenv("ENABLE_AI_CATEGORIZATION", "true")` если требуется по `app/api/routes/ai_suggest.py:60`). Ещё проще: в conftest.py уже DEV_MODE=false и fake OPENAI_API_KEY — этого достаточно для импорта; для `/ai/suggest-category` тест #3 нужно проверить `app.core.settings.settings.ENABLE_AI_CATEGORIZATION` — если False, тест пропускается через `pytest.skip`.

Mock pattern для llm_client (mirror tests/test_ai_usage_log_hook.py если он есть, иначе — простой generator-based stub).

Структура файлов: docstring header с описанием matrix coverage, async fixtures `db_client`, импорты `seed_user`, `seed_ai_usage_log`, `make_init_data`.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && python -m pytest tests/test_me_ai_spend.py tests/test_ai_cap_integration.py --collect-only -q 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - File `tests/test_me_ai_spend.py` exists; pytest collects 4 tests
    - File `tests/test_ai_cap_integration.py` exists; pytest collects 4 tests
    - First run: tests FAIL (KeyError ai_spend_cents OR ImportError spend_cap module OR endpoint not 429)
    - `grep -c "ai_spend_cents" tests/test_me_ai_spend.py` >= 4
    - `grep -c "Retry-After\|spending_cap_exceeded\|429" tests/test_ai_cap_integration.py` >= 4
    - `grep -c "^def test_\|^async def test_" tests/test_me_ai_spend.py` == 4
    - `grep -c "^def test_\|^async def test_" tests/test_ai_cap_integration.py` == 4
  </acceptance_criteria>
  <done>8 additional RED tests collected; all 5 new test files compile and fail at import / endpoint resolution.</done>
</task>

</tasks>

<threat_model>
Phase 15 enforcement is a security gate; threats focus on bypass + DoS:

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /ai/* | Untrusted message + tg_user_id from initData; gate is enforce_spending_cap |
| client → /admin/* | Owner-elevated client; require_owner already enforced |
| RED tests → app | Tests assert contract; do not bypass |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-01-01 | Tampering | tests skip RED state | mitigate | Verify acceptance criteria (Pytest collects N tests, fails as RED expected). |
| T-15-01-02 | Information disclosure | enforce 429 detail leaks cap_cents | accept | cap_cents is per-user; не PII; honest signal к user. |
</threat_model>

<verification>
Phase 15 RED-state baseline established:
- `pytest tests/test_spend_cap_service.py tests/test_enforce_spending_cap_dep.py tests/test_admin_cap_endpoint.py tests/test_me_ai_spend.py tests/test_ai_cap_integration.py --collect-only` runs successfully (collection не падает на syntax errors).
- Same suite when actually run, all tests FAIL with ImportError or 404/405. None passes (RED).
- `grep -rn "from app.services.spend_cap\|enforce_spending_cap\|ai_spend_cents\|/admin/users/.*/cap" tests/test_*.py` returns matches in expected files.
</verification>

<success_criteria>
- 5 new test files created in tests/ with 7+6+7+4+4 = 28 tests total.
- All tests fail in initial run (RED) with ImportError / 404 / 405.
- Tests directly assert each AICAP-01..05 contract (per matrix).
- After Plans 15-02..06 land, all 28 tests should pass without modification.
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-01-SUMMARY.md`.
</output>
