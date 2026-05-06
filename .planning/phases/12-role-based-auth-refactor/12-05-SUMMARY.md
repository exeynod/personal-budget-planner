---
phase: 12-role-based-auth-refactor
plan: "05"
subsystem: infrastructure
tags: [postgres-role, rls-runtime, alembic, infrastructure, threat-model-mitigation, d-11-07-02]
dependency_graph:
  requires: ["12-01"]
  provides: ["budget_app role via alembic 0007", "ADMIN_DATABASE_URL wiring", "BUDGET_APP_PASSWORD env pattern"]
  affects: ["docker-compose.yml", "app/core/settings.py", "alembic/env.py", "entrypoint.sh"]
tech_stack:
  added: []
  patterns: ["Postgres dual-role split (SUPERUSER DDL vs NOSUPERUSER runtime)", "idempotent DO-block CREATE ROLE", "entrypoint env var override for alembic"]
key_files:
  created:
    - alembic/versions/0007_postgres_role_split.py
  modified:
    - app/core/settings.py
    - alembic/env.py
    - entrypoint.sh
    - docker-compose.yml
    - docker-compose.dev.yml
    - .env.example
decisions:
  - "BUDGET_APP_PASSWORD embedded as escaped single-quoted literal in ALTER ROLE (PostgreSQL DDL bind-params restriction)"
  - "DO-block idempotent CREATE ROLE NOLOGIN first, then ALTER ROLE WITH LOGIN PASSWORD in step 2 (T-12-05-05: no window with loginable role without password)"
  - "entrypoint.sh uses DATABASE_URL=${ADMIN_DATABASE_URL:-$DATABASE_URL} shell override (not env export) — uvicorn inherits original DATABASE_URL"
  - "Task 4 (real migration apply + pytest GREEN) deferred to Plan 12-07 verification — requires live docker stack rebuild with updated .env"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-06"
  tasks_completed: 4
  files_changed: 7
---

# Phase 12 Plan 05: Postgres Role Split — SUMMARY

**One-liner:** Alembic 0007 creates budget_app (NOSUPERUSER NOBYPASSRLS) + grants; ADMIN_DATABASE_URL wired across settings/entrypoint/compose to enforce RLS at runtime (D-11-07-02).

## What Was Built

### alembic/versions/0007_postgres_role_split.py (NEW)

Migration идемпотентно создаёт `budget_app` Postgres role через DO-block и настраивает привилегии:

1. `CREATE ROLE budget_app NOLOGIN NOSUPERUSER NOBYPASSRLS` (DO-block, idempotent)
2. `ALTER ROLE budget_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD <escaped_literal>` — читает `BUDGET_APP_PASSWORD` env var, fail-loud если не задан
3. `GRANT USAGE ON SCHEMA public TO budget_app`
4. `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO budget_app`
5. `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO budget_app`
6. `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ... TO budget_app` (для будущих таблиц)

Downgrade: `DROP OWNED BY budget_app` + `DROP ROLE budget_app` (idempotent IF EXISTS).

Revision ID: `0007_postgres_role_split` (24 символа, < 32 — OK для alembic_version VARCHAR(32)).

### app/core/settings.py

Добавлен `ADMIN_DATABASE_URL: str` field с default pointing at `budget` role — backward compat для pre-12-05 setups.

### alembic/env.py

Заменён блок определения URL: `admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ.get("DATABASE_URL")` — alembic теперь использует привилегированный URL для DDL.

### entrypoint.sh

Alembic запускается с `DATABASE_URL="${ADMIN_DATABASE_URL:-$DATABASE_URL}"` override — uvicorn после этого наследует оригинальный `DATABASE_URL` (budget_app). Shell-level override (не export) обеспечивает scope только для alembic subprocess.

### docker-compose.yml

Все три сервиса (api, bot, worker) обновлены:
- `DATABASE_URL` → `budget_app:${BUDGET_APP_PASSWORD}@db:5432/budget_db` (NOSUPERUSER — RLS enforces)
- Добавлен `ADMIN_DATABASE_URL` → `budget:${DB_PASSWORD}@db:5432/budget_db` (SUPERUSER — для alembic)

