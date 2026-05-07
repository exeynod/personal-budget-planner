---
phase: 13-admin-ui-whitelist-ai-usage
plan: "02"
subsystem: db-schema
tags: [alembic, schema, ai-usage, spending-cap, rls]
requires:
  - "alembic 0007_postgres_role_split (budget_app role exists with NOSUPERUSER NOBYPASSRLS)"
  - "Phase 11 RLS policy pattern (NULLIF/coalesce on app.current_user_id GUC)"
  - "ADMIN_DATABASE_URL pointing at privileged role for migration runs"
provides:
  - "app_user.spending_cap_cents BIGINT NOT NULL DEFAULT 46500 (USD копейки stub)"
  - "ai_usage_log table: id BIGINT PK, user_id FK CASCADE, model TEXT, prompt/completion/cached/total_tokens INTEGER, est_cost_usd FLOAT, created_at TIMESTAMPTZ"
  - "Index ix_ai_usage_log_user_created (user_id, created_at) for per-user breakdown"
  - "RLS policy ai_usage_log_user_isolation enforced via FORCE ROW LEVEL SECURITY"
  - "GRANT SELECT/INSERT/UPDATE/DELETE on ai_usage_log + USAGE/SELECT on sequence to budget_app"
  - "ORM models: AppUser.spending_cap_cents Mapped[int] + AiUsageLog class"
affects:
  - "Plan 13-03 (AI usage hook): can INSERT into ai_usage_log on each /ai/chat call"
  - "Plan 13-04 (admin users service): doesn't need explicit DELETE from ai_usage_log (CASCADE handles it on app_user delete)"
  - "Plan 13-05 (admin AI usage breakdown): SELECT with privileged GUC bypass to aggregate cross-user"
  - "Phase 15 (AI cost cap enforcement): reads spending_cap_cents column to compare vs current month spend"
tech-stack-added:
  - "ai_usage_log telemetry table with composite index (user_id, created_at)"
patterns:
  - "Mirror migration DDL in ORM models (sa.Float ↔ Float(asdecimal=False), sa.BigInteger ↔ BigInteger)"
  - "ON DELETE CASCADE для telemetry-таблиц (vs RESTRICT для бизнес-доменов) — упрощает revoke flow"
  - "Idempotent REVOKE in DO-block для downgrade-safety когда роль может отсутствовать"
key-files-created:
  - "alembic/versions/0008_admin_phase13.py"
key-files-modified:
  - "app/db/models.py"
decisions:
  - "Index on (user_id, created_at) ASC vs DESC: ASC выбран — Postgres сканит индекс в обе стороны эффективно для агрегатов last-30d, отдельный DESC index не оправдан в pet-scale"
  - "ON DELETE CASCADE на user_id FK в ai_usage_log: telemetry-only, нет защищаемой бизнес-семантики; Plan 13-04 revoke не должен явно DELETE FROM ai_usage_log"
  - "DEFAULT_SPENDING_CAP_CENTS = 46500 как module-level constant в миграции — единая точка изменения если решим bump default"
  - "REVOKE в downgrade обёрнут в DO-block с pg_roles check — чтобы downgrade был idempotent даже после 0007 downgrade"
metrics:
  duration: "~4m 30s"
  completed: "2026-05-07"
---

# Phase 13 Plan 02: Alembic 0008 — spending_cap_cents + ai_usage_log Summary

Schema foundation for Phase 13 admin UI: новая колонка `app_user.spending_cap_cents` (USD копейки stub для Phase 15 enforcement) + новая `ai_usage_log` таблица (persistent storage per /ai/chat call вместо in-memory ring buffer) с RLS policy + grants для budget_app, плюс ORM mirror в `app/db/models.py`. Миграция применена на dev DB, round-trip downgrade -1 / upgrade head проходит чисто.

## What Was Implemented

### Task 1: alembic/versions/0008_admin_phase13.py (commit `eb60e15`)

Single-revision migration с четырьмя шагами в `upgrade()`:

