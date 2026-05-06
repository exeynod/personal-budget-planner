"""multitenancy: user_id FK + RLS + app_user.role + backfill

Revision ID: 0006_multitenancy
Revises: 0005_enable_ai_categorization
Create Date: 2026-05-07

Phase 11: Multi-Tenancy DB Migration & RLS (MUL-01..05, ROLE-01).

What this revision does (single atomic Alembic transaction):
  1. CREATE TYPE user_role AS ENUM ('owner', 'member', 'revoked')
  2. ALTER TABLE app_user ADD COLUMN role user_role NOT NULL DEFAULT 'member'
     + UPDATE app_user SET role = 'owner' WHERE tg_user_id = :owner_tg_id
  3. На 9 доменных таблицах: ADD COLUMN user_id BIGINT NULL (изначально)
  4. Backfill user_id = (SELECT id FROM app_user WHERE tg_user_id = :owner_tg_id)
  5. Sanity check: RAISE если в любой таблице остались user_id IS NULL
  6. На 9 доменных таблицах: ALTER COLUMN user_id SET NOT NULL
  7. ADD FOREIGN KEY user_id → app_user(id) ON DELETE RESTRICT (9 таблиц)
  8. Drop старого UNIQUE budget_period(period_start), CREATE NEW scoped uniques
  9. CREATE INDEX ix_<table>_user_id на 9 таблицах
  10. ENABLE/FORCE ROW LEVEL SECURITY + CREATE POLICY на 9 таблицах

Operational note: миграция требует downtime (~30 сек) — `docker compose stop
api bot worker; alembic upgrade head; docker compose start`.
"""
from __future__ import annotations

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006_multitenancy"
down_revision: Union[str, None] = "0005_enable_ai_categorization"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 9 доменных таблиц (scope multi-tenant). app_user, app_health — out of scope.
DOMAIN_TABLES: tuple[str, ...] = (
    "category",
    "budget_period",
    "plan_template_item",
    "planned_transaction",
    "actual_transaction",
    "subscription",
    "category_embedding",
    "ai_conversation",
    "ai_message",
)


def _resolve_owner_tg_id() -> int:
    """Read OWNER_TG_ID from env; fail loud if missing or zero."""
    raw = os.environ.get("OWNER_TG_ID", "").strip()
    if not raw:
        raise RuntimeError(
            "0006_multitenancy: OWNER_TG_ID env var must be set for backfill. "
            "Aborting migration to avoid leaving DB in inconsistent state."
        )
    try:
        owner_id = int(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"0006_multitenancy: OWNER_TG_ID={raw!r} is not an integer."
        ) from exc
    if owner_id == 0:
        raise RuntimeError(
            "0006_multitenancy: OWNER_TG_ID=0 (placeholder) — set real id."
        )
    return owner_id


