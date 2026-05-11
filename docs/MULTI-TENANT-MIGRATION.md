# Multi-tenant Architecture & Migration History

**Last updated**: 2026-05-11 (Phase 32 — Multi-tenant Production Enablement)

Этот документ описывает, как single-tenant pet-проект превратился в
multi-tenant production-ready instance. Он объясняет архитектуру
(RLS + role-based auth + AI cost cap), narrative о том, что было shipped
когда, и links на reference research.

Audience: future contributors, open-core readers (Phase 37 hand-off),
operational owner.

## Quick architecture map

```
┌─────────────────────────────────────────────────────────────────┐
│                       FastAPI request                            │
│                                                                  │
│  X-Test-User (DEV only)  Authorization: Bearer  X-Telegram-Init │
│         │                       │                      │         │
│         ▼                       ▼                      ▼         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  get_current_user → resolves AppUser by tg_user_id         │ │
│  │  Reject revoked role; require owner|member.                │ │
│  └─────────────┬──────────────────────────────────────────────┘ │
│                ▼                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  set_tenant_scope(db, user.id)                              │ │
│  │  → SET LOCAL app.current_user_id = <user.id>                │ │
│  └─────────────┬──────────────────────────────────────────────┘ │
│                ▼                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Service layer query: WHERE user_id = <user.id>             │ │
│  │  + RLS policy: user_id = current_setting(app.current_user_id)│
│  │  (defense-in-depth: app-level filter + DB-level RLS)        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                        ▼
        Postgres: 12 tenant tables, RLS enforced.
```

## Tables under RLS (12 total)

| Table | RLS enabled in | Note |
|-------|----------------|------|
| category | alembic 0006 (Phase 11) | Per-user; soft delete via is_archived |
| budget_period | alembic 0006 | Per-user; unique (user_id, period_start) |
| planned_transaction | alembic 0006 | Per-user |
| actual_transaction | alembic 0006 | Per-user; hard delete |
| subscription | alembic 0006 | Per-user; hard delete |
| category_embedding | alembic 0006 | Per-user vector cache |
| ai_conversation | alembic 0006 | Per-user |
| ai_message | alembic 0006 | Per-user |
| ai_usage_log | alembic 0008 (Phase 13) | Per-user AI spend ledger |
| account | alembic 0012 (Phase 22) | v1.0 — Account abstraction |
| goal | alembic 0014 (Phase 22) | v1.0 — Savings goals |
| savings_config | alembic 0014 (Phase 22) | v1.0 — Roundup config |

Tables NOT under RLS: `app_user` (the tenant directory itself),
`app_health`, `alembic_version`, `auth_token` (FK-bound to app_user).

`plan_template_item` table был dropped в v1.0 Phase 22 (plan 22.13) —
функционал инлайнен в `category.plan_cents`.

## Migration timeline

| Alembic | Phase | Date | What |
|---------|-------|------|------|
| 0001 | v0.2 Phase 1 | 2026-04-15 | Initial schema (single-tenant) |
| 0002 | v0.2 | 2026-04-20 | `subscription.notify_days_before` |
| 0003 | v0.3 Phase 7 | 2026-05-02 | AI tables (conversation/message) |
| 0004 | v0.3 Phase 8 | 2026-05-03 | pgvector embeddings |
| 0005 | v0.3 Phase 9 | 2026-05-04 | `enable_ai_categorization` flag |
| 0006 | v0.4 Phase 11 | 2026-05-06 | **Multi-tenancy: user_id FK on 9 tables + RLS** |
| 0007 | v0.4 Phase 12 | 2026-05-06 | Postgres role split (`budget_admin` BYPASSRLS vs `app`) |
| 0008 | v0.4 Phase 13 | 2026-05-07 | `ai_usage_log` + RLS |
| 0009 | v0.4 Phase 15 | 2026-05-07 | AI cost cap default = 100 ($1/mo) |
| 0010 | v0.4 | 2026-05-07 | Category UQ active |
| 0011 | v0.6 Phase 17 | 2026-05-09 | `auth_token` (iOS Bearer auth) |
| 0012 | v1.0 Phase 22 | 2026-05-10 | `account` table + RLS |
| 0013 | v1.0 Phase 22 | 2026-05-10 | `category` extension (code/ord/rollover/plan_cents); drops `plan_template_item` |
| 0014 | v1.0 Phase 22 | 2026-05-10 | `goal` + `savings_config` + RLS |
| 0015 | v1.0 Phase 22 | 2026-05-10 | RLS finalize (paranoia re-ENABLE) |
| 0016 | v1.0 Phase 22 | 2026-05-10 | `actual_transaction.account_id` |
| 0017 | v1.0 Phase 22 | 2026-05-10 | `account_id` composite FK |
| 0018 | **v1.1 Phase 32** | 2026-05-11 | **AI cost cap default 100 → 500 ($1 → $5/mo)** |
| 0019 | **v1.1 Phase 32** | 2026-05-11 | **Owner-role backfill (idempotent safety-net)** |

