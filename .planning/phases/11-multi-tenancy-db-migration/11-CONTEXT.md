# Phase 11: Multi-Tenancy DB Migration & RLS - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss in autonomous mode; user decisions from milestone discussion)

<domain>
## Phase Boundary

Все доменные данные изолированы по `user_id` на уровне БД (FK + Postgres RLS), существующие данные единственного OWNER_TG_ID-юзера сохранены через backfill, схема готова к multi-tenant запросам. Также добавляется `app_user.role` колонка (используется в Phase 12, но миграция атомарная).

**В scope:**
- Alembic миграция: добавление `user_id BIGINT NOT NULL FK → app_user.id` в 9 доменных таблиц (`category`, `budget_period`, `plan_template_item`, `planned_transaction`, `actual_transaction`, `subscription`, `category_embedding`, `ai_conversation`, `ai_message`)
- Backfill `user_id = (SELECT id FROM app_user WHERE tg_user_id = OWNER_TG_ID)` для существующих строк
- Добавление `app_user.role` enum-колонки (`owner` / `member` / `revoked`), default = `member`; backfill `role=owner` для существующего OWNER_TG_ID-юзера
- Postgres RLS policies на всех 9 таблицах: `user_id = current_setting('app.current_user_id')::bigint`
- Перевод unique-constraints с глобальных на `(user_id, ...)` где применимо
- Refactor всех Python-слой queries для явной фильтрации по `user_id` (через DI, не глобальный state)
- Integration test: 2 seed-юзера, юзер A не видит данных юзера B даже при попытке прямого ID-обхода
- `pg_try_advisory_lock` для миграционных операций (если требуются длительные locks)

**НЕ в scope:**
- Auth-слой refactor (Phase 12) — `OWNER_TG_ID`-eq остаётся работать до Phase 12
- API endpoint changes (Phase 12+)
- Frontend изменения (Phase 13+)
- Onboarding flow для новых юзеров (Phase 14)
- AI cost cap (Phase 15)
- `ai_usage_log` schema — уже имеет `user_id` (с Phase 10.1)? Уточнить, если нет — добавить

</domain>

<decisions>
## Implementation Decisions

### DB Migration Strategy
- **Single Alembic revision** — все изменения в одной миграции; rollback атомарный. Rationale: pet-проект, один OWNER, downtime приемлем; split на multiple revisions добавляет risk без выгоды
- **Offline migration** (downtime ~30 сек) — `docker compose stop api bot worker; alembic upgrade head; docker compose start`. Rationale: один пользователь, нет SLA; online migration со shadow-table значительно сложнее
- **Backfill через subquery** — `UPDATE category SET user_id = (SELECT id FROM app_user WHERE tg_user_id = :owner_tg_id)` (с параметром из ENV); потом `ALTER COLUMN user_id SET NOT NULL`. Rationale: pet-проект с 1 юзером, простая операция

### RLS Strategy
- **RLS enabled on all 9 domain tables** — `user_id = current_setting('app.current_user_id')::bigint`
- **App-side filtering as primary, RLS as defense-in-depth** — все queries в Python-слое явно `WHERE user_id = ?`; RLS — backstop, ловит баги если where забыт
- **Single GUC `app.current_user_id`** — устанавливается в начале каждого request через FastAPI dependency (`SET LOCAL app.current_user_id = :user_id`); reset на конце request не нужен (LOCAL = transaction scope)
- **Migration-friendly RLS policy** — `coalesce(current_setting('app.current_user_id', true)::bigint, -1)` чтобы при отсутствии setting'а (миграции, миграционные запросы) policy не падала, а возвращала пустой set
- **No BYPASSRLS for app-user** — приложение не использует su-роль; миграции/admin-операции через psql или alembic используют отдельный role с BYPASSRLS

### Schema Decisions
- **`user_id BIGINT NOT NULL FK → app_user.id ON DELETE RESTRICT`** — не CASCADE; revoke (Phase 13) делает explicit purge через service layer, не полагается на FK cascade. Rationale: явность, легче дебажить
- **Unique constraints scoped по `(user_id, ...)`** — `UNIQUE(user_id, name)` для `category`, `subscription`; `category_embedding(category_id, ...)` уже наследует `category.user_id` через FK — уникальность сохраняется через `category_id`
- **`app_user.role`** — Postgres enum type `user_role` (`'owner', 'member', 'revoked'`); `NOT NULL` с default `'member'`; backfill для существующего owner перед NOT NULL

### Query Refactor Pattern
- **Dependency injection** — новый dep `get_current_user_id` (возвращает int) рядом с `get_current_user`; service-functions принимают `user_id: int` параметром явно (не из глобального state)
- **All queries scoped в service layer** — `select(Category).where(Category.user_id == user_id)`; в роутах не пишем raw queries
- **Migration of existing services** — каждый существующий service получает `user_id` параметр; legacy callers (бот, worker) тоже передают user_id явно
- **Worker context** — для cron-джобов которые работают over all users (close_period, charge_subscriptions) — итерация по `app_user` где `role IN (owner, member)`, для каждого user — отдельный transaction scope с SET app.current_user_id

