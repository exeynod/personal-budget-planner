"""schema: add nullable category.color (explicit colour key)

Revision ID: 0035_category_color
Revises: 0034_category_icon
Create Date: 2026-06-08

WHY:
    0034 added an explicit, user-chosen ``icon`` key so the glyph could be
    picked independently of the category name. This adds a sibling ``color``
    key so the owner can pick the *colour* independently of the icon too
    (iOS-Shortcuts style: choose glyph and colour separately instead of the
    old bundled icon+colour presets). The column is nullable: NULL means
    "fall back to the name/hash-based colour" so existing rows keep their
    current visual without a backfill.

IDEMPOTENT-FRIENDLY:
    VARCHAR(32) holds the colour key (matches the stable COLOR_SET keys
    exported from ``categoryVisuals.ts``). Downgrade drops the column.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0035_category_color"
down_revision = "0034_category_icon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "category",
        sa.Column("color", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("category", "color")
