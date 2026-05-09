"""v1.0 actualkind enum + parent_txn_id + goal + savings_config + subscription ext (Phase 22 BE-06, BE-08, BE-11, BE-12)

Revision ID: 0014_v10_actual_goal_savings
Revises: 0013_v10_category_ext
Create Date: 2026-05-10

Phase 22 atomic migration #3 of 4 (CONTEXT D-01).

Enum migration (CONTEXT §Area 2):
  - RENAME TYPE categorykind → actualkind (used by actual_transaction +
    planned_transaction columns).
  - ADD VALUE 'roundup', 'deposit' to actualkind. PostgreSQL prohibits
    ALTER TYPE ADD VALUE inside a transaction block, поэтому весь блок
    обёрнут в `op.get_context().autocommit_block()` (BE-06).
  - CREATE TYPE category_kind ('expense', 'income') и migrate
    Category.kind to it. Category.kind остаётся 2-valued; only
    ActualTransaction.kind становится 4-valued.

NOTE on PlannedTransaction.kind: после rename её колонка тоже ссылается
на `actualkind` (перейменованный type). Application-layer Pydantic
validators отвергают 'roundup'/'deposit' для planned txns — DB enum
permissive, но service-layer никогда туда такие значения не пишет.
BE-06 scope: roundup/deposit — actual-only. ORM enum (CategoryKind)
остаётся 2-valued; маппинг к 4-valued PG enum допустим, поскольку
SQLAlchemy не валидирует выходящие значения сверх ORM enum при чтении
(plan 22.05 разделит ORM на CategoryKind=2 vs ActualKind=4).

Schema additions:
  - actual_transaction.parent_txn_id BIGINT NULL → FK actual_transaction.id
    ON DELETE CASCADE (BE-06). Composite FK (parent_txn_id, user_id) →
    (id, user_id) лежит в миграции 0015 (нужна composite UNIQUE на
    actual_transaction; добавляем там же).
  - subscription.day_of_month INT2 NULL CHECK 1..28 (BE-12)
  - subscription.account_id BIGINT NULL FK account.id ON DELETE RESTRICT (BE-12)
  - subscription.posted_txn_id BIGINT NULL FK actual_transaction.id ON DELETE SET NULL (BE-12)
  - INDEX ix_subscription_user_day (user_id, day_of_month)
    WHERE day_of_month IS NOT NULL (BE-12 — PLAN-list query optimisation)
  - CREATE TABLE goal (BE-11) — RLS ENABLE здесь, policy в 0015
  - CREATE TABLE savings_config (BE-08, PK = user_id) — RLS ENABLE здесь,
    policy в 0015
  - budget_period.misc_rollover_cents BIGINT NOT NULL DEFAULT 0 (BE-14
    schema for plan 22.10 close_period rollover)
  - budget_period.rollover_processed_at TIMESTAMPTZ NULL (BE-14
    idempotency marker)
  - UNIQUE INDEX uq_period_rolled ON budget_period(id) WHERE
    rollover_processed_at IS NOT NULL — defensive против double-write
    race в close_period_job (CONTEXT §Area 3).

RLS policies для goal/savings_config + composite FK на parent_txn_id —
в migration 0015 (CONTEXT D-01 split rationale).

Downgrade is best-effort symmetric. ВНИМАНИЕ: downgrade удаляет колонки
и tables, но не может удалить enum-значения 'roundup'/'deposit' из
PostgreSQL enum (PG limitation). Любые actual_transaction rows с этими
kind вызовут type-cast failure при rename actualkind → categorykind.
Downgrade предназначен для dev reset, не для prod rollback после данных.

T-22-03-03 mitigation: ADD VALUE IF NOT EXISTS идемпотентен; partial
failure после rename (rename succeeded, value-add failed) можно
ретраить — повторный rename упадёт (type categorykind не существует),
но IF NOT EXISTS на values пройдёт мимо уже добавленных. В таком случае
рестартовать миграцию вручную с пропуском rename — задокументировано
в плане 22.16 e2e tests.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0014_v10_actual_goal_savings"
down_revision = "0013_v10_category_ext"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── Step 1: enum migration в autocommit_block ───
    # PostgreSQL запрещает ALTER TYPE ... ADD VALUE внутри транзакции
    # (см. https://www.postgresql.org/docs/16/sql-altertype.html).
    # autocommit_block размыкает альмбиковую транзакцию на этот блок —
    # каждая команда коммитится отдельно. Идемпотентность гарантирована
    # `IF NOT EXISTS` для ADD VALUE (T-22-03-03 mitigation).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE categorykind RENAME TO actualkind")
        op.execute("ALTER TYPE actualkind ADD VALUE IF NOT EXISTS 'roundup'")
        op.execute("ALTER TYPE actualkind ADD VALUE IF NOT EXISTS 'deposit'")

    # ─── Step 2: создаём category_kind enum для Category.kind ───
    # Category.kind должен оставаться 2-valued (только expense/income —
    # roundup/deposit семантически не относятся к категориям). Создаём
    # новый type и перетягиваем колонку через USING cast.
    op.execute("CREATE TYPE category_kind AS ENUM ('expense', 'income')")
    op.execute(
        "ALTER TABLE category ALTER COLUMN kind TYPE category_kind "
        "USING kind::text::category_kind"
    )

    # ─── Step 3: actual_transaction.parent_txn_id self-FK ───
    # ON DELETE CASCADE: при удалении parent expense — связанный roundup
    # child автоматически удаляется (DATA-MODEL §8 «txn.deleted»).
    # Composite FK (parent_txn_id, user_id) → (id, user_id) для
    # cross-tenant защиты — в migration 0015 (там же composite UNIQUE
    # на actual_transaction).
    op.add_column(
        "actual_transaction",
        sa.Column("parent_txn_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_actual_parent_txn",
        "actual_transaction",
        "actual_transaction",
        ["parent_txn_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Partial index на parent_txn_id (только для child-rows) — ускоряет
    # cascade-deletion lookups + queries по seek roundup-children.
    op.create_index(
        "ix_actual_parent_txn_id",
        "actual_transaction",
        ["parent_txn_id"],
        postgresql_where=sa.text("parent_txn_id IS NOT NULL"),
    )

    # ─── Step 4: subscription extension (BE-12) ───
    # day_of_month INT2 — день месяца для регулярки (1..28 — клампим
    # на февраль; для месяцев с 30/31 днями просто берём 28-й).
    op.add_column(
        "subscription",
        sa.Column("day_of_month", sa.SmallInteger(), nullable=True),
    )
    # CHECK constraint (T-22-03-04 mitigation): 1..28 inclusive.
    # NULL разрешён — для существующих subs (legacy) и для
    # subs без явного дня (fallback на next_charge_date).
    op.create_check_constraint(
        "ck_subscription_day_of_month",
        "subscription",
        "day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 28)",
    )
    # account_id — со счёта какого spend происходит. RESTRICT —
    # нельзя удалить account, если есть подписки, привязанные к нему.
    op.add_column(
        "subscription",
        sa.Column("account_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_subscription_account",
        "subscription",
        "account",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # posted_txn_id — если регулярка проведена в текущем месяце,
    # ссылка на actual_transaction. ON DELETE SET NULL — при удалении
    # txn регулярка просто становится "не проведённой" в этом месяце.
    op.add_column(
        "subscription",
        sa.Column("posted_txn_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_subscription_posted_txn",
        "subscription",
        "actual_transaction",
        ["posted_txn_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Partial index для PLAN-list query: subscriptions с явным
    # day_of_month отсортированы по (user_id, day_of_month) для
    # быстрой выборки на главной (DATA-MODEL §1.5).
    op.create_index(
        "ix_subscription_user_day",
        "subscription",
        ["user_id", "day_of_month"],
        postgresql_where=sa.text("day_of_month IS NOT NULL"),
    )

    # ─── Step 5: CREATE TABLE goal (BE-11) ───
    # PK = id BIGSERIAL (autoincrement). user_id FK ON DELETE RESTRICT —
    # нельзя удалить юзера с активными целями (требуется явный revoke
    # flow per Phase 13 pattern).
    # Length 1..80 на name + target > 0 — DATA-MODEL §6 валидаторы.
    op.create_table(
        "goal",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("target_cents", sa.BigInteger(), nullable=False),
        sa.Column(
            "current_cents",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("due", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "target_cents > 0",
            name="ck_goal_target_positive",
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80",
            name="ck_goal_name_length",
        ),
    )
    op.create_index("ix_goal_user_id", "goal", ["user_id"])
    # ENABLE RLS здесь — policy `tenant_isolation_goal` создаётся в 0015
    # (CONTEXT D-01 — все policies сводятся в финальную миграцию).
    op.execute("ALTER TABLE goal ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE goal FORCE ROW LEVEL SECURITY")
    # Explicit GRANT (idempotent) — защита от env с ручной ревокацией
    # default privileges. Pattern из 0007/0012.
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE goal TO budget_app")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE goal_id_seq TO budget_app")

    # ─── Step 6: CREATE TABLE savings_config (BE-08) ───
    # PK = user_id (одна конфигурация на пользователя — 1:1).
    # ON DELETE CASCADE: при revoke юзера config purge'ится автоматически
    # (T-22-03-07 — savings_config не критичная audit-data, можно дропать).
    # roundup_base CHECK ∈ {10, 50, 100} — DATA-MODEL §1.7
    # (T-22-03-05 mitigation).
    op.create_table(
        "savings_config",
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "roundup_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "roundup_base",
            sa.SmallInteger(),
            nullable=False,
            server_default="10",
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "roundup_base IN (10, 50, 100)",
            name="ck_savings_config_base_enum",
        ),
    )
    # ENABLE RLS здесь — policy `tenant_isolation_savings_config` в 0015.
    op.execute("ALTER TABLE savings_config ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE savings_config FORCE ROW LEVEL SECURITY")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE savings_config TO budget_app"
    )

    # ─── Step 7: budget_period rollover idempotency (BE-14 schema) ───
    # misc_rollover_cents — суммарный остаток "misc"-категорий, переносимый
    # в next period (DATA-MODEL §3 «Прочее» — но без отдельной категории,
    # просто колонка-агрегат на periode).
    op.add_column(
        "budget_period",
        sa.Column(
            "misc_rollover_cents",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    # rollover_processed_at — timestamp успешного завершения close_period
    # для этого periode. NULL = ещё не процессили; NOT NULL = уже сделано
    # (idempotency check в plan 22.10).
    op.add_column(
        "budget_period",
        sa.Column(
            "rollover_processed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    # UNIQUE INDEX uq_period_rolled — defensive против race: даже если
    # advisory lock дал сбой и два worker-инстанса попытались закрыть
    # один period, partial unique index не позволит обоим UPDATE'ам
    # оставить rollover_processed_at NOT NULL. (T-22-03-06 mitigation.)
    # Технически id уже PK (UNIQUE сам по себе), но partial UNIQUE INDEX
    # WHERE rollover_processed_at IS NOT NULL служит discriminator'ом
    # на DB-уровне для double-write race.
    op.create_index(
        "uq_period_rolled",
        "budget_period",
        ["id"],
        unique=True,
        postgresql_where=sa.text("rollover_processed_at IS NOT NULL"),
    )


def downgrade() -> None:
    """Best-effort symmetric downgrade.

    ⚠ Limitations:
      - Невозможно удалить enum-значения 'roundup'/'deposit' из PG type
        (нет SQL-команды DROP VALUE). Делаем только обратный RENAME
        actualkind → categorykind. Любые actual_transaction rows с
        kind ∈ {roundup, deposit} вызовут ошибку при последующем cast.
      - savings_config / goal данные теряются при drop_table.
      - rollover_processed_at теряется (UPDATE'ом не восстанавливается).

    Downgrade подходит для dev reset, не для prod rollback после данных.
    """
    # ─── Step 7 reverse: budget_period rollover columns + index ───
    op.drop_index("uq_period_rolled", table_name="budget_period")
    op.drop_column("budget_period", "rollover_processed_at")
    op.drop_column("budget_period", "misc_rollover_cents")

    # ─── Step 6 reverse: drop savings_config (включая type зависимости) ───
    op.execute("DROP POLICY IF EXISTS tenant_isolation_savings_config ON savings_config")
    op.execute("ALTER TABLE savings_config NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE savings_config DISABLE ROW LEVEL SECURITY")
    op.drop_table("savings_config")

    # ─── Step 5 reverse: drop goal ───
    op.execute("DROP POLICY IF EXISTS tenant_isolation_goal ON goal")
    op.execute("ALTER TABLE goal NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE goal DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_goal_user_id", table_name="goal")
    op.drop_table("goal")

    # ─── Step 4 reverse: subscription extension ───
    op.drop_index("ix_subscription_user_day", table_name="subscription")
    op.drop_constraint(
        "fk_subscription_posted_txn",
        "subscription",
        type_="foreignkey",
    )
    op.drop_column("subscription", "posted_txn_id")
    op.drop_constraint(
        "fk_subscription_account",
        "subscription",
        type_="foreignkey",
    )
    op.drop_column("subscription", "account_id")
    op.drop_constraint(
        "ck_subscription_day_of_month",
        "subscription",
        type_="check",
    )
    op.drop_column("subscription", "day_of_month")

    # ─── Step 3 reverse: actual_transaction.parent_txn_id ───
    op.drop_index("ix_actual_parent_txn_id", table_name="actual_transaction")
    op.drop_constraint(
        "fk_actual_parent_txn",
        "actual_transaction",
        type_="foreignkey",
    )
    op.drop_column("actual_transaction", "parent_txn_id")

    # ─── Step 2 reverse: revert category.kind to categorykind type ───
    # Сначала переводим Category.kind на NEW categorykind (после rename
    # actualkind → categorykind в Step 1 reverse). Делаем в два шага,
    # потому что category_kind type должен быть удалён ПОСЛЕ rename
    # actualkind, иначе у нас два разных type'а для одной enum-семантики.

    # ─── Step 1 reverse: rename actualkind → categorykind в autocommit_block ───
    # ALTER TYPE RENAME сам по себе не требует autocommit, но симметрия
    # с upgrade — оставляем block. Также если бы кто-то добавил DROP
    # VALUE (PG18+), это попало бы сюда.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE actualkind RENAME TO categorykind")

    # Now перетягиваем category.kind с category_kind обратно на
    # categorykind (теперь это renamed-обратно type), затем дропаем
    # промежуточный category_kind.
    op.execute(
        "ALTER TABLE category ALTER COLUMN kind TYPE categorykind "
        "USING kind::text::categorykind"
    )
    op.execute("DROP TYPE IF EXISTS category_kind")
