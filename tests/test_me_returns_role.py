"""RED tests for Phase 12 ROLE-05 — GET /api/v1/me возвращает role field.

Tests fail until Plan 12-03 adds role to MeResponse + router.
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


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
                "TRUNCATE TABLE category, planned_transaction, "
                "actual_transaction, plan_template_item, subscription, "
                "budget_period, ai_message, ai_conversation, "
                "category_embedding, app_user RESTART IDENTITY CASCADE"
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
    yield async_client, SessionLocal
    await engine.dispose()


async def _seed(SessionLocal, *, tg_user_id, role):
    from app.db.models import AppUser
    async with SessionLocal() as session:
        session.add(AppUser(tg_user_id=tg_user_id, role=role, cycle_start_day=5))
        await session.commit()


@pytest.mark.asyncio
async def test_me_includes_role_for_owner(db_client, bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    await _seed(SessionLocal, tg_user_id=owner_tg_id, role=UserRole.owner)
    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "role" in body, f"MeResponse must include 'role' field, got keys={list(body.keys())}"
    assert body["role"] == "owner", f"expected role=owner, got {body['role']!r}"


@pytest.mark.asyncio
async def test_me_includes_role_for_member(db_client, bot_token):
    from tests.conftest import make_init_data
    from app.db.models import UserRole

    client, SessionLocal = db_client
    tg = 9_333_333_001
    await _seed(SessionLocal, tg_user_id=tg, role=UserRole.member)
    init_data = make_init_data(tg, bot_token)
    resp = await client.get(
        "/api/v1/me", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("role") == "member"
