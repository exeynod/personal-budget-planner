---
phase: 15-ai-cost-cap-per-user
reviewed: 2026-05-07T13:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - app/services/spend_cap.py
  - app/api/dependencies.py
  - app/api/routes/ai.py
  - app/api/routes/ai_suggest.py
  - app/api/routes/admin.py
  - app/api/schemas/admin.py
  - app/services/admin_users.py
  - app/api/router.py
  - frontend/src/api/types.ts
  - frontend/src/api/admin.ts
  - frontend/src/hooks/useAdminUsers.ts
  - frontend/src/screens/SettingsScreen.tsx
  - frontend/src/screens/AccessScreen.tsx
  - frontend/src/components/CapEditSheet.tsx
  - frontend/src/components/CapEditSheet.module.css
  - frontend/src/components/UsersList.tsx
  - tests/test_spend_cap_service.py
  - tests/test_enforce_spending_cap_dep.py
  - tests/test_admin_cap_endpoint.py
  - tests/test_me_ai_spend.py
  - tests/test_ai_cap_integration.py
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: fixed
fixes_applied:
  - CR-01: Money-scale alignment 100_000 → 100/USD in admin_ai_usage.py (commit 0c69b7d)
  - CR-02: Remove debug copy from CapEditSheet.tsx hint (commit 0c69b7d)
  - WR-05: Fix wrong /ai/chat body shape in 3 tests (commit 0c69b7d)
fixes_deferred:
  - WR-01: Double DB session via enforce_spending_cap (architectural — separate task)
  - WR-02: Cache sentinel pattern (theoretical, no current bug)
  - WR-03: SET LOCAL vs set_config style consistency (cosmetic)
  - WR-04: Math.round float drift (unlikely in practice)
  - IN-01..03: Info-level, not auto-fixed
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-07T13:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Фаза реализует ежемесячный cap AI-расходов: сервис агрегации с TTLCache, зависимость `enforce_spending_cap`, PATCH-эндпоинт администратора, расширение `/me` и фронтенд-компоненты. Архитектура корректна, major security path (аутентификация, require_owner, RLS) работает верно. Обнаружены два критических дефекта: несогласованный масштаб денег в `pct_of_cap` между Phase 13 и Phase 15 (ломает индикатор превышения лимита в AI Usage таблице) и утечка внутреннего технического текста в UI. Дополнительно — двойная инициализация сессии БД в критическом пути, разница в SET LOCAL vs set_config между модулями и несколько предупреждений по надёжности.

---

## Critical Issues

### CR-01: Несоответствие масштаба денег — `pct_of_cap` сломан для всех пользователей

**File:** `app/services/admin_ai_usage.py:155` и `app/api/schemas/admin.py:88`

**Issue:** `admin_ai_usage.py` конвертирует `est_cost_usd` в `est_cost_cents` по формуле `round(usd * 100_000)` (масштаб 100 000/USD). `spending_cap_cents` в `app_user` хранится с масштабом 100/USD (Phase 15 устанавливает именно это). При расчёте `pct_of_cap = est_cost_cents_current_month / spending_cap_cents` числитель в тысячу раз больше знаменателя, что всегда даёт значение около 1000× реального уровня — индикатор опасности (≥1.0) будет активирован при расходе $0.0005 при лимите $5.

Пример: пользователь потратил $0.01 → `est_cost_cents = 0.01 * 100_000 = 1000`. Лимит $465 → `spending_cap_cents = 46500`. `pct_of_cap = 1000/46500 ≈ 0.021` — пока ещё «корректно» выглядит, но при $0.465 расходе будет `pct_of_cap = 1.0` вместо правильного `0.001`. Для лимита $5 (`spending_cap_cents=500`) и расходе $0.01: `pct_of_cap = 1000/500 = 2.0` — мгновенно в «danger», тогда как реально потрачено 0.2% лимита.

Схема `AdminAiUsageRow` в `admin.py:88` документирует: «`est_cost_cents_current_month` — USD копейки (1 USD = 10000 storage units)», что не совпадает ни с одним из двух реальных масштабов (100_000/USD в сервисе, 100/USD в cap).

**Fix:** Выровнять масштаб. Проще всего конвертировать `est_cost_cents_current_month` в `admin_ai_usage.py` к масштабу 100/USD, чтобы совпасть с `spending_cap_cents`:

```python
# admin_ai_usage.py line 155 — change scale 100_000 → 100
est_cost_cents_cm = round(float(cm_bucket.est_cost_usd) * 100)
```

Одновременно исправить docstring в `AdminAiUsageRow.est_cost_cents_current_month` (schema) и `AdminAiUsageRow.spending_cap_cents` (schema) на единый «1 USD = 100 storage units». Если масштаб 100_000/USD нужно сохранить для Phase 13 legacy-тестов — вынести в именованную константу и синхронизировать cap default (`46500 → 46_500_000` при масштабе 100_000/USD).

---

### CR-02: Внутренний технический текст утекает в UI

**File:** `frontend/src/components/CapEditSheet.tsx:123`

**Issue:** Строка `spending_cap_cents хранится в USD-cents (100/USD).` — это отладочный/документационный текст, который попал в продакшн UI внутри `<p className={styles.hint}>`. Пользователь или оператор увидит в интерфейсе технический жаргон на английском языке. Для UI, который обращается к пользователям на русском, это явная ошибка сборки.

**Fix:**

```tsx
<p className={styles.hint}>
  Сбрасывается 1-го числа каждого месяца (МСК).
</p>
```

Удалить строку `{' '}spending_cap_cents хранится в USD-cents (100/USD).` полностью.

---

## Warnings

### WR-01: `enforce_spending_cap` открывает вторую сессию БД на каждый AI-запрос

**File:** `app/api/dependencies.py:216-255`

**Issue:** `enforce_spending_cap` принимает `db: AsyncSession = Depends(get_db)`. Роутеры `/ai/chat` и `/ai/suggest-category` также имеют `Depends(get_db_with_tenant_scope)` в обработчиках. FastAPI кешируёт зависимости в пределах одного запроса, но `get_db` и `get_db_with_tenant_scope` — это разные функции-зависимости (один возвращает plain сессию, другой — tenant-scoped). Оба создают отдельные соединения из пула, то есть на каждый `/ai/chat` запрос открывается **два** соединения с PostgreSQL одновременно: одно для cap check, одно для обработки. При 10 req/min это 20 активных соединений/min против ожидаемых 10.

Дополнительно: `_fetch_spend_cents_from_db` внутри cap сервиса делает `SET LOCAL app.current_user_id` (f-string interpolation) для RLS, тогда как `set_tenant_scope` в `db/session.py` использует `set_config(... is_local=true)` с bind-параметрами. Два разных метода для одной задачи создают риск расхождения при рефакторинге.

**Fix:** Передавать `db` из tenant-scoped dependency в `enforce_spending_cap`, либо вынести cap-check из `Depends` в тело обработчика, переиспользуя уже открытую сессию. Минимальный вариант — объединить оба в одну dependency chain так, чтобы FastAPI кешировал одну сессию.

---

### WR-02: Кеш в `get_user_spend_cents` — false negative при `spend == 0`

**File:** `app/services/spend_cap.py:104`

**Issue:**

```python
cached = _spend_cache.get(user_id)
if cached is not None:
    return cached
```

`TTLCache.get()` возвращает `None` как дефолт при отсутствии ключа И при значении `None`. Проблема возникает для пользователей с `spend == 0`: значение `0` — это валидное int, и `0 is not None` истинно, поэтому кеш-хит работает корректно. **Однако** если по какой-либо причине в кеш попадёт `None` (невозможно по текущему коду, но возможно при будущем рефакторинге), все пользователи с `cached = None` будут делать DB-запрос на каждом вызове, игнорируя TTL. Более серьёзно: паттерн проверки `if cached is not None` — нестандартный для TTLCache. Стандартный паттерн — использовать sentinel или `user_id in _spend_cache` для проверки присутствия.

Также: при `cap=0` каждый запрос через `enforce_spending_cap` будет проходить cache-lookup + lock (потому что cap-check всё равно делается до TTL expiry), это лишняя нагрузка под lock для заблокированного пользователя.

**Fix:**

```python
_CACHE_MISS = object()  # module-level sentinel

async def get_user_spend_cents(db: AsyncSession, *, user_id: int) -> int:
    cached = _spend_cache.get(user_id, _CACHE_MISS)
    if cached is not _CACHE_MISS:
        return cached  # type: ignore[return-value]
    async with _cache_lock:
        cached = _spend_cache.get(user_id, _CACHE_MISS)
        if cached is not _CACHE_MISS:
            return cached  # type: ignore[return-value]
        value = await _fetch_spend_cents_from_db(db, user_id)
        _spend_cache[user_id] = value
        return value
```

---

### WR-03: `SET LOCAL` в `spend_cap.py` использует f-string вместо `set_config`

**File:** `app/services/spend_cap.py:87`

**Issue:**

```python
await db.execute(sql_text(f"SET LOCAL app.current_user_id = '{int(user_id)}'"))
```

Несмотря на то что `int(user_id)` предотвращает SQL-инъекцию, этот паттерн отличается от установленного в `app/db/session.py:set_tenant_scope`, который использует `SELECT set_config('app.current_user_id', :uid, true)` с bind-параметром. Наличие двух разных паттернов для одной задачи — риск регрессии при рефакторинге: если кто-то изменит один, второй может не обновиться.

Дополнительно: `SET LOCAL` работает только внутри транзакции. Если сессия находится в autocommit-режиме (что возможно при некоторых конфигурациях SQLAlchemy async), `SET LOCAL` будет проигнорирован, и RLS-фильтр не сработает. `set_config(..., true)` транзакционно-safe и работает одинаково.

**Fix:** Использовать единый паттерн из `db/session.py`:

```python
await db.execute(
    sql_text("SELECT set_config('app.current_user_id', :uid, true)"),
    {"uid": str(user_id)},
)
```

---

### WR-04: `CapEditSheet` — `Math.round` для конвертации долларов в центы теряет точность

**File:** `frontend/src/components/CapEditSheet.tsx:64`

**Issue:**

```typescript
const cents = Math.round(numeric * 100);
```

Floating-point умножение `numeric * 100` даёт неточный результат для некоторых значений. Например, `1.005 * 100 = 100.49999...` → `Math.round` → 100 вместо 101. Пользователь вводит `$5.005`, ожидает `500.5` (= 501 цент через ceil), получает 500. Это несогласованность с backend, который использует `math.ceil(usd * 100)`.

Разница минимальна ($0.01), но может вызвать граничные случаи: пользователь ввёл значение точно равное текущему лимиту по его наблюдениям, а система подняла лимит на 1 цент меньше и расходы оказались на уровне лимита при следующем запросе.

**Fix:**

```typescript
// Избежать float drift: round to nearest cent first
const cents = Math.round(Math.round(numeric * 1000) / 10);
```

Или проще: ограничить шаг ввода до 0.01 (уже есть `step="0.01"`) и применять `parseFloat(value.toFixed(2)) * 100`.

---

### WR-05: `test_chat_blocked_when_at_cap_returns_429` и `test_cap_zero_blocks_chat_and_suggest` — отправляют неправильный формат тела `/ai/chat`

**File:** `tests/test_ai_cap_integration.py:113, 273`

**Issue:**

```python
json={"messages": [{"role": "user", "content": "hello"}]},
```

Схема `ChatRequest` ожидает `{"message": "string"}` (единственная строка), а не `{"messages": [...]}`. Это задокументировано в VERIFICATION.md как исправленный баг (commit d89b473), но исправление было применено только к `test_chat_unblocked_after_admin_patches_cap_higher` (строка 192), а два теста с тем же неправильным форматом на строках 113 и 273 — **не исправлены**. Эти тесты проходят только потому, что `enforce_spending_cap` срабатывает до валидации тела запроса и 422 не возникает. Если в будущем кто-то переставит зависимости или изменит порядок dependency evaluation, тесты начнут возвращать 422 вместо 429 и ложно провалятся.

