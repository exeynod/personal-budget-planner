"""Phase 67 Plan 08 (P2-4, P2-5) — ChatRequest bounds + suggest confidence.

P2-4 (BE-F5): ChatRequest.message must be bounded (min_length=1,
max_length=4000). Empty / oversize → 422.

P2-5 (BE-F6): /ai/suggest-category on a miss must return the *real* computed
confidence (not a hardcoded 0.0) with category_id/name = None; docstring must
state the actual 0.35 threshold.

ChatRequest validation is a pure Pydantic-schema test (no DB). The suggest miss
path is exercised at the service layer (EmbeddingService.suggest_category) so
the route-level confidence is the genuine cosine value.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError


# ---------- P2-4: ChatRequest length bounds ----------


def test_chat_request_rejects_empty_message():
    from app.api.schemas.ai import ChatRequest

    with pytest.raises(ValidationError):
        ChatRequest(message="")


def test_chat_request_rejects_oversize_message():
    from app.api.schemas.ai import ChatRequest

    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 4001)


def test_chat_request_accepts_bounded_message():
    from app.api.schemas.ai import ChatRequest

    assert ChatRequest(message="привет").message == "привет"
    # Exactly at the upper bound is allowed.
    assert len(ChatRequest(message="x" * 4000).message) == 4000


# ---------- P2-5: suggest miss returns the real confidence ----------


@pytest.mark.asyncio
async def test_suggest_miss_returns_real_confidence(monkeypatch):
    """A below-threshold cosine hit must surface the real confidence value,
    not a discarded None / hardcoded 0.0."""
    from app.ai.embedding_service import EmbeddingService

    class _FakeRow:
        def __init__(self, cid, name, conf):
            self._t = (cid, name, conf)

        def __iter__(self):
            return iter(self._t)

    class _FakeResult:
        def __init__(self, row):
            self._row = row

        def fetchone(self):
            return self._row

    class _FakeDB:
        async def execute(self, *a, **k):
            # below-threshold cosine confidence (0.20 < 0.35)
            return _FakeResult(_FakeRow(7, "Продукты", 0.20))

    svc = EmbeddingService.__new__(EmbeddingService)
    svc._embed_cache = {}

    async def _no_substring(*a, **k):
        return None

    async def _fake_embed(text):
        return [0.0] * 1536

    monkeypatch.setattr(svc, "_substring_synonym_match", _no_substring)
    monkeypatch.setattr(svc, "embed_text", _fake_embed)

    result = await svc.suggest_category(_FakeDB(), "что-то", user_id=1)

    # On a miss the service must still surface the real confidence with a
    # null category, so the route can echo the genuine value.
    assert result is not None, "miss must return a dict carrying the real confidence"
    assert result["category_id"] is None
    assert result["name"] is None
    assert result["confidence"] == pytest.approx(0.20)


@pytest.mark.asyncio
async def test_suggest_hit_returns_category(monkeypatch):
    """Above-threshold hit still returns the category id/name."""
    from app.ai.embedding_service import EmbeddingService

    class _FakeRow:
        def __init__(self, t):
            self._t = t

        def __iter__(self):
            return iter(self._t)

    class _FakeResult:
        def __init__(self, row):
            self._row = row

        def fetchone(self):
            return self._row

    class _FakeDB:
        async def execute(self, *a, **k):
            return _FakeResult(_FakeRow((7, "Продукты", 0.80)))

    svc = EmbeddingService.__new__(EmbeddingService)
    svc._embed_cache = {}

    async def _no_substring(*a, **k):
        return None

    async def _fake_embed(text):
        return [0.0] * 1536

    monkeypatch.setattr(svc, "_substring_synonym_match", _no_substring)
    monkeypatch.setattr(svc, "embed_text", _fake_embed)

    result = await svc.suggest_category(_FakeDB(), "молоко", user_id=1)
    assert result["category_id"] == 7
    assert result["name"] == "Продукты"
    assert result["confidence"] == pytest.approx(0.80)


def test_suggest_docstring_states_035_threshold():
    """The route docstring must state the real 0.35 threshold (not 0.5)."""
    from app.api.routes.ai_suggest import suggest_category

    doc = suggest_category.__doc__ or ""
    assert "0.35" in doc
    assert "0.5 " not in doc and ">= 0.5" not in doc
