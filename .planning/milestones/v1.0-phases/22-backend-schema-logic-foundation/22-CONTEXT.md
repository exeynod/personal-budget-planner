# Phase 22: Backend Schema & Logic Foundation - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 4 grey areas accepted en bloc

<domain>
## Phase Boundary

Backend готов поддержать v1.0 UI: новые сущности (`Account`, `Goal`, `SavingsConfig`, `Subscription` extension с `day_of_month`/`posted_txn_id`/`account_id`), расширения существующих (`Category.{plan_cents, code, ord, rollover, paused, parent_id}`, `ActualTransaction.kind ∈ {expense, income, roundup, deposit}` + `parent_txn_id`, `AppUser.income_cents`) и бизнес-правила (auto-roundup, rollover остатков на закрытии периода, atomic onboarding-complete) работают через типизированные REST endpoints под `/api/v1/*` с RLS-изоляцией для всех новых таблиц.

Frontend (web/iOS) в этой фазе **не трогается** — только backend, alembic, тесты, сидинг.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Migration & Data Backfill

- **Alembic split на 4 атомарные миграции:**
  - `0012_v10_user_account.py` — `User.income_cents`, новая таблица `account` + RLS-policy + indexes
  - `0013_v10_category_ext.py` — `Category.{plan_cents, code, ord, rollover, paused, parent_id}` + composite FK `(parent_id, user_id) → (id, user_id)` + system «savings» Category seeding helper
  - `0014_v10_actual_goal_savings.py` — `actual_transaction.kind` enum migration via `autocommit_block` + `parent_txn_id` self-FK; новые таблицы `goal`, `savings_config`; `subscription` extension columns (`day_of_month`, `posted_txn_id`, `account_id`)
  - `0015_v10_rls_finalize.py` — RLS-policies на `account`, `goal`, `savings_config` + composite FK `(actual_transaction.parent_txn_id, user_id) → (actual_transaction.id, user_id)`
- **`PlanTemplateItem` дропается полностью** — `Category.plan_cents` становится source of truth для текущего месяца. Историю плана (если нужна аналитике) восстанавливаем из `PlannedTransaction` (он остаётся).
- **Existing OWNER_TG_ID data backfill** в alembic data-migration внутри `0012`/`0013`:
  - `User.income_cents = NULL` (UI редиректит на onboarding-edit при `null`)
  - default Account `name='Карта', kind='card', balance_cents=0, primary=true, bank='Т-Банк', mask=NULL`
  - `Category.code = transliterate(name).lower()` (best-effort; collision handling: `code-2`, `code-3`)
  - `Category.ord = lpad(sort_order, 2, '0')` (e.g. `01`, `02`)
  - `Category.rollover = 'misc'` (по умолчанию)
  - `Category.paused = is_archived` (legacy archived → paused)
  - `Category.plan_cents` импортируется из последнего `PlanTemplateItem.amount_cents` per category (если запись есть, иначе 0)
- **V0.x backward compat (BE-05) — drop полностью.** Single user, 1 client (v0.6 iOS → v1.0). Nothing in production needs legacy 14-cat seed.

### Area 2: Schema & Enums

- **`ActualKind` enum migration через `autocommit_block`:**
  ```python
  with op.get_context().autocommit_block():
      op.execute("ALTER TYPE categorykind RENAME TO actualkind")
      op.execute("ALTER TYPE actualkind ADD VALUE IF NOT EXISTS 'roundup'")
      op.execute("ALTER TYPE actualkind ADD VALUE IF NOT EXISTS 'deposit'")
  ```
  `Category.kind` пересоздаём как новый enum `category_kind` (только expense/income — без roundup/deposit на категории).
- **`Subscription` extension: 3 column + 1 index:**
  - `day_of_month INT2 NULL CHECK (day_of_month BETWEEN 1 AND 28)`
  - `posted_txn_id BIGINT NULL FK actual_transaction(id) ON DELETE SET NULL`
  - `account_id BIGINT NULL FK account(id) ON DELETE RESTRICT`
  - `INDEX ix_subscription_user_day (user_id, day_of_month) WHERE day_of_month IS NOT NULL` (для PLAN-list query)
- **System «savings» Category** seeded at first onboarding-complete:
  - `code='savings', name='КОПИЛКА', kind=expense, ord='99', plan_cents=0, rollover='savings', paused=true`
  - Excluded from PLAN/Home через `WHERE code != 'savings'` filter в queries
  - Roundup/deposit txns ссылаются именно на этот Category row через `category_id`
