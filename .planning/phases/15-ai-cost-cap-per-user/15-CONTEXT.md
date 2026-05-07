# Phase 15: AI Cost Cap Per User - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Реализуется enforcement месячного cap'а AI-расходов на per-user основе. До каждого `/ai/chat` и `/ai/suggest-category` запроса backend агрегирует месячный spend юзера из `ai_usage_log`, кеширует результат на 60 сек, и при `spend ≥ spending_cap_cents` возвращает 429 с `Retry-After` (до начала следующего календарного месяца, Europe/Moscow). Owner может редактировать `spending_cap_cents` для себя и других через `PATCH /api/v1/admin/users/{id}/cap`. Юзер видит self-spend / cap в Settings экране.

Out of scope: per-tenant pricing tiers, billing/top-up, Redis-backed cache (single-instance MVP), пересчёт est_cost_usd → cost_cents migration (deferred — оставляем Float для Phase 15, agg делается с конверсией).

</domain>

<decisions>
## Implementation Decisions

### Enforcement (AICAP-02 / D-15-01)
- **Dependency `enforce_spending_cap`** в `app/api/dependencies.py` — композится с `require_onboarded` (already in router chain). Реализация: query spend_service для `user_id`; если `spend_cents >= user.spending_cap_cents` → `HTTPException(status_code=429, detail={"error":"spending_cap_exceeded","spent_cents":S,"cap_cents":C}, headers={"Retry-After": str(seconds_until_next_msk_month)})`.
- **Применение**: на роутерах `/api/v1/ai/*` (chat) и `/api/v1/ai-suggest/*` (suggest-category) через `dependencies=[Depends(enforce_spending_cap)]`.
- **`cap_cents=0` поведение**: блокирует все AI-запросы (cap=0 означает «AI выключен»); поскольку любой spend `≥ 0` и cap=0 → trigger 429.
- **Spend definition**: `SUM(ai_usage_log.est_cost_usd) WHERE user_id=X AND created_at >= month_start_msk`, конвертируем в cents через `ceil(usd * 100)` для сравнения с `spending_cap_cents` (BIGINT USD-копейки).

### Aggregation + Cache (AICAP-03 / D-15-02)
- **Cache layer**: in-process `cachetools.TTLCache(maxsize=128, ttl=60)` (или собственный `dict + asyncio.Lock` если cachetools не установлен — проверить deps). Key = `user_id`, value = `int spend_cents`.
- **Cache invalidation на cap edit**: TTL natural expire — задержка ≤60 сек после PATCH приемлема per AICAP-04 «следующий запрос». Active invalidation не нужен.
- **Month boundary**: `datetime.now(ZoneInfo("Europe/Moscow")).replace(day=1, hour=0, minute=0, second=0, microsecond=0)` — naive truncation, без edge-case на DST (msk без перехода на летнее).
- **Storage**: existing `ai_usage_log.est_cost_usd Float` (от Phase 13/v0.3). Aggregation:
  ```python
  stmt = select(func.coalesce(func.sum(AiUsageLog.est_cost_usd), 0.0)).where(
      AiUsageLog.user_id == user_id,
      AiUsageLog.created_at >= month_start_msk,
  )
  total_usd = await db.scalar(stmt) or 0.0
  spend_cents = math.ceil(total_usd * 100)
  ```
- **TZ note**: `created_at` в БД UTC; фильтр `>= month_start_msk` выполняется в python-objects конвертацией к UTC: `month_start_utc = month_start_msk.astimezone(timezone.utc)`.

### Admin PATCH cap (AICAP-04 / D-15-03)
- **Endpoint**: `PATCH /api/v1/admin/users/{user_id}/cap` под `Depends(require_owner)`.
- **Request body**: Pydantic `CapUpdate {spending_cap_cents: int = Field(ge=0)}` (≥0; cap=0 разрешено).
- **Self-edit**: owner может редактировать свой cap через тот же endpoint (id=self.id) — не отдельный endpoint; админка → DRY.
- **Response**: обновлённый `AppUserAdminRead` snapshot (как Phase 13 invite/revoke). Обновление инвалидирует кеш per-user (опционально — TTL natural enough).
- **Service**: `app/services/admin_users.py` (existing module from Phase 13) — добавить `update_user_cap(db, target_user_id, spending_cap_cents) -> AppUser`.

