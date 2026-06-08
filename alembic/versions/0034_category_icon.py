"""schema: add nullable category.icon (explicit icon key)

Revision ID: 0034_category_icon
Revises: 0033_drop_income_limits
Create Date: 2026-06-08

WHY:
    Categories previously derived their UI icon from the name (substring match
    in ``frontend/src/utils/categoryVisuals.ts``). This adds an explicit,
    user-chosen icon key (e.g. 'food', 'cafe', 'home', 'car', 'salary', ...)
    so the owner can pick / change the glyph independently of the name. The
    column is nullable: NULL means "fall back to the name-based mapping" so
    existing rows keep their current visual without a backfill.

IDEMPOTENT-FRIENDLY:
    VARCHAR(32) holds the icon key (matches the stable key set exported from
    ``categoryVisuals.ts``). Downgrade drops the column.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0034_category_icon"
down_revision = "0033_drop_income_limits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "category",
        sa.Column("icon", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("category", "icon")