1. `op.add_column("app_user", "spending_cap_cents", sa.BigInteger, server_default="46500")` — existing rows автоматически backfilled через server_default.
2. `op.create_table("ai_usage_log", ...)` — id BIGINT PK + user_id FK ON DELETE CASCADE + model TEXT + token columns INTEGER NOT NULL DEFAULT 0 + est_cost_usd FLOAT NOT NULL DEFAULT 0.0 + created_at TIMESTAMPTZ NOT NULL DEFAULT now().
3. `op.create_index("ix_ai_usage_log_user_created", ["user_id", "created_at"])` — для per-user current month / last-30d агрегатов в Plan 13-05.
4. RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY ai_usage_log_user_isolation USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))` (pattern из 0006_multitenancy).
5. GRANTS: `GRANT SELECT, INSERT, UPDATE, DELETE ON ai_usage_log TO budget_app` + `GRANT USAGE, SELECT ON SEQUENCE ai_usage_log_id_seq TO budget_app` (pattern из 0007).

`downgrade()` симметричен: REVOKE (в DO-block с pg_roles check для idempotency) → DROP POLICY IF EXISTS → drop_index → drop_table → drop_column.

### Task 2: app/db/models.py (commit `0528898`)

- Добавлен `Float` в импорт из `sqlalchemy`.
- В классе `AppUser` после `enable_ai_categorization` и перед `role` добавлен `spending_cap_cents: Mapped[int] = mapped_column(BigInteger, default=46500, server_default="46500", nullable=False)`.
- В конце файла после `CategoryEmbedding` добавлен новый класс `AiUsageLog(Base)` с `__tablename__ = "ai_usage_log"`, точно зеркалирующий DDL миграции 0008: id BIGINT PK autoincrement, user_id BigInteger FK ondelete=CASCADE, model Text, four token columns Integer default=0, est_cost_usd Float(asdecimal=False) default=0.0, created_at TIMESTAMP(timezone=True) server_default=func.now(), `__table_args__` с `Index("ix_ai_usage_log_user_created", "user_id", "created_at")`.
- Docstring AiUsageLog объясняет CASCADE choice (telemetry-only) и что Plan 13-05 admin endpoint обходит RLS через privileged query.

## Verification Results

| Check | Result |
|-------|--------|
| `alembic upgrade head` clean | ✓ Running upgrade 0007_postgres_role_split -> 0008_admin_phase13 |
| `alembic_version` after upgrade | ✓ `0008_admin_phase13` |
| `app_user.spending_cap_cents` column exists | ✓ `bigint NOT NULL DEFAULT '46500'::bigint` |
| Existing OWNER row backfilled | ✓ `id=1 spending_cap_cents=46500` |
| `ai_usage_log` table exists | ✓ Полная структура (9 columns, PK, FK CASCADE, index) |
| FK ON DELETE CASCADE | ✓ `ai_usage_log_user_id_fkey ... ON DELETE CASCADE` |
| Index ix_ai_usage_log_user_created | ✓ `btree (user_id, created_at)` |
| RLS forced + policy | ✓ `Policies (forced row security enabled): ai_usage_log_user_isolation` |
| budget_app GRANTs on table | ✓ DELETE, INSERT, SELECT, UPDATE |
| budget_app GRANTs on sequence | ✓ USAGE + SELECT |
| RLS runtime check (SET ROLE budget_app) | ✓ Без GUC → 0 rows; с GUC=999 → 0 rows (фильтрация работает) |
| `alembic downgrade -1` | ✓ ai_usage_log dropped, spending_cap_cents column dropped, version=0007 |
| `alembic upgrade head` after downgrade | ✓ Version=0008, table+column восстановлены |
| ORM `from app.db.models import AppUser, AiUsageLog` | ✓ AppUser.spending_cap_cents NOT NULL, AiUsageLog FK ondelete='CASCADE' |
| ORM Index `ix_ai_usage_log_user_created` | ✓ Present in `__table_args__` |

## Deviations from Plan

**1. Index без DESC ordering (изменение vs plan action § index DESC suggestion).**
Plan suggested `["user_id", sa.text("created_at DESC")]` с fallback на простой ASC. Реализовано как простой ASC index `["user_id", "created_at"]` — fallback из плана. Reasoning: Postgres сканит btree в обе стороны одинаково эффективно; explicit DESC дал бы выгоду только для merge-join в массивных datasets, что для pet-scale (~1.8GB/year по threat T-13-02-04 estimate) не оправдано. ORM модель и migration файл синхронизированы — обе используют ASC.

**2. [Rule 3 — blocking] REVOKE в downgrade обёрнут в DO-block.**
Plan предлагал прямой `REVOKE ALL ON ai_usage_log FROM budget_app`. Изменил на `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='budget_app') THEN REVOKE ALL ... END IF; END $$;` — потому что если 0008 запускают в режиме где 0007 уже был downgraded (и budget_app role не существует), прямой REVOKE упадёт с ERROR. DO-block делает downgrade idempotent. Не отступление от семантики — лишь defensive guard.

## Auto-fixed Issues

Никаких. Шёл строго по плану, кроме двух minor adjustments выше (оба обоснованы — DESC index suggestion имел fallback в плане, REVOKE guard — defensive idempotency).

## Threat Mitigations Applied

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-13-02-01 (existing rows lose data) | ✓ server_default="46500" backfills atomically; OWNER row verified `spending_cap_cents=46500` post-upgrade |
| T-13-02-02 (RLS info disclosure) | ✓ Same coalesce-NULLIF pattern as 0006; `-1` sentinel; verified: SET ROLE budget_app + no GUC → 0 rows visible |
| T-13-02-03 (excess privilege) | ✓ Migration grants ONLY SELECT/INSERT/UPDATE/DELETE on table + USAGE/SELECT on sequence; verified via information_schema.table_privileges (no ALTER, no TRUNCATE, no REFERENCES) |
| T-13-02-04 (unbounded growth) | accept (Phase 15 will add retention) |
| T-13-02-05 (cap change repudiation) | accept (Phase 15 PATCH endpoint will add audit log) |

## Threat Flags

Никаких новых attack surfaces за пределами планируемого:
- ai_usage_log читает только budget_app; admin-cross-user reads будут добавлены в Plan 13-05 с явным privileged-query pattern (его threat-флаг должен ставить тот план)
- spending_cap_cents — read-only column в Phase 13; PATCH endpoint появится в Phase 15

## Deferred Issues

**Pre-existing, не связано с этим планом:**
- `bot` контейнер находится в `restarting` state из-за `TelegramUnauthorizedError` — недействительный TG bot token в dev стеке. Эта проблема существовала до моих изменений (в начальном `docker compose ps` снапшоте `bot: restarting`). Out of scope per CLAUDE.md scope-boundary rule.
- `/health` endpoint возвращает 404 на `:8000/api/v1/health` и `:8000/health` — может быть routing question (проверка routes/path не нужна для текущего плана).

## Files Changed

```
alembic/versions/0008_admin_phase13.py | 153 +++++++++++++++++++++ (new)
app/db/models.py                       |  62 +++++++++ (+62 lines)
```

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1    | eb60e15 | feat(13-02): add alembic 0008 spending_cap_cents + ai_usage_log |
| 2    | 0528898 | feat(13-02): mirror alembic 0008 in ORM models (spending_cap_cents + AiUsageLog) |

## Self-Check: PASSED

- File `alembic/versions/0008_admin_phase13.py` exists ✓
- File `app/db/models.py` modified (Float import + AppUser.spending_cap_cents + AiUsageLog class) ✓
- Commit `eb60e15` exists in git log ✓
- Commit `0528898` exists in git log ✓
- alembic_version in DB = `0008_admin_phase13` ✓
- Round-trip downgrade -1 / upgrade head clean ✓
- ORM `from app.db.models import AppUser, AiUsageLog` works in api container ✓
