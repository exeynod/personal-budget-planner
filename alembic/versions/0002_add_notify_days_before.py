"""add notify_days_before to app_user

Revision ID: 0002_add_notify_days_before
Revises: 0001
Create Date: 2026-05-03

Adds AppUser.notify_days_before column (SET-02) with server_default=2
so existing rows are backfilled without NULL.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_notify_days_before"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column(
            "notify_days_before",
            sa.Integer(),
            nullable=False,
            server_default="2",
        ),
    )


def downgrade() -> None:
    op.drop_column("app_user", "notify_days_before")