**Fix:**

```python
# tests/test_ai_cap_integration.py line 113
json={"message": "hello"},

# tests/test_ai_cap_integration.py line 273
json={"message": "hello"},
```

---

## Info

### IN-01: `AdminUserResponse.spending_cap_cents` — default значение `0` в Pydantic схеме создаёт риск

**File:** `app/api/schemas/admin.py:41`

**Issue:**

```python
spending_cap_cents: int = 0  # Phase 15 AICAP-04
```

Значение по умолчанию `0` означает «AI off». Если какой-либо ORM-объект `AppUser` не заполнит это поле (например, из-за миграции или manual DB патча без значения), Pydantic вернёт `spending_cap_cents=0` вместо реального значения из БД, и owner увидит в UI «AI отключён» для активного пользователя без явной ошибки. Лучше использовать `Optional[int] = None` с явной проверкой, или убедиться что миграция не допускает NULL (и тогда default `0` является запасным вариантом, но отличается от DB default `46500`).

**Fix:** Либо задокументировать что `0` — это корректный sentinel только для обратной совместимости, либо изменить на `spending_cap_cents: int` без default (обязательное поле, которое всегда заполняется из БД после миграции alembic 0008).

---

### IN-02: `seconds_until_next_msk_month` добавляет `+1` дважды

**File:** `app/services/spend_cap.py:62`

**Issue:**

```python
return max(1, int((nxt - n).total_seconds()) + 1)
```

Добавление `+1` к `total_seconds()` обоснованно для избегания off-by-one в последнюю секунду месяца (CONTEXT D-15-03 «+1 избегаем off-by-one»). Однако `max(1, ...)` уже гарантирует минимум 1. При этом в нормальных условиях середины месяца значение может быть `N+1` вместо `N` (клиент получает `Retry-After: X+1` вместо `X`). Это не критично, но делает Retry-After на 1 секунду дольше чем нужно.

**Fix:** Если гарантия «не менее 1 секунды» нужна только при `total_seconds() <= 0`:

```python
secs = int((nxt - n).total_seconds())
return max(1, secs)  # max(1,...) уже обрабатывает граничный случай
```

---

### IN-03: `useAdminUsers` — двойная инициализация fetch при монтировании

**File:** `frontend/src/hooks/useAdminUsers.ts:41-80`

**Issue:** Хук содержит два способа загрузки данных при монтировании: `useEffect` на строках 41-46 (только для монтирования `mountedRef`) + `useEffect` на строках 63-80 (фактическая загрузка) + `refetch` callback. При монтировании компонента происходит ровно один `listAdminUsers()` вызов (второй useEffect), что корректно. Однако наличие `refetch` как useCallback и одновременно встроенного fetch-useEffect — дублирование логики. Если кто-то добавит dependency в массив зависимостей второго useEffect, это вызовет лишние запросы.

**Fix (minor):** Использовать `refetch` внутри useEffect вместо дублирования логики: `useEffect(() => { void refetch(); }, [refetch])`. Это устраняет дублирование и делает поведение при повторном монтировании предсказуемым.

---

## Summary of Key Risks

| # | Severity | Area | Impact |
|---|----------|------|--------|
| CR-01 | BLOCKER | Масштаб денег (admin_ai_usage vs cap) | `pct_of_cap` всегда неверен → UI warn/danger сломан |
| CR-02 | BLOCKER | CapEditSheet hint текст | Технический текст виден пользователю в prod |
| WR-01 | WARNING | Двойная DB сессия на AI-запрос | 2× нагрузка на connection pool |
| WR-02 | WARNING | Кеш sentinel паттерн | Потенциальная miss при будущем рефакторинге |
| WR-03 | WARNING | Два паттерна SET LOCAL vs set_config | Риск расхождения при рефакторинге |
| WR-04 | WARNING | Float-to-cents конвертация на фронте | Off-by-1-cent при граничных значениях |
| WR-05 | WARNING | Тесты с неправильным телом /ai/chat | Скрытые false-pass тесты |

---

_Reviewed: 2026-05-07T13:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
