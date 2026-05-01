# Phase 1: Infrastructure & Auth - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Технический скелет: все 5 docker-контейнеров поднимаются и общаются, БД-схема применяется через Alembic, Telegram initData валидируется на каждом запросе через HMAC-SHA256, OWNER_TG_ID whitelist работает, internal token защищает bot↔api. Фаза завершена когда `docker-compose up` поднимает все сервисы с health-check'ами.

**Не входит в Phase 1:** UI/UX, onboarding flow, бизнес-логика категорий/периодов/транзакций.

</domain>

<decisions>
## Implementation Decisions

### Python tooling & project layout
- **D-01:** Менеджер зависимостей — `uv` + `pyproject.toml` с lock-файлом (`uv.lock`). Dockerfile устанавливает через `uv pip install --system -r requirements.txt` (uv генерирует из pyproject). Преимущество: скорость, современный стандарт.
- **D-02:** Структура Python-пакета:
  ```
  app/
    __init__.py
    api/          ← FastAPI app (routers, dependencies, middleware)
    bot/          ← aiogram handlers
    worker/       ← APScheduler jobs
    db/           ← SQLAlchemy models, migrations (Alembic в alembic/)
    core/         ← shared: settings (pydantic-settings), auth, period_utils
  main_api.py     ← uvicorn entrypoint (api-контейнер)
  main_bot.py     ← aiogram entrypoint (bot-контейнер)
  main_worker.py  ← APScheduler entrypoint (worker-контейнер)
  alembic/        ← Alembic env + migrations
  ```
- **D-03:** Один `Dockerfile` с build-arg `SERVICE` (api/bot/worker), `CMD` выбирается по аргументу. Так docker-compose.yml для каждого сервиса передаёт `SERVICE=api` etc.

### Bot polling mode
- **D-04:** Режим long-poll (polling, не webhook). Проще для self-hosted, не требует регистрации webhook URL через Caddy. Webhook — в backlog как post-MVP (Q-11 из HLD).

### Dev-среда / initData bypass
- **D-05:** ENV `DEV_MODE=true` отключает HMAC-SHA256 валидацию initData и инжектирует mock-пользователя с `tg_user_id = OWNER_TG_ID`. Это позволяет делать curl-запросы к API локально без реального Telegram. В prod `DEV_MODE` должен быть `false` (или отсутствовать).
- **D-06:** `.env.example` обязателен в репозитории. `.env` в `.gitignore`.

### Frontend в Phase 1
- **D-07:** В Phase 1 включаем минимальный Vite + React scaffold (`frontend/`). Caddy раздаёт статику из `frontend/dist/`. В Phase 1 — только пустая страница «TG Budget» (stub для проверки, что Caddy+TLS работают). Настоящий React-код — с Phase 2.
- **D-08:** `docker-compose.yml` включает build-step для frontend через многостадийный Dockerfile: `node:22-alpine` → `npm ci && npm run build` → копирование `dist/` в Caddy volume.

### БД и миграции
- **D-09:** Alembic `autogenerate` от SQLAlchemy 2.x моделей. `api`-контейнер при старте запускает `alembic upgrade head` до поднятия uvicorn (через `entrypoint.sh`).
- **D-10:** В Phase 1 создаём все 6 таблиц + enums + индексы согласно HLD §2 (одна базовая миграция). Никакого seed-данных в миграции — seed идёт в Phase 2 через onboarding.

### app_user bootstrap
- **D-11:** `app_user` не создаётся в миграции. Запись создаётся при первом валидном запросе с OWNER_TG_ID (upsert в auth middleware). `tg_chat_id` остаётся NULL до привязки через `/start`.

### Health checks
- **D-12:** `GET /healthz` для api возвращает `{"status": "ok"}`. Bot-контейнер экспортирует `GET /healthz` на порту 8001 (простой HTTP-сервер через aiohttp или aiogram built-in). Worker записывает heartbeat-timestamp в Redis или БД-таблицу `worker_heartbeat`; в Phase 1 достаточно простой записи в отдельную таблицу `app_health`.

