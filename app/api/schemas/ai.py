"""Pydantic v2 схемы для AI Assistant endpoints (AI-03, AI-06, AI-V10-03)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    """Тело запроса POST /ai/chat.

    Phase 67 P2-4 (BE-F5): ``message`` ограничено по длине — пустая строка
    отклоняется (422), oversize (>4000 символов) отклоняется (422). Это
    защищает от token-cost amplification на нетрастед free-text от клиента.
    """

    model_config = ConfigDict(from_attributes=True)

    message: str = Field(min_length=1, max_length=4000)


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

    category_id и name — None если уверенность ниже порога (0.35,
    SUGGEST_THRESHOLD). confidence — фактический cosine similarity от 0.0 до
    1.0 (Phase 67 P2-5: реальное значение возвращается даже при miss).
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

    Phase 32 REQ-32-03: per-user AI cap visibility.
    cap_cents/remaining_cents/spent_cents_period — optional fields populated
    from ai_usage_log aggregation для current user. Legacy callers (без cap
    awareness) продолжают работать через optional/default=None.
    """

    model_config = ConfigDict(from_attributes=True)

    today: UsageBucket
    session_total: UsageBucket
    buffer_size: int
    buffer_max: int
    # Phase 32 REQ-32-03: per-user AI cap visibility.
    cap_cents: int | None = None  # current user's spending_cap_cents (USD-storage)
    remaining_cents: int | None = None  # cap_cents - spent_cents_period (>=0)
    spent_cents_period: int | None = None  # spend для current MSK month (cents)


class ObservationResponse(BaseModel):
    """Ответ GET /ai/observation (Phase 27, AI-V10-03).

    Server-side rule-engine observation for the AI screen initial-state.
    Pure-Python (no LLM), 1h per-user in-memory cache. Detailed rules
    documented in app/services/ai_observation.py.

    Fields:
        text: Single-line RU sentence (e.g. "Кафе уже +20% к лимиту").
        generated_at: MSK timestamp of computation. Frontend may render a
            relative "Сегодня в HH:MM" line beside the text.
    """

    model_config = ConfigDict(from_attributes=True)

    text: str
    generated_at: datetime
