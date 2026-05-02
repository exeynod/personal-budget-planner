# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-01)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.
**Current focus:** Phase 1 — Infrastructure & Auth

## Current Position

Phase: 1 of 6 (Infrastructure & Auth)
Plan: 3 of 6 in current phase
Status: Executing — Wave 1 complete, Wave 2 starting
Last activity: 2026-05-02 — Plans 01-01 (test stubs), 01-02 (Python skeleton), 01-03 (frontend scaffold) merged

Progress: [█████░░░░░] 50% (3/6 plans)

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

- Init: Single-tenant без `user_id` в FK — упрощение для pet
- Init: `cycle_start_day` настраиваемый, default = 5 — payroll-цикл заказчика
- Init: Дельта расходов = `План−Факт`, доходов = `Факт−План` — единое правило «положительная = хорошо»
- Init: Деньги в копейках (BIGINT) — избежать ошибок округления float
- Init: Worker как отдельный контейнер — чистое разделение API и cron-задач
- Init: Frontend = React 18 + Vite + `@telegram-apps/sdk-react`

### Pending Todos

None yet.

### Blockers/Concerns

- Q-7 (HLD): UI-kit Mini App ещё не выбран (`@telegram-apps/telegram-ui` vs shadcn vs кастом). Нужно решить в Phase 2 при первой UI-задаче.
- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, можно отложить до production-deploy.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-02
Stopped at: Phase 1 execution in progress (Wave 0/4)
Resume file: None
