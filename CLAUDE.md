<!-- GSD:project-start source:PROJECT.md -->
## Project

# TG Budget Planner

Личный Telegram Mini App для планирования и ведения месячного бюджета — перенос Google-таблицы заказчика (план/факт по категориям, шаблон плана, подписки с напоминаниями) в TG-приложение с быстрым вводом трат через Mini App или бот-команды. Single-tenant: один пользователь, авторизация по `tg_user_id` через `OWNER_TG_ID`.

**Core Value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.

See `.planning/PROJECT.md` for full project context.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.x (async), Pydantic v2
- **Bot**: aiogram 3.x (отдельный контейнер)
- **Frontend**: React 18 + Vite + TypeScript + `@telegram-apps/sdk-react`
- **DB**: PostgreSQL 16 + Alembic
- **Scheduler**: APScheduler (отдельный контейнер `worker`)
- **Hosting**: VPS + docker-compose (5 сервисов: caddy, api, bot, worker, db) + Caddy с Let's Encrypt
- **TZ**: расчёты периодов и шедулер `Europe/Moscow`, БД UTC
- **Money**: BIGINT копейки

See `docs/HLD.md` for full architecture and API contract.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- Деньги хранятся как `BIGINT` (`*_cents`), на UI — рубли. Никаких `float`.
- Бизнес-даты — `DATE`, аудит-времена — `TIMESTAMPTZ` UTC.
- Soft delete только для `category` (через `is_archived`). Транзакции и подписки — hard delete.
- Single-tenant в MVP: FK на `app_user` НЕ вводим, миграция на multi-tenant — отдельная задача.
- Знак дельты: «положительная = хорошо». Расходы `План−Факт`, доходы `Факт−План`.
- Period расчёт: `period_for(date, cycle_start_day) -> (period_start, period_end)`.
- Telegram `initData` валидируется HMAC-SHA256 на каждом запросе, `auth_date` ≤ 24ч.
- Internal API endpoints `/api/v1/internal/*` защищены `X-Internal-Token`, не проксируются Caddy наружу.
- Шедулер-джобы оборачиваются в `pg_try_advisory_lock` для исключения гонок.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

5 docker-контейнеров:
- `caddy` — TLS + reverse proxy + отдача SPA-статики
- `api` — FastAPI REST + валидация TG initData
- `bot` — aiogram, команды + push-отправка
- `worker` — APScheduler с PostgreSQL jobstore (3 джобы: notify_subscriptions 09:00, charge_subscriptions 00:05, close_period 00:01)
- `db` — PostgreSQL 16

`api` / `bot` / `worker` шарят один Python-codebase, точки входа разные.

6 БД-таблиц: `app_user`, `category`, `budget_period`, `plan_template_item`, `planned_transaction`, `actual_transaction`, `subscription`. ERD и индексы — в `docs/HLD.md` §2.

Sketch winners в `.planning/sketches/MANIFEST.md`: 001-B (dashboard tabs), 002-B (bottom-sheet), 003 (4 edge-states), 004-A (timeline), 005-B (grouped+inline), 006-B (scrollable onboarding).
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found yet.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` — do not edit manually.
<!-- GSD:profile-end -->
