"""Сервис для работы с embedding-векторами категорий (Phase 10, AICAT-01..03).

Обеспечивает:
- Генерацию embeddings через AbstractLLMClient
- Upsert в category_embedding таблицу
- Cosine similarity suggest по описанию транзакции
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import AbstractLLMClient
from app.db.models import Category, CategoryEmbedding

if TYPE_CHECKING:
    pass

EMBEDDING_DIM = 1536
SUGGEST_THRESHOLD = 0.5


class EmbeddingService:
    """Сервис управления embedding-векторами категорий."""

    def __init__(self, llm_client: AbstractLLMClient) -> None:
        self._llm_client = llm_client

    async def embed_text(self, text: str) -> list[float]:
        """Генерирует embedding-вектор для строки через LLM-провайдер.

        text: строка для векторизации.
        Возвращает list[float] размерностью EMBEDDING_DIM.
        """
        return await self._llm_client.embed(text)

    async def upsert_category_embedding(
        self,
        db: AsyncSession,
        category_id: int,
        vector: list[float],
    ) -> None:
        """Сохраняет или обновляет embedding для категории.

        Использует INSERT ON CONFLICT UPDATE для идемпотентного upsert.
        updated_at автоматически обновляется триггером/server_default через NOW().
        """
        stmt = (
            pg_insert(CategoryEmbedding)
            .values(category_id=category_id, embedding=vector)
            .on_conflict_do_update(
                index_elements=["category_id"],
                set_={"embedding": vector, "updated_at": text("now()")},
            )
        )
        await db.execute(stmt)
        await db.commit()

    async def suggest_category(
        self,
        db: AsyncSession,
        description: str,
    ) -> dict | None:
        """Находит ближайшую категорию по cosine similarity.

        Использует pgvector оператор <=> (cosine distance).
        confidence = 1 - cosine_distance.
        Возвращает {category_id, name, confidence} если confidence >= SUGGEST_THRESHOLD,
        иначе None.
        """
        query_vec = await self._llm_client.embed(description)

        # Cosine distance через pgvector <=> оператор
        # confidence = 1 - distance (чем меньше расстояние, тем выше уверенность)
        stmt = text(
            """
            SELECT
                ce.category_id,
                c.name,
                1.0 - (ce.embedding <=> CAST(:query_vec AS vector)) AS confidence
            FROM category_embedding ce
            JOIN category c ON c.id = ce.category_id
            WHERE c.is_archived = FALSE
            ORDER BY ce.embedding <=> CAST(:query_vec AS vector)
            LIMIT 1
            """
        )
        result = await db.execute(stmt, {"query_vec": str(query_vec)})
        row = result.fetchone()

        if row is None:
            return None

        category_id, name, confidence = row
        if confidence < SUGGEST_THRESHOLD:
            return None

        return {
            "category_id": category_id,
            "name": name,
            "confidence": float(confidence),
        }


def get_embedding_service() -> EmbeddingService:
    """Фабрика: возвращает EmbeddingService с дефолтным LLM-провайдером."""
    from app.ai.llm_client import get_llm_client

    return EmbeddingService(llm_client=get_llm_client())
