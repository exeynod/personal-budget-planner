"""category: replace uq_category_user_id_name UNIQUE with partial index excluding is_archived

Revision ID: 0010_category_uq_active
Revises: 0009_cap_default_1usd
Create Date: 2026-05-08

The original 0006_multitenancy created `uq_category_user_id_name` as a plain
UNIQUE(user_id, name), which does NOT account for the `is_archived`
soft-delete flag (CLAUDE.md convention: only category supports soft delete
via is_archived; transactions/subscriptions are hard delete). Concrete
failure mode: archive category 'X', then create a new active category
named 'X' — the second INSERT collides with the soft-deleted row on
UNIQUE(user_id, name). The same trap blocked the 0006 migration itself on
prod 2026-05-08 when backfill collapsed both rows under the same user_id
('Прочее' archived 2026-05-05 + 'Прочее' active 2026-05-06 → unique
violation when adding the constraint).

Fix: drop the constraint and replace with a partial unique index that
filters out archived rows: UNIQUE(user_id, name) WHERE NOT is_archived.

The same name `uq_category_user_id_name` is retained — Postgres unique
indexes and unique constraints share namespace, and dropping the
constraint frees the name. Keeping the name avoids churn in the model and
in tests that already reference it; "uq_" prefix remains semantically
honest because it IS a unique index, just partial.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0010_category_uq_active"
down_revision = "0009_cap_default_1usd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_category_user_id_name", "category", type_="unique"
    )
    op.create_index(
        "uq_category_user_id_name",
        "category",
        ["user_id", "name"],
        unique=True,
        postgresql_where=sa.text("NOT is_archived"),
    )


def downgrade() -> None:
    op.drop_index("uq_category_user_id_name", table_name="category")
    op.create_unique_constraint(
        "uq_category_user_id_name",
        "category",
        ["user_id", "name"],
    )
