"""Pydantic v2 схемы для AI Assistant endpoints (AI-03, AI-06)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class ChatRequest(BaseModel):
    """Тело запроса POST /ai/chat."""

    model_config = ConfigDict(from_attributes=True)

    message: str


class ChatMessageRead(BaseModel):
    """Одно сообщение из истории (ответ GET /ai/history)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str  # "user" | "assistant" | "tool"
    content: Optional[str] = None
    tool_name: Optional[str] = None
    created_at: str  # ISO datetime строка


class ChatHistoryResponse(BaseModel):
    """Ответ GET /ai/history."""

    model_config = ConfigDict(from_attributes=True)

    messages: list[ChatMessageRead]
