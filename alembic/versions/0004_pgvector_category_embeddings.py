"""add pgvector extension and category_embedding table

Revision ID: 0004_pgvector_category_embeddings
Revises: 0003_ai_tables
Create Date: 2026-05-06

Добавляет:
- Расширение vector (pgvector) через CREATE EXTENSION IF NOT EXISTS
- Таблица category_embedding: category_id PK FK → category, embedding vector(1536), updated_at TIMESTAMPTZ
- HNSW индекс на embedding (cosine distance, vector_cosine_ops)

Plan 10-01 (Phase 10: AI Categorization).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_pgvector_category_embeddings"
down_revision: Union[str, None] = "0003_ai_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Включить pgvector extension (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Создаём таблицу через raw SQL чтобы использовать нативный тип vector(1536)
    op.execute(
        """
        CREATE TABLE category_embedding (
            category_id INTEGER PRIMARY KEY REFERENCES category(id) ON DELETE CASCADE,
            embedding   vector(1536) NOT NULL,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # HNSW индекс для cosine similarity (оператор <=>)
    op.execute(
        "CREATE INDEX ix_category_embedding_hnsw "
        "ON category_embedding USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_category_embedding_hnsw")
    op.drop_table("category_embedding")
    # Не удаляем extension vector — могут зависеть другие объекты
