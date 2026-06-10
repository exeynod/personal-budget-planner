# Этап 2 — констрейнты БД + тест-роль budget_app + autogen-гейт

Дата: 2026-06-10. Источник: ревью 2026-06 (memory `review-2026-06-improvement-plan`),
handoff 2026-06-10 11:10. Этап 1 закрыт (`fa88703`). Выполняется выделенным Opus-агентом.

## Цель

Закрыть four work-items Этапа 2:

1. **WI-1** Констрейнты БД (новая миграция 0039) — защита инвариантов на уровне схемы.
2. **WI-2** Перевод основного тест-прогона на роль `budget_app` (сейчас RLS в тестах выключен).
3. **WI-3** Починка «мёртвых» проверок `tests/test_migrations_v1_0.py`.
4. **WI-4** Autogen-дифф-гейт models↔схема (`alembic check`) в verify-all/CI.

## Инварианты проекта (соблюдать)

- Схема БД **только через Alembic** (`alembic/versions/`); сырой DDL в `app/` ловит
  `make check-no-manual-ddl`. CHECK/UNIQUE дублируются в ORM `__table_args__` для autogen-alignment.
- Деньги — BIGINT копейки. Бизнес-даты DATE. TZ расчётов — Europe/Moscow, БД — UTC.
- master авто-деплоится в прод при зелёном CI → **не пушить**; коммит локальный, push — по команде владельца.
- Прод-данные реальны: миграция, падающая на проде, ломает деплой. Констрейнты, которые могут
  не выполниться на существующих данных, должны иметь явный guard с понятной ошибкой.

---

## WI-1: Констрейнты БД (migration 0039)

Новая ревизия `alembic/versions/0039_period_user_constraints.py` (down_revision = `0038_recompute_balances`).

### 1a. Partial unique: один active-период на юзера

```sql
CREATE UNIQUE INDEX uq_budget_period_one_active
  ON budget_period (user_id) WHERE status = 'active';
```

- ORM: добавить в `BudgetPeriod.__table_args__`
  `Index("uq_budget_period_one_active", "user_id", unique=True,
 postgresql_where=text("status = 'active'"))`.
- **Guard:** перед созданием индекса миграция SELECT-проверяет дубли
  `SELECT user_id FROM budget_period WHERE status='active' GROUP BY user_id HAVING count(*)>1`;
  если есть — `raise RuntimeError` с перечислением user_id (безопасный atomic-fail вместо тихой порчи).
  Инвариант close_period (старый→closed, новый→active) гарантирует ≤1; guard страхует прод.

### 1b. CHECK period_end >= period_start

```sql
ALTER TABLE budget_period
  ADD CONSTRAINT ck_budget_period_end_after_start CHECK (period_end >= period_start);
```

- ORM: `CheckConstraint("period_end >= period_start", name="ck_budget_period_end_after_start")`.

### 1c. CHECK cycle_start_day BETWEEN 1 AND 28

```sql
ALTER TABLE app_user
  ADD CONSTRAINT ck_app_user_cycle_start_day CHECK (cycle_start_day BETWEEN 1 AND 28);
```

- ORM: `CheckConstraint("cycle_start_day BETWEEN 1 AND 28", name="ck_app_user_cycle_start_day")`
  в `AppUser` (добавить `__table_args__` — у класса его сейчас нет).
- Guard: проверить отсутствие строк вне диапазона; backfill не нужен (default=5, валидация на онбординге).

### Downgrade

Симметричный: DROP INDEX / DROP CONSTRAINT (IF EXISTS). GRANT'ы не нужны (констрейнты/индексы наследуют).

### Тесты WI-1

`tests/test_period_constraints.py` (новый): попытка вставить 2-й active-период → IntegrityError;
period_end < period_start → IntegrityError; cycle_start_day=0/29 → IntegrityError; happy-path проходит.
Под admin-сессией (DDL/seed), assert через `pytest.raises(IntegrityError)`.

---

## WI-2: Тест-прогон под budget_app (RLS включён)

**Проблема:** `tests/conftest.py` (строки 32-40) промоутит `ADMIN_DATABASE_URL`→`DATABASE_URL`,
весь прогон под `budget` (SUPERUSER) → RLS bypass. Цель — рантайм-путь приложения в тестах идёт
под `budget_app`, RLS реально энфорсится.

**Архитектура (dual-engine, минимальный blast radius):**

- **НЕ** перетирать `DATABASE_URL` админским. Рантайм-движок `app.db.session.async_engine`
  остаётся на `settings.DATABASE_URL = budget_app` → HTTP/сервис-вызовы через `get_db` энфорсят RLS.
- **Seed/teardown под admin:** фикстуры `db_session`, `two_tenants`, `single_user` и пр., которым нужен
  TRUNCATE/DELETE/cross-tenant seed/RLS-bypass, подключаются явно через `ADMIN_DATABASE_URL`
  (новый внутренний admin-engine), НЕ через рантайм `DATABASE_URL`.
