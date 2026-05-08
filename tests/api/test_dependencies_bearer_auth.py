"""Tests for Bearer-token auth path в get_current_user (Phase 17, IOSAUTH-01).

Проверяет два сценария:
1. Запрос с валидным `Authorization: Bearer <token>` возвращает корректного user.
2. Запрос с `X-Telegram-Init-Data` (без Bearer) продолжает работать как раньше
   (web-фронт не сломан Phase 17 changes).

DB-backed: requires DATABASE_URL.
"""
import hashlib
import os
import secrets
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def seeded_owner(async_client, db_session, owner_tg_id):
    """Создаёт OWNER_TG_ID юзера с role=owner (как после dev-exchange)."""
    _require_db()
    from app.api.dependencies import get_db
    from app.db.models import AppUser, UserRole
    from app.main_api import app

    # Bypass RLS для seed
    await db_session.execute(text("SET LOCAL row_security = off"))
    # Удалить если был от прошлого теста
    await db_session.execute(
        text("DELETE FROM app_user WHERE tg_user_id = :tg"),
        {"tg": owner_tg_id},
    )
    user = AppUser(
        tg_user_id=owner_tg_id,
        role=UserRole.owner,
        cycle_start_day=5,
    )
    db_session.add(user)
    await db_session.flush()

    async def override():
        yield db_session

    app.dependency_overrides[get_db] = override
    yield {"id": user.id, "tg_user_id": owner_tg_id}
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def issued_token(seeded_owner, db_session):
    """Создаёт AuthToken для seeded_owner. Возвращает plaintext."""
    from app.db.models import AuthToken

    plaintext = secrets.token_hex(32)
    token_hash = hashlib.sha256(plaintext.encode()).hexdigest()
    token = AuthToken(token_hash=token_hash, user_id=seeded_owner["id"])
    db_session.add(token)
    await db_session.flush()
    return plaintext


@pytest.mark.asyncio
async def test_bearer_token_authenticates_successfully(
    async_client, issued_token, seeded_owner, monkeypatch
):
    """Запрос с Authorization: Bearer <token> → 200 на /me с правильным user."""
    # Disable DEV_MODE чтобы Bearer-path сработал, не bypass через _dev_mode_resolve_owner
    monkeypatch.setenv("DEV_MODE", "false")
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)

    response = await async_client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {issued_token}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tg_user_id"] == seeded_owner["tg_user_id"]
    assert body["role"] == "owner"


@pytest.mark.asyncio
async def test_init_data_still_works_without_bearer(
    async_client, seeded_owner, bot_token, owner_tg_id, monkeypatch
):
    """Запрос с X-Telegram-Init-Data (без Bearer) → 200 (web-фронт не сломан)."""
    from tests.conftest import make_init_data
    monkeypatch.setenv("DEV_MODE", "false")
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)

    init_data = make_init_data(owner_tg_id, bot_token)
    response = await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tg_user_id"] == owner_tg_id


@pytest.mark.asyncio
async def test_invalid_bearer_falls_back_to_init_data(
    async_client, seeded_owner, bot_token, owner_tg_id, monkeypatch
):
    """Если Bearer невалиден, но initData есть — используется initData."""
    from tests.conftest import make_init_data
    monkeypatch.setenv("DEV_MODE", "false")
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)

    init_data = make_init_data(owner_tg_id, bot_token)
    response = await async_client.get(
        "/api/v1/me",
        headers={
            "Authorization": "Bearer this-is-not-a-real-token-just-junk",
            "X-Telegram-Init-Data": init_data,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["tg_user_id"] == owner_tg_id


@pytest.mark.asyncio
async def test_revoked_token_rejected(
    async_client, issued_token, seeded_owner, db_session, monkeypatch
):
    """Revoked токен (revoked_at IS NOT NULL) → не аутентифицирует."""
    from app.db.models import AuthToken
    from sqlalchemy import select, update

    # Revoke токен
    token_hash = hashlib.sha256(issued_token.encode()).hexdigest()
    await db_session.execute(
        update(AuthToken)
        .where(AuthToken.token_hash == token_hash)
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await db_session.flush()

    monkeypatch.setenv("DEV_MODE", "false")
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)

    response = await async_client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {issued_token}"},
    )

    # Revoked Bearer → fallback на initData (нет) → 403
    assert response.status_code == 403
