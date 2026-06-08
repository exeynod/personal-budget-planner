"""schema: add budget_period.planned_at (monthly planning gate, ADR-0008)

Revision ID: 0037_period_planned_at
Revises: 0036_recurring_interval
Create Date: 2026-06-08

WHY:
    ADR-0008 turns monthly planning into a gate. ``budget_period.planned_at``
    (TIMESTAMPTZ NULL) marks whether a period has been planned: NULL = not
    planned -> the planning interstitial is shown; non-NULL = confirmed.
    New periods rolled by ``close_period_job`` are created with planned_at
    NULL (triggering the gate); onboarding's first period and the confirm-plan
    endpoint set it to now().

BACKFILL:
    All existing periods are backfilled to planned_at = now() — the in-progress
    month must NOT be gated immediately after deploy (the gate starts with the
    next rolled period).

DOWNGRADE:
    Drops the column.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0037_period_planned_at"
down_revision = "0036_recurring_interval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "budget_period",
        sa.Column("planned_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    # Backfill: existing periods count as already-planned so the in-progress
    # month is NOT gated after deploy.
    op.execute("UPDATE budget_period SET planned_at = now() WHERE planned_at IS NULL")


def downgrade() -> None:
    op.drop_column("budget_period", "planned_at")
