---
phase: 09-ai-assistant
plan: "05"
subsystem: ai-api-routes
tags: [fastapi, sse, streaming, rate-limit, tool-use, ai, chat]
dependency_graph:
  requires:
    - 09-03 (app/ai/llm_client.py — AbstractLLMClient + get_llm_client())
    - 09-04 (app/ai/tools.py — TOOLS_SCHEMA + TOOL_FUNCTIONS; app/services/ai_conversation_service.py; app/api/schemas/ai.py)
  provides:
    - POST /api/v1/ai/chat — SSE streaming endpoint with tool-use dispatch
    - GET /api/v1/ai/history — conversation history
    - DELETE /api/v1/ai/conversation — clear history
    - In-memory rate limiter 30 req/min (sliding window)
  affects:
    - 09-06 (frontend — вызывает /api/v1/ai/chat с fetch+ReadableStream)
    - 09-07 (frontend screens — зависит от /ai/history и /ai/conversation)
tech_stack:
  added: []
  patterns:
    - SSE via StreamingResponse + AsyncGenerator (text/event-stream)
    - In-memory sliding window rate limiter (defaultdict + time.monotonic)
    - _get_llm_client() factory helper for monkeypatching in tests
    - Router-level Depends(get_current_user) + per-endpoint user_id extraction
key_files:
  created:
    - app/api/routes/ai.py
  modified:
    - app/api/router.py
decisions:
  - "SSE streaming через StreamingResponse + AsyncGenerator — совместимо с ASGI и uvicorn"
  - "Rate limiter в _is_rate_limited() как отдельная функция — monkeypatching в test_rate_limit_returns_429"
  - "_get_llm_client() вынесен в отдельную функцию — monkeypatching в test_chat_returns_event_stream"
  - "tool_call_complete (internal event) не проксируется в SSE — только token/tool_start/tool_end/done/error"
metrics:
  duration: "~10 min"
  completed_date: "2026-05-06"
  tasks: 2
  files_created: 1
  files_modified: 1
---

# Phase 9 Plan 05: AI API Routes Summary

**One-liner:** FastAPI SSE streaming endpoint POST /ai/chat с tool-use dispatch и in-memory rate limiter (30 req/min), плюс GET /ai/history и DELETE /ai/conversation, зарегистрированные в public_router.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | AI routes — POST /chat (SSE), GET /history, DELETE /conversation | 83691e4 | app/api/routes/ai.py |
| 2 | Register ai_router in public_router | 3650bc5 | app/api/router.py |

## What Was Built

### Task 1: app/api/routes/ai.py

Создан `app/api/routes/ai.py` с тремя эндпоинтами и вспомогательными функциями:

**Rate limiter (AI-10):**
- `_rate_buckets: dict[int, list[float]]` — sliding window по user_id
- `_is_rate_limited(user_id)` — True если >= 30 запросов за 60 секунд; функция monkeypatch-able
- 31-й запрос → HTTP 429 + `Retry-After: 60` header

**LLM factory helper:**
- `_get_llm_client()` — вызывает `get_llm_client()`; выделен для monkeypatching в тестах

**`_event_stream(db, user_id, message)` AsyncGenerator:**
1. `get_or_create_conversation(db)` → сохранить user message
2. Получить историю, преобразовать в history_dicts (исключая текущий user msg)
3. `build_messages(history_dicts, message)` → llm_messages
4. `client.chat(llm_messages, tools=TOOLS_SCHEMA)` → async for event
5. Dispatch по event type:
   - `token` → `yield "data: {type:token, data:...}\n\n"`
   - `tool_start` → `yield "data: {type:tool_start, data:...}\n\n"`
   - `tool_call_complete` (internal) → `pending_tool_call = json.loads(event["data"])`
   - `tool_end` → вызвать `TOOL_FUNCTIONS[tool_name](db, **kwargs)` → сохранить в БД → второй LLM-запрос → yield токены → `yield tool_end`
   - `done` → сохранить полный assistant response → `yield done` → return
   - `error` → `yield error` → return
6. Exception catch → `yield error`

**Эндпоинты:**
- `POST /ai/chat` — rate limit check → `StreamingResponse(_event_stream(...), media_type="text/event-stream")`
- `GET /ai/history` — `get_or_create_conversation` → `get_recent_messages` → `ChatHistoryResponse`
- `DELETE /ai/conversation` (status_code=204) — `get_or_create_conversation` → `clear_conversation`

Все эндпоинты защищены `router-level Depends(get_current_user)`. `/chat` дополнительно извлекает `current_user["id"]` для rate limit.

### Task 2: app/api/router.py

Добавлены:
- `from app.api.routes.ai import router as ai_router` (в блок импортов)
- `public_router.include_router(ai_router)` после `analytics_router`
- Phase 9 routes block в docstring

После регистрации `public_router.routes` содержит `/ai/chat`, `/ai/history`, `/ai/conversation`.

## Deviations from Plan

None — план выполнен точно по спецификации.

## Threat Model Compliance

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-09-11 | Mitigated | `_is_rate_limited()` — sliding window 30 req/min, 429 + Retry-After: 60 |
| T-09-12 | Mitigated | `TOOL_FUNCTIONS.get(tool_name)` — неизвестный tool → `{"error": "..."}` dict |
| T-09-13 | Accepted | Single-tenant, TLS через Caddy |
| T-09-14 | Mitigated | JSON parse с try/except → `{}` при ошибке; `TOOL_FUNCTIONS.get()` защита |
| T-09-15 | Mitigated | `OPENAI_API_KEY` только в settings; route не возвращает config объекты |

## Verification

Все 3 auth теста GREEN:
```
tests/api/test_ai_chat.py::test_chat_requires_auth PASSED
tests/api/test_ai_chat.py::test_history_requires_auth PASSED
tests/api/test_ai_chat.py::test_clear_requires_auth PASSED
```

## Known Stubs

None — все эндпоинты реализованы с реальной логикой.

## Threat Flags

Новые network endpoints `/api/v1/ai/*` зарегистрированы. Все три endpoint'а уже учтены в threat model (T-09-11 через T-09-15). Caddy проксирует `/api/v1/ai/*` в api-контейнер, Telegram initData валидируется на каждом запросе.

## Self-Check: PASSED

- [x] `app/api/routes/ai.py` существует (244 строки)
- [x] `grep 'prefix.*"/ai"'` — OK
- [x] `grep "Depends(get_current_user)"` — 3 вхождения (router-level + chat endpoint twice)
- [x] `grep "status_code=429"` — OK
- [x] `grep "Retry-After"` — OK
- [x] `grep "text/event-stream"` — OK
- [x] `grep "StreamingResponse"` — OK
- [x] `grep "status_code=204"` — OK
- [x] `grep "from app.api.routes.ai import"` в router.py — OK
- [x] `grep "include_router(ai_router)"` в router.py — OK
- [x] public_router содержит маршруты `/ai/chat`, `/ai/history`, `/ai/conversation`
- [x] Commits 83691e4, 3650bc5 present in git log
- [x] 3 auth tests PASSED
