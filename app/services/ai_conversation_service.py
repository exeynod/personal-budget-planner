"""Сервис управления AI-разговором (AI-06).

Одна глобальная conversation на пользователя (single-tenant).
Последние AI_MAX_CONTEXT_MESSAGES передаются в LLM (старше — хранятся в БД).
Clear = hard delete ai_message строк (conversation строка остаётся).
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AiConversation, AiMessage


async def get_or_create_conversation(db: AsyncSession) -> AiConversation:
    """Вернуть единственную conversation, создать если её нет (AI-06)."""
    q = select(AiConversation).limit(1)
    conv = (await db.execute(q)).scalar_one_or_none()
    if conv is None:
        conv = AiConversation()
        db.add(conv)
        await db.flush()  # получить id без commit (commit делает get_db)
    return conv


async def append_message(
    db: AsyncSession,
    conv_id: int,
    role: str,
    content: str | None = None,
    tool_name: str | None = None,
    tool_result: str | None = None,
) -> AiMessage:
    """Добавить сообщение в conversation (AI-06).

    role: 'user' | 'assistant' | 'tool'
    tool_name: имя инструмента (для role='tool')
    tool_result: JSON-строка результата tool (для role='tool')
    """
    msg = AiMessage(
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
    limit: int = 20,
) -> list[AiMessage]:
    """Вернуть последние limit сообщений conversation (AI-06).

    Используется для формирования LLM-контекста.
    """
    q = (
        select(AiMessage)
        .where(AiMessage.conversation_id == conv_id)
        .order_by(AiMessage.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    # Вернуть в хронологическом порядке (oldest first)
    return list(reversed(rows))


async def clear_conversation(db: AsyncSession, conv_id: int) -> None:
    """Hard delete всех сообщений conversation (AI-06).

    Conversation-строка остаётся — только сообщения удаляются.
    """
    await db.execute(
        delete(AiMessage).where(AiMessage.conversation_id == conv_id)
    )
    # Flush без commit (commit делает get_db dependency)
    await db.flush()