## Role-based auth precedence

Per `app/api/dependencies.py:get_current_user`:

1. **DEV-only** `X-Test-User: <tg_user_id>` — only когда DEV_MODE=true.
   Header silently ignored в production.
2. **Bearer token** `Authorization: Bearer <hex>` — native iOS clients (v0.6 IOSAUTH-01).
   Lookup в `auth_token` table; check `revoked_at IS NULL`.
3. **Telegram initData** `X-Telegram-Init-Data` — web Mini App.
   HMAC-SHA256 validated; reject `auth_date > 24h`.

Все 3 ветки получают `AppUser` ORM с `role` enum (`owner` / `member` / `revoked`).
Reject conditions:
- `role = revoked` → 403.
- `role NOT IN (owner, member)` → 403 (defensive).
- `app_user` row не существует (для HMAC-validated tg_user_id) → 403.

**NO** automatic owner-resolution via `OWNER_TG_ID`-comparison в production.
`OWNER_TG_ID` env используется ТОЛЬКО:
- DEV_MODE helper `_dev_mode_resolve_owner` (auto-upsert OWNER row).
- `dev_seed.py` (test data seed).
- `pytest` fixtures.
- Alembic 0019 backfill (если env set, safety-net post-migration).

See `tests/test_no_owner_tg_id_in_prod.py` (Phase 32-03) для regression test.

## AI cost cap mechanism (Phase 15 + Phase 32)

Per-user budget cap для AI requests:

- Storage: `app_user.spending_cap_cents` BIGINT (USD-cents; 100/USD scale).
- Default: 500 ($5/mo) since Phase 32 (alembic 0018). Was 100 ($1/mo).
- Enforcement: `enforce_spending_cap` FastAPI dependency on `/api/v1/ai/*`.
- Aggregation: monthly window `Europe/Moscow` timezone.
- Visibility: `GET /api/v1/ai/usage` returns `cap_cents`, `remaining_cents`,
  `spent_cents_period` (Phase 32 extension).
- Lock pattern: `pg_advisory_lock` per-user в `/ai/chat` route (check-then-act
  race protection).

## RLS policy template

Every tenant table получает:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
CREATE POLICY <table>_user_isolation ON <table>
  USING (user_id = current_setting('app.current_user_id', true)::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::bigint);
```

`current_setting(... , true)` returns NULL если GUC не set — NULL ≠ user_id
→ policy filters out everything → safe-by-default.

## References

- `.planning/research/v2-stream-A-multitenancy.md` — original deep research.
- `.planning/milestones/v0.4-phases/11-multi-tenancy-db-migration/11-VERIFICATION.md` — Phase 11 evidence.
- `.planning/milestones/v0.4-phases/12-role-based-auth-refactor/12-VERIFICATION.md` — Phase 12 evidence.
- `.planning/milestones/v0.4-phases/15-ai-cost-cap-per-user/15-VERIFICATION.md` — Phase 15 evidence.
- `docs/RUNBOOK-multitenant.md` — operational disaster manual.
- `docs/LOAD-TEST.md` — production-readiness load test.
- `docs/HLD.md` — overall architecture (§7 security).

## Outstanding deferred items (post-Phase 32)

- Self-serve sign-up flow → **Phase 33** (compliance + consent gate).
- Public registration UI → **Phase 35** (paywall sign-up).
- Audit log expansion (DB triggers) → **Phase 33** (compliance baseline).
- pg_dump cron + offsite backup → outside Phase 32 scope (infra milestone).
- Multi-instance horizontal scaling → **v2.0 Branch A**.
- JWT-based auth → **v2.0 Branch A** (Bank CSV / Stripe trigger).
