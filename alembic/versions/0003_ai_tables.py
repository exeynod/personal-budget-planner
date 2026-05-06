"""add ai_conversation and ai_message tables

Revision ID: 0003_ai_tables
Revises: 0002_add_notify_days_before
Create Date: 2026-05-06

Adds AiConversation + AiMessage tables for Phase 9 AI Assistant (AI-06).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_ai_tables"
down_revision: Union[str, None] = "0002_add_notify_days_before"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_conversation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "ai_message",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("ai_conversation.id"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("tool_name", sa.String(100), nullable=True),
        sa.Column("tool_result", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_ai_message_conversation", "ai_message", ["conversation_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_ai_message_conversation", table_name="ai_message")
    op.drop_table("ai_message")
    op.drop_table("ai_conversation")
