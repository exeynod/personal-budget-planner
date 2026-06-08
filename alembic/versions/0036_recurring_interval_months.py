"""schema: add subscription.interval_months (recurring payments, ADR-0007)

Revision ID: 0036_recurring_interval
Revises: 0035_category_color
Create Date: 2026-06-08

WHY:
    ADR-0007 generalises the ``subscription`` table into a "recurring payment"
    with an arbitrary month interval. ``interval_months`` (SMALLINT, >= 1)
    becomes the new frequency source: 1 = monthly, 2 = every 2 months,
    12 = yearly. The legacy ``cycle`` / ``subcycle`` enum is left in place
    (deprecated) to keep the migration low-risk on live data — it is no longer
    read by the advance logic.

BACKFILL:
    cycle='monthly' -> interval_months=1
    cycle='yearly'  -> interval_months=12

    The column is added with server_default '1' so existing rows are valid
    before the UPDATE; monthly rows already match the default, only yearly
    rows are touched.

DOWNGRADE:
    Drops the CHECK constraint then the column.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0036_recurring_interval"
down_revision = "0035_category_color"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscription",
        sa.Column(
            "interval_months",
            sa.SmallInteger(),
            nullable=False,
            server_default="1",
        ),
    )
    # Backfill from the deprecated cycle enum.
    op.execute(
        "UPDATE subscription SET interval_months = 12 WHERE cycle = 'yearly'"
    )
    op.execute(
        "UPDATE subscription SET interval_months = 1 WHERE cycle = 'monthly'"
    )
    op.create_check_constraint(
        "ck_subscription_interval_months",
        "subscription",
        "interval_months >= 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_subscription_interval_months", "subscription", type_="check"
    )
    op.drop_column("subscription", "interval_months")