### Frontend Settings + Admin UI (AICAP-04 / D-15-04)
- **`/me` extended** — отдаём поле `ai_spend_cents: int` (текущий месяц, MSK). Frontend `MeResponse` гет new optional поле. Реализация: serialize step в `/me` route добавляет `await spend_svc.get_user_spend_cents(db, user_id)`.
- **SettingsScreen** — новый блок «AI расход» отображает `$2.30 / $5.00` через `(cents / 100).toFixed(2)`. Если `cap_cents=0` → «AI отключён», hint что-то типа «Обратитесь к администратору». Self только.
- **Admin AccessScreen** — в каждой строке юзера inline cap-input или edit-button → bottom-sheet (reuse `InviteSheet` стиль). MVP: bottom-sheet «Изменить лимит» с input `spending_cap_cents`, кнопка submit → `PATCH /admin/users/{id}/cap` через existing `useAdminUsers` hook (extend).
- **Format**: USD с двумя знаками после точки, `$X.XX / $Y.YY`. cents = USD-cents (existing convention from Phase 13).

### Tests (AICAP-05)
- **Unit-level (mock)**: `enforce_spending_cap` проходит при `spend < cap`, бросает 429 при `spend >= cap`, `Retry-After` header корректный (до начала след. месяца MSK).
- **Service-level**: `get_user_spend_cents` агрегирует только текущий месяц, ignoring логи прошлого месяца (boundary test для 1-го числа MSK).
- **Cache test**: повторный вызов в течение 60 сек возвращает кешированное значение (не лезет в БД); после TTL — re-query.
- **Cap=0 test**: enforce immediately returns 429.
- **Cap edit test**: PATCH меняет значение, следующий запрос (после TTL) использует новый лимит.
- **Integration**: real DB, mock OpenAI provider (как 14-06 pattern); один член → доходит до cap → 429; админ-PATCH → cap reset → 200.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/db/models.py:AppUser.spending_cap_cents` — BIGINT, default 46500 (Phase 13 stub). Без миграции в Phase 15.
- `app/db/models.py:AiUsageLog` — `user_id`, `est_cost_usd: Float`, `created_at: TIMESTAMPTZ`, индекс `ix_ai_usage_log_user_created`. Aggregation готова.
- `app/api/dependencies.py:get_current_user, require_owner, require_onboarded` — паттерн для `enforce_spending_cap`.
- `app/api/routes/ai.py` (POST `/ai/chat`) — добавляем `dependencies=[Depends(enforce_spending_cap)]` на router-level.
- `app/api/routes/ai_suggest.py` (`/ai-suggest/category`) — то же.
- `app/api/routes/admin.py` — добавляем `PATCH /users/{id}/cap`.
- `app/services/admin_users.py` — добавляем `update_user_cap`.
- `app/api/routes/settings.py` или `me.py` — extend `/me` ответ полем `ai_spend_cents`.
- `frontend/src/api/client.ts` — паттерн для admin PATCH (existing `revokeUser`, `inviteUser`).
- `frontend/src/api/admin.ts` — extend hook with `updateUserCap`.
- `frontend/src/screens/SettingsScreen.tsx` — добавляем «AI расход» блок.
- `frontend/src/screens/AccessScreen.tsx` — add cap-edit action в строках юзеров.

### Established Patterns
- **TTLCache pattern**: впервые в этом проекте — не было in-process кеширования. Добавим `cachetools` (или `functools.lru_cache + asyncio` костыль). Проверим pyproject.toml deps.
- **Money convention**: `*_cents BIGINT` — `spending_cap_cents` уже соблюдает; `est_cost_usd Float` — историческое исключение (legacy от Phase 13), не трогаем в Phase 15.
- **MSK TZ**: используется в worker джобах (close_period 00:01 MSK, charge_subscriptions 00:05 MSK) — паттерн `ZoneInfo("Europe/Moscow")` уже устоялся.
- **Admin endpoints**: `/admin/users/{id}/role` (Phase 13) ≈ `PATCH /admin/users/{id}/cap` — параллельная структура.
- **HTTPException with headers**: FastAPI `HTTPException(status_code=429, detail=..., headers={"Retry-After": "..."})` — стандартный.

### Integration Points
- `app/api/routes/ai.py` (top of file): добавить `Depends(enforce_spending_cap)` к `dependencies=[]` списку.
- `app/api/routes/ai_suggest.py`: то же.
- `app/api/dependencies.py`: новая функция `enforce_spending_cap`.
- `app/services/spend_cap.py` (NEW): `get_user_spend_cents`, `cache`, `seconds_until_next_msk_month`.
- `app/api/routes/admin.py`: новый PATCH endpoint.
- `app/api/schemas/admin.py`: `CapUpdate` schema.
- `app/services/admin_users.py`: `update_user_cap`.
- `app/api/routes/settings.py` или `me.py`: extend response с `ai_spend_cents`.
- `frontend/src/api/types.ts`: `MeResponse.ai_spend_cents` optional.
- `frontend/src/screens/SettingsScreen.tsx`: «AI расход» блок.
- `frontend/src/screens/AccessScreen.tsx` + `InviteSheet`-style component: cap-edit sheet.
- Tests: `tests/test_spend_cap.py` (NEW), `tests/test_admin_cap_endpoint.py` (NEW), extend `tests/test_admin_users_api.py`.

</code_context>

<specifics>
## Specific Ideas

- **`get_user_spend_cents` signature**: `async def get_user_spend_cents(db: AsyncSession, *, user_id: int) -> int` — возвращает spend_cents для текущего MSK месяца, через TTL cache.
- **`enforce_spending_cap` dependency**: depends on `current_user: AppUser = Depends(get_current_user)`, `db: AsyncSession = Depends(get_db)`. Получает spend_cents через service, сравнивает с `current_user.spending_cap_cents`. Возвращает None (passthrough) или raises 429.
- **Retry-After calculation**: `seconds = int((next_month_start_msk - now_msk).total_seconds())` + 1 (избегаем off-by-one в самый последний момент месяца).
- **Cache library**: проверить `cachetools` в pyproject.toml; если нет — использовать `dict + asyncio.Lock` обёртку (примитивный TTL через timestamp). Решение: добавить cachetools в deps если не уязвимо к security audit.
- **PATCH endpoint security**: `Depends(require_owner)` обязательно — owner only. Self-edit допустим (owner редактирует свой cap или member's). Body validation: `spending_cap_cents >= 0`, разумный upper bound (например, 1_000_000_00 cents = $1M) для защиты от накруток.
- **`/me` extend**: конкатенация поле `ai_spend_cents` в существующий response — не ломает frontend (TypeScript optional). Backend: `await spend_svc.get_user_spend_cents(db, user_id=current_user.id)`.
- **Frontend money formatting**: `formatUsdCents(cents: number) -> string` helper в `frontend/src/lib/money.ts` (если есть) или inline `(cents/100).toFixed(2)`. Phase 13 уже использует USD format где-то — переиспользовать.
- **Tests with frozen time**: использовать `freezegun` или `monkeypatch.setattr(datetime, 'now')` для test boundary cases (last second of month, first second of next month, mid-month).
- **DB query optimization**: existing `ix_ai_usage_log_user_created` композитный индекс — query plan уже оптимален (range scan на (user_id, created_at)).

</specifics>

<deferred>
## Deferred Ideas

- Migration `est_cost_usd Float → cost_cents BIGINT` — нарушает CLAUDE.md «никаких float», но Phase 15 не должен этим заниматься. Отдельная мини-фаза.
- Notifications «80% cap reached», «cap exhausted» — отдельная feature, не в AICAP-01..05.
- Per-model pricing override (если новые модели добавятся) — текущий est_cost_usd считается per-call в record_usage hook.
- Аналитика «топ-N юзеров по spend» — это admin AI Usage screen из Phase 13, уже есть.
- Cap reset на смену месяца через cron-джобу — не нужно, агрегация ON-DEMAND и фильтрует по `created_at >= month_start_msk`.
- Redis-backed cache — overkill для single-instance MVP; можно добавить если будет multi-replica деплой.
- Auto-cap-increase per request type (chat = $0.01, suggest = $0.001) — отвергли, единый cap проще.

</deferred>
