"""Phase 33 CMP-33-03: /legal/privacy + /legal/terms endpoint tests."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def legal_client():
    """ASGI client against main_api.app — no DB, no auth deps."""
    from main_api import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_privacy_ru_returns_markdown(legal_client):
    r = await legal_client.get("/legal/privacy?lang=ru")
    assert r.status_code == 200
    assert "text/markdown" in r.headers["content-type"]
    body = r.text
    assert "152-ФЗ" in body
    assert "OpenAI" in body
    assert "exeynod@gmail.com" in body
    assert "Draft v0.1" in body


async def test_privacy_en_returns_markdown(legal_client):
    r = await legal_client.get("/legal/privacy?lang=en")
    assert r.status_code == 200
    assert "text/markdown" in r.headers["content-type"]
    body = r.text
    assert "OpenAI" in body
    assert "Draft v0.1" in body


async def test_privacy_default_lang_is_ru(legal_client):
    r = await legal_client.get("/legal/privacy")
    assert r.status_code == 200
    assert "152-ФЗ" in r.text


async def test_terms_ru_and_en(legal_client):
    r_ru = await legal_client.get("/legal/terms?lang=ru")
    assert r_ru.status_code == 200
    assert "Условия использования" in r_ru.text
    r_en = await legal_client.get("/legal/terms?lang=en")
    assert r_en.status_code == 200


async def test_invalid_lang_rejected(legal_client):
    # FastAPI Query Literal["ru","en"] returns 422 for invalid input.
    r = await legal_client.get("/legal/privacy?lang=fr")
    assert r.status_code == 422


async def test_legal_endpoints_no_auth_required(legal_client):
    """Verify endpoints don't require Telegram initData."""
    # No headers, no token — should still 200.
    r = await legal_client.get("/legal/privacy")
    assert r.status_code == 200
