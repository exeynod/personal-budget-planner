---
phase: 06-subscriptions-worker-jobs
plan: 02
subsystem: api
tags: [pydantic, sqlalchemy, alembic, subscriptions, settings, postgresql]

# Dependency graph
requires:
  - phase: 06-01
    provides: "RED-gate tests for subscriptions + settings (test_subscriptions.py)"
  - phase: 04-actual-transactions-and-bot-commands
    provides: "_resolve_period_for_date from app/services/actual.py"
provides:
  - "AppUser.notify_days_before column (Mapped[int], default=2, server_default='2')"
  - "Alembic migration 0002_add_notify_days_before.py"
  - "app/api/schemas/subscriptions.py: SubscriptionCreate/Update/Read, ChargeNowResponse"
  - "app/api/schemas/settings.py: SettingsRead/SettingsUpdate extended with notify_days_before + is_bot_bound"
  - "app/services/subscriptions.py: list/create/update/delete/charge_subscription + AlreadyChargedError"
  - "app/services/settings.py: get_notify_days_before, update_notify_days_before, get_is_bot_bound"
  - "app/api/routes/settings.py: updated to return notify_days_before + is_bot_bound, partial update support"
affects:
  - 06-03  # routes/subscriptions.py builds on top of these services
  - 06-04  # charge_subscriptions worker uses charge_subscription service
  - 06-05  # frontend needs SubscriptionRead type

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AlreadyChargedError domain exception → mapped to HTTP 409 in route layer"
    - "CategoryNotFoundOrArchived domain exception → mapped to HTTP 400 in route layer"
    - "Lazy import pattern in charge_subscription to avoid cyclic imports (actual ↔ subscriptions)"
    - "notify_days_before defaults from AppUser if not passed (server-side default, not Pydantic default)"

key-files:
  created:
    - "app/api/schemas/subscriptions.py"
    - "app/services/subscriptions.py"
    - "alembic/versions/0002_add_notify_days_before.py"
  modified:
    - "app/db/models.py"
    - "app/api/schemas/settings.py"
    - "app/services/settings.py"
    - "app/api/routes/settings.py"

key-decisions:
  - "SettingsUpdate made fully Optional (both cycle_start_day and notify_days_before) to support partial PATCH"
  - "Settings route updated in 06-02 (not 06-03) to avoid ValidationError on existing SettingsRead with new required fields"
  - "is_bot_bound added to SettingsRead as bool (derived from AppUser.tg_chat_id is not None)"
  - "SUB-05 constraint uq_planned_sub_charge_date deferred check — DB not available locally, deferred to 06-07"
  - "Python 3.9 compatibility: Optional[int] instead of int | None (from __future__ annotations added)"

patterns-established:
  - "Service layer raises domain exceptions; route layer maps to HTTP codes"
  - "charge_subscription shared between charge-now HTTP endpoint and worker job"

requirements-completed: [SUB-01, SUB-04, SUB-05, SET-02]

# Metrics
duration: 25min
completed: 2026-05-03
---

# Phase 06 Plan 02: Subscriptions Foundation — DB Column, Schemas, Service Layer

**AppUser.notify_days_before колонка + Alembic миграция 0002, полный сервисный слой subscriptions с AlreadyChargedError/idempotency, и расширение Settings схем/сервисов/роутов для notify_days_before + is_bot_bound**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-03T00:00:00Z
- **Completed:** 2026-05-03
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- `AppUser.notify_days_before` колонка добавлена в модель + Alembic миграция `0002_add_notify_days_before.py`
- Pydantic-схемы: `SubscriptionCreate` (amount_cents gt=0, T-06-01), `SubscriptionUpdate` (all Optional), `SubscriptionRead` (nested CategoryRead), `ChargeNowResponse`
- Сервисный слой: `list/create/update/delete/charge_subscription`, `_advance_charge_date` (dateutil.relativedelta), `AlreadyChargedError` для SUB-05 идемпотентности
- Settings расширен: `get_notify_days_before`, `update_notify_days_before`, `get_is_bot_bound`; route обновлён для partial PATCH

## Task Commits

1. **Task 1: AppUser.notify_days_before + Alembic migration** — `eb5a793` (feat)
2. **Task 2: Pydantic schemas + settings extension** — `dca09bd` (feat)
3. **Task 3: Subscription service layer** — `9b4e518` (feat)

## Files Created/Modified

- `app/db/models.py` — добавлена колонка `notify_days_before: Mapped[int]` в AppUser
- `alembic/versions/0002_add_notify_days_before.py` — `ALTER TABLE app_user ADD COLUMN notify_days_before INTEGER NOT NULL DEFAULT 2`
- `app/api/schemas/subscriptions.py` (новый) — SubscriptionCreate/Update/Read, ChargeNowResponse
- `app/api/schemas/settings.py` — SettingsRead + notify_days_before + is_bot_bound; SettingsUpdate → оба поля Optional
- `app/services/subscriptions.py` (новый) — полный сервисный слой подписок
- `app/services/settings.py` — get_notify_days_before, update_notify_days_before, get_is_bot_bound
- `app/api/routes/settings.py` — partial update + новые поля в ответе

