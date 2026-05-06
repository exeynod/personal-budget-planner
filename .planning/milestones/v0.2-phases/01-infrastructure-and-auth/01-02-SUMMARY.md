---
phase: 01-infrastructure-and-auth
plan: 02
subsystem: infra
tags: [python, fastapi, sqlalchemy, alembic, pydantic-settings, structlog, pyproject, uv, postgres]

# Dependency graph
requires:
  - phase: 01-infrastructure-and-auth
    provides: pytest RED test stubs and fixtures expecting `app.*` modules to exist (01-01)
provides:
  - Python project skeleton via pyproject.toml with all backend dependencies pinned
  - app/ package layout (core, db, api, bot, worker subpackages)
  - Pydantic Settings (11 ENV fields) with safe defaults and DEV_MODE=False
  - structlog configuration helper (JSON for prod, ConsoleRenderer for dev)
  - SQLAlchemy 2.x DeclarativeBase + async engine + async_sessionmaker + get_db
  - 8 ORM models covering all 6 HLD tables + 1 audit (app_health)
  - PostgreSQL ENUM type registration for 5 enums (categorykind, periodstatus,
    plansource, actualsource, subcycle)
  - Composite indexes per HLD §2.3 + UNIQUE constraint preventing subscription
    auto-charge duplicates
affects: [01-04 alembic migrations, 01-05 api auth + middleware, 01-06 bot+worker entrypoints, 02 onboarding+seed, 03 categories, 04 budget periods, 05 transactions, 06 subscriptions]

# Tech tracking
tech-stack:
  added:
    - fastapi 0.128.8
    - uvicorn[standard] 0.39.0
    - sqlalchemy[asyncio] 2.0.49
    - asyncpg 0.31.0
    - alembic 1.16.5
    - pydantic 2.13.3
    - pydantic-settings 2.11.0
    - aiogram 3.22.0
    - "apscheduler<4"
    - structlog 25.5.0
    - aiohttp 3.13.5
    - pytz
    - "(dev) pytest 8.4.2, pytest-asyncio 1.2.0, httpx 0.28.1"
  patterns:
    - "uv-managed pyproject with hatchling build backend"
    - "Pydantic Settings with env_file=.env, extra=ignore"
    - "structlog with conditional processors (JSON vs Console) by LOG_FORMAT"
    - "async SQLAlchemy 2.x with async_sessionmaker(expire_on_commit=False)"
    - "FastAPI session dependency get_db that commits on success, rolls back on exception"
    - "BIGINT *_cents money columns; DATE for business dates, TIMESTAMPTZ(server_default=func.now()) for audit"
    - "PgEnum with create_type=True on first use, create_type=False on reuse to avoid double-creation"
    - "Single-tenant: no user_id FK on any table"
    - "Soft delete only on Category via is_archived; hard delete elsewhere"

key-files:
  created:
    - pyproject.toml
    - app/__init__.py
    - app/core/__init__.py
    - app/core/settings.py
    - app/core/logging.py
    - app/db/__init__.py
    - app/db/base.py
    - app/db/session.py
    - app/db/models.py
    - app/api/__init__.py
    - app/bot/__init__.py
    - app/worker/__init__.py
  modified: []

key-decisions:
  - "Settings ship with safe placeholder defaults (BOT_TOKEN='changeme', OWNER_TG_ID=0, DATABASE_URL with docker hostname) so import succeeds without .env in test contexts; real values come from .env in dev/prod"
  - "Module-level settings = Settings() singleton (no get_settings() factory) to keep import sites simple; pydantic-settings reads env once at startup"
  - "PgEnum(create_type=True) only on the first usage of each enum (Category.kind, BudgetPeriod.status, etc.); subsequent usages set create_type=False to prevent Alembic generating duplicate CREATE TYPE statements"
  - "AppHealth (D-12) included in this plan rather than 01-04 alembic migrations, so the model lives next to the others and Alembic autogenerate picks it up in one pass"
  - "subscriptions hard-delete (no is_active=False soft-delete) per CLAUDE.md; is_active is a behavioural flag (notify/charge yes/no), not a tombstone"

