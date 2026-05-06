"""OpenAI провайдер с streaming и prompt caching (AI-07, AI-08).

Использует openai Python SDK (AsyncOpenAI).
Streaming: stream=True → итерируем по чанкам через client.chat.completions.create().
Prompt caching: системный промпт с cache_control {"type": "ephemeral"} —
OpenAI автоматически кэширует при ≥1024 токенов (снижает input cost).
Tool calls: обрабатываем через accumulate-and-dispatch паттерн.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.ai.llm_client import AbstractLLMClient

logger = logging.getLogger(__name__)


def _humanize_provider_error(exc: Exception) -> str:
    """Преобразовать исключение OpenAI SDK в безопасное user-facing сообщение.

    Никогда не возвращаем str(exc) наружу — могут протечь raw API ключи,
    URL-ы и метаданные провайдера.
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
            }
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"

            # Accumulate tool call delta для сборки полного вызова
            accumulated_tool_calls: dict[int, dict] = {}

            stream = await self._client.chat.completions.create(**kwargs)
            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if choice is None:
                    continue

                delta = choice.delta

                # Токен текста
                if delta.content:
                    yield {"type": "token", "data": delta.content}

                # Накопление tool call дельт
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

                # finish_reason tool_calls — сигнализировать tool_start
                if choice.finish_reason == "tool_calls":
                    for idx in sorted(accumulated_tool_calls.keys()):
                        tc = accumulated_tool_calls[idx]
                        yield {"type": "tool_start", "data": tc["name"]}
                        # Сохраняем полный вызов для возврата в messages
                        # (используется в ai.py route для следующего шага)
                        yield {
                            "type": "tool_call_complete",
                            "data": json.dumps(tc),
                        }
                    yield {"type": "tool_end", "data": ""}
                    accumulated_tool_calls.clear()

            yield {"type": "done", "data": ""}

        except Exception as exc:  # pragma: no cover
            logger.exception("OpenAI provider error during streaming")
            yield {"type": "error", "data": _humanize_provider_error(exc)}

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
