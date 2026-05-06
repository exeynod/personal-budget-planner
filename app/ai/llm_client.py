"""Абстрактный LLM-клиент и фабрика провайдеров (AI-08).

Провайдер выбирается через ENV LLM_PROVIDER=openai|anthropic|deepseek.
Дефолт: openai (gpt-4.1-nano).

Контракт chat():
- принимает messages (list[dict] в формате OpenAI) + опциональный tools schema
- возвращает AsyncGenerator, генерирующий dict {type, data}
- type: "token" | "tool_start" | "tool_end" | "done" | "error"
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, AsyncGenerator

if TYPE_CHECKING:
    pass


class AbstractLLMClient(ABC):
    """Provider-agnostic интерфейс для LLM-вызовов с streaming (AI-08)."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Стримит события разговора.

        Каждое событие — dict с полями:
        - type: "token" | "tool_start" | "tool_end" | "done" | "error"
        - data: строка (токен текста, имя tool, пустая строка, сообщение ошибки)

        messages: список dict в формате OpenAI (role + content).
        tools: список dict в формате OpenAI function calling (опционально).
        """
        # Объявление абстрактного метода — реализуется в провайдере
        yield {}  # type: ignore[misc]

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Возвращает embedding-вектор для заданного текста.

        text: строка для векторизации.
        Возвращает list[float] размерностью EMBEDDING_DIM (1536 для text-embedding-3-small).
        """
        ...


def get_llm_client() -> AbstractLLMClient:
    """Фабрика: возвращает провайдер по значению ENV LLM_PROVIDER.

    Поддерживаемые провайдеры:
    - openai (default) → OpenAIProvider
    Расширяемость: добавить elif для anthropic/deepseek без изменения контракта.
    """
    from app.core.settings import settings
    from app.ai.providers.openai_provider import OpenAIProvider

    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai":
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            model=settings.LLM_MODEL,
        )

    raise ValueError(
        f"Неизвестный LLM_PROVIDER: {provider!r}. "
        "Поддерживается: 'openai'. "
        "Для anthropic/deepseek — добавить провайдер в app/ai/providers/."
    )
