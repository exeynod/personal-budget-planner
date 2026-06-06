# BACKEND IMPLEMENTATION PLAN — UX-реворк планирования + выпиливание (G) + корректировка остатка (H)

> Источник: `.planning/ux-redesign/AGREED-PLAN.md` (B/G/H + решения A), `.planning/ux-redesign/RESEARCH.md` (§2/§4/§6).
> Всё grounded в реальном коде (file:line). Деньги — BIGINT cents. Multi-tenant via RLS
> (`set_tenant_scope` → `SET LOCAL app.current_user_id`). Alembic head на момент написания: **`0027_perf_composite_indexes`**.
> Контракт регенерируется из live-app: `make contract` (→ `contract/openapi.json` → web `schema.ts` + iOS `GeneratedDTO.swift`).

---

## 0. Текущее состояние (что реально есть в коде)

- `Category.plan_cents` (`models.py:293`) — единый **живой** лимит, НЕ per-period. SoT плана в v1.0 (см. докстринг `compute_balance` `actual.py:384-401`).
- `Category.paused` (`models.py:313`), `Category.rollover` (`models.py:305`, VARCHAR(8) + CHECK `ck_category_rollover_enum`) — удаляем (G3, G4).
- `PlannedTransaction` (`models.py:587`): `period_id, kind(actualkind), amount_cents, description, category_id, planned_date(nullable), source(plansource: template|manual|subscription_auto), subscription_id, original_charge_date, user_id`. **НЕТ `posted_txn_id`** — это и есть мост, который надо добавить (G1).
- `Subscription.posted_txn_id` (`models.py:555`, FK→`actual_transaction` ON DELETE SET NULL) + partial unique `uq_subscription_posted_txn_id` (alembic 0025) — **образец моста**, который зеркалим на planned.
- `post_subscription`/`unpost_subscription` (`subscriptions.py:361/459`) — **рабочий образец** post-флоу: `SELECT … FOR UPDATE` → idempotency (`posted_txn_id IS NOT NULL`→409) → `create_actual_v10(kind='expense', amount=-abs, account_id=sub.account_id, tx_date=_today_in_app_tz())` → `sub.posted_txn_id=parent.id`. Дата **зашита на сегодня** (`subscriptions.py:440`).
- `create_actual_v10` (`actual.py:647`) — принимает `tx_date`, `account_id`, `parent_txn_id`; применяет balance-delta через `apply_balance_delta`; вызывает roundup-hook. **Roundup-hook удаляем из дефолт-пути** при выпиливании savings (см. §3.6).
- `create_manual_planned` (`planned.py:223`) + routes `GET/POST /periods/{id}/planned`, `PATCH/DELETE /planned/{id}` (`routes/planned.py`) — **CRUD детализации уже есть и работает**. Веб к ним не ходит, но бэкенд готов.
- `apply_template_to_period` (`planned.py:330`) — **no-op** (`created=0`), т.к. `plan_template_item` дропнут в 0013.
- `templates.py` service (`services/templates.py`) + routes (`routes/templates.py`) — **deprecated-заглушки** (410 Gone).
- `compute_balance` (`actual.py:378`) — план из `Category.plan_cents` (исключая `code='savings'`), факт из `SUM(abs(amount_cents))` по `(category_id, kind in {expense,income})`; `planned_transaction` **полностью исключён** (см. докстринг `actual.py:384`). Income-план = `AppUser.income_cents`.
- `get_primary_account(db, *, user_id)` (`accounts.py:408`) → `Optional[Account]` (`is_primary=True`). Используем как авто-резолв primary при post/create.
- Savings surface: `Goal`/`SavingsConfig` модели (`models.py:942/982`), `services/savings.py`, `services/goals.py`, `services/roundup.py`, routes `savings.py`/`goals.py`, onboarding savings-seed (`onboarding_v10.py:103-120, 356-395, 513-547`), rollover savings-branch (`rollover.py:213-270`).
- RLS policy naming (CONTEXT D-08): `tenant_isolation_<table>`, тело `USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) WITH CHECK (...)` (см. 0015:72-83). `ENABLE`+`FORCE ROW LEVEL SECURITY` + `GRANT … TO budget_app` (+ `GRANT USAGE,SELECT ON SEQUENCE … TO budget_app` для serial). RLS-audit тест (`tests/test_rls_audit.py:36-38`) перечисляет tenant-таблицы — **обновить список**.

---

## 1. Migrations (alembic) — точные операции, по порядку

Все новые ревизии — линейная цепочка от `0027`. Предлагаю **четыре** ревизии для атомарности и чистого rollback:

### 0028 — `plan_template_*` revive + `period_category_plan` (planning ADD)

`down_revision = "0027_perf_composite_indexes"`

