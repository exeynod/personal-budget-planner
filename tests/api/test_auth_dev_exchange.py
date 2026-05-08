"""Tests for POST /api/v1/auth/dev-exchange (Phase 17, IOSAUTH-02).

DB-backed: requires DATABASE_URL. Self-skips otherwise.

Covered behaviors:
- Valid secret → 200 + token + tg_user_id == OWNER_TG_ID
- Invalid secret → 403
- DEV_AUTH_SECRET not set → 503
- Repeat exchange → выдаёт НОВЫЙ токен; старый продолжает работать
"""
import os

import pytest
import pytest_asyncio
from sqlalchemy import select


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def patch_dev_secret(monkeypatch):
    """Сетит DEV_AUTH_SECRET в Settings runtime + ENV."""
    secret = "test-dev-secret-very-long-string"
    monkeypatch.setenv("DEV_AUTH_SECRET", secret)
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_AUTH_SECRET", secret)
    yield secret


@pytest_asyncio.fixture
async def auth_token_db(async_client, db_session):
    """Подменяет get_db на real DB session — endpoint пишет в auth_token таблицу."""
    _require_db()
    from app.api.dependencies import get_db
    from app.main_api import app

    async def override():
        yield db_session

    app.dependency_overrides[get_db] = override
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_valid_secret_returns_token(
    async_client, patch_dev_secret, auth_token_db, db_session
):
    """Valid secret → 200, token хранится как hash, tg_user_id корректный."""
    from app.core.settings import settings
    from app.db.models import AuthToken

    response = await async_client.post(
        "/api/v1/auth/dev-exchange",
        json={"secret": patch_dev_secret},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert "token" in body
    assert len(body["token"]) == 64  # 32 байт hex
    assert body["tg_user_id"] == settings.OWNER_TG_ID

    # Токен должен быть в БД (как hash, не plaintext)
    import hashlib
    plaintext = body["token"]
    expected_hash = hashlib.sha256(plaintext.encode()).hexdigest()

    result = await db_session.execute(
        select(AuthToken).where(AuthToken.token_hash == expected_hash)
    )
    record = result.scalar_one_or_none()
    assert record is not None
    assert record.revoked_at is None


@pytest.mark.asyncio
async def test_invalid_secret_returns_403(
    async_client, patch_dev_secret
):
    """Несовпадающий secret → 403."""
    response = await async_client.post(
        "/api/v1/auth/dev-exchange",
        json={"secret": "wrong-secret"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid secret"


@pytest.mark.asyncio
async def test_no_dev_secret_configured_returns_503(
    async_client, monkeypatch
):
    """DEV_AUTH_SECRET не задан → 503 (endpoint disabled)."""
    monkeypatch.delenv("DEV_AUTH_SECRET", raising=False)
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_AUTH_SECRET", None)

    response = await async_client.post(
        "/api/v1/auth/dev-exchange",
        json={"secret": "anything"},
    )

    assert response.status_code == 503


@pytest.mark.asyncio
async def test_repeat_exchange_yields_new_token(
    async_client, patch_dev_secret, auth_token_db, db_session
):
    """Каждый exchange выдаёт новый токен; старый не отзывается автоматически."""
    response_a = await async_client.post(
        "/api/v1/auth/dev-exchange",
        json={"secret": patch_dev_secret},
    )
    response_b = await async_client.post(
        "/api/v1/auth/dev-exchange",
        json={"secret": patch_dev_secret},
    )

    assert response_a.status_code == 200
    assert response_b.status_code == 200
    token_a = response_a.json()["token"]
    token_b = response_b.json()["token"]
    assert token_a != token_b

    # Оба токена должны быть в БД, оба активны (revoked_at IS NULL)
    from app.db.models import AuthToken
    result = await db_session.execute(
        select(AuthToken).where(AuthToken.revoked_at.is_(None))
    )
    active_count = len(result.scalars().all())
    assert active_count >= 2


@pytest.mark.asyncio
async def test_empty_secret_request_validation(
    async_client, patch_dev_secret
):
    """Пустая строка → 422 (Pydantic min_length=1)."""
    response = await async_client.post(
        "/api/v1/auth/dev-exchange",
        json={"secret": ""},
    )

    assert response.status_code == 422
