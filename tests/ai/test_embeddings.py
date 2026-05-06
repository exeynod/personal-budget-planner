"""RED тесты для EmbeddingService и suggest-category endpoint (Plan 10-01).

Эти тесты ДОЛЖНЫ ПАДАТЬ до реализации в Plan 10-02 (GREEN).
Покрывают:
- EmbeddingService: генерация embedding через openai embed API
- EmbeddingService: upsert в category_embedding таблицу
- EmbeddingService: suggest_category по cosine similarity
- GET /api/v1/ai/suggest-category?q=<text> endpoint
"""
from __future__ import annotations

import pytest


# --- EmbeddingService import tests ---

def test_embedding_service_importable():
    """EmbeddingService должен быть импортируемым из app.ai.embedding_service."""
    from app.ai.embedding_service import EmbeddingService  # noqa: F401


def test_embedding_service_has_embed_text_method():
    """EmbeddingService должен иметь метод embed_text(text: str) -> list[float]."""
    from app.ai.embedding_service import EmbeddingService
    assert hasattr(EmbeddingService, "embed_text")


def test_embedding_service_has_upsert_category_method():
    """EmbeddingService должен иметь метод upsert_category_embedding."""
    from app.ai.embedding_service import EmbeddingService
    assert hasattr(EmbeddingService, "upsert_category_embedding")


def test_embedding_service_has_suggest_category_method():
    """EmbeddingService должен иметь метод suggest_category."""
    from app.ai.embedding_service import EmbeddingService
    assert hasattr(EmbeddingService, "suggest_category")


def test_get_embedding_service_factory():
    """get_embedding_service() фабрика должна быть импортируемой."""
    from app.ai.embedding_service import get_embedding_service  # noqa: F401


# --- Suggest category response schema ---

def test_suggest_category_response_importable():
    """SuggestCategoryResponse pydantic schema должна быть импортируемой."""
    from app.api.schemas.ai import SuggestCategoryResponse  # noqa: F401


def test_suggest_category_response_has_required_fields():
    """SuggestCategoryResponse должен иметь поля category_id, name, confidence."""
    from app.api.schemas.ai import SuggestCategoryResponse
    import inspect
    fields = SuggestCategoryResponse.model_fields
    assert "category_id" in fields
    assert "confidence" in fields


def test_suggest_category_response_category_id_nullable():
    """SuggestCategoryResponse.category_id может быть None (confidence < 0.5)."""
    from app.api.schemas.ai import SuggestCategoryResponse
    # Должен принять None category_id (низкая уверенность)
    resp = SuggestCategoryResponse(category_id=None, name=None, confidence=0.3)
    assert resp.category_id is None
    assert resp.confidence == 0.3


def test_suggest_category_response_with_match():
    """SuggestCategoryResponse должен принять валидный матч."""
    from app.api.schemas.ai import SuggestCategoryResponse
    resp = SuggestCategoryResponse(category_id=42, name="Продукты", confidence=0.85)
    assert resp.category_id == 42
    assert resp.name == "Продукты"
    assert resp.confidence == 0.85


# --- suggest-category route exists ---

def test_suggest_category_router_importable():
    """Router с suggest-category endpoint должен быть импортируемым."""
    from app.api.routes.ai_suggest import router  # noqa: F401


def test_suggest_category_route_registered():
    """GET /suggest-category должен быть зарегистрирован в router."""
    from app.api.routes.ai_suggest import router
    paths = [route.path for route in router.routes]
    assert "/suggest-category" in paths


# --- Embedding dimensions ---

def test_embedding_dimension_constant():
    """Константа EMBEDDING_DIM должна быть равна 1536 (text-embedding-3-small)."""
    from app.ai.embedding_service import EMBEDDING_DIM
    assert EMBEDDING_DIM == 1536


# --- CategoryEmbedding ORM model (Phase 10 DB schema) ---

def test_category_embedding_model_importable():
    """CategoryEmbedding ORM модель должна быть импортируемой из app.db.models."""
    from app.db.models import CategoryEmbedding  # noqa: F401


def test_category_embedding_has_vector_column():
    """CategoryEmbedding должна иметь колонку embedding типа Vector(1536)."""
    from app.db.models import CategoryEmbedding
    assert hasattr(CategoryEmbedding, "embedding")


def test_category_embedding_category_id_is_pk():
    """CategoryEmbedding.category_id должен быть первичным ключом."""
    from app.db.models import CategoryEmbedding
    from sqlalchemy import inspect as sa_inspect
    mapper = sa_inspect(CategoryEmbedding)
    pk_names = [col.key for col in mapper.primary_key]
    assert "category_id" in pk_names


# --- Settings ---

def test_enable_ai_categorization_setting_exists():
    """settings.ENABLE_AI_CATEGORIZATION должен существовать и быть bool."""
    from app.core.settings import Settings
    fields = Settings.model_fields
    assert "ENABLE_AI_CATEGORIZATION" in fields
    assert fields["ENABLE_AI_CATEGORIZATION"].default is True