### Логирование
- **D-13:** `structlog` с JSON-форматом в prod (`LOG_FORMAT=json`), human-readable в dev (`LOG_FORMAT=console`). Уровень — из `LOG_LEVEL` ENV (default `INFO`).

### Claude's Discretion
- Конкретная версия зависимостей (FastAPI, SQLAlchemy, aiogram, APScheduler, pydantic-settings) — Claude выбирает последние стабильные.
- Имена docker network и volume в compose файле.
- Детали Caddyfile (конкретный синтаксис rewrite/reverse_proxy блоков).
- Структура `entrypoint.sh` для автомиграций.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Архитектура и контейнеры
- `docs/HLD.md` §1 — схема 5 контейнеров, назначение каждого
- `docs/HLD.md` §8 — ENV-переменные (DATABASE_URL, BOT_TOKEN, OWNER_TG_ID, INTERNAL_TOKEN, API_BASE_URL, PUBLIC_DOMAIN)

### БД-схема
- `docs/HLD.md` §2 — ERD, 6 таблиц, enums, индексы, соглашения (kopeki, DATE/TIMESTAMPTZ, soft-delete)
- `docs/HLD.md` §2.2 — перечисления (CategoryKind, PeriodStatus, PlanSource, ActualSource, SubCycle)
- `docs/HLD.md` §2.3 — обязательные индексы

### Auth & Security
- `docs/HLD.md` §7.1 — алгоритм валидации Telegram initData (5 шагов HMAC-SHA256)
- `docs/HLD.md` §7.2 — OWNER_TG_ID whitelist
- `docs/HLD.md` §7.3 — Internal token для bot↔api

### Требования Phase 1
- `.planning/REQUIREMENTS.md` — INF-01..INF-05, AUTH-01, AUTH-02

### Нефункциональные
- `docs/HLD.md` §9 — health checks, логирование, миграции, бэкап
- `CLAUDE.md` — Tech Stack, Conventions (money as BIGINT kopecks, DATE/TIMESTAMPTZ)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Пустой репозиторий — фаза создаёт весь каркас с нуля.

### Established Patterns
- Single-tenant без `user_id` FK — прямое следствие решения из PROJECT.md. Модели НЕ должны иметь поля `user_id`.
- Деньги только как `BIGINT` kopecks — никаких `float` нигде в моделях и схемах.

### Integration Points
- `api` ↔ `db`: SQLAlchemy async engine через `DATABASE_URL`
- `bot` ↔ `api`: HTTP через internal endpoint `/api/v1/internal/*` + `X-Internal-Token`
- `worker` ↔ `db`: прямое соединение через SQLAlchemy (отдельная async session)
- `caddy` ↔ `api`: reverse proxy `/api/` → `http://api:8000`
- `caddy` → `frontend/dist/`: статические файлы SPA

</code_context>

<specifics>
## Specific Ideas

- Dockerfile: один файл с build-arg `SERVICE`, чтобы не дублировать layer-кэш для трёх Python-контейнеров.
- `entrypoint.sh` для api: `alembic upgrade head && exec uvicorn main_api:app --host 0.0.0.0 --port 8000`
- Worker heartbeat достаточен для Phase 1 — не нужен Redis, хватит записи в PostgreSQL.

</specifics>

<deferred>
## Deferred Ideas

- **Bot webhook режим** — Q-11 из HLD. Long-poll выбран для Phase 1, webhook — post-MVP опция.
- **pg_dump backup стратегия** — Q-9 из HLD. Нужно определить куда выгружать (S3 vs локальный volume). Отложено в Phase 6 или post-MVP.

</deferred>

---

*Phase: 1-infrastructure-and-auth*
*Context gathered: 2026-05-01*
