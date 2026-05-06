---
phase: 09-ai-assistant
plan: "03"
subsystem: ai-llm-client
tags: [openai, streaming, asyncgenerator, llm, prompt-caching, abstract-factory]
dependency_graph:
  requires:
    - 09-02 (app/core/settings.py с OPENAI_API_KEY, LLM_PROVIDER, LLM_MODEL)
  provides:
    - AbstractLLMClient ABC с методом chat() AsyncGenerator
    - get_llm_client() фабрика провайдеров
    - OpenAIProvider с streaming через AsyncOpenAI + tool call accumulate-dispatch
  affects:
    - 09-04-PLAN (system_prompt.py — использует get_llm_client())
    - 09-05-PLAN (api/routes/ai.py — импортирует get_llm_client())
tech_stack:
  added:
    - openai>=1.50.0 (AsyncOpenAI, stream=True)
  patterns:
    - AbstractLLMClient ABC с abstractmethod AsyncGenerator
    - get_llm_client() factory pattern (LLM_PROVIDER ENV dispatch)
    - accumulate-and-dispatch для tool call delta chunks
    - stream=True + async for chunk in stream (openai standard streaming API)
key_files:
  created:
    - app/ai/__init__.py
    - app/ai/llm_client.py
    - app/ai/providers/__init__.py
    - app/ai/providers/openai_provider.py
  modified:
    - pyproject.toml (добавлен openai>=1.50.0)
decisions:
  - "Использован client.chat.completions.create(stream=True) вместо client.beta.chat.completions.stream() — более стабильный API, совместим с openai 2.x"
  - "openai SDK добавлен в pyproject.toml как основная зависимость (Rule 2 — missing critical dependency)"
  - "cache_control ephemeral передаётся в messages прозрачно — провайдер не модифицирует структуру (system_prompt.py в Plan 04 форматирует промпт)"
metrics:
  duration: "~15 min"
  completed_date: "2026-05-06"
  tasks: 2
  files_created: 4
  files_modified: 1
---

# Phase 9 Plan 03: AbstractLLMClient + OpenAI Provider Summary

**One-liner:** AbstractLLMClient ABC + OpenAIProvider с AsyncOpenAI streaming (stream=True), accumulate-dispatch для tool calls, prompt caching через cache_control ephemeral, фабрика get_llm_client() по LLM_PROVIDER ENV.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | AbstractLLMClient + фабрика get_llm_client() | 019dff9 | app/ai/__init__.py, app/ai/llm_client.py, app/ai/providers/__init__.py |
| 2 | OpenAI провайдер со streaming и prompt caching | a55d9c4 | app/ai/providers/openai_provider.py |
| - | [Rule 2] openai SDK в pyproject.toml | 6fb3119 | pyproject.toml |

## What Was Built

### Task 1: AbstractLLMClient + get_llm_client()

Создан `app/ai/llm_client.py`:
- `AbstractLLMClient` — ABC с абстрактным методом `chat(messages, tools=None) -> AsyncGenerator[dict, None]`
- Каждое событие: `{type: "token"|"tool_start"|"tool_call_complete"|"tool_end"|"done"|"error", data: str}`
- `get_llm_client()` — фабрика: читает `settings.LLM_PROVIDER`, возвращает `OpenAIProvider(api_key, model)`
- Расширяемость: `elif provider == "anthropic"` добавляется без изменения контракта

Созданы пустые `app/ai/__init__.py` и `app/ai/providers/__init__.py`.

### Task 2: OpenAIProvider

Создан `app/ai/providers/openai_provider.py`:
- `OpenAIProvider(api_key, model)` — `__init__` создаёт `AsyncOpenAI(api_key=api_key)`
- `chat()` — async generator через `client.chat.completions.create(stream=True)`
- Итерирует чанки, извлекает `choice.delta.content` → `yield {"type": "token", "data": content}`
- Для tool calls: accumulate delta → при `finish_reason == "tool_calls"` → `tool_start`, `tool_call_complete` (JSON), `tool_end`
- `OPENAI_API_KEY` не хардкодится — берётся из `__init__` параметра (передаётся из `settings` через фабрику)
- Prompt caching: провайдер прозрачно передаёт messages — `cache_control` структурируется в system_prompt.py (Plan 04)

### Deviation: openai SDK в pyproject.toml (Rule 2)

openai Python SDK отсутствовал в `pyproject.toml`. Добавлен `openai>=1.50.0` как основная зависимость — без него OpenAIProvider не импортируется (Rule 2: missing critical dependency для корректной работы).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Dependency] openai SDK добавлен в pyproject.toml**
- **Found during:** Task 2
- **Issue:** `openai` не был в списке зависимостей `pyproject.toml`, хотя `openai_provider.py` делает `from openai import AsyncOpenAI`
- **Fix:** Добавлен `"openai>=1.50.0"` в `dependencies` списке `pyproject.toml`
- **Files modified:** `pyproject.toml`
- **Commit:** 6fb3119

**2. [Rule 1 - API Compatibility] Использован стандартный streaming API вместо beta**
- **Found during:** Task 2
- **Issue:** Псевдо-код в плане использовал `client.beta.chat.completions.stream(**kwargs) as stream` с событийной типизацией, но openai SDK 2.x beta API возвращает typed events (`ContentDeltaEvent`, `ChunkEvent`), несовместимые с паттерном `chunk.choices[0].delta`
- **Fix:** Заменено на `client.chat.completions.create(stream=True)` — стандартный streaming API, возвращает ChatCompletionChunk с `choices[0].delta` — точно как в плане
- **Files modified:** `app/ai/providers/openai_provider.py`
- **Commit:** a55d9c4

## Threat Model Compliance

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-09-04 | Mitigated | OPENAI_API_KEY только в settings; в openai_provider.py нет хардкода (берётся из __init__ параметра) |
| T-09-05 | Deferred | Rate limit 30 req/мин — реализуется в Plan 09-05 (API route уровень) |
| T-09-06 | Accepted | tool_call_complete — internal event, не экспортируется в SSE |

## Known Stubs

None.

## Threat Flags

None — новых network endpoints или auth paths не создано. Новая зависимость на внешний API (OpenAI) уже учтена в threat model T-09-04/T-09-05.

## Self-Check: PASSED

- [x] `app/ai/__init__.py` существует
- [x] `app/ai/llm_client.py` содержит `class AbstractLLMClient` и `def get_llm_client`
- [x] `app/ai/providers/__init__.py` существует
- [x] `app/ai/providers/openai_provider.py` содержит `class OpenAIProvider`
- [x] Commits 019dff9, a55d9c4, 6fb3119 confirmed in git log
- [x] `from app.ai.llm_client import AbstractLLMClient, get_llm_client` — OK
- [x] `from app.ai.providers.openai_provider import OpenAIProvider` — OK
- [x] `tests/ai/test_llm_client.py` — 4/4 passed (RED gate GREEN)
- [x] `grep "OPENAI_API_KEY" app/ai/providers/openai_provider.py` — 0 строк (не хардкодится)
