"""REST эндпоинты Phase 9 AI Assistant (AI-03, AI-06, AI-09, AI-10).

Endpoints:
- POST /ai/chat — SSE streaming chat с tool-use (AI-03)
- GET /ai/history — история разговора (AI-06)
- DELETE /ai/conversation — очистка истории (AI-06)

Auth: router-level Depends(get_current_user) — все эндпоинты защищены.
Rate limit: in-memory sliding window 30 req/мин (AI-10, per-process).
OPENAI_API_KEY: только в backend ENV, никогда не в ответах (AI-09).
"""
from __future__ import annotations

import json
import time
from collections import defaultdict
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import get_llm_client
from app.ai.system_prompt import build_messages
from app.ai.tools import TOOL_FUNCTIONS, TOOLS_SCHEMA
from app.api.dependencies import get_current_user, get_db
from app.api.schemas.ai import ChatHistoryResponse, ChatMessageRead, ChatRequest
from app.core.settings import settings
from app.services import ai_conversation_service as conv_svc

router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[Depends(get_current_user)],
)

# ---- Rate limiter (in-memory, per-process) — AI-10 ----
_rate_buckets: dict[int, list[float]] = defaultdict(list)
_RATE_LIMIT = 30  # запросов в минуту
_RATE_WINDOW = 60.0  # секунд


def _is_rate_limited(user_id: int) -> bool:
    """Sliding window rate limiter. Возвращает True если лимит превышен."""
    now = time.monotonic()
    bucket = _rate_buckets[user_id]
    # Очистить устаревшие записи
    _rate_buckets[user_id] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[user_id]) >= _RATE_LIMIT:
        return True
    _rate_buckets[user_id].append(now)
    return False


def _get_llm_client():
    """Фабрика LLM-клиента — отдельная функция для monkeypatching в тестах."""
    return get_llm_client()


async def _event_stream(
    db: AsyncSession,
    user_id: int,
    message: str,
) -> AsyncGenerator[str, None]:
    """Генератор SSE-событий для POST /ai/chat.

    Протокол:
    1. Получить/создать conversation
    2. Сохранить user message в БД
    3. Получить историю (последние AI_MAX_CONTEXT_MESSAGES)
    4. Собрать messages с system prompt (cache_control)
    5. Стримить события от LLM
    6. Обработать tool_call_complete → вызвать tool → добавить tool result
    7. Продолжить стриминг с tool result
    8. Сохранить assistant response в БД
    9. Отправить done
    """
    try:
        # 1. Conversation persistence
        conv = await conv_svc.get_or_create_conversation(db)
        await conv_svc.append_message(db, conv.id, role="user", content=message)
        await db.flush()

        # 2. История для LLM-контекста
        history_msgs = await conv_svc.get_recent_messages(
            db, conv.id, limit=settings.AI_MAX_CONTEXT_MESSAGES
        )
        # Преобразовать ORM → dict для build_messages (исключить только что добавленный user msg)
        history_dicts = [
            {"role": m.role, "content": m.content or ""}
            for m in history_msgs[:-1]
        ]

        # 3. Собрать messages с cache_control
        llm_messages = build_messages(history_dicts, message)

        # 4. Стримить события
        client = _get_llm_client()
        assistant_content_parts: list[str] = []
        pending_tool_call: dict | None = None

        async for event in client.chat(llm_messages, tools=TOOLS_SCHEMA):
            etype = event.get("type", "")

            if etype == "token":
                assistant_content_parts.append(event["data"])
                yield f"data: {json.dumps({'type': 'token', 'data': event['data']})}\n\n"

            elif etype == "tool_start":
                yield f"data: {json.dumps({'type': 'tool_start', 'data': event['data']})}\n\n"

            elif etype == "tool_call_complete":
                # Internal event — не экспортируем в SSE
                pending_tool_call = json.loads(event["data"])

            elif etype == "tool_end":
                # Вызвать tool и продолжить стриминг
                if pending_tool_call:
                    tool_name = pending_tool_call.get("name", "")
                    raw_args = pending_tool_call.get("arguments", "{}")
                    try:
                        kwargs = json.loads(raw_args) if raw_args else {}
                    except json.JSONDecodeError:
                        kwargs = {}

                    tool_fn = TOOL_FUNCTIONS.get(tool_name)
                    if tool_fn:
                        tool_result = await tool_fn(db, **kwargs)
                    else:
                        tool_result = {"error": f"Неизвестный инструмент: {tool_name}"}

                    # Сохранить tool result в БД
                    await conv_svc.append_message(
                        db,
                        conv.id,
                        role="tool",
                        tool_name=tool_name,
                        tool_result=json.dumps(tool_result, ensure_ascii=False),
                    )

                    # Второй LLM-запрос с tool result
                    tool_result_str = json.dumps(tool_result, ensure_ascii=False)
                    llm_messages_with_result = llm_messages + [
                        {
                            "role": "tool",
                            "tool_call_id": pending_tool_call.get("id", ""),
                            "content": tool_result_str,
                        }
                    ]

                    async for event2 in client.chat(
                        llm_messages_with_result, tools=None
                    ):
                        etype2 = event2.get("type", "")
                        if etype2 == "token":
                            assistant_content_parts.append(event2["data"])
                            yield f"data: {json.dumps({'type': 'token', 'data': event2['data']})}\n\n"
                        elif etype2 == "done":
                            break
                        elif etype2 == "error":
                            yield f"data: {json.dumps({'type': 'error', 'data': event2['data']})}\n\n"
                            return

                yield f"data: {json.dumps({'type': 'tool_end', 'data': ''})}\n\n"
                pending_tool_call = None

            elif etype == "done":
                # Сохранить полный assistant ответ в БД
                full_response = "".join(assistant_content_parts)
                if full_response:
                    await conv_svc.append_message(
                        db, conv.id, role="assistant", content=full_response
                    )
                await db.flush()
                yield f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n"
                return

            elif etype == "error":
                yield f"data: {json.dumps({'type': 'error', 'data': event['data']})}\n\n"
                return

    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'data': str(exc)})}\n\n"


@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """POST /ai/chat — streaming SSE ответ (AI-03).

    Rate limit: 30 req/мин → 429 + Retry-After (AI-10).
    """
    user_id: int = current_user["id"]

    if _is_rate_limited(user_id):
        raise HTTPException(
            status_code=429,
            detail="Превышен лимит запросов. Попробуй через минуту.",
            headers={"Retry-After": "60"},
        )

    return StreamingResponse(
        _event_stream(db, user_id, body.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history", response_model=ChatHistoryResponse)
async def get_history(
    db: AsyncSession = Depends(get_db),
) -> ChatHistoryResponse:
    """GET /ai/history — история разговора (AI-06)."""
    conv = await conv_svc.get_or_create_conversation(db)
    msgs = await conv_svc.get_recent_messages(
        db, conv.id, limit=settings.AI_MAX_CONTEXT_MESSAGES
    )
    return ChatHistoryResponse(
        messages=[
            ChatMessageRead(
                id=m.id,
                role=m.role,
                content=m.content,
                tool_name=m.tool_name,
                created_at=m.created_at.isoformat(),
            )
            for m in msgs
        ]
    )


@router.delete("/conversation", status_code=204)
async def clear_conversation(
    db: AsyncSession = Depends(get_db),
) -> None:
    """DELETE /ai/conversation — очистить историю разговора (AI-06)."""
    conv = await conv_svc.get_or_create_conversation(db)
    await conv_svc.clear_conversation(db, conv.id)