## Service Function Signatures (для 06-03)

```python
# app/services/subscriptions.py
async def list_subscriptions(db: AsyncSession) -> list[Subscription]
async def create_subscription(db, *, tg_user_id, name, amount_cents, cycle, next_charge_date, category_id, notify_days_before=None, is_active=True) -> Subscription
async def update_subscription(db, sub_id: int, patch: dict) -> Subscription
async def delete_subscription(db, sub_id: int) -> None
async def charge_subscription(db, sub_id: int, *, cycle_start_day: int) -> tuple[PlannedTransaction, date]
def _advance_charge_date(sub: Subscription) -> date

class AlreadyChargedError(Exception): ...
class CategoryNotFoundOrArchived(Exception): ...

# app/services/settings.py (new functions)
async def get_notify_days_before(db: AsyncSession, tg_user_id: int) -> int
async def update_notify_days_before(db: AsyncSession, tg_user_id: int, value: int) -> int
async def get_is_bot_bound(db: AsyncSession, tg_user_id: int) -> bool
```

## Alembic Migration Status

- **0002_add_notify_days_before.py** создан. `alembic upgrade head` не запускался локально — БД недоступна.
- Файл миграции синтаксически корректен. Применять при деплое.

## SUB-05 Constraint Check (uq_planned_sub_charge_date)

Результат: **CONSTRAINT_MISSING_OR_NO_DB** — локальная БД недоступна.

Constraint `uq_planned_sub_charge_date` объявлен в `app/db/models.py:PlannedTransaction.__table_args__` (Phase 4) и должен быть материализован при `alembic upgrade head` из первой миграции. Проверка деферирована к **06-07 (Wave 5)** — перед финальной верификацией убедиться что constraint существует:

```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name='planned_transaction' AND constraint_name='uq_planned_sub_charge_date';
-- Должно вернуть строку: uq_planned_sub_charge_date
```

## Decisions Made

1. **SettingsUpdate полностью Optional** — `cycle_start_day` тоже стал `Optional` (был required). Это нужно для partial PATCH (нельзя требовать оба поля). Существующие тесты settings продолжают работать.

2. **Settings route обновлён в 06-02** — план предполагал это для 06-03, но SettingsRead теперь требует `notify_days_before` и `is_bot_bound`, что вызвало бы ValidationError в существующем route. Обновление route было сделано как deviation Rule 2 (missing critical functionality).

3. **`from __future__ import annotations`** — добавлен для Python 3.9 совместимости (синтаксис `int | None` не поддерживается в 3.9).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Settings route обновлён одновременно со схемами**
- **Found during:** Task 2 (Pydantic schemas + settings extension)
- **Issue:** SettingsRead получил обязательные поля `notify_days_before` + `is_bot_bound`, но существующий `settings_router` создавал `SettingsRead(cycle_start_day=cycle)` без новых полей → ValidationError 500
- **Fix:** Обновлён `app/api/routes/settings.py` для вызова новых service-функций и передачи всех полей; SettingsUpdate сделан fully Optional для partial PATCH
- **Files modified:** `app/api/routes/settings.py`, `app/services/settings.py`
- **Verification:** `python3 -c "from app.api.schemas.settings import SettingsRead; SettingsRead(cycle_start_day=1, notify_days_before=2, is_bot_bound=False)"` — OK
- **Committed in:** `dca09bd` (Task 2 commit)

**2. [Rule 1 - Bug] Python 3.9 type annotation compatibility**
- **Found during:** Task 3 (subscription service layer)
- **Issue:** `int | None` syntax not supported in Python 3.9, raises `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`
- **Fix:** Added `from __future__ import annotations` and used `Optional[int]` from typing
- **Files modified:** `app/services/subscriptions.py`
- **Verification:** `python3 -c "from app.services.subscriptions import create_subscription"` — OK
- **Committed in:** `9b4e518` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 - missing critical, 1 Rule 1 - bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- Локальная БД PostgreSQL недоступна — `alembic upgrade head` и SUB-05 constraint check deferred к 06-07

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **06-03 (Routes)** может строиться: все service-функции готовы, signatures задокументированы выше
- **06-04 (Worker Jobs)** может использовать `charge_subscription` и `_advance_charge_date` напрямую
- Тесты `test_subscriptions.py` остаются RED (нет subscriptions_router) — ожидаемо для Wave 1

---
*Phase: 06-subscriptions-worker-jobs*
*Completed: 2026-05-03*
