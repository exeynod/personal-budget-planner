# Phase 12: Role-Based Auth Refactor - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss in autonomous mode); decisions locked from milestone-level discussion + Phase 11 deferred items

<domain>
## Phase Boundary

Auth-слой переключён с `OWNER_TG_ID`-equality на role-based проверки. Frontend получает role через `/me` и может скрывать admin-функционал у members. Bot и worker используют role-based проверки. Также resolve D-11-07-01 (legacy test fixtures) и D-11-07-02 (NOSUPERUSER role split для RLS enforcement).

**В scope:**
- Refactor `get_current_user` (app/api/dependencies.py) — выбрасывает 403 при `role == 'revoked'` или unknown `tg_user_id`; пропускает `role IN ('owner', 'member')`
- Новая dependency `require_owner` — выбрасывает 403 для не-owner юзеров; используется как additional Depends на admin-only endpoints (Phase 13 будет их подключать)
- ROLE-02: При первом запуске юзер с `tg_user_id == OWNER_TG_ID` получает `role = owner`. Поскольку Phase 11 уже выполнил backfill через миграцию, этот пункт фактически означает: убрать все остальные места кода где сравнивается `tg_user_id == OWNER_TG_ID` — auth полагается на role
- Endpoint `GET /api/v1/me` возвращает `{tg_user_id, role, onboarded_at, ...}` — frontend читает `role` для conditional admin UI
- Refactor бота (`app/bot/handlers.py:58`) — replace `user_id != settings.OWNER_TG_ID` check на role-check (через resolve user record + check role)
- Worker remains role-aware (Phase 11 already iterates active users)
- Удалить все остальные `tg_user_id == OWNER_TG_ID` сравнения в request pipeline (grep по codebase)
- Resolve D-11-07-01: ~63 legacy test fixtures (test_subscriptions, test_planned, test_actual_*, etc.) get user_id-aware seeds — массовая правка conftest helpers
- Resolve D-11-07-02: Postgres `budget` runtime role переходит на NOSUPERUSER (через migration или setup-script); `DATABASE_URL` разделяется на admin (alembic, миграции) vs app (runtime); RLS policies теперь реально enforce'ятся в проде

**НЕ в scope:**
- Admin UI (Phase 13)
- Onboarding для приглашённых юзеров (Phase 14)
- AI cost cap (Phase 15)
- Любые DB schema changes (Phase 11 сделал)
- Frontend изменения кроме `/me` consume — frontend подключение admin tab visibility будет в Phase 13

</domain>

<decisions>
## Implementation Decisions

### Auth-Layer Changes
- **`get_current_user` refactor** — текущая логика сравнивает `user_id == settings.OWNER_TG_ID` → новая логика: резолвит `app_user` по `tg_user_id`, проверяет `role IN ('owner', 'member')`; иначе 403
- **Unknown `tg_user_id` → 403** — не auto-create `app_user`. Phase 14 (onboarding) обрабатывает первый /start через бота для приглашённых юзеров
- **`require_owner` dependency** — отдельная функция в `app/api/dependencies.py`, использует `get_current_user`, проверяет `user.role == UserRole.OWNER`; admin-only endpoints используют её как Depends
- **Все 4 dependencies остаются доступны** — `get_current_user`, `get_current_user_id`, `get_db_with_tenant_scope`, `require_owner`. `OWNER_TG_ID` остаётся в settings.py (используется только в onboarding initial seed + bot first-user logic), но НЕ в request-time auth
- **`OWNER_TG_ID` в `app/bot/handlers.py:58`** — заменить на role-check через internal API call (`GET /internal/users/{tg_user_id}/role`) или через прямой DB lookup в боте (через shared engine). **Решение: прямой DB lookup в боте через shared async engine** — bot уже имеет access к session через app/db/session.py; добавить helper `bot_resolve_user_role(tg_user_id) -> UserRole | None`

### `/me` Endpoint
- **Response shape**: `{tg_user_id: int, role: 'owner'|'member'|'revoked', onboarded_at: datetime|null, starting_balance_cents: int, cycle_start_day: int, notify_days_before: int, enable_ai_categorization: bool, spending_cap_cents: int|null}`
- **`role` поле** добавляется к существующему response — frontend читает для conditional rendering
- **Frontend types обновляются** — `frontend/src/api/types.ts` добавляет `role` в Me response
- **Frontend changes минимальные** — только types + `/me` consumer hook возвращает role; реальное использование в Phase 13

### Postgres Role Split (D-11-07-02 Resolution)
- **Two Postgres roles**:
  - `budget_admin` (SUPERUSER) — для alembic миграций, BYPASSRLS implicit; `ADMIN_DATABASE_URL` ENV var
  - `budget_app` (NOSUPERUSER NOBYPASSRLS) — для runtime API/bot/worker; `DATABASE_URL` ENV var
- **Migration approach**: Alembic 0007 миграция создаёт `budget_app` role и grant'ит ему нужные privileges (SELECT/INSERT/UPDATE/DELETE на доменных таблицах + USAGE на sequences); migration runs as `budget_admin`
- **`DATABASE_URL` в `.env.example`** обновляется с двумя вариантами + комментарии
- **`docker-compose.yml`/dev-override** — два DATABASE_URL вариа; api/bot/worker используют DATABASE_URL (`budget_app`), alembic в entrypoint.sh использует ADMIN_DATABASE_URL (`budget_admin`)
- **Local dev** — `entrypoint.sh` запускает `alembic upgrade` через ADMIN_DATABASE_URL, потом передаёт control runtime с DATABASE_URL
- **Теперь RLS реально enforce'ятся** — `budget_app` role не байпасит RLS, любая попытка обхода (например worker job с потерянным SET LOCAL) вернёт пустой результат

