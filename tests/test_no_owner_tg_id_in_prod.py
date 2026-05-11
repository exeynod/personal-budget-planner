"""Phase 32 REQ-32-02: production path has NO OWNER_TG_ID magic bypass.

Sanity: даже если initData валидируется для tg_user_id == OWNER_TG_ID,
при DEV_MODE=false и отсутствии app_user row — auth должен return 403,
а НЕ имплицитный owner-upsert.

Этот test закрывает регресcium-loophole: легко случайно вернуть legacy
behaviour 'OWNER_TG_ID auto-resolves to owner without DB row' через
дефолт в `_dev_mode_resolve_owner`. Тест явно проверяет, что production
path этим не пользуется.
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.api.dependencies import get_current_user
from app.core.settings import settings

pytestmark = pytest.mark.asyncio


async def test_prod_path_403_for_unknown_tg_user_id(db_session, monkeypatch):
    """DEV_MODE=false + initData для tg_user_id=OWNER_TG_ID без app_user row → 403."""
    # Ensure no row with OWNER_TG_ID exists.
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    await db_session.execute(
        text("DELETE FROM app_user WHERE tg_user_id = :tg"),
        {"tg": settings.OWNER_TG_ID},
    )
    await db_session.commit()

    # Force production path.
    monkeypatch.setattr("app.core.settings.settings.DEV_MODE", False, raising=False)

    # Patch validate_init_data to return OWNER_TG_ID synthetically.
    with patch(
        "app.api.dependencies.validate_init_data",
        return_value={"id": settings.OWNER_TG_ID},
    ):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                x_telegram_init_data="mocked-payload",
                authorization=None,
                x_test_user=None,
                db=db_session,
            )
        assert exc_info.value.status_code == 403, (
            f"Expected 403 (Not authorized) but got {exc_info.value.status_code}"
        )


async def test_prod_path_role_based_only(db_session, monkeypatch):
    """User с role='member' и matching tg_user_id → returns user (не зависит от OWNER_TG_ID)."""
    tg = 7_777_000 + (uuid.uuid4().int & 0xFFF)

    try:
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("INSERT INTO app_user (tg_user_id, role) VALUES (:tg, 'member')"),
            {"tg": tg},
        )
        await db_session.commit()

        monkeypatch.setattr("app.core.settings.settings.DEV_MODE", False, raising=False)

        with patch(
            "app.api.dependencies.validate_init_data",
            return_value={"id": tg},
        ):
            user = await get_current_user(
                x_telegram_init_data="mocked-payload",
                authorization=None,
                x_test_user=None,
                db=db_session,
            )
            assert user.tg_user_id == tg
            assert user.role.value == "member"  # NOT promoted via OWNER_TG_ID
    finally:
        await db_session.execute(text("RESET ROLE"))
        await db_session.execute(text("SET LOCAL row_security = off"))
        await db_session.execute(
            text("DELETE FROM app_user WHERE tg_user_id = :tg"), {"tg": tg}
        )
        await db_session.commit()
