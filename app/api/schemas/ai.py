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


class SuggestCategoryResponse(BaseModel):
    """Ответ GET /ai/suggest-category.

    category_id и name — None если уверенность ниже порога (0.5).
    confidence — cosine similarity от 0.0 до 1.0.
    """

    model_config = ConfigDict(from_attributes=True)

    category_id: Optional[int] = None
    name: Optional[str] = None
    confidence: float
