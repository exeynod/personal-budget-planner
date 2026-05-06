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


class UsageBucket(BaseModel):
    """Aggregated AI usage stats for a time bucket (Phase 10.1)."""

    model_config = ConfigDict(from_attributes=True)

    requests: int
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int
    total_tokens: int
    est_cost_usd: float


class UsageResponse(BaseModel):
    """Ответ GET /ai/usage — token usage and estimated USD cost.

    today: requests since midnight UTC (in-process ring buffer).
    session_total: everything currently in the ring buffer.
    buffer_size / buffer_max: the in-memory window we currently track.
    Per-process scope — counters reset when api container restarts.
    """

    model_config = ConfigDict(from_attributes=True)

    today: UsageBucket
    session_total: UsageBucket
    buffer_size: int
    buffer_max: int
