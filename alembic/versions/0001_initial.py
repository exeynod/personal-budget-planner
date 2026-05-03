"""Initial schema: 6 domain tables + app_health + enums + indices

Revision ID: 0001
Revises:
Create Date: 2026-05-01

Tables: app_user, category, budget_period, plan_template_item,
        planned_transaction, actual_transaction, subscription, app_health
Enums: categorykind, periodstatus, plansource, actualsource, subcycle
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Enums (raw SQL for async-alembic compatibility) ----
    op.execute("DO $$ BEGIN CREATE TYPE categorykind AS ENUM ('expense', 'income'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    op.execute("DO $$ BEGIN CREATE TYPE periodstatus AS ENUM ('active', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    op.execute("DO $$ BEGIN CREATE TYPE plansource AS ENUM ('template', 'manual', 'subscription_auto'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    op.execute("DO $$ BEGIN CREATE TYPE actualsource AS ENUM ('mini_app', 'bot'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    op.execute("DO $$ BEGIN CREATE TYPE subcycle AS ENUM ('monthly', 'yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;")

    # ---- app_user ----
    op.create_table(
        "app_user",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tg_user_id", sa.BigInteger(), nullable=False),
        sa.Column("tg_chat_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "cycle_start_day",
            sa.Integer(),
            server_default="5",
            nullable=False,
        ),
        sa.Column("onboarded_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("tg_user_id", name="uq_app_user_tg_user_id"),
    )

    # ---- category ----
    op.create_table(
        "category",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "expense",
                "income",
                name="categorykind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ---- subscription (created before planned_transaction for FK target) ----
    op.create_table(
        "subscription",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column(
            "cycle",
            sa.Enum(
                "monthly", "yearly", name="subcycle", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("next_charge_date", sa.Date(), nullable=False),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("category.id"),
            nullable=False,
        ),
        sa.Column(
            "notify_days_before",
            sa.Integer(),
            server_default="2",
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default="true",
            nullable=False,
        ),
    )
    op.create_index(
        "ix_subscription_active_charge",
        "subscription",
        ["is_active", "next_charge_date"],
    )

    # ---- budget_period ----
    op.create_table(
        "budget_period",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "starting_balance_cents",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column("ending_balance_cents", sa.BigInteger(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "active", "closed", name="periodstatus", create_type=False
            ),
            server_default="active",
            nullable=False,
        ),
        sa.Column("closed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("period_start", name="uq_budget_period_start"),
    )

    # ---- plan_template_item ----
    op.create_table(
        "plan_template_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("category.id"),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("day_of_period", sa.Integer(), nullable=True),
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )

    # ---- planned_transaction ----
    op.create_table(
        "planned_transaction",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "period_id",
            sa.Integer(),
            sa.ForeignKey("budget_period.id"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "expense",
                "income",
                name="categorykind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("category.id"),
            nullable=False,
        ),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column(
            "source",
            sa.Enum(
                "template",
                "manual",
                "subscription_auto",
                name="plansource",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "subscription_id",
            sa.Integer(),
            sa.ForeignKey("subscription.id"),
            nullable=True,
        ),
        sa.Column("original_charge_date", sa.Date(), nullable=True),
        sa.UniqueConstraint(
            "subscription_id",
            "original_charge_date",
            name="uq_planned_sub_charge_date",
        ),
    )
    op.create_index(
        "ix_planned_period_kind",
        "planned_transaction",
        ["period_id", "kind"],
    )

    # ---- actual_transaction ----
    op.create_table(
        "actual_transaction",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "period_id",
            sa.Integer(),
            sa.ForeignKey("budget_period.id"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "expense",
                "income",
                name="categorykind",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("category.id"),
            nullable=False,
        ),
        sa.Column("tx_date", sa.Date(), nullable=False),
        sa.Column(
            "source",
            sa.Enum(
                "mini_app",
                "bot",
                name="actualsource",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_actual_period_kind",
        "actual_transaction",
        ["period_id", "kind"],
    )
    op.create_index(
        "ix_actual_category_date",
        "actual_transaction",
        ["category_id", "tx_date"],
    )

    # ---- app_health (worker heartbeat, D-12) ----
    op.create_table(
        "app_health",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service", sa.String(50), nullable=False),
        sa.Column(
            "last_heartbeat_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("app_health")
    op.drop_index(
        "ix_actual_category_date", table_name="actual_transaction"
    )
    op.drop_index("ix_actual_period_kind", table_name="actual_transaction")
    op.drop_table("actual_transaction")
    op.drop_index("ix_planned_period_kind", table_name="planned_transaction")
    op.drop_table("planned_transaction")
    op.drop_table("plan_template_item")
    op.drop_table("budget_period")
    op.drop_index(
        "ix_subscription_active_charge", table_name="subscription"
    )
    op.drop_table("subscription")
    op.drop_table("category")
    op.drop_table("app_user")

    sa.Enum(name="subcycle").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="actualsource").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="plansource").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="periodstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="categorykind").drop(op.get_bind(), checkfirst=True)