1. **`plan_template_item`** (ОЖИВИТЬ; B):

   ```
   id            BIGSERIAL PK
   user_id       BIGINT NOT NULL FK→app_user.id ON DELETE RESTRICT
   category_id   BIGINT NOT NULL FK→category.id ON DELETE CASCADE
   limit_cents   BIGINT NOT NULL DEFAULT 0
   UNIQUE (user_id, category_id)  -- один лимит на категорию в шаблоне
   ```

   - `Index("ix_plan_template_item_user_id", "user_id")`.
   - RLS: `ENABLE`+`FORCE`, `CREATE POLICY tenant_isolation_plan_template_item …`, `GRANT … TO budget_app` + `GRANT USAGE,SELECT ON SEQUENCE plan_template_item_id_seq TO budget_app`.
   - NB: новая схема (`limit_cents`) ≠ старая дропнутая (`amount_cents, day_of_period, sort_order`). Это новая таблица с тем же именем — downgrade просто дропает.

2. **`plan_template_line`** (НОВОЕ; повторяющиеся строки шаблона):

   ```
   id            BIGSERIAL PK
   user_id       BIGINT NOT NULL FK→app_user.id ON DELETE RESTRICT
   category_id   BIGINT NOT NULL FK→category.id ON DELETE CASCADE
   title         TEXT NOT NULL
   amount_cents  BIGINT NOT NULL
   day_of_period SMALLINT NULL          -- 1..31; clamp в дату через _clamp_planned_date
   kind          actualkind NOT NULL    -- семантически {expense, income}
   CHECK (day_of_period IS NULL OR day_of_period BETWEEN 1 AND 31)  ck_tpl_line_day
   ```

   - `Index("ix_plan_template_line_user_cat", "user_id", "category_id")`.
   - Переиспользуем существующий PG enum `actualkind` (`PgEnum(..., create_type=False)`).
   - RLS как выше (`tenant_isolation_plan_template_line`).

3. **`period_category_plan`** (НОВОЕ; per-period снапшот лимита):
   ```
   id            BIGSERIAL PK
   user_id       BIGINT NOT NULL FK→app_user.id ON DELETE RESTRICT
   period_id     BIGINT NOT NULL FK→budget_period.id ON DELETE CASCADE
   category_id   BIGINT NOT NULL FK→category.id ON DELETE CASCADE
   limit_cents   BIGINT NOT NULL DEFAULT 0
   UNIQUE (period_id, category_id)  uq_period_category_plan
   ```

   - `Index("ix_period_category_plan_user_period", "user_id", "period_id")` (под hot-read из `compute_balance`).
   - RLS: `tenant_isolation_period_category_plan` + grants.

### 0029 — `planned_transaction.posted_txn_id` (мост план↔факт; G1)

`down_revision = "0028"`

- `ADD COLUMN posted_txn_id BIGINT NULL` на `planned_transaction`, FK→`actual_transaction.id` **ON DELETE SET NULL** (зеркало `Subscription.posted_txn_id`, `models.py:555`).
- Partial unique для идемпотентности (зеркало `uq_subscription_posted_txn_id` из 0025):
  ```
  CREATE UNIQUE INDEX uq_planned_posted_txn_id ON planned_transaction (posted_txn_id)
  WHERE posted_txn_id IS NOT NULL;
  ```
  — гарантирует, что один actual не привязан к двум planned-строкам; belt-and-braces для post-гонки.
- `planned_transaction` **уже под RLS** (создана в 0001, ENABLE в 0006) — новая колонка автоматически в скоупе, доп. policy не нужна.
- Downgrade: drop index → drop column.

### 0030 — Balance adjustment (H)

`down_revision = "0029"`

**Решение: запись-корректировка `actual_transaction` (НЕ `app_user.balance_adjustment_cents`).** Без новой колонки/enum-значения — переиспользуем существующую инфраструктуру.

- **Не вводим новый enum-kind `adjustment`** (это потребовало бы `ALTER TYPE actualkind ADD VALUE`, ломало бы `compute_balance` фильтр `kind IN {expense,income}`, `by_category`-схему `Literal['expense','income']` и тесты).
- Вместо этого корректировка — это **обычный `actual_transaction`** с `kind ∈ {income|expense}` (знак = `реальный − расчётный`), `category_id` = системная категория-маркер, `source=mini_app`, `description='Корректировка остатка'`, `account_id`=primary.
- Чтобы корректировка **не искажала план/факт по категориям**, нужна системная категория `code='adjustment'` (kind=expense, `plan_cents=0`), которую `compute_balance` исключает наряду с `savings`. **Миграция 0030:**
  - data-only: для каждого существующего юзера сидим системную категорию `code='adjustment', name='Корректировка', kind=expense, ord='98', plan_cents=0, sort_order=98` (idempotent на `(user_id, code)`), если её нет. (Новые юзеры получают её в onboarding — см. §3.7.)
  - Никаких новых таблиц/колонок — чисто backfill системной категории.
- Альтернатива (отвергнута): `app_user.balance_adjustment_cents BIGINT DEFAULT 0`. Проще в расчёте (`balance_now += adj`), но **невидима в реестре** и необратима по записям — владелец в H явно хочет «явную запись, обратимо, видно в истории». Запись-actual удовлетворяет этому без накопительного offset.

