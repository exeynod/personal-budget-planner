"""Unit тесты ai_conversation_service (AI-06).
RED gate: модуль ещё не существует.
Тесты FAIL до Plan 09-02 (DB schema) + Plan 09-05 (service).
"""
from __future__ import annotations
import os

import pytest


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


async def _seed_test_user(session):
    """Truncate DB, seed AppUser, return its PK id."""
    from tests.helpers.seed import seed_user, truncate_db
    await truncate_db()
    user = await seed_user(session, tg_user_id=999888777)
    await session.commit()
    await session.refresh(user)
    return user.id


def test_service_importable():
    """Сервис должен быть импортируемым."""
    from app.services import ai_conversation_service  # noqa: F401


def test_service_has_required_functions():
    """Сервис должен экспортировать 4 функции контракта."""
    from app.services import ai_conversation_service as svc
    assert hasattr(svc, "get_or_create_conversation")
    assert hasattr(svc, "append_message")
    assert hasattr(svc, "get_recent_messages")
    assert hasattr(svc, "clear_conversation")


@pytest.mark.asyncio
async def test_get_or_create_conversation_idempotent(db_session):
    """get_or_create_conversation вызванный дважды возвращает одну запись."""
    _require_db()
    from app.services.ai_conversation_service import get_or_create_conversation
    user_id = await _seed_test_user(db_session)
    conv1 = await get_or_create_conversation(db_session, user_id=user_id)
    conv2 = await get_or_create_conversation(db_session, user_id=user_id)
    assert conv1.id == conv2.id


@pytest.mark.asyncio
async def test_append_and_get_messages(db_session):
    """append_message + get_recent_messages: сообщение появляется в списке."""
    _require_db()
    from app.services.ai_conversation_service import (
        append_message,
        get_or_create_conversation,
        get_recent_messages,
    )
    user_id = await _seed_test_user(db_session)
    conv = await get_or_create_conversation(db_session, user_id=user_id)
    await append_message(db_session, conv.id, user_id=user_id, role="user", content="Тест сообщение")
    msgs = await get_recent_messages(db_session, conv.id, user_id=user_id, limit=20)
    assert len(msgs) == 1
    assert msgs[0].role == "user"
    assert msgs[0].content == "Тест сообщение"


@pytest.mark.asyncio
async def test_clear_conversation_removes_messages(db_session):
    """clear_conversation удаляет все ai_message строки conversation."""
    _require_db()
    from app.services.ai_conversation_service import (
        append_message,
        clear_conversation,
        get_or_create_conversation,
        get_recent_messages,
    )
    user_id = await _seed_test_user(db_session)
    conv = await get_or_create_conversation(db_session, user_id=user_id)
    await append_message(db_session, conv.id, user_id=user_id, role="user", content="msg1")
    await append_message(db_session, conv.id, user_id=user_id, role="assistant", content="resp1")
    await clear_conversation(db_session, conv.id, user_id=user_id)
    msgs = await get_recent_messages(db_session, conv.id, user_id=user_id, limit=20)
    assert len(msgs) == 0
