## Project

# TG Budget Planner

<!-- CODEAGENTSWARM PROJECT CONFIG START - DO NOT EDIT -->

## Project Configuration

**Project Name**: tg-budget-planner

_This project name is used for task organization in CodeAgentSwarm. All tasks created in this directory will be associated with this project._

_For complete CodeAgentSwarm instructions, see the global CLAUDE.md file at ~/.claude/CLAUDE.md_

<!-- CODEAGENTSWARM PROJECT CONFIG END -->

Личный Telegram Mini App для планирования и ведения месячного бюджета (план/факт по
категориям, шаблон плана, подписки с напоминаниями). Авторизация по `tg_user_id`,
единственный owner — `OWNER_TG_ID`. Технически **multi-tenant via RLS** (per-row
`user_id` + PostgreSQL Row-Level Security + роли `owner`/`member`).

**Core value:** в один тап записать факт-трату и видеть актуальную дельту план/факт.

> Этот файл — **карта, не энциклопедия**. Глубина — в `docs/HLD.md`, `docs/RUNBOOK.md`,
> per-service доках (`docs/services/*.md`), `docs/adr/`, `.planning/`. Читай их по нужде.

## Стек

Python 3.12 · FastAPI · SQLAlchemy 2.x async · Pydantic v2 · aiogram 3 · APScheduler ·
React 18 + Vite + TS (`@telegram-apps/sdk-react`) · PostgreSQL 16 (+pgvector) + Alembic ·
VPS + docker-compose (5 сервисов) + Caddy/Let's Encrypt.

## Layout

```
app/                 общий Python-codebase (3 точки входа ниже шарят его)
  api/               FastAPI REST + валидация TG initData
  bot/               aiogram — команды + push
  worker/jobs/       APScheduler-джобы (notify/close_period/purge)
  services/          доменная логика (план/факт, категории, подписки, онбординг)
  core/              config, security (HMAC initData), RLS set_tenant_scope
  db/                models.py · base · session
  ai/                категоризация трат (OpenAI + pgvector)
main_api.py · main_bot.py · main_worker.py   точки входа (разные процессы/контейнеры)
frontend/            React+Vite SPA (тема liquid_glass; e2e в tests/e2e/)
alembic/versions/    миграции — ЕДИНСТВЕННЫЙ источник истины схемы БД
contract/            openapi.json (дамп из живого api) → web schema.ts + iOS DTO
ios/                 нативный iOS-клиент (XcodeGen)
tests/               pytest (на живом PG; RLS-роль budget_app)
scripts/             run-integration-tests · check-no-manual-ddl · ci-local · seed_extra_dev
docs/                HLD · RUNBOOK · DEPLOY · adr · services/
```

## Сервисы (docker-compose)

| Сервис   | Точка входа      | Назначение                                             | Доки                                               |
| -------- | ---------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `caddy`  | —                | TLS + reverse proxy + отдача SPA-статики               | `deploy/Caddyfile*`, `docs/DEPLOY.md`              |
| `api`    | `main_api.py`    | FastAPI REST + валидация TG initData                   | [docs/services/api.md](docs/services/api.md)       |
| `bot`    | `main_bot.py`    | aiogram — команды + push-отправка                      | [docs/services/bot.md](docs/services/bot.md)       |
| `worker` | `main_worker.py` | APScheduler (notify 09:00 / close 00:01 / purge 02:00) | [docs/services/worker.md](docs/services/worker.md) |
| `db`     | —                | PostgreSQL 16 + pgvector, RLS                          | `docs/HLD.md` §2 (ERD)                             |

`api`/`bot`/`worker` — один codebase `app/`, разные entrypoints. 7 таблиц: `app_user`,
`category`, `budget_period`, `plan_template_item`, `planned_transaction`,
`actual_transaction`, `subscription` (+ AI/audit). ERD/индексы — `docs/HLD.md` §2.

## Жёсткие инварианты

- **Деньги — `BIGINT` копейки** (`*_cents`), на UI рубли. Никаких `float`.
- **Даты:** бизнес-даты `DATE`, аудит-времена `TIMESTAMPTZ` UTC.
- **TZ:** расчёты периодов и шедулер — `Europe/Moscow`; БД — UTC.
- **Multi-tenant via RLS** (не single-tenant): доменные таблицы несут `user_id`;
  RLS изолирует (`user_id = current_setting('app.current_user_id')::bigint`, alembic 0008);
  каждый запрос вызывает `set_tenant_scope` → `SET LOCAL app.current_user_id`
  (transaction-scoped). Это security-актив. `admin_audit_log` намеренно вне RLS.
- **Схема БД — только через Alembic** (`alembic/versions/`). Сырой `CREATE/ALTER/DROP
TABLE` в `app/`/`main_*.py` запрещён — ловит `make check-no-manual-ddl` (escape:
  `DDL-EXEMPT`).
- **Soft delete только для `category`** (`is_archived`); транзакции/подписки — hard delete.
- **Знак дельты — «положительная = хорошо»:** расходы `План−Факт`, доходы `Факт−План`.
- **Period:** `period_for(date, cycle_start_day) -> (period_start, period_end)`.
- **initData** валидируется HMAC-SHA256 на каждом запросе, `auth_date` ≤ 24ч.
- **Internal endpoints** `/api/v1/internal/*` защищены `X-Internal-Token`, наружу не проксируются.
- **Шедулер-джобы** обёрнуты в `pg_try_advisory_lock` (защита от гонок).
- **Дизайн — единственный:** `liquid_glass` (тумблер `ui.theme`).
- **Контракт:** `contract/openapi.json` → клиентские типы; правка API без regen роняет
  `make contract-check`. Перегенерить: `make contract` + `npm run gen:api`.

## Reference-docs drift

Правка поведения сервиса обновляет его доку (`docs/services/<svc>.md`) и/или
`docs/HLD.md` в ТОМ ЖЕ коммите. Доки описывают **реальное** поведение; желаемое →
`docs/adr` или `.planning`. pre-commit хук напоминает про доки при правке
`app/db/models.py` / `alembic/versions/*`.

## Don'ts

- ❌ Сырой DDL в `app/` вместо Alembic-миграции — падает на `check-no-manual-ddl`.
- ❌ `float` для денег — только `BIGINT` копейки.
- ❌ Hand-edit `contract/openapi.json` / `frontend/src/api/generated/schema.ts` —
  перегенерить (`make contract` / `npm run gen:api`).
- ❌ Обходить RLS / писать без `set_tenant_scope` — изоляция тенантов сломается.
- ❌ Push в `master` без зелёного `make ci-local` — master авто-деплоится в прод.
- ❌ Коммитить `.env` / `.planning/*.png` / `node_modules` (gitignored).

## Dev contour

```bash
make up            # dev-стек (api :8000, DEV_MODE, dev_seed авто)
make seed          # богатые UAT-данные поверх
cd frontend && npm run dev   # Vite :5173 (liquid_glass, HMR)
make verify-all    # быстрый гейт: ddl + lint + tsc + contract-check (без docker-тестов)
make ci-local      # полный mirror CI (pre-push)
make hooks         # установить git-хуки (один раз)
```

`make help` — каталог всех таргетов. Сценарии — `docs/RUNBOOK.md`.

## Key docs

`docs/HLD.md` (архитектура + API-контракт + ERD) · `docs/RUNBOOK.md` (сценарии) ·
`docs/DEPLOY.md` · `Makefile` (`make help`) · `contract/README.md` · `docs/adr/` ·
`.planning/PROJECT.md` (полный контекст).