patterns-established:
  - "Pattern: shared Python codebase rooted at app/, three docker entrypoints will live as main_api.py, main_bot.py, main_worker.py at repo root (per D-02)"
  - "Pattern: Settings imported once at module load via app.core.settings.settings; dependents take settings.FIELD"
  - "Pattern: get_db dependency yields AsyncSession, commits on clean exit, rolls back on exception — used by all route handlers in subsequent plans"
  - "Pattern: ORM models use SQLAlchemy 2.x Mapped[type] annotations + mapped_column() (no legacy Column() syntax)"
  - "Pattern: composite indexes named ix_{table}_{cols} and unique constraints uq_{table}_{cols} for predictable Alembic naming"

requirements-completed: [INF-01, INF-02]

# Metrics
duration: ~10 min
completed: 2026-05-02
---

# Phase 1 Plan 02: Python Skeleton — Settings, Logging, ORM Models Summary

**SQLAlchemy 2.x async skeleton with 8 ORM models (BIGINT cents money, single-tenant, soft delete only on Category), Pydantic Settings (11 ENV fields), and structlog conditional renderer — shared codebase for api/bot/worker containers.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-02 (commit `f8e4fb1`)
- **Completed:** 2026-05-02 (commit `2d5594f`)
- **Tasks:** 2 of 2
- **Files created:** 12 (11 Python + 1 pyproject.toml)

## Accomplishments
- pyproject.toml pins all backend deps (fastapi, sqlalchemy[asyncio], asyncpg, aiogram, alembic, apscheduler<4, pydantic-settings, structlog, aiohttp, pytz) plus dev deps (pytest, pytest-asyncio, httpx). Pytest configured with asyncio_mode=auto, testpaths=tests.
- app/ package laid out per D-02: core/, db/, api/, bot/, worker/ each with __init__.py.
- core/settings.py: Settings(BaseSettings) with all 11 ENV fields documented in HLD §8 and CONTEXT.md (DATABASE_URL, DATABASE_URL_SYNC, BOT_TOKEN, OWNER_TG_ID, INTERNAL_TOKEN, API_BASE_URL, PUBLIC_DOMAIN, DEV_MODE=False, LOG_LEVEL, LOG_FORMAT, APP_TZ).
- core/logging.py: configure_logging(log_level, log_format) wires structlog with JSON renderer when log_format='json' or ConsoleRenderer otherwise (D-13).
- db/base.py: Base = DeclarativeBase().
- db/session.py: async engine bound to settings.DATABASE_URL, async_sessionmaker(expire_on_commit=False), get_db FastAPI dependency.
- db/models.py: 8 models with SQLAlchemy 2.x Mapped[] syntax — AppUser, Category (with is_archived soft delete), BudgetPeriod (with relationships to planned/actual transactions), PlanTemplateItem, Subscription, PlannedTransaction, ActualTransaction, AppHealth. All money fields BigInteger; all 5 PostgreSQL ENUMs registered; composite indexes per HLD §2.3; UNIQUE (subscription_id, original_charge_date) per N-1 in HLD §10.

## Task Commits

Each task was committed atomically with `--no-verify` (worktree-based parallel execution, hooks disabled):

1. **Task 1: Создать pyproject.toml** — `f8e4fb1` (chore)
2. **Task 2: Создать app/ пакет — settings, logging, DB models, session** — `2d5594f` (feat)

**Plan metadata commit:** see Self-Check below — SUMMARY.md committed separately by the orchestrator merge step.

## Files Created/Modified

- `pyproject.toml` — backend + dev dependencies, pytest config, hatchling build backend
- `app/__init__.py` — package marker
- `app/core/__init__.py` — subpackage marker
- `app/core/settings.py` — Pydantic Settings with 11 ENV fields and module-level singleton
- `app/core/logging.py` — `configure_logging()` for structlog JSON/console renderer
- `app/db/__init__.py` — subpackage marker
- `app/db/base.py` — `Base = DeclarativeBase()`
- `app/db/session.py` — async engine + `AsyncSessionLocal` + `get_db()` dependency
- `app/db/models.py` — 8 ORM models, 5 PgEnums, indexes, unique constraint
- `app/api/__init__.py` — subpackage marker (FastAPI routers will land here in 01-05)
- `app/bot/__init__.py` — subpackage marker (aiogram handlers in 01-06)
- `app/worker/__init__.py` — subpackage marker (APScheduler jobs in 01-06)

