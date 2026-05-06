"""Сервис управления AI-разговором (AI-06).

Phase 11 (Plan 11-06): per-user AI conversation. Один AiConversation row на
user_id (а не singleton-на-всё-приложение). Последние AI_MAX_CONTEXT_MESSAGES
передаются в LLM (старше — хранятся в БД). Clear = hard delete ai_message строк
(conversation строка остаётся).

Все функции принимают ``user_id: int`` keyword-only и фильтруют
``AiConversation.user_id`` / ``AiMessage.user_id``. AiMessage.user_id
дополнительный фильтр: даже если злоумышленник угадал conv_id чужого юзера,
запрос ничего не вернёт (T-11-06-05 defense-in-depth).
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AiConversation, AiMessage


async def get_or_create_conversation(
    db: AsyncSession, *, user_id: int
) -> AiConversation:
    """Вернуть единственную conversation юзера, создать если её нет (AI-06).

    Phase 11: scoped по user_id. Каждый user имеет свою conversation row.
    """
    q = (
        select(AiConversation)
        .where(AiConversation.user_id == user_id)
        .limit(1)
    )
    conv = (await db.execute(q)).scalar_one_or_none()
    if conv is None:
        conv = AiConversation(user_id=user_id)
        db.add(conv)
        await db.flush()  # получить id без commit (commit делает get_db)
    return conv


async def append_message(
    db: AsyncSession,
    conv_id: int,
    *,
    user_id: int,
    role: str,
    content: str | None = None,
    tool_name: str | None = None,
    tool_result: str | None = None,
) -> AiMessage:
    """Добавить сообщение в conversation (AI-06).

    Phase 11: AiMessage INSERT задаёт user_id явно (T-11-06-05).

    role: 'user' | 'assistant' | 'tool'
    tool_name: имя инструмента (для role='tool')
    tool_result: JSON-строка результата tool (для role='tool')
    """
    msg = AiMessage(
        user_id=user_id,
        conversation_id=conv_id,
        role=role,
        content=content,
        tool_name=tool_name,
        tool_result=tool_result,
    )
    db.add(msg)
    await db.flush()
    return msg


async def get_recent_messages(
    db: AsyncSession,
    conv_id: int,
    *,
    user_id: int,
    limit: int = 20,
) -> list[AiMessage]:
    """Вернуть последние limit сообщений conversation (AI-06).

    Phase 11: сообщения фильтруются и по conversation_id, и по user_id —
    defense-in-depth даже если conv_id принадлежит другому tenant
    (T-11-06-05).

    Используется для формирования LLM-контекста.
    """
    q = (
        select(AiMessage)
        .where(
            AiMessage.conversation_id == conv_id,
            AiMessage.user_id == user_id,
        )
        .order_by(AiMessage.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    # Вернуть в хронологическом порядке (oldest first)
    return list(reversed(rows))


async def clear_conversation(
    db: AsyncSession, conv_id: int, *, user_id: int
) -> None:
    """Hard delete всех сообщений conversation (AI-06).

    Phase 11: scoped по user_id — даже если conv_id чужой, ничего не удалит.

    Conversation-строка остаётся — только сообщения удаляются.
    """
    await db.execute(
        delete(AiMessage).where(
            AiMessage.conversation_id == conv_id,
            AiMessage.user_id == user_id,
        )
    )
    # Flush без commit (commit делает get_db dependency)
    await db.flush()