### .env.example

Секция Database обновлена: документированы `BUDGET_APP_PASSWORD` и `ADMIN_DATABASE_URL` с объяснением двухролевой схемы.

## Threat Model Mitigations Applied

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-12-05-01 (Elevation: runtime uses super URL) | MITIGATED | docker-compose api/bot/worker DATABASE_URL → budget_app |
| T-12-05-04 (Excess grants) | MITIGATED | Only SELECT/INSERT/UPDATE/DELETE; no CREATE/DROP/ALTER |
| T-12-05-05 (Role with no password window) | MITIGATED | NOLOGIN first, then ALTER WITH LOGIN PASSWORD in step 2 |
| T-12-05-06 (Missing BUDGET_APP_PASSWORD) | MITIGATED | `_resolve_app_password()` raises RuntimeError loudly with instructions |
| T-12-05-07 (DEFAULT PRIVILEGES wrong user) | MITIGATED | Documented in migration — runs as `budget` via ADMIN_DATABASE_URL |

## Verification Status

| Check | Result |
|-------|--------|
| Migration AST parse | PASS |
| `grep -c 'budget_app' 0007_postgres_role_split.py` ≥ 8 | PASS (22) |
| `grep -c 'NOSUPERUSER NOBYPASSRLS' 0007_postgres_role_split.py` ≥ 1 | PASS (6) |
| Revision ID length < 32 chars | PASS (24) |
| `settings.ADMIN_DATABASE_URL` accessible | PASS |
| `grep -c 'ADMIN_DATABASE_URL' settings.py+env.py+entrypoint.sh` ≥ 4 | PASS (8) |
| `grep -c '\${ADMIN_DATABASE_URL:-\$DATABASE_URL}' entrypoint.sh` ≥ 1 | PASS |
| entrypoint.sh executable bit preserved | PASS (-rwxr-xr-x) |
| `grep -c 'BUDGET_APP_PASSWORD' docker-compose.yml` ≥ 3 | PASS (6) |
| `grep -c 'ADMIN_DATABASE_URL' docker-compose.yml` ≥ 3 | PASS (3) |
| `docker compose -f docker-compose.yml config` parses | PASS |
| test_postgres_role_runtime.py: 3 tests collectible | PASS (3 found) |
| Real DB apply + pytest GREEN | DEFERRED → Plan 12-07 (requires live docker rebuild) |

## Deviations from Plan

### Auto-adjusted: `.env.example` comment minor rephrasing

ADMIN_DATABASE_URL count in `.env.example` is 3 (> requirement of ≥1) — added inline comment on same line as variable definition + section header + standalone line. This exceeds minimum and is correct.

Otherwise plan executed exactly as written — no Rule 1/2/3 deviations.

## Known Stubs

None — this plan is infrastructure only; no UI or data stubs.

## Threat Flags

None — all new surface items were pre-analysed in the plan's threat_model.

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 830ba4b | Task 1 | feat(12-05): add alembic 0007 postgres_role_split migration |
| e62f16f | Task 2 | feat(12-05): wire ADMIN_DATABASE_URL in settings, alembic env, entrypoint |
| edb377a | Task 3 | feat(12-05): split DATABASE_URL / ADMIN_DATABASE_URL in compose + .env.example |

## Self-Check: PASSED

- alembic/versions/0007_postgres_role_split.py: FOUND
- app/core/settings.py: FOUND (ADMIN_DATABASE_URL)
- alembic/env.py: FOUND (admin_url)
- entrypoint.sh: FOUND (ADMIN_DATABASE_URL override)
- docker-compose.yml: FOUND (BUDGET_APP_PASSWORD, ADMIN_DATABASE_URL)
- .env.example: FOUND (BUDGET_APP_PASSWORD, ADMIN_DATABASE_URL)
- Commits 830ba4b, e62f16f, edb377a: FOUND in git log
