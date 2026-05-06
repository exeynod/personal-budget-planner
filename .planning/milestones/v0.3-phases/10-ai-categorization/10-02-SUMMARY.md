---
phase: "10"
plan: "02"
subsystem: ai-categorization
tags: [embeddings, pgvector, cosine-similarity, fastapi, openai]
dependency_graph:
  requires: ["10-01"]
  provides: ["embedding-service", "suggest-category-endpoint"]
  affects: ["app/ai/", "app/api/routes/", "app/api/schemas/"]
tech_stack:
  added: []
  patterns: ["abstract-method-extension", "service-class", "pgvector-cosine-similarity"]
key_files:
  created:
    - app/ai/embedding_service.py
    - app/api/routes/ai_suggest.py
  modified:
    - app/ai/llm_client.py
    - app/ai/providers/openai_provider.py
    - app/api/schemas/ai.py
    - app/api/router.py
decisions:
  - "EmbeddingService размещён в app/ai/ (не app/services/) — тесты импортируют из app.ai.embedding_service"
  - "ai_suggest router регистрируется с prefix=/ai в public_router, итоговый путь /ai/suggest-category"
  - "suggest_category возвращает confidence=0.0 (не ошибку) если нет категорий в БД"
metrics:
  duration: "15 minutes"
  completed: "2026-05-06"
  tasks_completed: 4
  tasks_total: 4
  files_created: 2
  files_modified: 4
  tests_passed: 16
---

# Phase 10 Plan 02: Embedding service + suggest API Summary

EmbeddingService с cosine similarity поиском через pgvector и GET /api/v1/ai/suggest-category endpoint.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | abstract embed() в AbstractLLMClient + OpenAIProvider | d3f9180 |
| 2 | EmbeddingService (embed_text, upsert, suggest_category) | 18fff5b |
| 3 | SuggestCategoryResponse schema + ai_suggest router | 7d50527 |
| 4 | Регистрация ai_suggest_router в public_router | 4cb1642 |

## What Was Built

**app/ai/llm_client.py** — добавлен `abstract async embed(text: str) -> list[float]` в `AbstractLLMClient`.

**app/ai/providers/openai_provider.py** — реализован `embed()` через `self._client.embeddings.create(model=settings.EMBEDDING_MODEL)`, возвращает `response.data[0].embedding`.

**app/ai/embedding_service.py** — класс `EmbeddingService`:
- `embed_text(text)` — делегирует в `llm_client.embed()`
- `upsert_category_embedding(db, category_id, vector)` — INSERT ON CONFLICT UPDATE с `now()`
- `suggest_category(db, description)` — генерирует query vector, выполняет SQL с `<=>` оператором pgvector, возвращает `{category_id, name, confidence}` если confidence >= 0.5, иначе None
- Константа `EMBEDDING_DIM = 1536`
- Фабрика `get_embedding_service()` → `EmbeddingService(get_llm_client())`

**app/api/schemas/ai.py** — добавлен `SuggestCategoryResponse(category_id: int|None, name: str|None, confidence: float)`.

**app/api/routes/ai_suggest.py** — `GET /suggest-category?q=<text>`:
- Проверяет `settings.ENABLE_AI_CATEGORIZATION` → 404 если False
- Возвращает SuggestCategoryResponse (confidence=0.0 при отсутствии совпадений)

**app/api/router.py** — `ai_suggest_router` подключён к `public_router` с `prefix="/ai"`.

## Test Results

16/16 тестов в `tests/ai/test_embeddings.py` прошли (GREEN).

## Deviations from Plan

**1. [Rule 2 - Структура] EmbeddingService в app/ai/ вместо app/services/**
- **Причина:** Тесты импортируют `from app.ai.embedding_service import EmbeddingService`
- **Решение:** Разместили в `app/ai/embedding_service.py` согласно ожиданиям тестов

**2. [Rule 2 - Упрощение] ai_suggest — отдельный router, не модуль ai_categorization**
- **Причина:** Тесты импортируют `from app.api.routes.ai_suggest import router`
- **Решение:** Создали `app/api/routes/ai_suggest.py` вместо `ai_categorization.py`

## Self-Check: PASSED

- app/ai/embedding_service.py: FOUND
- app/api/routes/ai_suggest.py: FOUND
- app/api/schemas/ai.py SuggestCategoryResponse: FOUND
- Все 4 коммита присутствуют: d3f9180, 18fff5b, 7d50527, 4cb1642
- 16/16 тестов GREEN
