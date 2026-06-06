## Project

# TG Budget Planner


<!-- CODEAGENTSWARM PROJECT CONFIG START - DO NOT EDIT -->

## Project Configuration

**Project Name**: tg-budget-planner

_This project name is used for task organization in CodeAgentSwarm. All tasks created in this directory will be associated with this project._

_For complete CodeAgentSwarm instructions, see the global CLAUDE.md file at ~/.claude/CLAUDE.md_

<!-- CODEAGENTSWARM PROJECT CONFIG END -->

Личный Telegram Mini App для планирования и ведения месячного бюджета — перенос Google-таблицы заказчика (план/факт по категориям, шаблон плана, подписки с напоминаниями) в TG-приложение с быстрым вводом трат через Mini App или бот-команды. Авторизация по `tg_user_id`; единственный owner — через `OWNER_TG_ID`. Технически система **multi-tenant via RLS** (см. ниже R9 / ARCH-A7): per-row `user_id`, PostgreSQL Row-Level Security и роли `owner`/`member` уже активны.

**Core Value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу.

See `.planning/PROJECT.md` for full project context.

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

## Conventions

- Деньги хранятся как `BIGINT` (`*_cents`), на UI — рубли. Никаких `float`.
- Бизнес-даты — `DATE`, аудит-времена — `TIMESTAMPTZ` UTC.
- Soft delete только для `category` (через `is_archived`). Транзакции и подписки — hard delete.
- **Multi-tenant via RLS (R9 / ARCH-A7):** не single-tenant. Доменные таблицы несут `user_id`; PostgreSQL Row-Level Security изолирует строки (`user_id = current_setting('app.current_user_id')::bigint`, alembic 0008); роли `owner`/`member` (`UserRole`); каждый запрос вызывает `set_tenant_scope` → `SET LOCAL app.current_user_id` (transaction-scoped, сбрасывается на COMMIT/ROLLBACK). Это security-актив, а не carrying cost. `admin_audit_log` намеренно вне RLS (owner-only под `budget_admin`).
- Знак дельты: «положительная = хорошо». Расходы `План−Факт`, доходы `Факт−План`.
- Period расчёт: `period_for(date, cycle_start_day) -> (period_start, period_end)`.
- Telegram `initData` валидируется HMAC-SHA256 на каждом запросе, `auth_date` ≤ 24ч.
- Internal API endpoints `/api/v1/internal/*` защищены `X-Internal-Token`, не проксируются Caddy наружу.
- Шедулер-джобы оборачиваются в `pg_try_advisory_lock` для исключения гонок.

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

## Project Skills

No project skills found yet.