- **`Account.balance_cents` reconciliation = trust delta-accounting:**
  - service-layer обновляет `balance += txn.amount` атомарно с insert/delete txn
  - reconciliation-cron не вводим (single source of truth = txn-таблица + balance как cache)
  - тест: integration-test пересчитывает balance и сверяет с агрегатом

### Area 3: Business Logic & Idempotency

- **Roundup hook = service-layer Python в одной DB-транзакции с parent txn.**
  - Вход: `actual_transactions.create_service(payload)` после insert parent
  - Если `parent.kind == 'expense'` AND `SavingsConfig.roundup_enabled == true`:
    - `delta = ((|amount| + base − 1) // base) * base − |amount|`
    - skip если `delta == 0` или `delta == base`
    - insert child txn `kind='roundup', amount=-delta, parent_txn_id=parent.id, account_id=parent.account_id, category_id=savings_category.id, occurred_at=parent.occurred_at`
    - `parent.account.balance_cents -= delta` (атомарно)
- **Roundup scope = только `kind='expense'`.** Income/manual-deposit/refund — пропускаются.
- **`close_period_job` rollover idempotency = both:**
  - `pg_try_advisory_lock(hashtext('close_period:' || period_id))` + `LOCK_TIMEOUT 5s`
  - inside lock: `if period.rollover_processed_at IS NOT NULL: return`
  - после успеха: `UPDATE budget_period SET rollover_processed_at = now() WHERE id = period_id`
  - `UNIQUE INDEX uq_period_rolled ON budget_period(id) WHERE rollover_processed_at IS NOT NULL` (defensive против double-write race)
- **`POST /api/v1/onboarding/complete` = 409 Conflict** если `accounts[].length > 0` уже существуют для пользователя.
  - Body schema: `{income_cents: int, accounts: [{bank, kind, balance_cents, mask?, primary?}], category_plans: {code: cents}, goal?: {name, target_cents, due?}, savings_config?: {roundup_enabled, base}}` — все поля required кроме goal/savings_config.
  - Атомарно в одной транзакции: insert User.income_cents, insert Account-rows (один primary=true), seed system Category «savings», seed 8 default Categories с `Category.plan_cents = category_plans[code]`, optional Goal, SavingsConfig (default roundup_enabled=false, base=10).
  - Reset-helper: `DELETE /api/v1/onboarding/reset` (admin-only через `X-Internal-Token`) — wipe Account/Goal/SavingsConfig + plan_cents=0 + reset User.income_cents=NULL для повторного онбординга в dev.

### Area 4: RLS & API

- **RLS на 3 новых таблицах** — в migration `0015` создаём policy:
  ```sql
  ALTER TABLE account ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_account ON account
    USING (user_id = current_setting('app.current_user_id')::bigint);
  -- идентично для goal, savings_config
  ```
- **Composite FK для cross-tenant защиты:**
  - `category(parent_id, user_id) → category(id, user_id)` (BE-16)
  - `actual_transaction(parent_txn_id, user_id) → actual_transaction(id, user_id)` (BE-16)