### Legacy Test Fixtures (D-11-07-01 Resolution)
- **Audit scope**: `tests/test_subscriptions.py`, `test_planned.py`, `test_actual_*.py`, `test_categories.py`, `test_periods.py`, `test_template.py`, etc. — все тесты которые seed'ят данные напрямую через session (не через API)
- **Strategy**: создать helper `tests/helpers/seed.py` с функциями `seed_user(role='owner')`, `seed_category(user_id, ...)`, `seed_subscription(user_id, ...)` etc. — все принимают `user_id` параметр явно
- **Существующие тесты обновляются** для использования helper'ов — каждый тест получает либо `single_user` фикстуру (для simple cases) либо `two_tenants` (для isolation tests)
- **Не каждый тест требует rewrite** — некоторые могут продолжать работать если они call'ят API (auth dependency сама резолвит user). Audit findит конкретные тесты что fail-ят

### Claude's Discretion
- Точный путь refactor'а `get_current_user` — return AppUser или dict с role? Probably AppUser ORM object для type safety
- Имя bot-helper функции (`bot_resolve_user_role` или `get_user_role_for_bot`) — на усмотрение
- Точный путь миграции 0007 (создание budget_app role) — может потребовать SQL function для grant'ов
- Frontend API types — каким именем role-enum в TypeScript (просто `'owner' | 'member' | 'revoked'` string union или generated enum)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/dependencies.py` — `get_current_user` (existing), `get_current_user_id` (Phase 11), `get_db_with_tenant_scope` (Phase 11) — расширяем с `require_owner`
- `app/db/models.py` — `AppUser` имеет `role` колонку (Phase 11 added); `UserRole` enum imported
- `app/api/routes/me.py` или эквивалент — endpoint /me для frontend
- `app/db/session.py` — shared async engine (используется api/bot/worker; готов для bot-side user lookup)
- `frontend/src/api/types.ts` — добавить `role` в Me type
- `tests/conftest.py` — `two_tenants` фикстура (Phase 11) + добавляем helper'ы для legacy tests

### Established Patterns
- **Auth pattern**: FastAPI dependency chain — `get_current_user` резолвит, downstream deps используют
- **ORM enum binding**: `Mapped[UserRole]` маппится на Postgres `user_role` enum (Phase 11)
- **Bot pattern**: aiogram handler читает settings, проверяет; refactor добавляет DB lookup
- **Test pattern**: pytest fixtures, async session
- **Docker pattern**: entrypoint.sh запускает миграции, потом app

### Integration Points
- `app/api/dependencies.py` — main auth refactor target
- `app/api/routes/me.py` (or wherever /me lives) — добавить role в response
- `app/api/schemas/me.py` (or wherever) — добавить role в Pydantic schema
- `app/bot/handlers.py:58` — заменить OWNER_TG_ID-eq на role check
- `app/core/settings.py` — добавить `ADMIN_DATABASE_URL` (или раздельные `DATABASE_URL` + `DATABASE_URL_ADMIN`)
- `alembic/env.py` — переключиться на `ADMIN_DATABASE_URL` для миграций
- `entrypoint.sh` — обновить чтобы alembic использовал admin URL
- `docker-compose.yml` + `docker-compose.dev.yml` — два DATABASE_URL ENV var
- `tests/helpers/seed.py` (new) — fixture helpers
- `tests/conftest.py` — добавить `single_user` fixture, обновить `two_tenants` если нужно
- `frontend/src/api/types.ts` + `frontend/src/hooks/useMe.ts` (or similar) — добавить role
- Все legacy test файлы — постепенно мигрировать на user_id-aware fixtures (некоторые могут не требовать changes если идут через API)

### Out of scope code paths
- `app/api/routes/internal_*.py` — internal token auth не зависит от role
- Frontend admin UI rendering — Phase 13
- Frontend onboarding redirects — Phase 14

</code_context>

<specifics>
## Specific Ideas

- **Migration 0007 (Postgres role split)** — должна быть idempotent: `CREATE ROLE budget_app IF NOT EXISTS` может не работать в Postgres напрямую — использовать DO-block:
  ```sql
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_app') THEN
      CREATE ROLE budget_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
  END $$;
  ```
  Затем grant'ы и password setup через ENV (`BUDGET_APP_PASSWORD`).

- **Test для D-11-07-02 fix**: после миграции 0007 + DATABASE_URL split, тест test_rls_policy.py должен показать что RLS реально enforce'ится в runtime (без `_rls_test_role` workaround из Phase 11).

- **Frontend feature flag pattern**: `useMe()` hook возвращает `{role, ...}`; компонент `<AdminGate>{children}</AdminGate>` рендерит children только если `role === 'owner'`. Phase 13 использует этот gate для admin tab visibility.

</specifics>

<deferred>
## Deferred Ideas

- **Audit log table** для admin actions (`AUD-01`, `AUD-02` в Future Requirements) — Phase 13 решит
- **Sentry/UptimeRobot/Healthchecks** — Future Requirements, отдельный milestone
- **Rate limiting Cloudflare/Caddy/slowapi** — Future Requirements
- **Bot resolve via internal API vs direct DB**: выбрали direct DB (см. decisions); если в будущем bot становится отдельным сервисом без shared DB engine — refactor на internal API call

</deferred>