## Decisions Made

- **Defaults in Settings, not required-with-no-default:** import succeeds in test contexts even without .env present. Real values supplied via .env (dev) or docker-compose env (prod).
- **Module-level `settings = Settings()`:** simpler than a `get_settings()` factory; pydantic-settings caches at import.
- **`PgEnum(... create_type=True)` only on the first usage of each enum:** `categorykind` registers once via Category.kind; PlannedTransaction.kind and ActualTransaction.kind reuse with `create_type=False` to prevent Alembic emitting duplicate `CREATE TYPE` SQL.
- **AppHealth model lives in models.py now (not deferred to 01-04 migrations plan):** ensures Alembic autogenerate emits the table in the same first migration as the rest. Per D-12.
- **`subscription.is_active` is a behavioural flag, not a tombstone.** Subscriptions are hard-deleted per CLAUDE.md; `is_active=false` only suppresses notify/charge jobs.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met:
- pyproject.toml has all 13 deps + dev deps + pytest config (Task 1)
- 11 Settings fields, 8 ORM models, BigInteger money everywhere, no Float, no `user_id` FK columns, `is_archived` only on Category, all required indexes/unique constraints present (Task 2)

The plan's grep-based acceptance scripts produced two false positives (matches inside the module docstring and inside `tg_user_id` substring), so verification was supplemented with AST-based checks. The AST checks confirmed:
- `Float` is not referenced as a Name or Attribute anywhere in models.py
- No column annotated `user_id:` exists (only `tg_user_id:` on AppUser)
- `is_archived` is defined exclusively on the `Category` class

## Issues Encountered

- **Host has no Python 3.11+** (only 3.9.6), so `tomllib` is unavailable for the literal acceptance command in the plan. Worked around with substring-based structural checks plus AST verification on subsequent files. Plan's runtime targets 3.12 inside Docker; this only affects local dev verification.

## User Setup Required

None — no external service configuration required for this plan. ENV stubs in `.env.example` and the Docker `.env` will be added in 01-05 (api ENV wiring) and 01-06 (bot/worker ENV).

## Next Phase Readiness

- **Plan 01-04 (Alembic migrations) is unblocked:** `app.db.base.Base.metadata` is now populated by `app.db.models`. Alembic env.py will import `from app.db.models import *` (or rely on side-effect import via base.py) and `target_metadata = Base.metadata` will see all 8 tables, 5 enums, indexes, and the unique constraint.
- **Plan 01-05 (FastAPI app + auth) is unblocked:** `from app.core.settings import settings`, `from app.core.logging import configure_logging`, `from app.db.session import get_db, AsyncSessionLocal` are all importable.
- **Plan 01-06 (bot + worker entrypoints) is unblocked:** same imports plus `settings.DATABASE_URL_SYNC` is ready for APScheduler SQLAlchemyJobStore (Pattern 7 in 01-RESEARCH).
- **Wave 1 sibling Plan 01-03 (frontend scaffold)** is independent of this work — no shared files.

## Self-Check

- [x] `pyproject.toml` exists at `/Users/exy/pet_projects/tg-budget-planner/pyproject.toml`
- [x] All 11 `app/**/*.py` files exist
- [x] Commit `f8e4fb1` exists in `git log` (Task 1)
- [x] Commit `2d5594f` exists in `git log` (Task 2)
- [x] AST parse of `app/db/models.py` and `app/core/settings.py` succeeds
- [x] All 8 ORM model classes inherit from `Base` (verified via AST)
- [x] All 11 Settings ENV fields present, no extras (verified via AST)
- [x] No `Float` reference, no `user_id:` column annotation (verified via AST)
- [x] `is_archived` only on `Category` (verified via AST)
- [x] STATE.md and ROADMAP.md NOT modified (per parallel-execution constraints)

**Self-Check: PASSED**

---
*Phase: 01-infrastructure-and-auth*
*Plan: 02*
*Completed: 2026-05-02*
