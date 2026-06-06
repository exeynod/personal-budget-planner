"""RED тесты для EmbeddingService и suggest-category endpoint (Plan 10-01).

Эти тесты ДОЛЖНЫ ПАДАТЬ до реализации в Plan 10-02 (GREEN).
Покрывают:
- EmbeddingService: генерация embedding через openai embed API
- EmbeddingService: upsert в category_embedding таблицу
- EmbeddingService: suggest_category по cosine similarity
- GET /api/v1/ai/suggest-category?q=<text> endpoint
"""

from __future__ import annotations



# NOTE (prune): the trivial import/hasattr/schema-field unit tests that used to
# live here were dropped — they only asserted that methods/fields/routes exist,
# which is implicitly covered by the contract check and the functional
# embedding tests (test_categories.py::test_refresh_embedding_persists_row,
# tests/ai/test_categorization.py). Kept below: the EMBEDDING_DIM contract, the
# nullable-vs-match response semantics (real behaviour), and the settings flag.


def test_embedding_dimension_constant():
    """Константа EMBEDDING_DIM должна быть равна 1536 (text-embedding-3-small)."""
    from app.ai.embedding_service import EMBEDDING_DIM

    assert EMBEDDING_DIM == 1536


def test_suggest_category_response_nullable_vs_match():
    """SuggestCategoryResponse: low-confidence → null category_id; match → populated."""
    from app.api.schemas.ai import SuggestCategoryResponse

    miss = SuggestCategoryResponse(category_id=None, name=None, confidence=0.3)
    assert miss.category_id is None and miss.confidence == 0.3

    hit = SuggestCategoryResponse(category_id=42, name="Продукты", confidence=0.85)
    assert hit.category_id == 42 and hit.name == "Продукты"


def test_enable_ai_categorization_setting_exists():
    """settings.ENABLE_AI_CATEGORIZATION должен существовать и быть bool (default True)."""
    from app.core.settings import Settings

    fields = Settings.model_fields
    assert "ENABLE_AI_CATEGORIZATION" in fields
    assert fields["ENABLE_AI_CATEGORIZATION"].default is True
