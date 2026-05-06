"""RED тесты контракта AbstractLLMClient (AI-08).
FAIL до Plan 09-03 (LLM client implementation).
"""
from __future__ import annotations
import pytest


def test_abstract_llm_client_importable():
    """AbstractLLMClient должен быть импортируемым."""
    from app.ai.llm_client import AbstractLLMClient  # noqa: F401


def test_openai_provider_importable():
    """OpenAI провайдер должен быть импортируемым."""
    from app.ai.providers.openai_provider import OpenAIProvider  # noqa: F401


def test_provider_factory_returns_openai_by_default():
    """get_llm_client() без ENV должен вернуть OpenAIProvider."""
    import os
    os.environ.setdefault("LLM_PROVIDER", "openai")
    from app.ai.llm_client import get_llm_client
    from app.ai.providers.openai_provider import OpenAIProvider
    client = get_llm_client()
    assert isinstance(client, OpenAIProvider)


@pytest.mark.asyncio
async def test_chat_method_is_async_generator():
    """chat() должен возвращать AsyncGenerator."""
    import inspect
    from app.ai.llm_client import AbstractLLMClient
    assert hasattr(AbstractLLMClient, "chat")
    # chat — abstract, проверяем сигнатуру
    sig = inspect.signature(AbstractLLMClient.chat)
    assert "messages" in sig.parameters
