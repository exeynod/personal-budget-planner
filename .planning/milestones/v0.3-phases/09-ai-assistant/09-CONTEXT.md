# Phase 9: AI Assistant - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Экран AI — полноэкранный conversational chat с tool-use над данными бюджета. Backend: OpenAI gpt-4.1-nano, SSE streaming, persistence в БД, абстрактный LLM-клиент, 4 core tools. Frontend: замена placeholder AiScreen, chat bubbles, tool indicator, suggestion chips.

Вне скоупа: compare_periods и get_subscriptions tools (отложены); модерация; multi-user; AI-категоризация (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Conversation Persistence
- 1 глобальный conversation на пользователя — одна вечная нить, кнопка «Очистить» сбрасывает
- Последние 20 сообщений передаются в LLM-контекст (старше — хранятся в БД, в prompt не включаются)
- Clear conversation = hard delete всех ai_message строк для conversation (схема проще, single-tenant)
- Rate limit: in-memory dict + TTL (asyncio, per-process) — достаточно для single-user pet app

### SSE Streaming Format
- JSON events с type-полем: `{type: "token"|"tool_start"|"tool_end"|"done"|"error", data: ...}`
- Tool events в потоке: tool_start (с названием операции) → tokens → tool_end — фронт показывает pulse-pill
- EventSource client: fetch + ReadableStream (TextDecoder) — поддерживает custom headers с initData auth
- Ошибки: отправить `{type: "error", data: message}` → закрыть стрим

### Tool-Use Design
- 4 core tools в первой итерации: get_period_balance, get_category_summary, query_transactions, get_forecast
- Tool results: structured dict → AI форматирует ответ на естественном языке
- Tool error handling: AI получает `{error: "message"}` → объясняет пользователю
- Prompt caching: system prompt + budget context (категории + активный период) как отдельные cache_control blocks

### Frontend Chat UX
- Suggestion chips: 4 фиксированных — «Каков мой баланс?», «Где я перерасходовал?», «Сколько потратил на еду?», «Сделай прогноз»
- Tool indicator: pulse-pill «Смотрю данные...» появляется между user msg и AI response, исчезает при первом токене
- Ответы AI: inline markdown (bold, ul/ol) через простой inline-parser
- Auto-scroll: scroll-to-bottom при каждом новом токене

### Claude's Discretion
- Конкретный SQL в tools — на усмотрение, следуя паттернам из analytics.py
- Системный промпт на русском или английском — Claude выбирает исходя из практики (рекомендован RU)
- Migration numbering — следовать существующей схеме alembic версий
- Error messages для пользователя — на русском, friendly tone

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/routes/analytics.py` — паттерн FastAPI router с `dependencies=[Depends(get_current_user)]`
- `app/services/analytics.py` — паттерн service layer с async session + SQLAlchemy
- `app/api/schemas/analytics.py` — паттерн Pydantic v2 schemas
- `app/db/models.py` — паттерн SQLAlchemy 2.x ORM с Mapped[] + mapped_column()
- `app/db/session.py` — async session factory
- `frontend/src/screens/AnalyticsScreen.tsx` — паттерн экрана с loading/error/empty states
- `frontend/src/hooks/useAnalytics.ts` — паттерн hook с cancelled flag + fetch

### Established Patterns
- Backend: async SQLAlchemy, FastAPI dependencies, Pydantic v2
- Auth: `get_current_user` dependency на всех routes
- Money: BIGINT kopecks, formatKopecks() на фронте
- DB tables: Mapped[], mapped_column(), UniqueConstraint, Index
- Frontend: CSS modules, Phosphor icons, PageTitle component
- Frontend state: useState + useEffect с cancelled flag

### Integration Points
- `app/api/router.py` — зарегистрировать ai_router
- `app/db/models.py` — добавить AiConversation + AiMessage модели
- `frontend/src/screens/AiScreen.tsx` — заменить placeholder
- `frontend/src/App.tsx` — AiScreen уже подключён к nav

</code_context>

<specifics>
## Specific Ideas

- Sketch 009-A: fullscreen chat layout (победитель из MANIFEST.md)
- AI-таб уже подсвечен фиолетовым (#a78bfa) в BottomNav — сохранить
- gpt-4.1-nano — проверить поддержку prompt caching (предположительно да, как у всех gpt-4.1 family)
- Системный промпт включает: роль (бюджетный помощник), правила (только данные пользователя), список инструментов

</specifics>

<deferred>
## Deferred Ideas

- compare_periods tool — Phase 10 или отдельная задача
- get_subscriptions tool — аналогично
- Named conversation threads — multi-tenant feature, отложено
- Markdown rendering библиотека (marked, remark) — решено inline-parser'ом, библиотека в backlog

</deferred>
