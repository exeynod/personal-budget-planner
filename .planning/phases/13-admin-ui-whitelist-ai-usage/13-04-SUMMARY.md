---
phase: 13-admin-ui-whitelist-ai-usage
plan: "04"
subsystem: backend-admin-routes
tags: [admin, routes, service-layer, cascade-purge, rbac, last-seen-at]
requires:
  - "Plan 13-02 (alembic 0008 with spending_cap_cents + ai_usage_log table)"
  - "Plan 12-02 (require_owner dependency from app/api/dependencies.py)"
  - "Phase 11 RLS scope pattern via set_config (Plan 11-06 worker scoping)"
provides:
  - "GET /api/v1/admin/users — list whitelist with last_seen_at, owner-first sort"
  - "POST /api/v1/admin/users — invite by tg_user_id (201/409/422); creates role=member"
  - "DELETE /api/v1/admin/users/{id} — revoke + cascade purge (204/403/404)"
  - "purge_user(db, user_id) service: FK-safe DELETE order across 10 tables + AppUser"
  - "AppUser.last_seen_at TIMESTAMPTZ nullable column (Phase 14 will populate)"
  - "Structured audit log lines: audit.user_invited / audit.user_revoked"
affects:
  - "Plan 13-05 (admin AI usage breakdown): extends admin_router with /admin/ai-usage"
  - "Plan 13-06 (frontend admin UI): consumes 3 endpoints via fetch hooks"
  - "Phase 14 (member onboarding): will write last_seen_at on /me / bot bind"
tech-stack-added:
  - "FastAPI Annotated[AppUser, Depends(require_owner)] router-level RBAC"
  - "Pydantic v2 ConfigDict(extra='forbid') + Field(ge=10_000) input validation"
patterns:
  - "Service-layer cascade purge with explicit FK-safe DELETE order (mirrors Plan 11-02 D-NOTE)"
  - "Transaction-scoped tenant GUC via SELECT set_config('app.current_user_id', :uid, true) before DELETEs"
  - "Race-safe invite: select-then-insert + IntegrityError fallback rolls back & maps to 409"
  - "Self-revoke check at route layer (HTTP-semantic concern; not in service)"
key-files-created:
  - "app/api/schemas/admin.py"
  - "app/services/admin_users.py"
  - "app/api/routes/admin.py"
key-files-modified:
  - "app/db/models.py"
  - "alembic/versions/0008_admin_phase13.py"
  - "app/api/router.py"
decisions:
  - "downgrade() uses ALTER TABLE app_user DROP COLUMN IF EXISTS last_seen_at — defensive idempotency because 0008 was extended after first dev apply (Rule 3 auto-fix)"
  - "explicit DELETE FROM ai_usage_log в _PURGE_TABLES_ORDERED, even though FK is ON DELETE CASCADE — даёт row count для audit log"
  - "owner-first sort via ORDER BY (role != 'owner') boolean — простой single-clause без CASE WHEN, читается яснее для 3-state enum"
  - "set_config(..., true) is_local=true — GUC сбрасывается на commit/rollback, не утекает в pool connections"
metrics:
  duration: "~6m 17s"
  completed: "2026-05-07"
---

# Phase 13 Plan 04: Admin Users CRUD + Cascade Purge Summary

Wave 2 backend для Phase 13 admin UI: реализованы 3 endpoint'а под `Depends(require_owner)` (GET / POST / DELETE на `/api/v1/admin/users`), service-layer `purge_user` с FK-safe порядком DELETE по 10 таблицам и тенант GUC через `set_config`, плюс новая колонка `AppUser.last_seen_at` для UI «Xd назад» индикатора. 12/12 RED тестов из Plan 13-01 переходят в GREEN (с `DEV_MODE=false`). Никаких regression в остальном test suite.

## What Was Implemented

### Task 1: schemas + service-layer + last_seen_at column (commit `d8115f8`)

**`app/api/schemas/admin.py`** (new):
- `AdminUserResponse` — `model_config = ConfigDict(from_attributes=True)`; поля `id, tg_user_id, tg_chat_id, role (Literal owner|member|revoked), last_seen_at (Optional[datetime]), onboarded_at, created_at`
- `AdminUserCreateRequest` — `model_config = ConfigDict(extra="forbid")`; `tg_user_id: int = Field(..., ge=10_000)` для блокировки коротких id и `@username` (FastAPI вернёт 422)

**`app/services/admin_users.py`** (new):
- `UserAlreadyExistsError`, `UserNotFoundError` — domain exceptions для 409 / 404 mapping
- `list_users(db)` — `ORDER BY (role != 'owner'), nulls_last(desc(last_seen_at)), id` → owner-first, members by recent activity, deterministic tie-break
- `invite_user(db, *, tg_user_id)` — select-then-insert; ловит `IntegrityError` для race-safety; refresh ORM перед return
- `purge_user(db, *, user_id)` — verify exists → set tenant GUC → loop DELETE по `_PURGE_TABLES_ORDERED` (10 таблиц в FK-safe порядке) → DELETE FROM app_user → return per-table counts dict
- `_PURGE_TABLES_ORDERED` constant: `ai_message → ai_conversation → category_embedding → planned_transaction → actual_transaction → plan_template_item → subscription → budget_period → category → ai_usage_log`