- **Worker rollover writes используют `app.current_user_id` GUC** — внутри `close_period_job` per-user loop:
  ```python
  for user in users:
      async with session.begin():
          await session.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user.id})
          # rollover logic
  ```
  Не используем `BYPASSRLS` (соответствует существующему паттерну worker'а после `0007_postgres_role_split`).
- **API endpoints под `/api/v1/`:**
  - `GET/POST/PATCH/DELETE /api/v1/accounts` (BE-02)
  - `GET/POST/PATCH/DELETE /api/v1/goals` (BE-11)
  - `GET /api/v1/savings` (BE-09)
  - `PATCH /api/v1/savings/config` (BE-08)
  - `POST /api/v1/savings/deposit` (BE-10)
  - `POST /api/v1/subscriptions/:id/post` + `unpost` (BE-13)
  - `POST /api/v1/onboarding/complete` (extension по BE-15)
  - `DELETE /api/v1/onboarding/reset` (admin-only)
  - Routes регистрируются в `app/api/v1/__init__.py` через include_router, как существующие.

### Claude's Discretion

- Порядок и naming alembic-миграций (предложен — финализировать в plan-phase)
- Точные имена индексов (соблюдая convention `ix_<table>_<cols>` или `uq_<table>_<cols>`)
- Структура pydantic-schemas (один-в-один с DATA-MODEL.md TS-типами или slight Pythonic naming)
- Разбиение endpoints по router-файлам (`accounts.py`, `goals.py`, `savings.py`, `subscriptions.py`, `onboarding.py`)
- Test coverage targets (recommended ≥85% на service-layer для roundup/rollover/atomic-onboarding)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/db/models.py` (505 lines) — все доменные модели + RLS-комментарий («Multi-tenant since Phase 11: user_id BIGINT NOT NULL FK → app_user.id ON DELETE RESTRICT»). Phase 22 добавляет туда новые классы и расширения.
- `app/db/session.py` — async-session factory с `app.current_user_id` GUC injection. Reuse для всех новых endpoints.
- `app/core/settings.py` — `OWNER_TG_ID`, `INTERNAL_TOKEN`. Reuse для admin-only `/onboarding/reset`.
- `app/services/` — существующий service-layer pattern. Новые модули: `accounts.py`, `goals.py`, `savings.py`, `roundup.py`, `rollover.py` (часть `close_period`).
- `app/worker/jobs/close_period.py` — расширяем для rollover (если уже существует) либо создаём заново.
- `alembic/versions/0006_multitenancy.py` — reference для RLS policy syntax.
- `alembic/versions/0007_postgres_role_split.py` — reference для role/GUC pattern (worker connects as `budget_app` NOSUPERUSER NOBYPASSRLS).
- `alembic/versions/0011_auth_token.py` — последняя миграция; новые начинаются с `0012_*`.

### Established Patterns

- **SQLAlchemy 2.x async** + `Mapped[]` typing (см. `app/db/models.py`)
- **Pydantic v2** schemas в `app/api/v1/schemas/` или inline per-router (текущий стиль смешан — финализируем в plan-phase)
- **RLS-aware sessions**: `SET LOCAL app.current_user_id = :uid` в request-middleware (см. `app/api/middleware/auth.py`) и worker job-loop
- **Money as `BigInteger` cents** на всех денежных полях (CLAUDE.md convention)
- **Soft-delete только для category** через `is_archived` (CLAUDE.md). Phase 22 *не* меняет этого правила — paused != archived (paused остаётся в queries).
- **Tests location**: `tests/` (pytest); integration-tests с testcontainers Postgres (см. `docker-compose.test.yml`)
- **Internal API** под `/api/v1/internal/*` защищён `X-Internal-Token` (CLAUDE.md). `/onboarding/reset` падает в эту категорию.

### Integration Points

- **Frontend** (web + iOS) подхватит новые DTOs в Phase 23-27. Phase 22 публикует API contract через OpenAPI (`/openapi.json`).
- **Bot** (`app/bot/`) — команда `/balance` будет читать `account.balance_cents` (агрегат primary). Не блокирует Phase 22, но потребует адаптации в Phase 25/27.
- **AI tools** (`app/ai/tools.py`) — read-only tools могут начать использовать новые поля (account, goal). Не обязательны для Phase 22 acceptance.

</code_context>

<specifics>
## Specific Ideas

- **DATA-MODEL.md** в `.planning/v1.0-handoff/handoff/DATA-MODEL.md` — single source of truth по схеме, бизнес-правилам, форматтерам, валидаторам. Phase 22 реализует §1-§9 на backend.
- **Roundup formula** (DATA-MODEL §4): `delta = ceil(|t.amount| / base) * base − |t.amount|`. В Python: `((amount + base - 1) // base) * base - amount` (целочисленно, без float).
- **Default 8 categories shares** (DATA-MODEL §1.3): food/cafe/home/transit/fun/gifts/health/subs с shares 0.20/0.10/0.30/0.06/0.05/0.04/0.05/0.03 (сумма 0.83, остаток 0.17 рекомендуется в копилку).
- **Validators** (DATA-MODEL §6) — реализовать на pydantic-schemas (income > 0, ≤ 100M ₽; plan ≥ 0 ≤ income*4; Σ plan ≤ income; txn.amount != 0; etc.).
- **TZ**: периоды и cron — `Europe/Moscow`, БД UTC (CLAUDE.md). `close_period_job` запускается 00:01 MSK = 21:01 UTC предыдущего дня.

</specifics>

<deferred>
## Deferred Ideas

- **AI tools обновление под новые сущности (Account/Goal)** — отдельная work, попадёт в Phase 27 (AI screen rewrite) или в backlog.
- **Aggregation cron для balance reconciliation** — отвергнуто (trust delta-accounting). Если в проде вылезет drift — добавим в R6.
- **Multi-currency support** — out of scope (single-currency RUB во всём проекте).
- **Subscription cycle = yearly** для UI «подписки» vs `monthly` для «регулярные» — UI semantic в Phase 26, backend хранит cycle одинаково.
- **Plan history archival (старые `PlanTemplateItem` снимки)** — дропаются полностью в migration 0013. Если потребуется аналитика «как менялся план» — восстанавливаем из git-истории миграций или backup БД.
- **Onboarding-reset через UI** — отложено в R6 (для MVP только `X-Internal-Token` admin endpoint).

</deferred>