def upgrade() -> None:
    owner_tg_id = _resolve_owner_tg_id()

    # ─── Phase 1: enum user_role + app_user.role + backfill owner role ───
    op.execute("CREATE TYPE user_role AS ENUM ('owner', 'member', 'revoked')")
    op.add_column(
        "app_user",
        sa.Column(
            "role",
            sa.Enum(
                "owner", "member", "revoked",
                name="user_role",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'member'::user_role"),
        ),
    )
    op.execute(
        sa.text(
            "UPDATE app_user SET role = 'owner' WHERE tg_user_id = :owner_tg_id"
        ).bindparams(owner_tg_id=owner_tg_id)
    )

    # ─── Phase 2: ADD COLUMN user_id BIGINT NULL на 9 доменных таблицах ───
    for table in DOMAIN_TABLES:
        op.add_column(
            table,
            sa.Column("user_id", sa.BigInteger(), nullable=True),
        )

    # ─── Phase 3: backfill user_id = id юзера с tg_user_id == OWNER_TG_ID ───
    for table in DOMAIN_TABLES:
        op.execute(
            sa.text(
                f"UPDATE {table} SET user_id = "
                f"(SELECT id FROM app_user WHERE tg_user_id = :owner_tg_id) "
                f"WHERE user_id IS NULL"
            ).bindparams(owner_tg_id=owner_tg_id)
        )

    # ─── Phase 3.5: sanity check — никаких NULL user_id остаться не должно ───
    conn = op.get_bind()
    for table in DOMAIN_TABLES:
        count = conn.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE user_id IS NULL")
        ).scalar_one()
        if count and count > 0:
            raise RuntimeError(
                f"0006_multitenancy: backfill failed for {table}: "
                f"{count} rows still have user_id IS NULL. Check that "
                f"app_user has a row with tg_user_id={owner_tg_id}."
            )

    # ─── Phase 4: ALTER COLUMN user_id SET NOT NULL на 9 таблицах ───
    for table in DOMAIN_TABLES:
        op.alter_column(table, "user_id", nullable=False)

    # ─── Phase 5: FK constraints user_id → app_user.id ON DELETE RESTRICT ───
    for table in DOMAIN_TABLES:
        op.create_foreign_key(
            f"fk_{table}_user_id_app_user",
            source_table=table,
            referent_table="app_user",
            local_cols=["user_id"],
            remote_cols=["id"],
            ondelete="RESTRICT",
        )

    # ─── Phase 6: unique constraints scoped по user_id ───
    # 6a) budget_period: drop старого глобального unique(period_start),
    #     create scoped(user_id, period_start)
    op.drop_constraint("uq_budget_period_start", "budget_period", type_="unique")
    op.create_unique_constraint(
        "uq_budget_period_user_id_period_start",
        "budget_period",
        ["user_id", "period_start"],
    )
    # 6b) category: новый unique(user_id, name)
    op.create_unique_constraint(
        "uq_category_user_id_name",
        "category",
        ["user_id", "name"],
    )
    # 6c) subscription: новый unique(user_id, name)
    op.create_unique_constraint(
        "uq_subscription_user_id_name",
        "subscription",
        ["user_id", "name"],
    )

    # ─── Phase 7: индексы (user_id) на 9 таблицах ───
    for table in DOMAIN_TABLES:
        op.create_index(
            f"ix_{table}_user_id",
            table,
            ["user_id"],
        )

    # ─── Phase 8: RLS — ENABLE + FORCE + POLICY на каждой из 9 таблиц ───
    # Policy: разрешает row если user_id == app.current_user_id (GUC).
    # Без выставленного GUC current_setting('app.current_user_id', true) → ''
    # (пустая строка, НЕ NULL — особенность функции). NULLIF превращает её
    # в NULL, потом coalesce → -1, не матчит ни одну строку — query возвращает
    # 0 rows. Без NULLIF cast '' к bigint падает с InvalidTextRepresentationError.
    # (defense-in-depth: app-side filter + RLS backstop).
    # FORCE ROW LEVEL SECURITY — table owner тоже подчиняется policy
    # (в production app-user не su; миграции через alembic_user могут получить
    # BYPASSRLS отдельно).
    for table in DOMAIN_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_user_isolation ON {table} "
            f"USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1)) "
            f"WITH CHECK (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))"
        )


def downgrade() -> None:
    # Симметрия upgrade — откат в обратном порядке.

    # ─── Drop RLS policies + disable RLS ───
    for table in DOMAIN_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_user_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # ─── Drop indexes ix_<table>_user_id ───
    for table in DOMAIN_TABLES:
        op.drop_index(f"ix_{table}_user_id", table_name=table)

    # ─── Drop scoped unique constraints ───
    op.drop_constraint(
        "uq_subscription_user_id_name", "subscription", type_="unique"
    )
    op.drop_constraint(
        "uq_category_user_id_name", "category", type_="unique"
    )
    op.drop_constraint(
        "uq_budget_period_user_id_period_start",
        "budget_period",
        type_="unique",
    )
    # Restore старого глобального unique(period_start)
    op.create_unique_constraint(
        "uq_budget_period_start",
        "budget_period",
        ["period_start"],
    )

    # ─── Drop FK constraints ───
    for table in DOMAIN_TABLES:
        op.drop_constraint(
            f"fk_{table}_user_id_app_user", table, type_="foreignkey"
        )

    # ─── Drop user_id columns ───
    for table in DOMAIN_TABLES:
        op.drop_column(table, "user_id")

    # ─── Drop app_user.role + user_role enum ───
    op.drop_column("app_user", "role")
    op.execute("DROP TYPE user_role")
