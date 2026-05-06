# Phase 1: Infrastructure & Auth — Research

**Researched:** 2026-05-01
**Domain:** Docker-compose skeleton, FastAPI + SQLAlchemy async, aiogram long-poll, Alembic async migrations, Caddy TLS, Telegram initData HMAC-SHA256
**Confidence:** HIGH (большинство утверждений верифицировано через PyPI, Context7 и официальную документацию)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Менеджер зависимостей — `uv` + `pyproject.toml` с lock-файлом (`uv.lock`). Dockerfile устанавливает через `uv pip install --system -r requirements.txt`.
- **D-02:** Структура Python-пакета: `app/{api,bot,worker,db,core}/`, точки входа `main_api.py`, `main_bot.py`, `main_worker.py`, миграции в `alembic/`.
- **D-03:** Один `Dockerfile` с build-arg `SERVICE` (api/bot/worker), CMD выбирается по аргументу.
- **D-04:** Bot в режиме long-poll (не webhook).
- **D-05:** ENV `DEV_MODE=true` отключает HMAC-SHA256 валидацию и инжектирует mock-пользователя с `tg_user_id = OWNER_TG_ID`.
- **D-06:** `.env.example` обязателен в репозитории; `.env` в `.gitignore`.
- **D-07:** Phase 1 — минимальный Vite+React scaffold (`frontend/`), пустая страница «TG Budget» для проверки Caddy+TLS.
- **D-08:** Многостадийный Dockerfile для frontend: `node:22-alpine` → `npm ci && npm run build` → dist копируется в Caddy volume.
- **D-09:** Alembic autogenerate от SQLAlchemy 2.x моделей; `api`-контейнер при старте запускает `alembic upgrade head` через `entrypoint.sh`.
- **D-10:** В Phase 1 создаём все 6 таблиц + enums + индексы согласно HLD §2.
- **D-11:** `app_user` создаётся при первом валидном запросе с OWNER_TG_ID (upsert в auth middleware), не в миграции.
- **D-12:** `GET /healthz` для api; bot экспортирует `GET /healthz` на порту 8001; worker записывает heartbeat в таблицу `app_health`.
- **D-13:** structlog с JSON-форматом в prod (`LOG_FORMAT=json`), human-readable в dev (`LOG_FORMAT=console`).

### Claude's Discretion

- Конкретные версии зависимостей (FastAPI, SQLAlchemy, aiogram, APScheduler, pydantic-settings).
- Имена docker network и volume в compose-файле.
- Детали Caddyfile (синтаксис rewrite/reverse_proxy).
- Структура `entrypoint.sh` для автомиграций.

### Deferred Ideas (OUT OF SCOPE)

- Bot webhook режим — post-MVP.
- pg_dump backup стратегия — Phase 6 или post-MVP.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INF-01 | docker-compose с 5 сервисами: caddy / api / bot / worker / db; все сервисы шарят один Python-codebase | D-02, D-03, архитектура контейнеров |
| INF-02 | PostgreSQL 16 + Alembic-миграции; автомиграции при старте api | D-09, D-10, паттерн async env.py |
| INF-03 | Caddy с автоматическим Let's Encrypt; internal docker network bot↔api не проксируется наружу | Caddyfile patterns, Caddy auto-HTTPS |
| INF-04 | Internal API endpoints `/api/v1/internal/*` защищены `X-Internal-Token` | FastAPI middleware/dependency pattern |
| INF-05 | Health-check эндпоинты `/healthz` для api/bot, heartbeat для worker | D-12, aiohttp HTTP сервер рядом с polling |
| AUTH-01 | Telegram `initData` валидируется HMAC-SHA256 с `bot_token`, `auth_date` ≤ 24ч | HLD §7.1, алгоритм верифицирован |
| AUTH-02 | Whitelist через ENV `OWNER_TG_ID`, всё остальное → 403 | FastAPI dependency/middleware |
</phase_requirements>

---

## Summary

Фаза создаёт технический каркас проекта с нуля: пять docker-контейнеров, общая Python-кодовая база, схема БД, TLS-прокси, аутентификация через Telegram. Все ключевые технологии зрелые и имеют хорошую документацию.

Критические точки сложности: (1) async env.py для Alembic требует специального паттерна — нельзя использовать стандартный синхронный шаблон; (2) APScheduler существует в двух несовместимых версиях (3.x и 4.x) — HLD указывает на 3.x API (`apscheduler.jobstores.sqlalchemy`), что является актуальным стабильным выпуском; (3) в Phase 1 для worker достаточен simple APScheduler без jobstore — персистентность джоб нужна только с Phase 5/6.

