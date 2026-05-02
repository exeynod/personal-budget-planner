"""Integration tests for Internal /telegram/chat-bind endpoint (ONB-03).

Covers D-11 (upsert pattern), T-internal-token (403 без X-Internal-Token),
T-chatbind-spoof (валидация токена).

Wave 0 RED state: route /api/v1/internal/telegram/chat-bind will be created
in Plan 02-04. DB fixture self-skips when DATABASE_URL is unset.
"""
import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest_asyncio.fixture
async def db_client(async_client):
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE category, planned_transaction, actual_transaction, "
                "plan_template_item, subscription, budget_period, app_user "
                "RESTART IDENTITY CASCADE"
            )
        )

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db
    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_chat_bind_without_internal_token_403(db_client, owner_tg_id):
    """T-internal-token: без X-Internal-Token → 403."""
    response = await db_client.post(
        "/api/v1/internal/telegram/chat-bind",
        json={"tg_user_id": owner_tg_id, "tg_chat_id": owner_tg_id},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_chat_bind_with_wrong_token_403(db_client, owner_tg_id):
    """T-chatbind-spoof: с неправильным X-Internal-Token → 403."""
    response = await db_client.post(
        "/api/v1/internal/telegram/chat-bind",
        json={"tg_user_id": owner_tg_id, "tg_chat_id": owner_tg_id},
        headers={"X-Internal-Token": "wrong_token"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_chat_bind_creates_user_with_chat_id(
    db_client, bot_token, owner_tg_id, internal_token
):
    """ONB-03 / D-11: если AppUser не существует — upsert создаёт строку с tg_chat_id."""
    response = await db_client.post(
        "/api/v1/internal/telegram/chat-bind",
        json={"tg_user_id": owner_tg_id, "tg_chat_id": 555},
        headers={"X-Internal-Token": internal_token},
    )
    assert response.status_code == 200

    # Verify via /me (the OWNER initData path will see the populated tg_chat_id)
    from tests.conftest import make_init_data

    init_data = make_init_data(owner_tg_id, bot_token)
    me = await db_client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    body = me.json()
    assert body["chat_id_known"] is True
    assert body["tg_chat_id"] == 555


@pytest.mark.asyncio
async def test_chat_bind_updates_existing_chat_id(
    db_client, bot_token, owner_tg_id, internal_token
):
    """D-11: повторный bind с другим chat_id обновляет."""
    await db_client.post(
        "/api/v1/internal/telegram/chat-bind",
        json={"tg_user_id": owner_tg_id, "tg_chat_id": 100},
        headers={"X-Internal-Token": internal_token},
    )
    response = await db_client.post(
        "/api/v1/internal/telegram/chat-bind",
        json={"tg_user_id": owner_tg_id, "tg_chat_id": 200},
        headers={"X-Internal-Token": internal_token},
    )
    assert response.status_code == 200

    from tests.conftest import make_init_data

    init_data = make_init_data(owner_tg_id, bot_token)
    me = await db_client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert me.json()["tg_chat_id"] == 200