> **Обоснование выбора (H):** запись-actual = (1) видна в реестре `GET /actual`, (2) обратима стандартным `DELETE /actual/{id}` + restore balance через `delete_actual_v10`, (3) корректно двигает `balance_now_cents` (т.к. он = `starting + Σincome − Σexpense` по факту), (4) не требует ALTER TYPE и не трогает контракт `compute_balance`. Системная `adjustment`-категория держит её вне план/факт-ладдера.

### 0031 — REMOVALS (выпиливание savings + paused + rollover; G1/G3/G4)

`down_revision = "0030"`. **Делаем removals последней ревизией** — после того как planning-фичи и reconcile приземлились (упрощает review и rollback; данные savings — data-loss).

- **Savings tables (G1):**
  - `DROP TABLE savings_config` (PK=user_id; CASCADE с user, своя RLS — drop policy + disable + drop table).
  - `DROP TABLE goal` (FK→app_user RESTRICT; drop policy `tenant_isolation_goal`, drop index `ix_goal_user_id`, drop table).
  - `category_embedding` НЕ трогаем (это AI, не savings).
- **Savings-связанные actual-данные:** строки `actual_transaction.kind IN ('roundup','deposit')` остаются в БД (исторические факты). **НЕ дропаем enum-значения** `roundup`/`deposit` из `actualkind` (PG не умеет `DROP VALUE`; и удаление сломало бы старые rows). Они просто перестают создаваться (roundup-hook и rollover-savings-branch удаляются на уровне сервиса, §3.6). `compute_balance` уже их исключает.
- **`category.paused` (G3):** `DROP CONSTRAINT` нет (paused — обычный bool), `op.drop_column("category", "paused")`. Перед drop — ничего не нужно (значение игнорируется). Сервисы, читающие `cat.paused` (`rollover.py:184`), удаляются в §3.6.
- **`category.rollover` (G4):** `op.drop_constraint("ck_category_rollover_enum", "category", type_="check")` → `op.drop_column("category", "rollover")`. (Enum `RolloverPolicy` в Python удаляем из models.)
- **`category.code='savings'` system row:** оставляем (исторические deposit/roundup ссылаются на неё через `category_id` FK RESTRICT — нельзя дропнуть). Просто перестаёт быть исключением в новом `compute_balance`? — НЕТ, **оставляем исключение** `code='savings'` в `compute_balance` (там лежат deposit/roundup, которые не должны попадать в expense-план). Категория становится «мёртвой, но не удаляемой».
- **RLS-audit тест:** убрать `goal`, `savings_config` из `TENANT_TABLES` (`tests/test_rls_audit.py:37-38`); добавить `plan_template_item`, `plan_template_line`, `period_category_plan`.
- Downgrade 0031: best-effort re-create `goal`/`savings_config` структуры + RLS (данные не восстанавливаются), re-add `category.paused`/`category.rollover` (default-значения).

> **Migration ordering rationale:** ADD-фичи (0028-0030) до REMOVALS (0031). Если CI на 0031 краснеет (тесты savings/accounts), planning-фичи уже смёржены и тестируемы независимо. Каждая ревизия проходит `make migration-roundtrip` (upgrade→downgrade→upgrade).

---

## 2. Model changes (`app/db/models.py`)

**ADD:**

- `class PlanTemplateItem(Base)` — `id, user_id(FK app_user RESTRICT), category_id(FK category CASCADE), limit_cents`. `UniqueConstraint("user_id","category_id")` + `Index ix_plan_template_item_user_id`.
- `class PlanTemplateLine(Base)` — `id, user_id, category_id, title(Text), amount_cents, day_of_period(SmallInteger nullable), kind(PgEnum actualkind create_type=False)`. CHECK день 1..31. `Index ix_plan_template_line_user_cat`.
- `class PeriodCategoryPlan(Base)` — `id, user_id, period_id(FK budget_period CASCADE), category_id(FK category CASCADE), limit_cents`. `UniqueConstraint("period_id","category_id", name="uq_period_category_plan")` + index.
- `PlannedTransaction.posted_txn_id: Mapped[Optional[int]]` → `ForeignKey("actual_transaction.id", ondelete="SET NULL")`, nullable. Relationship `posted_txn` (foreign_keys=`PlannedTransaction.posted_txn_id`). Добавить partial unique в `__table_args__`:
  `Index("uq_planned_posted_txn_id","posted_txn_id",unique=True, postgresql_where=text("posted_txn_id IS NOT NULL"))`.

**REMOVE:**

- `Category.paused` (`models.py:313-315`), `Category.rollover` (`models.py:305-310`) + `CheckConstraint ck_category_rollover_enum` (`models.py:367-370`).
- `class RolloverPolicy` enum (`models.py:95-108`) — удалить (или оставить как dead-enum? удалить, никто не использует после §3.6).
- `class Goal` (`models.py:942`), `class SavingsConfig` (`models.py:982`).
- Обновить module docstring (`models.py:14-23`) — убрать упоминания goal/savings_config/rollover/paused.

**KEEP:** `Account` (single primary), `ActualTransaction.account_id`, `Category.is_archived`, `ActualKind` enum целиком (roundup/deposit остаются valid для исторических rows).

---

## 3. Services

### 3.1 `apply_template_to_period` — переписать (`planned.py:330`)