Для bot health-check на отдельном порту единственный чистый вариант — запуск простого aiohttp-сервера параллельно с `dp.start_polling()` через `asyncio.gather`.

**Primary recommendation:** Использовать APScheduler 3.x (`AsyncIOScheduler`) — это стабильный API, соответствующий HLD. APScheduler 4.x имеет принципиально иной API и не совместим со структурой HLD.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TLS терминация, SPA-статика | caddy | — | Caddy auto-HTTPS + file_server |
| REST API, initData validation | api (FastAPI) | db | Вся бизнес-логика и auth в API |
| Bot commands, push-сообщения | bot (aiogram) | api (internal) | Бот вызывает api через X-Internal-Token |
| Cron-джобы | worker (APScheduler) | db | Прямое подключение к БД без API |
| Хранилище данных | db (PostgreSQL) | — | Единственный источник истины |
| Auth (initData HMAC) | api middleware | — | Проверяется на каждом запросе к /api/v1/* |
| Конфигурация ENV | core/settings.py | — | pydantic-settings, общий для всех контейнеров |
| Миграции | alembic | api entrypoint | alembic upgrade head при старте api |

---

## Standard Stack

### Core (верифицировано через PyPI registry)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.128.8 | REST API framework | Async-нативный, Pydantic v2, богатая экосистема |
| uvicorn | 0.39.0 | ASGI server | Стандартный сервер для FastAPI |
| sqlalchemy | 2.0.49 | ORM + async engine | Async-нативный в 2.x, autogenerate для Alembic |
| asyncpg | 0.31.0 | PostgreSQL async driver | Единственный полноценный async PG-драйвер |
| alembic | 1.16.5 | DB migrations | Официальный инструмент SQLAlchemy |
| pydantic | 2.13.3 | Data validation | Встроен в FastAPI, v2 быстрее v1 |
| pydantic-settings | 2.11.0 | ENV конфигурация | Pydantic v2-совместимый settings менеджер |
| aiogram | 3.22.0 | Telegram Bot framework | Async-нативный, актуальный Bot API |
| apscheduler | 3.11.2 | Task scheduler | 3.x stable — соответствует HLD §6 |
| structlog | 25.5.0 | Structured logging | JSON-логи, интеграция со stdlib logging |
| aiohttp | 3.13.5 | Bot healthz HTTP server | Уже зависимость aiogram; asyncio-compatible |

[VERIFIED: pip registry 2026-05-01]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| httpx | 0.28.1 | HTTP-клиент для тестов | AsyncClient для httpx тестов FastAPI |
| pytest | 8.4.2 | Test framework | Базовый фреймворк тестов |
| pytest-asyncio | 1.2.0 | Async test support | Async fixtures + test functions |

[VERIFIED: pip registry 2026-05-01]

### Frontend (минимальный scaffold)

| Package | Version | Purpose |
|---------|---------|---------|
| vite | 8.0.10 | Build tool |
| react | 18.x | UI framework |
| @telegram-apps/sdk-react | 3.3.9 | TG Mini App SDK |

[VERIFIED: npm registry 2026-05-01]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| APScheduler 3.x | APScheduler 4.x | 4.x имеет принципиально другой API (AsyncScheduler, SQLAlchemyDataStore), несовместим с HLD §6. Использовать 3.x. |
| asyncpg | psycopg3 | asyncpg — стандарт для asyncio+PG; psycopg3 тоже async, но asyncpg быстрее |
| aiohttp (bot healthz) | fastapi (дополнительный порт) | aiohttp уже транзитивная зависимость aiogram, не нужен второй FastAPI инстанс |

### Installation

```bash
# Python (через uv в Dockerfile)
uv add fastapi uvicorn[standard] sqlalchemy[asyncio] asyncpg alembic \
       pydantic pydantic-settings aiogram "apscheduler<4" structlog aiohttp

# Dev
uv add --dev pytest pytest-asyncio httpx

# Frontend
cd frontend && npm create vite@latest . -- --template react-ts
npm install @telegram-apps/sdk-react
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser / Telegram Client
        |
        | HTTPS (443)
        v
  ┌──────────────┐
  │   caddy      │  TLS терминация
  │   :80/:443   │  SPA статика из /srv/dist
  └──┬───────────┘
     |              /api/* → http://api:8000
     |              all others → try_files /index.html + file_server
     v
  ┌──────────────┐       ┌────────────────┐
  │   api:8000   │◄──────│  bot (aiogram) │  X-Internal-Token
  │   FastAPI    │       │  :8001 /healthz│
  └──┬───────────┘       └───────┬────────┘
     |                           |
     | asyncpg                   | asyncpg
     v                           v
  ┌──────────────────────────────────────────┐
  │            db (PostgreSQL 16)            │
  └──────────────────────────────────────────┘
     ^
     | asyncpg
  ┌──┴───────────┐
  │   worker     │  APScheduler AsyncIOScheduler
  │   (cron)     │  записывает heartbeat → app_health
  └──────────────┘
```

Потоки данных:
1. Mini App → Caddy (TLS) → api → db
2. Bot (/start, команды) → bot handler → api /internal/* → db
3. Worker cron → db (прямо)
4. Caddy → /srv/dist (static files, no dynamic)

### Recommended Project Structure

```
tg-budget-planner/
├── app/
│   ├── __init__.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py           # APIRouter, все маршруты
│   │   ├── dependencies.py     # get_db, get_current_user
│   │   └── middleware.py       # initData validation, internal token
│   ├── bot/
│   │   ├── __init__.py
│   │   └── handlers.py         # /start и прочие команды
│   ├── worker/
│   │   ├── __init__.py
│   │   └── jobs.py             # cron jobs (пустые в Phase 1)
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py             # Base = DeclarativeBase()
│   │   ├── session.py          # async_engine, async_sessionmaker
│   │   └── models.py           # все 6 ORM-моделей
│   └── core/
│       ├── __init__.py
│       ├── settings.py         # pydantic-settings Settings
│       ├── auth.py             # validate_init_data(), verify_owner()
│       └── logging.py          # structlog configure()
├── alembic/
│   ├── env.py                  # async-compatible env.py
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial.py     # все 6 таблиц + enums + индексы
├── frontend/
│   ├── src/
│   │   └── App.tsx             # "TG Budget" stub
│   ├── package.json
│   └── vite.config.ts
├── main_api.py
├── main_bot.py
├── main_worker.py
├── Dockerfile                  # build-arg SERVICE=api|bot|worker
├── Dockerfile.frontend         # многостадийный node → dist
├── docker-compose.yml
├── docker-compose.override.yml # dev overrides (DEV_MODE=true)
├── Caddyfile
├── entrypoint.sh               # alembic upgrade head + uvicorn
├── pyproject.toml
├── uv.lock
├── .env.example
└── .env                        # gitignored
```

### Pattern 1: Async SQLAlchemy Session Dependency (FastAPI)

**What:** Инжектировать AsyncSession в route handler через Depends
**When to use:** Все API endpoints, требующие доступа к БД

```python
# Source: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
# app/db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# app/api/dependencies.py
from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

# route handler
@router.get("/me")
async def get_me(db: AsyncSession = Depends(get_db)):
    ...
```

[VERIFIED: Context7 /websites/sqlalchemy_en_20]

### Pattern 2: Alembic async env.py

**What:** Запуск миграций с asyncpg driver требует специального async-контекста
**When to use:** При генерации и применении миграций

```python
# Source: https://alembic.sqlalchemy.org/en/latest/cookbook.html
# alembic/env.py (async-compatible)
import asyncio
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from app.db.base import Base
target_metadata = Base.metadata

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online():
    asyncio.run(run_async_migrations())
```

[VERIFIED: Context7 /websites/alembic_sqlalchemy]

### Pattern 3: Telegram initData HMAC-SHA256 Validation

**What:** Проверка подлинности запросов из Mini App
**When to use:** Каждый запрос к `/api/v1/*` (кроме `/internal/*`)

```python
# Source: https://docs.telegram-mini-apps.com/platform/init-data + HLD §7.1
# app/core/auth.py
import hashlib
import hmac
import time
from urllib.parse import parse_qsl, unquote

def validate_init_data(init_data_raw: str, bot_token: str) -> dict:
    """Validate Telegram Mini App initData. Raises ValueError on failure."""
    params = dict(parse_qsl(init_data_raw, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        raise ValueError("Missing hash")

    # Step 1: data_check_string — sorted key=value pairs joined by \n
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Step 2: secret_key = HMAC-SHA256("WebAppData", bot_token)
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode(),
        hashlib.sha256
    ).digest()

    # Step 3: calc_hash = HMAC-SHA256(data_check_string, secret_key)
    calc_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        raise ValueError("Invalid hash")

    # Step 4: check auth_date <= 24h
    auth_date = int(params.get("auth_date", 0))
    if time.time() - auth_date > 86400:
        raise ValueError("auth_date expired")

    import json
    user_data = json.loads(unquote(params.get("user", "{}")))
    return user_data
```

[CITED: https://docs.telegram-mini-apps.com/platform/init-data]

### Pattern 4: FastAPI Middleware для auth + OWNER whitelist

**What:** Dependency для проверки initData + whitelist, DEV_MODE bypass
**When to use:** Все защищённые эндпоинты

```python
# app/api/dependencies.py
from fastapi import Header, HTTPException, status, Depends
from app.core.auth import validate_init_data
from app.core.settings import settings

async def get_current_user(
    x_telegram_init_data: str = Header(None)
) -> dict:
    if settings.DEV_MODE:
        return {"id": settings.OWNER_TG_ID, "first_name": "Dev"}

    if not x_telegram_init_data:
        raise HTTPException(status_code=403, detail="Missing X-Telegram-Init-Data")

    try:
        user = validate_init_data(x_telegram_init_data, settings.BOT_TOKEN)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if user.get("id") != settings.OWNER_TG_ID:
        raise HTTPException(status_code=403, detail="Not authorized")

    return user
```

[ASSUMED: Точный синтаксис хедера — `X-Telegram-Init-Data`. Telegram официально не специфицирует имя хедера; проект использует кастомный хедер.]

### Pattern 5: Internal Token Dependency

**What:** Защита `/api/v1/internal/*` через X-Internal-Token
**When to use:** Все internal endpoints

```python
# app/api/dependencies.py
async def verify_internal_token(
    x_internal_token: str = Header(None)
) -> None:
    if not x_internal_token or x_internal_token != settings.INTERNAL_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid internal token")
```

[ASSUMED: Реализация через Depends, не через middleware, чтобы применять только к /internal/* роутеру]

### Pattern 6: aiogram long-poll + healthz на отдельном порту

**What:** Запустить бот и HTTP healthz-сервер параллельно
**When to use:** main_bot.py

```python
# Source: Context7 /aiogram/aiogram + аiohttp docs
# main_bot.py
import asyncio
from aiohttp import web
from aiogram import Bot, Dispatcher

async def health_handler(request):
    return web.Response(text='{"status":"ok"}', content_type="application/json")

async def main():
    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher()
    # ... register handlers ...

    # healthz server
    app = web.Application()
    app.router.add_get("/healthz", health_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8001)
    await site.start()

    # polling (blocks until shutdown)
    await dp.start_polling(bot)

asyncio.run(main())
```

[CITED: https://docs.aiogram.dev/en/latest/dispatcher/long_polling.html]

### Pattern 7: APScheduler 3.x AsyncIOScheduler с PostgreSQL jobstore

**What:** Cron-планировщик с персистентностью в PostgreSQL
**When to use:** main_worker.py (в Phase 1 — только инициализация без реальных джоб)

```python
# Source: https://apscheduler.readthedocs.io/en/3.x/userguide.html
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
import pytz

MOSCOW_TZ = pytz.timezone("Europe/Moscow")

jobstores = {
    "default": SQLAlchemyJobStore(url=settings.DATABASE_URL_SYNC)
    # DATABASE_URL_SYNC = postgresql://... (без asyncpg)
}

scheduler = AsyncIOScheduler(jobstores=jobstores, timezone=MOSCOW_TZ)
# scheduler.add_job(my_job, "cron", hour=9, minute=0, id="notify_subscriptions")
scheduler.start()
```

**ВАЖНО:** SQLAlchemyJobStore в APScheduler 3.x использует синхронный SQLAlchemy URL (без `+asyncpg`). `AsyncIOScheduler` — async-совместимый scheduler, но jobstore работает через sync SQLAlchemy.

[VERIFIED: https://apscheduler.readthedocs.io/en/3.x/userguide.html]

### Pattern 8: Dockerfile с build-arg SERVICE

```dockerfile
# Source: https://docs.astral.sh/uv/guides/integration/docker/ + D-03
FROM python:3.12-slim AS base
ARG SERVICE

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY main_api.py main_bot.py main_worker.py entrypoint.sh ./

RUN chmod +x entrypoint.sh

CMD if [ "$SERVICE" = "api" ]; then \
      ./entrypoint.sh; \
    elif [ "$SERVICE" = "bot" ]; then \
      uv run python main_bot.py; \
    elif [ "$SERVICE" = "worker" ]; then \
      uv run python main_worker.py; \
    fi
```

[ASSUMED: Конкретный синтаксис CMD с shell expansion. Альтернатива — использовать ENTRYPOINT-скрипт с case statement.]

### Pattern 9: entrypoint.sh для api

```bash
#!/bin/sh
set -e
uv run alembic upgrade head
exec uv run uvicorn main_api:app --host 0.0.0.0 --port 8000
```

[CITED: D-09 из CONTEXT.md]

### Pattern 10: Caddyfile для SPA + reverse proxy

```caddyfile
# Source: https://caddyserver.com/docs/caddyfile/patterns
{env.PUBLIC_DOMAIN} {
    # Reverse proxy API (не проксирует /internal/* — handled внутри docker network)
    reverse_proxy /api/* api:8000

    # SPA fallback
    root * /srv/dist
    try_files {path} /index.html
    file_server
}
```

**Примечание:** `/api/v1/internal/*` доступен внутри docker network напрямую через `http://api:8000`. Caddy не нужно его знать — он просто проксирует `/api/*`, а caddy не выставляет direct access к api снаружи. Безопасность обеспечивается тем, что api-контейнер не публикует порт 8000 на хосте.

[VERIFIED: Context7 /websites/caddyserver_caddyfile + https://caddyserver.com/docs/caddyfile/patterns]

### Pattern 11: structlog конфигурация

```python
# Source: Context7 /hynek/structlog
# app/core/logging.py
import logging
import structlog

def configure_logging(log_level: str = "INFO", log_format: str = "json"):
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(level=level)

    if log_format == "json":
        processors = [
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = [
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="%H:%M:%S"),
            structlog.dev.ConsoleRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

[VERIFIED: Context7 /hynek/structlog]

### Anti-Patterns to Avoid

- **Синхронный alembic env.py с async engine:** стандартный шаблон Alembic работает синхронно; с asyncpg нужен специальный async env.py (Pattern 2 выше).
- **Прямое использование asyncpg URL в APScheduler 3.x jobstore:** SQLAlchemyJobStore требует синхронный URL (`postgresql://`, без `+asyncpg`). Нужно два DATABASE_URL: один для SQLAlchemy async app, второй для jobstore.
- **APScheduler 4.x вместо 3.x:** У 4.x принципиально иной API (`AsyncScheduler`, `add_schedule`). HLD описывает 3.x семантику.
- **Публикация api-порта на хосте:** port 8000 не должен быть в `ports:` docker-compose для api/bot/worker — только caddy публикует 80/443.
- **DEV_MODE в prod:** Dockerfile должен иметь `DEV_MODE=false` по умолчанию; переопределяется в `docker-compose.override.yml`.
- **Не использовать `hmac.compare_digest`:** обычное `==` для сравнения хешей уязвимо к timing attack.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS сертификаты | Скрипты certbot/Let's Encrypt | Caddy auto-HTTPS | Caddy сам получает и обновляет сертификаты |
| Async DB session lifecycle | Самописный контекстный менеджер | SQLAlchemy `async_sessionmaker` + `Depends` | Правильная обработка commit/rollback |
| DB миграции | ALTER TABLE вручную | Alembic autogenerate | Детектирует изменения моделей автоматически |
| Structured logging | print() / logging.basicConfig | structlog | Контекстные поля, JSON renderer |
| Cron scheduling | asyncio.sleep() в loop | APScheduler 3.x AsyncIOScheduler | Missed jobs при рестарте, timezone, coalesce |
| HMAC comparison | `==` для строк | `hmac.compare_digest()` | Защита от timing attacks |
| ENV конфигурация | os.environ.get() по всему коду | pydantic-settings Settings | Типизация, валидация, единый источник |

---

## Common Pitfalls

### Pitfall 1: APScheduler 3.x SQLAlchemyJobStore требует sync URL

**What goes wrong:** `postgresql+asyncpg://...` в SQLAlchemyJobStore → `sqlalchemy.exc.ArgumentError`
**Why it happens:** Jobstore использует синхронный SQLAlchemy под капотом
**How to avoid:** Добавить `DATABASE_URL_SYNC` в settings (без `+asyncpg` драйвера):
```
DATABASE_URL=postgresql+asyncpg://budget:pass@db:5432/budget_db   # для app
DATABASE_URL_SYNC=postgresql://budget:pass@db:5432/budget_db       # для jobstore
```
**Warning signs:** `NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:asyncpg`

### Pitfall 2: Alembic env.py синхронный по умолчанию

**What goes wrong:** `asyncpg` не поддерживает синхронный connect; стандартный alembic init создаёт синхронный env.py
**Why it happens:** `alembic init` генерирует legacy-шаблон
**How to avoid:** Заменить `run_migrations_online()` на async версию (Pattern 2)
**Warning signs:** `asyncpg.exceptions.InterfaceError: cannot perform operation: another operation is in progress`

### Pitfall 3: api-контейнер стартует раньше db

**What goes wrong:** `alembic upgrade head` падает с `connection refused`
**Why it happens:** Docker `depends_on` не ждёт готовности PostgreSQL, только запуска контейнера
**How to avoid:** Добавить `healthcheck` для db в docker-compose и `depends_on: condition: service_healthy`
**Warning signs:** `Error: could not connect to server: Connection refused`

### Pitfall 4: Caddy не может получить TLS при первом запуске

**What goes wrong:** ACME challenge не проходит
**Why it happens:** DNS не указывает на сервер, или порт 80 закрыт
**How to avoid:** (1) Добавить volume для `/data` и `/config` в caddy-сервисе; (2) убедиться, что dns A-запись настроена ДО первого запуска; (3) порты 80 и 443 открыты на VPS
**Warning signs:** `obtaining certificate: ... ACME: Error 400 :: urn:ietf:params:acme:error:dns`

### Pitfall 5: app_health таблица создаётся миграцией, но worker может стартовать до api

**What goes wrong:** worker пытается писать в `app_health`, которая ещё не создана
**Why it happens:** worker не запускает миграции, а api ещё не успел
**How to avoid:** В docker-compose worker `depends_on: api: condition: service_healthy`; /healthz api возвращает 200 только после успешных миграций

### Pitfall 6: uv не установлен в системе при разработке

**What goes wrong:** `uv not found` на dev-машине
**Why it happens:** uv — не стандартный системный пакет
**How to avoid:** Добавить в README установку uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`

---

## Code Examples

### SQLAlchemy 2.x ORM модель (синтаксис с DeclarativeBase)

```python
# Source: https://docs.sqlalchemy.org/en/20/orm/
# app/db/models.py
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, BigInteger, Boolean, Integer, Date, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import ENUM

class Base(DeclarativeBase):
    pass

class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tg_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    tg_chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    cycle_start_day: Mapped[int] = mapped_column(Integer, default=5)
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), default=datetime.utcnow
    )
```

[CITED: https://docs.sqlalchemy.org/en/20/]

### pydantic-settings конфигурация

```python
# Source: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
# app/core/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    DATABASE_URL_SYNC: str  # без +asyncpg, для APScheduler jobstore
    BOT_TOKEN: str
    OWNER_TG_ID: int
    INTERNAL_TOKEN: str
    API_BASE_URL: str = "http://api:8000"
    PUBLIC_DOMAIN: str
    DEV_MODE: bool = False
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    APP_TZ: str = "Europe/Moscow"

settings = Settings()
```

[VERIFIED: pip pydantic-settings 2.11.0]

### aiogram startup с Dispatcher

```python
# Source: Context7 /aiogram/aiogram
# main_bot.py
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

bot = Bot(
    token=settings.BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML)
)
dp = Dispatcher()
```

[VERIFIED: Context7 /aiogram/aiogram]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLAlchemy 1.x sync | SQLAlchemy 2.x async-native | 2023 (2.0 GA) | Unified async/sync API, `async_sessionmaker` |
| `startup`/`shutdown` events | `lifespan` context manager | FastAPI 0.93+ | Единый lifecycle через asynccontextmanager |
| APScheduler 3.x jobstores | APScheduler 4.x datastores | 4.x beta | **Не мигрировать** — другой API, 4.x ещё нестабилен для prod |
| Dockerfile `pip install` | Dockerfile с `uv` | 2024 | 10-100x быстрее установка зависимостей |
| Alembic sync env.py | Alembic async env.py | ~2021 | Требуется при async driver (asyncpg) |
| pytz | zoneinfo (stdlib Python 3.9+) | Python 3.9 | APScheduler 4.x использует zoneinfo; 3.x — pytz |

**Deprecated/outdated:**
- `@app.on_event("startup")`: заменён на `lifespan` в FastAPI 0.93+
- `APScheduler 4.x`: публичная бета со сломанным API; использовать 3.x

---

## Open Questions

1. **Синхронный vs async URL для APScheduler 3.x jobstore**
   - Что знаем: SQLAlchemyJobStore требует sync URL; DATABASE_URL_SYNC нужен
   - Что неясно: нужен ли PostgreSQL jobstore уже в Phase 1, или достаточно MemoryJobStore?
   - Recommendation: В Phase 1 worker не имеет реальных джоб — можно использовать MemoryJobStore; PostgreSQL jobstore добавить в Phase 5 при реализации close_period джобы

2. **Тест Caddy TLS на локальной dev-машине**
   - Что знаем: Let's Encrypt требует публичный домен с DNS A-записью
   - Что неясно: Нужен ли локальный self-signed TLS или разработчик тестирует только на VPS?
   - Recommendation: В docker-compose.override.yml (dev) — Caddy в HTTP-режиме (без TLS); TLS только на prod

3. **uv не установлен на хосте разработчика**
   - Что знаем: uv отсутствует на данной машине [VERIFIED: uv not found]
   - Что неясно: Нужна ли установка uv как prerequisite или только внутри Docker?
   - Recommendation: uv нужен внутри Docker (через COPY --from=ghcr.io/astral-sh/uv); для локальной разработки — опционально

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | все контейнеры | ✓ | 29.2.1 | — |
| Docker Compose | orchestration | ✓ | v5.0.2 | — |
| Node.js | frontend build | ✓ | v25.8.2 | — |
| npm | frontend deps | ✓ | 11.11.1 | — |
| Python 3.12 | app код | ✗ | 3.9.6 (неподходящая) | Docker образ python:3.12-slim |
| uv | зависимости | ✗ | — | `curl -LsSf https://astral.sh/uv/install.sh | sh` |
| PostgreSQL | БД | ✗ | — | docker-compose db сервис |

[VERIFIED: проверка через command -v 2026-05-01]

**Missing dependencies with no fallback:**
- Python 3.12 на хосте — всё работает в Docker, локальная разработка требует uv venv с Python 3.12

**Missing dependencies with fallback:**
- uv: устанавливается через install script; внутри Docker берётся из ghcr.io/astral-sh/uv image

**Замечание:** Все сервисы запускаются в Docker — отсутствие python3.12 и uv на хосте не блокирует разработку при работе через `docker-compose up`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.4.2 + pytest-asyncio 1.2.0 |
| Config file | `pytest.ini` или `pyproject.toml [tool.pytest.ini_options]` — Wave 0 |
| Quick run command | `uv run pytest tests/ -x -q` |
| Full suite command | `uv run pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INF-01 | docker-compose up поднимает 5 контейнеров | smoke (manual) | `docker compose up -d && docker compose ps` | ❌ Wave 0 |
| INF-02 | Alembic миграции применяются, 6 таблиц существуют | integration | `pytest tests/test_migrations.py -x` | ❌ Wave 0 |
| INF-03 | Caddy раздаёт SPA, /api/* проксируется | smoke (manual/VPS) | ручная проверка на VPS | manual-only |
| INF-04 | /internal/* без токена → 403, с токеном → 200 | unit/integration | `pytest tests/test_internal_auth.py -x` | ❌ Wave 0 |
| INF-05 | /healthz api и bot → 200 | integration | `pytest tests/test_health.py -x` | ❌ Wave 0 |
| AUTH-01 | initData с валидным HMAC → 200; с невалидным → 403 | unit | `pytest tests/test_auth.py::test_valid_init_data -x` | ❌ Wave 0 |
| AUTH-02 | Запрос с чужим tg_user_id → 403 | unit | `pytest tests/test_auth.py::test_owner_whitelist -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/test_auth.py tests/test_health.py -x -q`
- **Per wave merge:** `uv run pytest tests/ -v`
- **Phase gate:** Полный suite зелёный перед `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/__init__.py` — пакет тестов
- [ ] `tests/conftest.py` — async_client fixture, test DB setup
- [ ] `tests/test_auth.py` — AUTH-01, AUTH-02 (unit, без БД)
- [ ] `tests/test_health.py` — INF-05 (с running app через httpx AsyncClient)
- [ ] `tests/test_internal_auth.py` — INF-04
- [ ] `tests/test_migrations.py` — INF-02 (проверка таблиц после alembic upgrade head)
- [ ] `pytest.ini` или `[tool.pytest.ini_options]` в pyproject.toml
- [ ] Framework install: `uv add --dev pytest pytest-asyncio httpx`

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (из config.json).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Telegram initData HMAC-SHA256 + OWNER_TG_ID whitelist |
| V3 Session Management | no | Stateless (initData на каждый запрос, нет сессий) |
| V4 Access Control | yes | Dependency `get_current_user` + `verify_internal_token` |
| V5 Input Validation | yes | pydantic v2 на всех входных данных |
| V6 Cryptography | yes | `hmac.compare_digest()` — timing-safe; никакого self-made HMAC |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Подделка initData | Spoofing | HMAC-SHA256 с bot_token; compare_digest |
| auth_date replay attack | Elevation | Проверка `auth_date` ≤ 24ч |
| Несанкционированный доступ к /internal/* | Elevation | X-Internal-Token; не экспонируется через Caddy |
| SQL injection | Tampering | SQLAlchemy parameterized queries; никакого raw SQL |
| Secrets в git | Info disclosure | .env в .gitignore; .env.example без реальных значений |
| DEV_MODE в prod | Spoofing | DEV_MODE=false по умолчанию; prod .env не содержит DEV_MODE=true |
| Exposure api port on host | Elevation | api/bot/worker не публикуют порты на хосте в docker-compose |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact на Phase 1 |
|-----------|------------------|
| Python 3.12, FastAPI, SQLAlchemy 2.x async, Pydantic v2 | Обязательные версии пакетов |
| aiogram 3.x | Использовать версию 3.22.0 |
| PostgreSQL 16 + Alembic | Образ `postgres:16-alpine` |
| APScheduler (отдельный контейнер worker) | Отдельная точка входа main_worker.py |
| Caddy + Let's Encrypt | caddy:2-alpine |
| TZ: Europe/Moscow для шедулера и периодов, БД UTC | APScheduler timezone=pytz.timezone("Europe/Moscow") |
| Деньги как BIGINT копейки | Все *_cents поля — BigInteger, никакого Float |
| Бизнес-даты DATE, аудит TIMESTAMPTZ UTC | Соответствующие типы в моделях |
| Soft delete только для category | is_archived в Category; transport/sub — hard delete |
| Single-tenant: FK на app_user НЕ вводим | Модели без user_id FK |
| initData HMAC-SHA256 на каждом запросе | Middleware/dependency на /api/v1/* |
| Internal API /api/v1/internal/* защищён X-Internal-Token, не проксируется Caddy | Отдельный роутер + dependency |
| Шедулер в pg_try_advisory_lock | Реализовать в worker job wrapper (Phase 5/6); в Phase 1 достаточно basic |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `X-Telegram-Init-Data` — имя хедера для initData | Pattern 3 | Frontend должен использовать то же имя хедера |
| A2 | В Phase 1 для worker достаточен MemoryJobStore (не PostgreSQL) | Pattern 7 | Если нужна персистентность с первого запуска — нужен DATABASE_URL_SYNC |
| A3 | CMD в Dockerfile через shell expansion корректно работает с build-arg | Pattern 8 | Может потребоваться ENTRYPOINT-скрипт |
| A4 | Internal dependency через `Depends(verify_internal_token)` (не middleware) | Pattern 5 | Middleware проще для роутера-уровня защиты |
| A5 | `app_health` таблица создаётся первой миграцией вместе с остальными 6 таблицами | D-12 | Нужна дополнительная таблица в начальной миграции |

---

## Sources

### Primary (HIGH confidence)

- PyPI registry — версии всех Python-пакетов (fastapi, sqlalchemy, aiogram, alembic, apscheduler, structlog, pydantic, asyncpg, uvicorn, aiohttp) [VERIFIED 2026-05-01]
- npm registry — версии @telegram-apps/sdk-react, vite [VERIFIED 2026-05-01]
- Context7 `/websites/alembic_sqlalchemy` — async env.py pattern
- Context7 `/fastapi/fastapi` — Depends, lifespan, middleware patterns
- Context7 `/aiogram/aiogram` — polling, Dispatcher, DefaultBotProperties
- Context7 `/websites/sqlalchemy_en_20` — async_sessionmaker, AsyncSession
- Context7 `/hynek/structlog` — JSON configuration
- Context7 `/agronholm/apscheduler` — APScheduler 4.x API (использован для сравнения, НЕ для рекомендации)
- Context7 `/websites/caddyserver_caddyfile` — reverse_proxy + file_server patterns

### Secondary (MEDIUM confidence)

- https://apscheduler.readthedocs.io/en/3.x/userguide.html — APScheduler 3.x API (AsyncIOScheduler, SQLAlchemyJobStore)
- https://docs.telegram-mini-apps.com/platform/init-data — алгоритм валидации initData
- https://docs.astral.sh/uv/guides/integration/docker/ — uv в Docker
- https://caddyserver.com/docs/automatic-https — Caddy auto-HTTPS requirements

### Tertiary (LOW confidence)

- WebSearch результаты по FastAPI + SQLAlchemy async pattern — подтверждены официальной документацией

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — верифицирован через PyPI registry
- Architecture: HIGH — прямо задан HLD.md + CONTEXT.md
- Auth pattern: HIGH — верифицирован через официальные TG Mini Apps docs
- APScheduler 3.x API: MEDIUM — верифицирован через readthedocs, но Context7 показал 4.x API (расхождение задокументировано)
- Caddy patterns: HIGH — верифицирован через Context7 caddyfile docs
- Test infrastructure: MEDIUM — стандартные паттерны, файлы нужно создавать с нуля

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (стабильный стек, 30 дней)
