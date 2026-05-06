"""RED tests for Phase 12 Plan 12-04 — bot helper bot_resolve_user_role.

Until Plan 12-04 lands, app/bot/auth.py (or wherever the helper lives)
does not export bot_resolve_user_role → ImportError.

Function contract (after 12-04):
    async def bot_resolve_user_role(tg_user_id: int) -> UserRole | None:
        '''Look up app_user.role by tg_user_id; None if не существует.'''
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


@pytest_asyncio.fixture
async def fresh_db():
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    from tests.helpers.seed import truncate_db
    await truncate_db()
    yield SessionLocal
    await engine.dispose()


async def _seed(SessionLocal, *, tg_user_id, role):
    from app.db.models import AppUser
    async with SessionLocal() as session:
        session.add(AppUser(tg_user_id=tg_user_id, role=role, cycle_start_day=5))
        await session.commit()


@pytest.mark.asyncio
async def test_bot_resolve_user_role_owner(fresh_db):
    from app.bot.auth import bot_resolve_user_role  # ImportError until 12-04
    from app.db.models import UserRole

    await _seed(fresh_db, tg_user_id=9_444_444_001, role=UserRole.owner)
    result = await bot_resolve_user_role(9_444_444_001)
    assert result is UserRole.owner


@pytest.mark.asyncio
async def test_bot_resolve_user_role_member(fresh_db):
    from app.bot.auth import bot_resolve_user_role
    from app.db.models import UserRole

    await _seed(fresh_db, tg_user_id=9_444_444_002, role=UserRole.member)
    result = await bot_resolve_user_role(9_444_444_002)
    assert result is UserRole.member


@pytest.mark.asyncio
async def test_bot_resolve_user_role_revoked(fresh_db):
    from app.bot.auth import bot_resolve_user_role
    from app.db.models import UserRole

    await _seed(fresh_db, tg_user_id=9_444_444_003, role=UserRole.revoked)
    result = await bot_resolve_user_role(9_444_444_003)
    assert result is UserRole.revoked


@pytest.mark.asyncio
async def test_bot_resolve_user_role_unknown_returns_none(fresh_db):
    from app.bot.auth import bot_resolve_user_role

    result = await bot_resolve_user_role(9_444_444_999)
    assert result is None
