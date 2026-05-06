"""Сервис для работы с embedding-векторами категорий (Phase 10, AICAT-01..03).

Обеспечивает:
- Генерацию embeddings через AbstractLLMClient
- Upsert в category_embedding таблицу
- Cosine similarity suggest по описанию транзакции

Phase 10.1: in-process LRU cache on embed_text дедуплицирует одинаковые
запросы (повторные `/ai/suggest-category?q=...` от того же текста),
снижая latency и расход на text-embedding-3-small.

Phase 11 (Plan 11-06): upsert_category_embedding и suggest_category принимают
``user_id`` keyword-only. CategoryEmbedding INSERT задаёт user_id явно
(NOT NULL constraint в schema). suggest_category фильтрует embeddings по
user_id (только свои категории влияют на suggestion).
"""
from __future__ import annotations

from collections import OrderedDict
from functools import lru_cache
from typing import TYPE_CHECKING

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import AbstractLLMClient
from app.db.models import Category, CategoryEmbedding

if TYPE_CHECKING:
    pass

EMBEDDING_DIM = 1536
SUGGEST_THRESHOLD = 0.35

# Default synonym packs for seed-category names. Embedding the category
# together with these short related terms ("Продукты: еда, магазин,
# пятёрочка, перекрёсток…") lifts cosine similarity for short Russian
# probes from ~0.30 (where the bare name barely beats noise) into
# 0.45-0.65 territory, where SUGGEST_THRESHOLD=0.35 reliably fires.
# Lookup is by lowercase name so it survives renames that only change
# capitalization. Categories without a default pack just use the bare
# name — no breakage, only suboptimal recall on short input.
_CATEGORY_SYNONYMS: dict[str, str] = {
    "продукты": "еда, магазин, пятёрочка, перекрёсток, лента, ашан, магнит, продуктовый",
    "кафе и рестораны": "кафе, ресторан, кофе, обед, ужин, завтрак, бар, доставка еды",
    "транспорт": "такси, бензин, метро, автобус, парковка, проезд, автобусный, поездка",
    "развлечения": "кино, концерт, парк, аттракционы, шоу, ивент, билеты на мероприятие",
    "здоровье": "аптека, врач, лекарства, анализы, стоматолог, клиника, медицина",
    "спорт": "тренажёрный зал, абонемент, бассейн, тренировка, фитнес, йога, хоккей, футбол",
    "книги": "литература, читалка, букмейт, литрес, kindle",
    "подарки": "цветы, сувенир, презент, день рождения",
    "зарплата": "оклад, премия, дивиденды, доход с работы",
    "сервисы": "подписки, netflix, spotify, интернет, мобильная связь, hosting",
}


def augment_category_name_for_embedding(name: str) -> str:
    """Return the embedding-source string for a category name.

    Adds short synonym hints when the name matches a known seed category.
    The result is what gets sent to text-embedding-3-small, NOT what's
    shown to the user — display name (`category.name`) stays untouched.
    """
    key = (name or "").strip().lower()
    syn = _CATEGORY_SYNONYMS.get(key)
    if not syn:
        return name
    return f"{name}: {syn}"

_EMBED_CACHE_MAXSIZE = 128


class EmbeddingService:
    """Сервис управления embedding-векторами категорий.

    Внутренний LRU-кэш (Phase 10.1) хранит до _EMBED_CACHE_MAXSIZE
    последних embed_text-результатов. Ключ — нормализованный текст
    (lowercased + strip), без TTL: на одной строке embedding-функция
    детерминирована, инвалидация не нужна.

    Phase 11: upsert/suggest принимают user_id для tenant scoping.
    """

    def __init__(self, llm_client: AbstractLLMClient) -> None:
        self._llm_client = llm_client
        self._embed_cache: OrderedDict[str, list[float]] = OrderedDict()

    async def embed_text(self, text: str) -> list[float]:
        """Генерирует embedding-вектор для строки через LLM-провайдер.

        Phase 10.1: повторные одинаковые запросы (с точностью до
        регистра/пробелов) обслуживаются из in-memory LRU-кэша,
        чтобы не дёргать text-embedding-3-small повторно.

        text: строка для векторизации.
        Возвращает list[float] размерностью EMBEDDING_DIM.
        """
        key = text.strip().lower()
        if not key:
            return await self._llm_client.embed(text)

        cached = self._embed_cache.get(key)
        if cached is not None:
            self._embed_cache.move_to_end(key)
            return cached

        vector = await self._llm_client.embed(text)
        self._embed_cache[key] = vector
        self._embed_cache.move_to_end(key)
        if len(self._embed_cache) > _EMBED_CACHE_MAXSIZE:
            self._embed_cache.popitem(last=False)
        return vector

    async def upsert_category_embedding(
        self,
        db: AsyncSession,
        category_id: int,
        vector: list[float],
        *,
        user_id: int,
    ) -> None:
        """Сохраняет или обновляет embedding для категории.

        Phase 11: user_id задаётся явно при INSERT и при ON CONFLICT UPDATE.
        Caller отвечает за то, что category_id принадлежит user_id (PK на
        category_id с CASCADE delete; user_id колонка на CategoryEmbedding —
        NOT NULL после миграции 11-02).

        Использует INSERT ON CONFLICT UPDATE для идемпотентного upsert.
        updated_at автоматически обновляется триггером/server_default через NOW().
        """
        stmt = (
            pg_insert(CategoryEmbedding)
            .values(
                category_id=category_id,
                user_id=user_id,
                embedding=vector,
            )
            .on_conflict_do_update(
                index_elements=["category_id"],
                set_={
                    "embedding": vector,
                    "updated_at": text("now()"),
                    "user_id": user_id,
                },
            )
        )
        await db.execute(stmt)

    async def suggest_category(
        self,
        db: AsyncSession,
        description: str,
        *,
        user_id: int,
    ) -> dict | None:
        """Находит ближайшую категорию по cosine similarity.

        Phase 11: scoped по user_id. Ищем только среди embeddings, принадлежащих
        этому юзеру (CategoryEmbedding.user_id) и среди его активных категорий
        (Category.user_id, is_archived = FALSE).

        Использует pgvector оператор <=> (cosine distance).
        confidence = 1 - cosine_distance.
        Возвращает {category_id, name, confidence} если confidence >= SUGGEST_THRESHOLD,
        иначе None.
        """
        # Phase 10.1: маршрутизируем через embed_text, чтобы повторные
        # описания обслуживались из LRU-кэша.
        query_vec = await self.embed_text(description)
        # asyncpg не приводит Python list к pgvector через CAST(:p AS vector)
        # — параметр должен быть строковым литералом '[0.1,0.2,...]'.
        # SQLAlchemy 2.x ORM upsert (pg_insert.values) приводит list сам,
        # но raw text() байпасит этот слой, поэтому форматируем вручную.
        query_vec_literal = "[" + ",".join(repr(float(v)) for v in query_vec) + "]"

        # Cosine distance через pgvector <=> оператор
        # confidence = 1 - distance (чем меньше расстояние, тем выше уверенность).
        # Phase 11: фильтр по user_id — оба JOIN-партнёра имеют user_id колонку
        # после Plan 11-02 / 11-03.
        stmt = text(
            """
            SELECT
                ce.category_id,
                c.name,
                1.0 - (ce.embedding <=> CAST(:query_vec AS vector)) AS confidence
            FROM category_embedding ce
            JOIN category c ON c.id = ce.category_id
            WHERE c.is_archived = FALSE
              AND c.user_id = :user_id
              AND ce.user_id = :user_id
            ORDER BY ce.embedding <=> CAST(:query_vec AS vector)
            LIMIT 1
            """
        )
        result = await db.execute(
            stmt,
            {"query_vec": query_vec_literal, "user_id": user_id},
        )
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


@lru_cache(maxsize=1)
def get_embedding_service() -> EmbeddingService:
    """Фабрика: возвращает singleton EmbeddingService с дефолтным LLM-клиентом.

    Phase 10.1: singleton через lru_cache — иначе каждый запрос создавал
    новый instance со своим пустым _embed_cache, и LRU never hit. Тесты
    могут сбросить через get_embedding_service.cache_clear().
    """
    from app.ai.llm_client import get_llm_client

    return EmbeddingService(llm_client=get_llm_client())
