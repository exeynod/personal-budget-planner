"""Contract тесты для Phase 9 AI chat endpoints (AI-03, AI-06, AI-10).

RED gate: маршруты /api/v1/ai/* ещё не реализованы.
Тесты FAIL с 404 до Plan 09-05.
Тесты с DB пропускаются при отсутствии DATABASE_URL.

Covered:
- 403 без auth на POST /ai/chat, GET /ai/history, DELETE /ai/conversation
- POST /ai/chat → 200, Content-Type: text/event-stream
- GET /ai/history → 200, {messages: [...]}
- DELETE /ai/conversation → 204
- POST /ai/chat с превышением rate limit → 429 + Retry-After header
"""
from __future__ import annotations
import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def db_client(async_client, bot_token, owner_tg_id):
    """async_client с реальной DB-сессией. Пропускается без DATABASE_URL."""
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    from tests.helpers.seed import truncate_db
    await truncate_db()

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db

    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )

    # Phase 14 require_onboarded: bootstrap-via-/me path leaves onboarded_at
    # NULL; flip it now so /ai/* domain endpoints stay reachable in tests.
    async with SessionLocal() as _onb_session:
        await _onb_session.execute(
            text("UPDATE app_user SET onboarded_at = NOW() WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        await _onb_session.commit()

    yield async_client, {"X-Telegram-Init-Data": init_data}

    app.dependency_overrides.clear()
    await engine.dispose()


# --- 403 auth тесты (не требуют DB) ---


@pytest.mark.asyncio
async def test_chat_requires_auth(async_client):
    response = await async_client.post(
        "/api/v1/ai/chat", json={"message": "hello"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_history_requires_auth(async_client):
    response = await async_client.get("/api/v1/ai/history")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_clear_requires_auth(async_client):
    response = await async_client.delete("/api/v1/ai/conversation")
    assert response.status_code == 403


# --- Contract тесты с DB ---


@pytest.mark.asyncio
async def test_get_history_empty(db_client):
    """GET /ai/history возвращает 200 с пустым списком сообщений при чистой БД."""
    client, headers = db_client
    response = await client.get("/api/v1/ai/history", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "messages" in data
    assert isinstance(data["messages"], list)


@pytest.mark.asyncio
async def test_clear_conversation(db_client):
    """DELETE /ai/conversation возвращает 204."""
    client, headers = db_client
    response = await client.delete("/api/v1/ai/conversation", headers=headers)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_chat_returns_event_stream(db_client, monkeypatch):
    """POST /ai/chat возвращает 200 с Content-Type text/event-stream."""
    client, headers = db_client

    # Mock LLM-клиент чтобы не делать реальный запрос к OpenAI
    async def mock_stream(*args, **kwargs):
        yield {"type": "token", "data": "Тест"}
        yield {"type": "done", "data": ""}

    import app.api.routes.ai as ai_routes
    monkeypatch.setattr(ai_routes, "_get_llm_client", lambda: type("M", (), {"chat": mock_stream})())

    response = await client.post(
        "/api/v1/ai/chat",
        json={"message": "Каков мой баланс?"},
        headers=headers,
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_rate_limit_returns_429(db_client, monkeypatch):
    """POST /ai/chat возвращает 429 с Retry-After при превышении rate limit (AI-10)."""
    client, headers = db_client

    # Инъекция: принудительно выставить флаг rate limit exceeded
    import app.api.routes.ai as ai_routes
    monkeypatch.setattr(ai_routes, "_is_rate_limited", lambda user_id: True)

    response = await client.post(
        "/api/v1/ai/chat",
        json={"message": "тест"},
        headers=headers,
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers
