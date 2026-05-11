"""Phase 38-02 (REQ-38-02) — analytics_event log + track_event service.

Covers:
- ``track_event`` inserts a row with the expected event_name + JSON props.
- ``track_event`` silently swallows errors (fire-and-forget semantics) —
  передача ``None`` как session ломается внутри сервиса, но НЕ raise'ит.

Fixture pattern скопирован из ``tests/test_business_personal_tag.py``:
dedicated engine + ``SET LOCAL row_security = off`` для seed/cleanup. RLS на
``analytics_event`` нет (анонимизированный internal-log), но ``app_user`` row
требует bypass.
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def db_check_session():
    """Lightweight session for inserting/inspecting analytics_event rows."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_track_event_inserts_row(db_check_session):
    """Happy path — service вставляет одну строку с правильными полями."""
    from app.services.analytics import track_event

    await db_check_session.execute(text("SET LOCAL row_security = off"))
    # Seed minimal user.
    r = await db_check_session.execute(
        text(
            "INSERT INTO app_user (tg_user_id, role) "
            "VALUES (9001300001, 'owner') RETURNING id"
        )
    )
    user_id = r.scalar_one()
    await db_check_session.commit()

    try:
        await track_event(
            db_check_session,
            event_name="test.event",
            user_id=user_id,
            props={"key": "value"},
        )
        rows = (
            await db_check_session.execute(
                text(
                    "SELECT event_name, event_props FROM analytics_event "
                    "WHERE user_id = :u"
                ),
                {"u": user_id},
            )
        ).all()
        assert len(rows) == 1
        assert rows[0][0] == "test.event"
        assert rows[0][1] == {"key": "value"}
    finally:
        await db_check_session.execute(text("SET LOCAL row_security = off"))
        await db_check_session.execute(
            text("DELETE FROM analytics_event WHERE user_id = :u"),
            {"u": user_id},
        )
        await db_check_session.execute(
            text("DELETE FROM app_user WHERE id = :u"), {"u": user_id}
        )
        await db_check_session.commit()


async def test_track_event_silently_swallows_errors():
    """Bad DB session должна не raise — fire-and-forget semantics.

    ``None`` как ``db`` ломается на ``db.execute(...)`` (AttributeError),
    но сервис ловит любое Exception и логирует WARNING.
    """
    from app.services.analytics import track_event

    # Should not raise — proves fire-and-forget contract.
    await track_event(None, event_name="test.error")  # type: ignore[arg-type]