Сигнатура та же. Новая логика (идемпотентна):

```
def apply_template_to_period(db, *, user_id, period_id):
    period = _get_period_or_404(...)
    # idempotency: если в period уже есть period_category_plan → no-op
    if EXISTS(period_category_plan WHERE period_id) : return {created:0, ...}
    # 1. лимиты: plan_template_item → period_category_plan (limit_cents)
    for item in plan_template_item WHERE user_id:
        INSERT period_category_plan(user_id, period_id, item.category_id, item.limit_cents)
    # 2. строки: plan_template_line → planned_transaction(source=manual, kind, amount, description=title,
    #            planned_date = _clamp_planned_date(period, line.day_of_period))
    for line in plan_template_line WHERE user_id:
        INSERT planned_transaction(... source=PlanSource.manual ... posted_txn_id=NULL)
    # 3. активные подписки → planned_transaction(source=subscription_auto) через add_subscription_to_period
    #    (уже делается в close_period.py:250-264 — НЕ дублировать; см. ниже)
    return {period_id, created, planned:[...]}
```

- **Идемпотентность через `period_category_plan` existing-check** (вместо старого `source=template`-check, т.к. `PlanSource.template` мы не пишем; строки шаблона приземляются как `manual`).
- `_clamp_planned_date` (`planned.py:118`) уже есть — переиспользуем.
- **Подписки:** `close_period.py:250-264` уже добавляет subscription planned-rows для нового периода. Чтобы не дублировать и не задвоить, `apply_template_to_period` **НЕ трогает подписки** — оставляем материализацию подписок в close_period. (В RESEARCH §4 G5: rollup всё равно исключает `subscription_auto`.)
- **Wire-in:** вызвать `apply_template_to_period(session, user_id, new_period.id)` в `close_period.py` **после** `session.flush()` создания `new_period` (после строки `close_period.py:195`), но порядок с подписками не важен (они в разных source). Также — кнопка «применить шаблон заново» в Плане месяца дёргает существующий route `POST /periods/{id}/apply-template` (`routes/planned.py:132`), который теперь делает реальную работу.

### 3.2 Post planned → actual (зеркало `post_subscription`) — НОВОЕ в `services/planned.py`

```
class PlannedAlreadyPostedError(Exception): ...   # → 409 (posted_txn_id IS NOT NULL)
class PlannedNotPostedError(Exception): ...        # → 404 (posted_txn_id IS NULL)

async def post_planned(db, planned_id, *, user_id, tx_date: date) -> ActualTransaction:
    row = SELECT planned WHERE id=planned_id AND user_id FOR UPDATE   # serialise post-гонку
    if row is None: raise PlannedNotFoundError
    if row.source == subscription_auto: raise SubscriptionPlannedReadOnlyError  # подписки постятся через свой /post
    if row.posted_txn_id is not None: raise PlannedAlreadyPostedError(...)
    # резолв primary-счёта (G §10 — primary по умолчанию)
    primary = await get_primary_account(db, user_id=user_id)   # accounts.py:408
    account_id = primary.id if primary else None
    sign = -abs(row.amount_cents) if row.kind == ActualKind.expense else abs(row.amount_cents)
    parent, _ = await create_actual_v10(
        db, user_id=user_id, kind=row.kind.value, amount_cents=sign,
        description=row.description or "План",
        category_id=row.category_id, tx_date=tx_date,
        source=ActualSource.mini_app, account_id=account_id)
    row.posted_txn_id = parent.id
    flush (IntegrityError on uq_planned_posted_txn_id → PlannedAlreadyPostedError)
    return parent

async def unpost_planned(db, planned_id, *, user_id) -> None:
    row = SELECT planned WHERE id, user_id
    if row.posted_txn_id is None: raise PlannedNotPostedError
    txn_id = row.posted_txn_id; row.posted_txn_id = None; flush
    await delete_actual_v10(db, txn_id, user_id=user_id)   # restore balance

async def post_planned_batch(db, planned_ids: list[int], *, user_id, tx_date: date | None) -> dict:
    # tx_date None → каждая строка на свою planned_date (fallback today если NULL); иначе общая дата (B F: «провести всё на одну дату»)
    created, skipped = [], []
    for pid in planned_ids:
        try:
            d = tx_date or (planned_row.planned_date or _today_in_app_tz())
            txn = await post_planned(db, pid, user_id=user_id, tx_date=d)
            created.append(txn.id)
        except PlannedAlreadyPostedError: skipped.append(pid)
    return {"posted": created, "skipped": skipped}
```

- Семантика дат (решение A.3 / B.F): одиночный `post_planned` принимает явный `tx_date`; batch — `tx_date=None` ⇒ per-line `planned_date` (или today), иначе общая дата на пакет.
- Income vs expense: знак суммы по `row.kind` (expense → отрицательный, income → положительный), как в `post_subscription` (`subscriptions.py:431`).
- `_today_in_app_tz` импортируем из `services.periods` (как в `subscriptions.py:396`).

### 3.3 `compute_balance` изменения (`actual.py:378`)

