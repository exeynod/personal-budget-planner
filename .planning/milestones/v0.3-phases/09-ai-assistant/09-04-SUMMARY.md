---
phase: 09-ai-assistant
plan: "04"
subsystem: ai-business-logic
tags: [ai, tools, openai, function-calling, prompt-caching, conversation, pydantic, sqlalchemy]

# Dependency graph
requires:
  - "09-02 (AiConversation + AiMessage ORM models)"
provides:
  - "4 async AI tool functions над данными бюджета (get_period_balance, get_category_summary, query_transactions, get_forecast)"
  - "TOOLS_SCHEMA в формате OpenAI function calling"
  - "build_messages() с cache_control ephemeral на системном промпте (prompt caching)"
  - "ai_conversation_service: get_or_create_conversation, append_message, get_recent_messages, clear_conversation"
  - "Pydantic v2 схемы ChatRequest, ChatMessageRead, ChatHistoryResponse"
affects:
  - "09-05-PLAN (API routes — импортируют tools, service, schemas)"
  - "09-03 (LLM client — использует build_messages())"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tool function: async def f(db: AsyncSession) -> dict — никогда не бросает исключение"
    - "cache_control: {type: ephemeral} на system prompt content block (OpenAI prompt caching)"
    - "Conversation CRUD: db.flush() вместо db.commit() (commit делает FastAPI dependency)"
    - "T-09-07 mitigated: min(limit, 50) в query_transactions"

key-files:
  created:
    - app/ai/__init__.py
    - app/ai/tools.py
    - app/ai/system_prompt.py
    - app/services/ai_conversation_service.py
    - app/api/schemas/ai.py
  modified: []

key-decisions:
  - "4 tool-функции возвращают dict[str, Any], при ошибке — {'error': 'message'} — LLM объясняет пользователю"
  - "query_transactions: min(limit, 50) — T-09-07 mitigation, LLM не может запросить >50 записей"
  - "build_messages(): tool role -> assistant (simplification, достаточно для single-turn tool-use)"
  - "ai_conversation_service использует db.flush() без commit — транзакция управляется FastAPI get_db"

# Metrics
duration: "~15 min"
completed: 2026-05-06
tasks: 2
files_created: 5
files_modified: 0
---

# Phase 9 Plan 04: AI Tools + Conversation Service Summary

**One-liner:** 4 async tool-функции над БД бюджета (get_period_balance, get_category_summary, query_transactions, get_forecast), системный промпт с cache_control ephemeral, ai_conversation_service CRUD, Pydantic схемы для AI chat endpoints.

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-05-06T04:06:47Z
- **Tasks:** 2 / 2
- **Files created:** 5

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Tools registry + system prompt builder | 3c099ed | app/ai/__init__.py, app/ai/tools.py, app/ai/system_prompt.py |
| 2 | AI conversation service + Pydantic schemas | 3f503fa | app/services/ai_conversation_service.py, app/api/schemas/ai.py |

## What Was Built

### Task 1: app/ai/tools.py + app/ai/system_prompt.py

**app/ai/tools.py** — 4 async tool-функции + TOOLS_SCHEMA + TOOL_FUNCTIONS:

- `get_period_balance(db)` — баланс (факт/план/дельта) активного периода
- `get_category_summary(db, category_id?)` — сводка по всем/одной категории (план/факт/дельта с правильным знаком)
- `query_transactions(db, limit?, kind?, category_id?)` — список транзакций с фильтрацией; limit ограничен min(limit, 50)
- `get_forecast(db)` — линейный прогноз остатка к концу периода; возвращает insufficient_data=True если прошло <3 дней
- `TOOLS_SCHEMA` — список dict в формате OpenAI function calling (4 элемента)
- `TOOL_FUNCTIONS` — маппинг name -> function для dispatch в route handler

Все функции: `try/except Exception` — при любой ошибке возвращают `{"error": "..."}`.

**app/ai/system_prompt.py** — системный промпт + builder:

- `SYSTEM_PROMPT` — русский промпт (роль бюджетного помощника, правила ответа)
- `build_messages(history, user_message)` — собирает messages list для OpenAI API с `cache_control: {type: ephemeral}` на system block (AI-07 prompt caching)

### Task 2: app/services/ai_conversation_service.py + app/api/schemas/ai.py

**app/services/ai_conversation_service.py** — CRUD сервис:

- `get_or_create_conversation(db)` — единственная conversation (single-tenant), создаёт если нет
- `append_message(db, conv_id, role, content?, tool_name?, tool_result?)` — добавить сообщение
- `get_recent_messages(db, conv_id, limit=20)` — последние N сообщений в хронологическом порядке
- `clear_conversation(db, conv_id)` — hard delete всех ai_message (conversation остаётся)

Нет `db.commit()` — транзакция управляется FastAPI `get_db` dependency.

**app/api/schemas/ai.py** — Pydantic v2 схемы:

- `ChatRequest` — `{message: str}` для POST /ai/chat
- `ChatMessageRead` — одно сообщение истории (id, role, content, tool_name, created_at)
- `ChatHistoryResponse` — `{messages: list[ChatMessageRead]}` для GET /ai/history

## Decisions Made

- Tool role="tool" в history конвертируется в role="assistant" в build_messages() — упрощение, достаточно для однооборотного tool-use
- delta_cents для расходов = plan - actual, для доходов = actual - plan (положит. = хорошо, соответствует CLAUDE.md)
- get_forecast возвращает insufficient_data=True при elapsed_days < 3 — защита от деления на малое число

## Deviations from Plan

None — план выполнен точно по спецификации.

## Threat Model Compliance

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-09-07 | Mitigated | `min(limit, 50)` в query_transactions |
| T-09-08 | Accepted | Single-tenant, данные только владельца |
| T-09-09 | Accepted | Hard delete by design, created_at как audit |
| T-09-10 | Mitigated | is_archived фильтр + category_id фильтр |

## Known Stubs

None — все функции реализованы с реальными SQL-запросами.

## Threat Flags

None — новых сетевых endpoints не создано в этом плане.

## Self-Check: PASSED

- [x] `app/ai/tools.py` — 4 async tool functions, TOOLS_SCHEMA (4 items), TOOL_FUNCTIONS dict
- [x] `app/ai/system_prompt.py` — build_messages() с cache_control ephemeral
- [x] `app/services/ai_conversation_service.py` — 4 async functions, no db.commit()
- [x] `app/api/schemas/ai.py` — 3 Pydantic schemas с from_attributes=True
- [x] Commits 3c099ed, 3f503fa confirmed in git log
- [x] `python3 -c "from app.ai.tools import TOOLS_SCHEMA; assert len(TOOLS_SCHEMA)==4"` — OK
- [x] `python3 -c "from app.ai.system_prompt import build_messages"` — OK
- [x] `python3 -c "from app.api.schemas.ai import ChatRequest, ChatHistoryResponse"` — OK
