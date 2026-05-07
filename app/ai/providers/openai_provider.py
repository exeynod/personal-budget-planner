"""OpenAI провайдер с streaming, function-calling и usage tracking.

Use openai Python SDK (AsyncOpenAI). Stream=True for token-by-token UX.
Tool calls accumulated across chunks. `stream_options.include_usage`
makes OpenAI emit a final usage record (Phase 10.1 cost optimization).
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.ai.llm_client import AbstractLLMClient

logger = logging.getLogger(__name__)


# gpt-4.1-nano pricing (2026-01, USD per 1M tokens). Update when OpenAI
# changes prices. Cached input gets a 75% discount when caching applies
# (≥1024 prompt tokens — currently we don't hit this threshold).
_PRICING_PER_M = {
    "gpt-4.1-nano": {"input": 0.10, "cached_input": 0.025, "output": 0.40},
    "gpt-4.1-mini": {"input": 0.40, "cached_input": 0.10, "output": 1.60},
    "gpt-4.1": {"input": 2.00, "cached_input": 0.50, "output": 8.00},
    "gpt-4o-mini": {"input": 0.15, "cached_input": 0.075, "output": 0.60},
}


def _estimate_cost_usd(model: str, usage: dict) -> float:
    """Estimate USD cost from usage counts. Returns 0.0 for unknown models."""
    pricing = _PRICING_PER_M.get(model)
    if not pricing:
        return 0.0
    prompt = usage.get("prompt_tokens", 0) or 0
    cached = usage.get("cached_tokens", 0) or 0
    completion = usage.get("completion_tokens", 0) or 0
    uncached = max(prompt - cached, 0)
    return (
        uncached * pricing["input"]
        + cached * pricing["cached_input"]
        + completion * pricing["output"]
    ) / 1_000_000


def humanize_provider_error(exc: Exception) -> str:
    """Преобразовать исключение в безопасное user-facing сообщение.

    SEC-02 (Plan 16-02): public helper, переиспользуется не только провайдером
    OpenAI, но и outer SSE-handler в `app/api/routes/ai.py:_event_stream` —
    чтобы любой `Exception` отдавал пользователю generic-text без утечки
    `str(exc)` (имена классов, file paths, SQL фрагменты, raw API keys).

    Полный traceback должен идти отдельно через `logger.exception(...)`
    — sanitization применяется только к user-visible payload.
    """
    status = getattr(exc, "status_code", None)
    raw = str(exc).lower()
    if status == 401 or "401" in raw or "incorrect api key" in raw or "invalid_api_key" in raw:
        return "AI не настроен на сервере (проверь OPENAI_API_KEY)."
    if status == 429 or "429" in raw or "rate_limit" in raw:
        return "Слишком много запросов. Подожди минуту и повтори."
    if status and 500 <= status < 600:
        return "AI-провайдер временно недоступен. Попробуй позже."
    return "Не удалось получить ответ от AI. Попробуй позже."


class OpenAIProvider(AbstractLLMClient):
    """OpenAI gpt-4.1-nano провайдер с streaming и function calling (AI-08)."""

    def __init__(self, api_key: str, model: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Стримит события разговора через OpenAI Streaming API.

        messages: список dict. Если первый message — system с cache_control,
        он передаётся как structured content для prompt caching (ephemeral).
        tools: список в формате OpenAI function calling.

        Возвращаемые события:
        - {type: "token", data: "текст"} — фрагмент ответа
        - {type: "tool_start", data: "имя_tool"} — начало вызова tool
        - {type: "tool_call_complete", data: "<json>"} — полный tool call (internal)
        - {type: "tool_end", data: ""} — окончание вызова tool
        - {type: "done", data: ""} — конец стрима
        - {type: "error", data: "сообщение"} — ошибка
        """
        try:
            kwargs: dict = {
                "model": self._model,
                "messages": messages,
                "stream": True,
                # Phase 10.1: ask OpenAI to include a final usage record
                # in the stream so we can log token costs.
                "stream_options": {"include_usage": True},
            }
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"

            accumulated_tool_calls: dict[int, dict] = {}

            stream = await self._client.chat.completions.create(**kwargs)
            async for chunk in stream:
                # Final usage record arrives in a chunk with no choices.
                if getattr(chunk, "usage", None):
                    u = chunk.usage
                    cached = 0
                    details = getattr(u, "prompt_tokens_details", None)
                    if details is not None:
                        cached = getattr(details, "cached_tokens", 0) or 0
                    usage_data = {
                        "model": self._model,
                        "prompt_tokens": u.prompt_tokens,
                        "completion_tokens": u.completion_tokens,
                        "cached_tokens": cached,
                        "total_tokens": u.total_tokens,
                    }
                    usage_data["est_cost_usd"] = _estimate_cost_usd(
                        self._model, usage_data
                    )
                    yield {"type": "usage", "data": usage_data}
                    continue

                choice = chunk.choices[0] if chunk.choices else None
                if choice is None:
                    continue

                delta = choice.delta

                if delta.content:
                    yield {"type": "token", "data": delta.content}

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in accumulated_tool_calls:
                            accumulated_tool_calls[idx] = {
                                "id": tc.id or "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc.function:
                            if tc.function.name:
                                accumulated_tool_calls[idx]["name"] += tc.function.name
                            if tc.function.arguments:
                                accumulated_tool_calls[idx]["arguments"] += tc.function.arguments

                if choice.finish_reason == "tool_calls":
                    for idx in sorted(accumulated_tool_calls.keys()):
                        tc = accumulated_tool_calls[idx]
                        yield {"type": "tool_start", "data": tc["name"]}
                        yield {
                            "type": "tool_call_complete",
                            "data": json.dumps(tc),
                        }
                    yield {"type": "tool_end", "data": ""}
                    accumulated_tool_calls.clear()

            yield {"type": "done", "data": ""}

        except Exception as exc:  # pragma: no cover
            logger.exception("OpenAI provider error during streaming")
            yield {"type": "error", "data": humanize_provider_error(exc)}

    async def embed(self, text: str) -> list[float]:
        """Генерирует embedding через OpenAI Embeddings API (text-embedding-3-small).

        text: строка для векторизации.
        Возвращает list[float] размерностью 1536.
        """
        from app.core.settings import settings

        response = await self._client.embeddings.create(
            input=text,
            model=settings.EMBEDDING_MODEL,
        )
        return response.data[0].embedding
