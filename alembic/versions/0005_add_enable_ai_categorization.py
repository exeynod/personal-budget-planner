"""add enable_ai_categorization to app_user

Revision ID: 0005_add_enable_ai_categorization
Revises: 0004_pgvector_category_embeddings
Create Date: 2026-05-06

Добавляет колонку enable_ai_categorization BOOLEAN NOT NULL DEFAULT TRUE в таблицу app_user.
Используется для управления AI-категоризацией транзакций (AICAT-05, SET-03).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_add_enable_ai_categorization"
down_revision: Union[str, None] = "0004_pgvector_category_embeddings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column(
            "enable_ai_categorization",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("app_user", "enable_ai_categorization")