Цель (RESEARCH §4 G5, AGREED §B/§C): лимит из `period_category_plan` per-period; добавить агрегат «запланировано (manual, unposted)»; не задвоить подписки; income-план.

- **Источник лимита:** заменить чтение `Category.plan_cents` (`actual.py:519-525`) на LEFT JOIN `period_category_plan WHERE period_id=period_id` per category. Fallback: если для периода нет `period_category_plan`-строки (период до apply-template) → `Category.plan_cents` (backward-compat, чтобы не сломать существующие периоды/тесты). Исключение `code='savings'` и `code='adjustment'` сохраняем.
- **Новый агрегат `planned_unposted_cents` per (category_id, kind):**
  ```
  SELECT category_id, kind, SUM(abs(amount_cents))
  FROM planned_transaction
  WHERE user_id AND period_id
    AND posted_txn_id IS NULL                 -- ещё не проведено
    AND source != 'subscription_auto'         -- G5: не задваивать подписки
  GROUP BY category_id, kind
  ```
  Добавить в `by_category[*]` поле `planned_unposted_cents` (новое) рядом с `planned_cents`(=лимит)/`actual_cents`/`delta_cents`. Это «Расписано» из ладдера (RESEARCH §3 Шаг 2).
- **Income-план:** оставить `planned_total_income_cents = AppUser.income_cents` (без изменений; per-income-category planning через planned_transaction kind=income отражается в `planned_unposted_cents`, но не в total income plan — income-категории CRUD приходят отдельно, см. §4).
- `balance_now_cents` без изменений (actuals-based; корректировка-actual из H уже учтена, т.к. это обычный expense/income).
- **Контракт:** добавление поля `planned_unposted_cents` в `BalanceCategoryRow` — нерушащее (additive). Default 0 для категорий без planned-строк.

### 3.4 Per-period limit мутация — расширить/новый сервис

`PATCH /plan-month` (`plan_month.py:61`) сейчас пишет в `Category.plan_cents`. Решение (AGREED B: «План на месяц правится локально, в шаблон не возвращается»):

- **Новый сервис `update_period_plan_atomic(db, *, user_id, period_id, plans: list[(category_id, limit_cents)])`** — пишет в `period_category_plan` (UPSERT на `(period_id, category_id)`). Та же валидация cross-tenant категорий (как `plan_month.py:95-108`). `Σplan ≤ income` — оставить как **мягкое** для детализации, но для лимитов сохранить hard-check (решение A.8: лимит=потолок касается детализации, не Σлимитов≤доход).
- **Шаблонный лимит:** новый сервис `upsert_template_item(db,*,user_id,category_id,limit_cents)` + `list_template_items` пишут в `plan_template_item`.
- `Category.plan_cents` остаётся для backward-compat read-fallback в `compute_balance`, но `PATCH /plan-month` можно (a) оставить как есть (пишет plan_cents — текущий период «живой»), либо (b) перенаправить на period_category_plan текущего периода. **Рекомендация:** оставить `/plan-month`→`plan_cents` как «быстрый лимит текущего периода» для совместимости с уже работающим web Plan-редактором (RESEARCH §1a), а `period_category_plan` использовать для apply-template/snapshot. Если расхождение нежелательно — мигрировать web на `/periods/{id}/plan` позже (фаза Web UI).

### 3.5 Balance reconcile сервис (H) — НОВОЕ `services/actual.py` или новый `services/reconcile.py`

```
async def reconcile_balance(db, *, user_id, target_balance_cents: int) -> ActualTransaction | None:
    cur = await compute_balance(db, current_active_period_id, user_id=user_id)
    delta = target_balance_cents - cur["balance_now_cents"]
    if delta == 0: return None
    adj_cat = SELECT category WHERE user_id AND code='adjustment'   # сидится в onboarding/0030
    kind = 'income' if delta > 0 else 'expense'
    amount = delta if delta > 0 else delta   # income положит., expense отрицат.; для expense храним delta(<0)
    primary = await get_primary_account(db, user_id=user_id)
    parent,_ = await create_actual_v10(db, user_id=user_id, kind=kind,
        amount_cents=(abs(delta) if kind=='income' else -abs(delta)),
        description='Корректировка остатка', category_id=adj_cat.id,
        tx_date=_today_in_app_tz(), source=ActualSource.mini_app,
        account_id=primary.id if primary else None)
    return parent
```

- После записи `balance_now_cents` станет == target (т.к. balance = starting + Σincome − Σexpense). Обратимость — `DELETE /actual/{id}`.
- Резолв «current active period» — через `_resolve_period_for_date(today)` внутри `create_actual_v10`.

### 3.6 Removals на уровне сервисов

- **roundup:** удалить вызов `maybe_create_roundup_child` из `create_actual_v10` (`actual.py:733-736`) → child всегда None. Удалить `services/roundup.py`. Убрать `roundup`/`deposit` создание; исторические rows остаются.
- **rollover savings-branch:** в `rollover.py` удалить весь `if cat.rollover == RolloverPolicy.savings` блок (`rollover.py:213-270`) и чтение `cat.paused` (`rollover.py:184`). С уходом `rollover`/`paused` полей **весь `do_period_rollover` становится либо no-op, либо только misc**. Решение (AGREED G4: «с уходом накоплений rollover бессмысленно»): **удалить `services/rollover.py` целиком** + вызов в `close_period.py:205-264` (шаги 5/5b). `budget_period.misc_rollover_cents`/`rollover_processed_at` колонки можно оставить (не мешают) или дропнуть отдельной ревизией — **оставляем** (вне скоупа, не ломает). Обновить `close_period._close_period_for_user`: убрать rollover, оставить close+create+subscriptions+`apply_template_to_period`.
- **savings service/routes:** удалить `services/savings.py`, `services/goals.py`, `routes/savings.py`, `routes/goals.py`; снять их `include_router` из `app/api/router.py` (`router.py:55,59`).
- **accounts management (G2):** оставить `services/accounts.py` (нужен `get_primary_account`, `apply_balance_delta`, `create_account` для onboarding). **Удалить только API-роуты управления** (см. §4) — экраны Счета/детали/перевод. Primary-резолв авто в post/create/reconcile.
- **paused usages:** grep `\.paused` по `app/` — только `rollover.py:184` и onboarding savings-seed; оба удаляются.

### 3.7 Onboarding изменения (`services/onboarding_v10.py`)

- Удалить savings-seed: `_upsert_savings_category` savings-config (`onboarding_v10.py:356-395, 545-547`), Goal-create (`onboarding_v10.py:518-543`), `savings_config`-аргумент. Удалить `paused=True`/`rollover='savings'` из savings-категории (категория больше не сидится).
- **Оставить** seed primary `Account` (`onboarding_v10.py:497` `is_primary=(idx==primary_idx)`) и стартовый баланс (AGREED G2: «онбординг продолжает спрашивать стартовый баланс»).
- **Добавить** seed системной `adjustment`-категории (`code='adjustment', name='Корректировка', kind=expense, ord='98', plan_cents=0`) — idempotent, mirrors 0030 backfill.
- Убрать `rollover=RolloverPolicy.misc`/`paused=False` из обычных категорий (`onboarding_v10.py:336-349`) — поля удалены.

---

## 4. API endpoints — NEW / CHANGED / REMOVED

### NEW

