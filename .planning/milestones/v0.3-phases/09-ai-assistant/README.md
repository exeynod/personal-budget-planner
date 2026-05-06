# Phase 9 — AI Assistant

**Milestone:** v0.3 — Analytics & AI
**Status:** Pending plan creation
**Depends on:** Phase 7 (placeholder AiScreen существует)

## Goal

Экран AI — conversational chat с tool-use над данными бюджета. OpenAI gpt-4.1-nano, streaming SSE, prompt caching, persistence в БД, абстрактный provider-agnostic LLM-клиент. Tools покрывают основные сценарии (баланс, топ расходов, сравнение периодов).

## Requirements

AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-08, AI-09, AI-10

## Reference Sketches

- `009-ai-chat/` — winner: variant A (полноэкранный чат)

## Locked Decisions (per PROJECT.md Key Decisions)

- **Provider:** OpenAI (`openai` Python SDK)
- **Chat model:** `gpt-4.1-nano` (default), fallback `gpt-4o-mini` через ENV
- **Architecture:** abstract LLM client `app/ai/llm_client.py` — `chat()` / `embed()` контракт, `LLM_PROVIDER` ENV для swap (openai / anthropic / deepseek)
- **Streaming:** SSE через FastAPI, OpenAI SDK `stream=True`
- **Persistence:** new tables `ai_conversation`, `ai_message`
- **Security:** `OPENAI_API_KEY` only backend ENV, never frontend
- **Rate limit:** 30 req/min per user

## Files to Touch

**Backend:**
- `app/ai/__init__.py` (NEW)
- `app/ai/llm_client.py` (NEW) — provider-agnostic interface
- `app/ai/providers/openai_provider.py` (NEW) — OpenAI implementation
- `app/ai/tools.py` (NEW) — function-calling tools registry
- `app/ai/system_prompt.py` (NEW) — системный промпт + контекст бюджета
- `app/api/v1/ai.py` (NEW) — chat endpoint + SSE
- `app/services/ai_conversation_service.py` (NEW) — persistence
- `app/models/ai_conversation.py` (NEW) — SQLAlchemy models
- `app/schemas/ai.py` (NEW) — Pydantic schemas
- `alembic/versions/000X_ai_tables.py` (NEW) — migration

**Frontend:**
- `frontend/src/screens/AiScreen.tsx` — replace placeholder
- `frontend/src/screens/AiScreen.module.css`
- `frontend/src/components/ChatMessage.tsx` (NEW) — bubble renderers
- `frontend/src/components/ToolUseIndicator.tsx` (NEW)
- `frontend/src/api/ai.ts` (NEW) — chat client с EventSource
- `frontend/src/hooks/useAiConversation.ts` (NEW)

**Tests:**
- `tests/ai/test_llm_client.py` (NEW) — unit tests для абстракции (mocking provider)
- `tests/ai/test_tools.py` (NEW) — каждый tool isolated test
- `tests/api/test_ai_chat.py` (NEW) — SSE streaming integration
- `tests/services/test_ai_conversation_service.py` (NEW)
- `frontend/tests/e2e/ai.spec.ts` (NEW)

## Tools (function calling) — финальный список фиксируется в плане

- `query_transactions(period_id?, category_id?, kind?, limit)` → list of transactions
- `get_period_balance(period_id?)` → balance + delta + plan/fact totals
- `get_category_summary(category_id, period_id?)` → planned, actual, delta для категории
- `compare_periods(period_a_id, period_b_id)` → side-by-side aggregates
- `get_subscriptions(active_only?)` → list of subscriptions
- `get_forecast(period_id?)` → прогноз остатка к концу периода

## Plans

To be created via `/gsd-plan-phase 9`. Expected ~7-8 plans:
1. Wave 0: RED tests
2. DB schema + migration (ai_conversation, ai_message)
3. LLM client abstraction + OpenAI provider
4. Tools registry + system prompt + context builder
5. API endpoints (chat init + SSE stream + clear conversation)
6. Frontend chat components
7. Frontend integration (AiScreen + EventSource hook)
8. Verification + UAT (rate limit, streaming, tool-use display)