### Testing Strategy
- **2-юзера integration test** — pytest fixture создаёт юзеров A и B с разными bag'ами данных (категории, транзакции, подписки); проверяет что queries от A не видят данные B
- **Direct-ID bypass test** — юзер A пытается `GET /api/v1/category/{B_category_id}` → 404 (или 403, выбрать в plan)
- **RLS policy test** — без `SET app.current_user_id` query возвращает 0 rows (через psycopg/asyncpg с raw connection)
- **Backfill test** — миграция применяется на seed-БД, проверяется что `user_id` всех существующих rows = id OWNER юзера

### Claude's Discretion
- Точный порядок ALTER TABLE statements в миграции (FK constraints, RLS enable, policies create) — выбрать оптимальный для скорости / минимизации locks
- Точное имя GUC (`app.current_user_id` vs альтернатива) — стандарт для PostgreSQL
- Имя alembic revision file (например `20260507_user_id_rls_role.py`)
- Точный синтаксис RLS policies (FORCE/PERMISSIVE) — выбрать стандартные
- Worker job changes — насколько глубоко refactor'ить `notify_subscriptions`, `charge_subscriptions`, `close_period` для multi-tenant итерации (минимально: добавить SET app.current_user_id перед каждым tenant-scoped блоком)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/core/db.py` — async session factory (нужен extension для SET app.current_user_id)
- `app/api/dependencies.py:39+` — `get_current_user` уже резолвит app_user из tg_user_id; легко расширить до `get_current_user_id` returning int
- `app/db/migrations/` — Alembic infrastructure готова, есть прецедент Phase 10 (pgvector migration)
- `tests/conftest.py` — pytest fixtures для DB; нужно расширить для 2-юзерных fixtures
- `app/db/models/` — все ORM модели в одном месте; добавить `user_id` Column атомарно

### Established Patterns
- **Alembic migrations** — синхронный код, op.add_column / op.execute / op.create_index; пример в `0003_*pgvector*.py`
- **ORM models** — SQLAlchemy 2.x typed mappings (`Mapped[int]`, `mapped_column(...)`)
- **Service layer** — `app/services/*.py`, async functions, принимают `AsyncSession` + business params, возвращают ORM objects или Pydantic schemas
- **Dependency injection** — FastAPI `Depends(...)` chains в `app/api/dependencies.py`
- **Docker dev workflow** — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (per memory feedback)

### Integration Points
- `app/api/dependencies.py` — добавить `get_current_user_id` dep; later (Phase 12) изменить `get_current_user` для role-check
- `app/core/db.py` или `app/api/dependencies.py` — middleware/dep для `SET LOCAL app.current_user_id` per request
- `app/services/*.py` — все service functions (categories, plans, actuals, subscriptions, periods, ai_*) — добавить `user_id` параметр
- `app/api/routes/*.py` — все роуты резолвят `user_id` через dep, передают в service
- `main_worker.py` + worker джобы (`app/worker/jobs/*.py` или inline) — refactor для per-user iteration
- `app/dev_seed.py` — seed создаёт OWNER_TG_ID-юзера; после миграции должен создавать с role='owner'

### Out of scope code paths (preserve as-is, refactor in later phases)
- `app/bot/handlers.py` — OWNER_TG_ID whitelist остаётся в Phase 11 (Phase 12 уберёт)
- `app/api/routes/internal_*` — internal token auth не зависит от user_id
- AI ring buffer (`app/ai/usage_tracker.py` или подобный) — сохраняет `user_id` уже (с Phase 10.1)? Уточнить в plan-phase

</code_context>

<specifics>
## Specific Ideas

- **Migration safety:** запускать с `docker compose stop api bot worker` перед `alembic upgrade head`, потом `start`. Worker может оставаться остановленным до Phase 12 (его cron не упадёт от RLS если `app.current_user_id` не установлен — coalesce trick).
- **OWNER_TG_ID env access in migration:** Alembic миграция читает `OWNER_TG_ID` из ENV (через `os.environ['OWNER_TG_ID']`) для backfill — fail loud если не установлен.
- **RLS verification snippet** для тестов:
  ```python
  await session.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_a_id})
  rows_a = (await session.execute(select(Category))).scalars().all()
  # rows_a содержит только данные user_a
  ```
- **2-tenant fixture pattern:** `@pytest.fixture` создаёт `user_a`, `user_b` через `app_user` table directly (skip onboarding), seed категории/транзакции/подписки для обоих, возвращает `(user_a, user_b)` tuple.

</specifics>

<deferred>
## Deferred Ideas

- **Worker per-user iteration optimization** (batching, parallel) — оптимизация на потом; Phase 11 делает минимально работоспособный refactor
- **`pg_try_advisory_lock` для миграции** — нужен только если миграция длительная; для 1-юзера БД миграция занимает миллисекунды, lock не нужен. Если в будущем будет реальный multi-tenant trafic — добавить.
- **Audit table для DB access logs** — отложено в `Future Requirements / AUD-01..02` (REQUIREMENTS.md)

</deferred>