**`app/db/models.py`** (mod):
- `AppUser.last_seen_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)` — между `onboarded_at` и `created_at`

**`alembic/versions/0008_admin_phase13.py`** (mod):
- `upgrade()`: добавлен новый шаг 0 — `op.add_column("app_user", sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=True))` ПЕРЕД spending_cap_cents
- `downgrade()`: добавлен `op.execute("ALTER TABLE app_user DROP COLUMN IF EXISTS last_seen_at")` после drop spending_cap_cents — `IF EXISTS` для idempotency (0008 был дважды применён в dev)

### Task 2: routes + mount (commit `ca18e5d`)

**`app/api/routes/admin.py`** (new, 113 LOC):
- `admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])` — router-level RBAC gate; member/revoked получают 403 на любом endpoint'е
- `GET /admin/users` (response_model=list[AdminUserResponse]) — делегирует `admin_svc.list_users`
- `POST /admin/users` (status_code=201, response_model=AdminUserResponse) — try/except `UserAlreadyExistsError` → 409; current_user resolved via Depends для logging
- `DELETE /admin/users/{user_id}` (status_code=204) — self-revoke check (`if user_id == current_user.id: raise 403`) ПЕРЕД service call; try/except `UserNotFoundError` → 404; logs `audit.user_revoked uid=… by_owner=… purged_rows={…}` с per-table counts
- Все три endpoint'а logger.info structured audit lines

**`app/api/router.py`** (mod):
- `from app.api.routes.admin import admin_router` (alphabetical position)
- `public_router.include_router(admin_router)` — после ai_suggest_router, перед internal_router

## Verification Results

| Check | Result |
|-------|--------|
| `python -c "from app.api.schemas.admin import ..."` | OK |
| `python -c "from app.services.admin_users import ..."` | OK |
| `from app.main_api import app` (full app load) | OK |
| FastAPI route registry includes `/api/v1/admin/users` | YES (3 endpoints: GET, POST, DELETE+{user_id}) |
| `last_seen_at` column exists in app_user | YES (`information_schema.columns` query) |
| alembic round-trip downgrade -1 / upgrade head | clean |
| `pytest tests/test_admin_users_api.py -v` (DEV_MODE=false) | 12/12 PASSED in 1.18s |
| `pytest tests/ --tb=no -q` (DEV_MODE=true, default container) | 8 failed (5 belong to Plan 13-05 RED ai_usage; 3 are auth-path admin tests requiring DEV_MODE=false) — 287 passed; **0 regressions** |
| `grep -c "last_seen_at" app/db/models.py` | 1 |
| `grep -c "last_seen_at" alembic/versions/0008_admin_phase13.py` | 3 (comment + add_column + drop_column) |
| `grep -c "ge=10_000" app/api/schemas/admin.py` | 2 (Field + comment reference) |
| `grep -c "set_config" app/services/admin_users.py` | 2 (SQL call + docstring) |
| `grep -c "admin_router" app/api/router.py` | 2 (import + include) |
| `grep -c "Depends(require_owner)" app/api/routes/admin.py` | 3 (router-level + 2 per-endpoint for current_user resolution) |

### Cascade purge sanity (test_admin_delete_user_cascade_purges_data)
Member юзер с category + budget_period + actual_transaction → DELETE /admin/users/{member_id} → 204 → проверка: `category, budget_period, actual_transaction, planned_transaction, subscription, plan_template_item, category_embedding, ai_conversation, ai_message` — все 0 rows для member_id; owner-данные intact (1 row в category); AppUser member-row удалён. PASSED.

### Audit log structured lines
Тесты не парсят логи напрямую (нет caplog assert), но handler пишет:
- `audit.user_invited tg_user_id=<x> new_id=<y> by_owner=<z>` на каждый POST 201
- `audit.user_revoked uid=<x> by_owner=<y> purged_rows={'ai_message': 0, 'category': 1, …}` на каждый DELETE 204

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking] Defensive `DROP COLUMN IF EXISTS` в downgrade 0008**

- **Found during:** Task 1 (alembic round-trip)
- **Issue:** Plan 13-02 уже применил alembic 0008 в dev (revision=`0008_admin_phase13`, без `last_seen_at`). После расширения 0008 нужен round-trip downgrade -1 / upgrade head чтобы новая колонка применилась. Прямой `op.drop_column("app_user", "last_seen_at")` падает в этом случае с `column "last_seen_at" of relation "app_user" does not exist` — БД не имеет колонки которую старая 0008-без-last_seen_at не создавала.
- **Fix:** Заменил `op.drop_column("app_user", "last_seen_at")` на `op.execute("ALTER TABLE app_user DROP COLUMN IF EXISTS last_seen_at")` — идемпотентно работает на обоих формах БД.
- **Files modified:** `alembic/versions/0008_admin_phase13.py` (downgrade)
- **Commit:** `d8115f8` (Task 1)