| Method | Path                                                      | Request (Pydantic)                                                       | Response                                                                                      |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/template/items`                                  | —                                                                        | `list[TemplateItemRead{category_id, limit_cents}]`                                            |
| PUT    | `/api/v1/template/items/{category_id}`                    | `{limit_cents:int≥0}`                                                    | `TemplateItemRead`                                                                            |
| GET    | `/api/v1/template/lines`                                  | `?category_id=`                                                          | `list[TemplateLineRead{id,category_id,title,amount_cents,day_of_period,kind}]`                |
| POST   | `/api/v1/template/lines`                                  | `TemplateLineCreate{category_id,title,amount_cents,day_of_period?,kind}` | `TemplateLineRead`                                                                            |
| PATCH  | `/api/v1/template/lines/{id}`                             | `TemplateLineUpdate` (partial)                                           | `TemplateLineRead`                                                                            |
| DELETE | `/api/v1/template/lines/{id}`                             | —                                                                        | 204                                                                                           |
| GET    | `/api/v1/periods/{id}/plan`                               | —                                                                        | `list[PeriodPlanRow{category_id,limit_cents}]` (из period_category_plan, fallback plan_cents) |
| PATCH  | `/api/v1/periods/{id}/plan`                               | `{plans:[{category_id,limit_cents}]}`                                    | `{plans:[...]}` (UPSERT period_category_plan)                                                 |
| POST   | `/api/v1/periods/{id}/planned/{pid}/post`                 | `{tx_date:date}`                                                         | `PlannedPostResponse{txn_id, planned_id, posted_at}`                                          |
| POST   | `/api/v1/periods/{id}/planned/{pid}/unpost`               | —                                                                        | 204                                                                                           |
| POST   | `/api/v1/periods/{id}/planned/post-batch`                 | `{planned_ids:[int], tx_date?:date}`                                     | `{posted:[int], skipped:[int]}`                                                               |
| POST   | `/api/v1/balance/reconcile` (или `/me/reconcile-balance`) | `{target_balance_cents:int}`                                             | `{adjustment_txn_id?:int, balance_now_cents:int}`                                             |

- **Income-category CRUD** уже покрыт существующим `routes/categories.py` (`POST/PATCH /categories` принимают `kind`). Подтвердить, что `kind=income` категории создаются/листятся — **да** (модель `Category.kind` 2-valued). Доп. эндпоинты не нужны; нужен лишь UI-сегмент Расход/Доход.
- **Planned CRUD wrapper** уже существует (`routes/planned.py`: GET/POST/PATCH/DELETE) — подтверждено, новые роуты только post/unpost/batch.
- Маппинг исключений: `PlannedAlreadyPostedError`→409, `PlannedNotPostedError`→404, `SubscriptionPlannedReadOnlyError`→400, `PlannedNotFoundError`/`PeriodNotFoundError`→404 (как в `routes/subscriptions.py:274-352`).
- Все новые роуты — под `Depends(get_current_user)`+`require_onboarded`+`get_db_with_tenant_scope`+`get_current_user_id` (паттерн `routes/planned.py:58-61`).

### CHANGED

- `compute_balance` response (`GET /periods/{id}/balance`, `routes/actual.py:227`): `by_category[*]` += `planned_unposted_cents` (additive).
- `routes/subscriptions.py` `/{id}/post` — опционально прокинуть `tx_date` в body (сейчас зашит today, `subscriptions.py:440`). Для слияния подписок и planned в одну поверхность (A.7) — желательно дать подпискам тот же выбор даты. Минимально: оставить today (не блокер).
- `apply-template` route (`routes/planned.py:132`) — теперь делает реальную работу (тело сервиса §3.1).
- `create_actual` / planned post — `account_id` авто-резолвится в primary, если не передан (G §10): добавить fallback `get_primary_account` в `create_actual_v10`-вызовах post-флоу (post_subscription уже требует `sub.account_id`; для planned post — резолвим primary).

### REMOVED

- `routes/savings.py` (весь `savings_router`: `GET /savings`, `PATCH /savings/config`, `POST /savings/deposit`) — снять `include_router`.
- `routes/goals.py` (весь `goals_router`: list/create/update/delete) — снять `include_router`.
- `routes/accounts.py`: удалить mutating-роуты `POST /accounts`, `PATCH /accounts/{id}`, `DELETE /accounts/{id}`, `POST /accounts/{id}/set-primary` (`accounts.py:57,81,113,154`). **Оставить** `GET /accounts` (read единственного баланса) ИЛИ заменить на `GET /me` balance-поле. Минимально — оставить `GET /accounts` (read-only), убрать управление.
- `routes/templates.py` (deprecated 410-заглушки) — **удалить router** и заменить новым template-роутером (§4 NEW). Снять старый `templates_router` include (`router.py:77`), добавить новый.

---

## 5. Test plan (pytest)

### NEW / UPDATE (add)

- `tests/services/test_apply_template.py` (есть `tests/test_apply_template.py` — переписать): apply копирует `plan_template_item`→`period_category_plan` + `plan_template_line`→`planned_transaction(manual)` с `planned_date` из `day_of_period`; идемпотентность (повторный вызов created=0); не дублирует подписки.
- `tests/services/test_planned_post.py` (НОВЫЙ): `post_planned` создаёт actual со знаком по kind, ставит `posted_txn_id`, двигает balance; `unpost_planned` удаляет actual + restore; idempotency 409; cross-tenant 404; subscription_auto → read-only; income vs expense знак; primary-резолв.
- `tests/services/test_post_planned_batch.py` (НОВЫЙ): per-line date vs общая дата; skipped для уже проведённых.
- `tests/services/test_reconcile.py` (НОВЫЙ): reconcile создаёт adjustment-actual так, что `balance_now == target`; delta=0 → no-op; обратимость через delete.
- `tests/test_balance.py` (UPDATE): `planned_unposted_cents` в `by_category`; лимит из `period_category_plan` с fallback на `plan_cents`; исключение `code='adjustment'` из плана; исключение `subscription_auto` из planned-агрегата (анти-задвоение).
- `tests/api/test_template_api.py` (НОВЫЙ): CRUD template items/lines.
- `tests/api/test_period_plan_api.py` (НОВЫЙ): GET/PATCH `/periods/{id}/plan` UPSERT.
- `tests/api/test_planned_post_api.py` (НОВЫЙ): post/unpost/batch HTTP-статусы.
- `tests/jobs/test_close_period_rollover.py` (UPDATE→rename): rollover удалён; проверить close+create+`apply_template_to_period` wire-in; убрать savings-rollover ассерты.
- `tests/test_rls_audit.py` / `tests/test_rls_policy.py` (UPDATE): `TENANT_TABLES` += `plan_template_item, plan_template_line, period_category_plan`; −= `goal, savings_config`.
- `tests/test_migrations_v1_0.py` / `tests/test_migrations.py` (UPDATE): новые ревизии 0028-0031 в roundtrip; head обновлён.
- `tests/test_openapi_contract.py` (UPDATE): новые/удалённые роуты в openapi.

### BREAK (удаление сломает — нужно удалить/переписать тесты)

- `tests/api/test_savings_api.py`, `tests/services/test_savings.py`, `tests/services/test_roundup.py`, `tests/test_roundup.py` (если есть) — **удалить** (savings выпилен).
- `tests/api/test_goals_api.py`, `tests/services/test_goals.py` — **удалить**.
- `tests/api/test_accounts_api.py`, `tests/services/test_accounts.py` — **обрезать**: убрать кейсы create/update/delete/set-primary роутов; оставить `get_primary_account`/`apply_balance_delta`/`list`.
- `tests/services/test_onboarding_v10.py`, `tests/test_onboarding*.py`, `tests/api/test_onboarding_v10_api.py` — **обновить**: убрать savings_config/goal/savings-category ассерты; добавить adjustment-категорию seed; убрать `paused`/`rollover` поля.
- `tests/test_close_period_job.py`, `tests/jobs/test_close_period_rollover.py` — убрать rollover-savings/misc-deposit ассерты.
- `tests/test_categories.py`, `tests/api/test_categories_v10_patch.py`, `tests/test_multitenancy_v1_0_columns.py`, `tests/test_migration_backfill.py` — убрать `paused`/`rollover` колонки.
- `tests/test_account_deletion.py`, `tests/test_data_export.py`, `tests/test_csv_export.py` — проверить ссылки на goal/savings_config/deposit (data_export может включать savings — обрезать).
- `tests/services/test_subscriptions_post.py`, `tests/api/test_subscriptions_post_api.py` — без изменений (подписочный post остаётся), но если меняем `tx_date` в body — обновить.

---

## 6. Risks / order / gotchas

1. **RLS на новых таблицах — обязательно.** Без `ENABLE`+`FORCE ROW LEVEL SECURITY` + policy + `GRANT … TO budget_app` новые таблицы будут (a) cross-tenant дырой или (b) пустыми под `budget_app`-ролью (default-deny). `tests/test_rls_audit.py` поймает отсутствие FORCE; добавить новые таблицы в `TENANT_TABLES`. Sequence-grant (`GRANT USAGE,SELECT ON SEQUENCE …_id_seq`) обязателен для BIGSERIAL под `budget_app` (паттерн 0013:303).
2. **`set_tenant_scope` transaction-scoped** (`SET LOCAL`) — все новые сервисы должны вызываться внутри запроса, где route уже сделал `get_db_with_tenant_scope`. Worker (`close_period`) сам ставит `set_tenant_scope(session, user_id)` (`close_period.py:126`) — `apply_template_to_period` wire-in внутри этого скоупа, OK.
3. **Анти-задвоение подписок (G5)** — критично: `planned_unposted_cents` ДОЛЖЕН исключать `source=subscription_auto` И `posted_txn_id IS NOT NULL`. Иначе подписка считается и как planned, и как actual после проведения. Тест обязателен.
4. **Migration ordering:** 0028 (ADD planning) → 0029 (posted_txn_id) → 0030 (adjustment backfill) → 0031 (REMOVALS). REMOVALS последними. Каждая — `make migration-roundtrip`. `actualkind` enum **не трогаем** (no DROP VALUE).
5. **`code='savings'` категорию нельзя дропнуть** (FK RESTRICT от исторических deposit/roundup `actual_transaction.category_id`). Оставляем как мёртвую, сохраняем её исключение в `compute_balance`.
6. **`compute_balance` fallback:** периоды, созданные ДО apply-template, не имеют `period_category_plan`-строк → fallback на `Category.plan_cents`, иначе все старые балансы обнулятся. Тест на оба пути.
7. **Контракт-регенерация:** после изменений запустить `make contract` (live docker-api → `contract/openapi.json` → web `schema.ts` + iOS `GeneratedDTO.swift`) и закоммитить все 3 артефакта. `make contract-check` в CI краснеет при дрейфе. `tests/test_openapi_contract.py` сверяет роуты.
8. **CI-зелёность:** основные источники красноты — (a) удалённые savings/goals/accounts тесты, (b) `paused`/`rollover` колоночные тесты, (c) RLS-audit table-list, (d) контракт-дрейф, (e) onboarding-ассерты на savings-seed. Все перечислены в §5 BREAK — обработать в той же PR, что и removals (0031), чтобы не оставлять CI красным между ревизиями.
9. **`balance_adjustment` выбор (H):** запись-actual через `adjustment`-категорию (не enum-kind, не user-колонка) — обоснование в §1/0030. Минимизирует blast-radius на `compute_balance`/контракт.
10. **`include_router` чистка** (`app/api/router.py`): снять savings/goals/templates(старый); добавить новый template-router + planned-post роуты (планед-роутер уже включён — добавить эндпоинты в него же). Забытый include → 404 на новых роутах или мёртвый savings-роут в openapi.

---

## Порядок исполнения (top-to-bottom)

1. Migrations 0028 → 0029 → 0030 (ADD + bridge + adjustment backfill); roundtrip каждую.
2. Models: ADD PlanTemplateItem/PlanTemplateLine/PeriodCategoryPlan + `PlannedTransaction.posted_txn_id`.
3. Services: `apply_template_to_period` rewrite; `post_planned`/`unpost_planned`/`post_planned_batch`; `update_period_plan_atomic`; template-item/line сервисы; `reconcile_balance`; `compute_balance` правки (лимит per-period + planned_unposted + adjustment-исключение).
4. Routes: template CRUD, period plan, planned post/unpost/batch, reconcile; обновить `apply-template`; `include_router` новых.
5. Wire-in `apply_template_to_period` в `close_period`.
6. Migration 0031 (REMOVALS) + удаление savings/goals/rollover/roundup сервисов и роутов; onboarding правки (убрать savings, добавить adjustment-seed); accounts-management роуты убрать.
7. Tests: add (§5 NEW) + fix/delete (§5 BREAK); RLS-audit table-list.
8. `make contract` + commit 3 артефактов; `make contract-check`; полный `pytest`.