- Сохранить `RUNTIME_DATABASE_URL` semantics для тестов, которые проверяют именно budget_app
  (`test_postgres_role_runtime.py`).

**Подводный камень:** многие сервис-тесты передают `db_session` (admin) напрямую в сервис-функции —
они RLS не энфорсят даже после свитча, и это ОК (RLS-энфорсмент покрывается выделенными
multitenancy-тестами через `SET LOCAL ROLE`). Цель WI-2 — чтобы (а) рантайм-путь под budget_app,
(б) seed/teardown под admin не маскировал боевую роль, (в) интеграционный прогон зелёный.

**Порядок выполнения:**

1. Переписать conftest: убрать promotion; ввести `_admin_db_url()` helper; `db_session` → admin-engine.
2. Boot test-стек (`make down` если поднят dev — конфликт по :8000), прогнать
   `./scripts/run-integration-tests.sh -q` → измерить blast radius.
3. Итеративно чинить фикстуры/тесты, ориентируясь на принцип «seed/teardown=admin, рантайм=budget_app».
4. Если blast radius неуправляемый (десятки тестов завязаны на admin db_session как рантайм) —
   реализовать для HTTP/интеграционного пути + расширить выделенный RLS-модуль, остаток
   задокументировать в плане и отчёте. **Не ломать зелёный прогон ради чистоты.**

**Грабли (из памяти `ci-e2e-gotchas`, conftest комментариев):**

- pytest-asyncio per-function loop → admin-engine тоже надо dispose между тестами (как `_dispose_global_engine`).
- `RESET ROLE` + `SET LOCAL row_security = off` в cleanup-путях — сохранить.
- budget_app должен иметь GRANT на все таблицы (alembic это делает per-table) — проверить, что новые
  таблицы из 0039 не вводят таблиц (вводит только индексы/констрейнты — GRANT не нужен).

---

## WI-3: Починка мёртвых проверок test_migrations_v1_0.py

«Мёртвые» места:

- `v10_revs` allowlist (стр. 193-226) — хрупкий, требует добавления КАЖДОЙ новой ревизии.
  Заменить на устойчивую проверку: «DB на head» через сравнение `alembic_version` с
  `ScriptDirectory.get_heads()` (читать реальный head из alembic-скриптов), а не хардкод-сет.
- `test_existing_user_gets_income_cents_null` — нет ни одной data-row проверки (только shape).
  Либо усилить (проверить инвариант на seeded-данных), либо честно задокументировать как shape-only.
- Удалить осиротевшие хелперы после вырезанных Section D/F (round-trip/RLS-smoke), если не используются.
- Сверить, что 0038 уже в allowlist (handoff: да) — при переходе на get_heads() allowlist уходит.

Принцип: проверки должны **реально проверять** инвариант или быть удалены. Не оставлять
trivially-passing/skip-навсегда тесты.

---

## WI-4: Autogen-дифф-гейт models↔схема

`alembic check` (1.16.5) детектит дрейф между моделями и head-схемой.

- Новый таргет Makefile `migrations-check`: поднимает/использует БД, `alembic check` под `ADMIN_DATABASE_URL`,
  EXIT 1 при дрейфе. Завести скрипт `scripts/check-migrations-autogen.sh` по образцу
  `check-no-manual-ddl.sh` (с negative-control selftest по образцу `check-no-manual-ddl-selftest`).
- Wire: добавить в `verify-all` (если можно без docker — нужен живой PG; если нет — в `ci-local.sh`
  backend-стадию, внутри api-контейнера где БД доступна).
- **Важно:** после WI-1 модели и 0039 должны быть согласованы — `alembic check` обязан быть зелёным.

---

## Definition of Done

- `make verify-all` зелёный (+ новый migrations-check, если завязан туда).
- `./scripts/run-integration-tests.sh -q` зелёный под новой ролевой схемой.
- 0039 применяется и откатывается чисто (на тест-БД); guard'ы проверены.
- `tests/test_migrations_v1_0.py` без хардкод-allowlist, без мёртвых проверок.
- Reference-доки обновлены В ТОМ ЖЕ коммите: `docs/HLD.md` (§ERD/констрейнты),
  `docs/services/*` если затронуто поведение, `docs/RUNBOOK.md` если добавлен make-таргет.
- Коммит локальный (НЕ push). Сводка — в отчёт.

## Не в скоупе (Этап 3+)

rollover из close_period, глобальные exception-handlers, единый tenant-scope паттерн, снос legacy v0.x,
UI money-IO, док-дрейф RUNBOOK jobstore. Вне-скоупные баги из handoff (PATCH /actual roundup/deposit 500 и пр.).