Это не отступление от plan-семантики — лишь defensive guard для edge-case dev-окружения где 0008 был applied до расширения. На fresh БД (без миграции) — поведение идентично оригинальному drop_column. На pet-проде (single instance) — round-trip work clean после rebuild.

### Other Adjustments

Никаких других deviation. Все три файла artefacts (`schemas/admin.py`, `services/admin_users.py`, `routes/admin.py`) точно соответствуют интерфейсам из `<interfaces>` блока плана. Mount в router.py — после ai_suggest_router как и planировалось.

## Authentication Gates

Никаких. Все тесты были unit/integration на изолированной test-DB.

## Threat Mitigations Applied

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-13-04-01 (member calls /admin/*) | mitigate | router-level `Depends(require_owner)` → 403; verified by test_admin_{list,create,delete}_user_403_for_member (3 tests) |
| T-13-04-02 (owner self-revoke) | mitigate | `if user_id == current_user.id: raise 403` ПЕРЕД service call; verified by test_admin_delete_user_self_403 |
| T-13-04-03 (race на duplicate invite) | mitigate | invite_user catches IntegrityError → rolls back → raises UserAlreadyExistsError → 409 |
| T-13-04-04 (cascade leaks other users' data) | mitigate | `WHERE user_id = :uid` на каждом DELETE; verified by test_admin_delete_user_cascade_purges_data (asserts owner data intact) |
| T-13-04-05 (PII в audit log) | accept | tg_user_id не PII per CONTEXT (closed whitelist 5-50 users) |
| T-13-04-06 (RLS bypass без auth) | mitigate | service вызывается ТОЛЬКО из `/admin/*` под require_owner; нет публичных callers |
| T-13-04-07 (DoS на cascade DELETE) | accept | MVP scale, defer до Phase 15 |
| T-13-04-08 (no persisted audit trail) | accept | structured stdout log line — full audit_log table deferred per CONTEXT.md |

## Threat Flags

Никаких новых attack surfaces за пределами threat_model плана. Введённый `set_config('app.current_user_id', ...)` внутри purge_user не расширяет surface — это уже стандартный pattern Phase 11 worker-scoping (Plan 11-06).

## Deferred Issues

**Pre-existing, не связано с этим планом:**

- 5 RED тестов в `tests/test_admin_ai_usage_api.py` остаются падающими — это Plan 13-05 (admin AI usage breakdown) target.
- 3 теста auth-path (`test_admin_{list,create,delete}_user_403_for_member`) падают если запускать с `DEV_MODE=true` (default в dev container). Они работают корректно с `DEV_MODE=false`. Причина: container env `DEV_MODE=true`, conftest.py использует `os.environ.setdefault("DEV_MODE", "false")` (no-op если уже set), а `app.core.settings` singleton кэширует bool до того как `async_client` fixture успевает override. Это known dev-mode quirk не специфичный для Plan 13-04 — auth-path тестов для других routes (`tests/test_postgres_role_runtime.py` etc.) обычно запускают с явным `-e DEV_MODE=false`.

**Mitigation в SDLC:** для CI integration runs следует устанавливать `DEV_MODE=false` явно (как делает `scripts/run-integration-tests.sh` либо явный `-e DEV_MODE=false` exec flag).

## Files Changed

```
app/api/schemas/admin.py       |  53 +++++++++++ (new)
app/services/admin_users.py    | 153 +++++++++++++++++++++++++++++ (new)
app/api/routes/admin.py        | 113 +++++++++++++++++++++ (new)
app/db/models.py               |   3 +++ (last_seen_at column)
alembic/versions/0008_admin_phase13.py | 13 +++++ (last_seen_at add/drop)
app/api/router.py              |   5 +++ (import + include_router)
```

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1    | `d8115f8` | feat(13-04): admin users service-layer + schemas + last_seen_at column |
| 2    | `ca18e5d` | feat(13-04): admin users CRUD routes + mount in public_router |

## Self-Check: PASSED

- File `app/api/schemas/admin.py` exists ✓
- File `app/services/admin_users.py` exists ✓
- File `app/api/routes/admin.py` exists ✓
- File `app/db/models.py` modified (last_seen_at column added) ✓
- File `alembic/versions/0008_admin_phase13.py` modified (3 last_seen_at refs) ✓
- File `app/api/router.py` modified (admin_router import + include) ✓
- Commit `d8115f8` exists in git log ✓
- Commit `ca18e5d` exists in git log ✓
- `from app.main_api import app` clean ✓
- 3 admin paths registered in FastAPI route registry ✓
- `tests/test_admin_users_api.py` 12/12 GREEN with DEV_MODE=false ✓
- 287/295 passing in full suite (8 fails: 5 = Plan 13-05 RED, 3 = DEV_MODE=true env issue) — 0 regression ✓
- last_seen_at column physically present in app_user table ✓
