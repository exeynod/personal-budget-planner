---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: — Analytics & AI
status: executing
stopped_at: context exhaustion at 75% (2026-05-05)
last_updated: "2026-05-05T18:00:35.131Z"
last_activity: 2026-05-05 -- Phase 8 execution started
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 44
  completed_plans: 44
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05 for milestone v0.3)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.
**Current focus:** Phase 8 — Analytics Backend

## Current Position

Milestone: v0.3 (Active) — Analytics & AI
Phase: 8 (Analytics Backend) — EXECUTING
Plan: 1 of ?
Status: Executing Phase 8
Last activity: 2026-05-05 -- Phase 8 execution started

Previous milestone v0.2 (MVP) — Complete 2026-05-03, 6 phases / 38 plans.

Progress: [          ] 0% (milestone v0.3)

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v0.3 (2026-05-05): Bottom nav реорганизуется в функциональную: Главная / Транзакции / Аналитика / AI / Управление. Заменяет MVP-nav (История/План/Подписки/Ещё) — История+План объединяются в «Транзакции» с под-табами, Подписки+Шаблон+Категории+Настройки в «Управление»
- v0.3 (2026-05-05): LLM provider = OpenAI (gpt-4.1-nano для chat, text-embedding-3-small для эмбеддингов); абстрактный LLM-клиент с `LLM_PROVIDER` ENV для возможности переключения
- v0.3 (2026-05-05): AI Categorization (Phase 10) через embeddings + cosine similarity, без LLM-вызова на каждой транзакции — pgvector в Postgres
- v0.3 (2026-05-05): Аналитика повышена из v2 в v1 — агрегаты считаются на backend, SVG-чарты самописные без chart-libs
- Init: Single-tenant без `user_id` в FK — упрощение для pet
- Init: `cycle_start_day` настраиваемый, default = 5 — payroll-цикл заказчика
- Init: Дельта расходов = `План−Факт`, доходов = `Факт−План` — единое правило «положительная = хорошо»
- Init: Деньги в копейках (BIGINT) — избежать ошибок округления float
- Init: Worker как отдельный контейнер — чистое разделение API и cron-задач
- Init: Frontend = React 18 + Vite + `@telegram-apps/sdk-react`
- 04-01: Untracked test files (58 тестов) проверены и приняты как соответствующие RED-gate требованиям
- 04-01: parse_amount caps at 10^12 копеек (10 млрд рублей) — overflow guard
- 04-01: In-memory disambiguation cache (D-47) — dict + TTL 5 мин, без aiogram FSM
- 04-02: _ensure_category_active private copy в actual.py (не импортируем private из planned.py)
- 04-02: _category_balance inline helper в internal_bot.py (не полный compute_balance — оптимизация)
- 04-02: ActualRead.model_validate(actual_row).model_dump() в process_bot_actual — route re-creates BotActualResponse
- 04-03: /actual/balance объявлен до /actual/{actual_id} — FastAPI first-match routing prevents 422 (T-04-25)
- 04-03: internal_bot_router без dependencies — наследует verify_internal_token от parent (D-54, избегает double-execution)
- 04-04: commands.py — отдельный Router; app/bot/handlers.py (Phase 2) не модифицирован; два роутера в main_bot.py
- 04-04: `router` переименован в `start_router` в main_bot.py — test_main_bot_entry.py обновлён соответственно
- 04-04: _post_internal helper в api_client.py — DRY для Phase 4 bot→api; bind_chat_id без изменений
- 04-05: ActualEditorInitial и ActualEditorSavePayload — именованные интерфейсы (не inline типы) для Plan 04-06 reuse
- 04-05: isEdit guard в JSX используется один (не isEdit && onDelete) — TS2774 prevention
- 04-05: maxTxDateDefault() — fallback today+7d всегда активен (T-04-45 client guard)

### Pending Todos

None yet.

### Blockers/Concerns

- Q-7 (HLD): UI-kit Mini App ещё не выбран (`@telegram-apps/telegram-ui` vs shadcn vs кастом). Нужно решить в Phase 2 при первой UI-задаче.
- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, можно отложить до production-deploy.
- Q-v0.3-1 (Phase 9): Под какую модель кэшируем системный промпт? OpenAI Cached Input включён по умолчанию — нужно убедиться, что `gpt-4.1-nano` его поддерживает (большинство моделей семейства поддерживают). Решить при создании плана Phase 9.
- Q-v0.3-2 (Phase 10): pgvector index — HNSW vs IVFFlat? Для 14 категорий любой ок; HNSW проще, IVFFlat легче бэкапить. Решить в плане Phase 10.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-05T18:00:24.187Z
Stopped at: context exhaustion at 75% (2026-05-05)
Resume file: None
