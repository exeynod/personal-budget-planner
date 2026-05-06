---
phase: 11-multi-tenancy-db-migration
plan: 02
subsystem: db-migrations
tags: [migration, alembic, multitenancy, rls, role, ddl]
requires: [app_user.tg_user_id, OWNER_TG_ID env var, alembic 0005_enable_ai_categorization]
provides:
  - alembic-revision: "0006_multitenancy_user_id_rls_role"
  - schema: "user_role enum + app_user.role + user_id FK on 9 domain tables"
  - rls: "ENABLE+FORCE ROW LEVEL SECURITY + per-table user_isolation policy"
affects:
  - alembic chain (head moves from 0005 to 0006)
  - downstream plans 11-03..11-07 (model/service refactor depends on schema)
tech-stack:
  added: []
  patterns:
    - "Single atomic alembic revision (Postgres DDL transactional, any raise → ROLLBACK)"
    - "Backfill via subquery + sanity count check before SET NOT NULL"
    - "RLS coalesce trick — `coalesce(current_setting('app.current_user_id', true)::bigint, -1)` keeps migration-time queries safe"
    - "Symmetric downgrade — drops in reverse order; restores legacy uq_budget_period_start"
key-files:
  created:
    - alembic/versions/0006_multitenancy_user_id_rls_role.py
  modified: []
decisions:
  - "Single revision file (atomic rollback) — Plan 11-02 explicitly chose this over split revisions"
  - "FK ON DELETE RESTRICT (not CASCADE) — Phase 13 will handle revoke purge in service layer"
  - "Single GUC `app.current_user_id` for RLS — coalesce(...,-1) trick allows migrations to run without setting GUC"
  - "FORCE ROW LEVEL SECURITY enabled — even table owner subject to policy (defense-in-depth)"
  - "OWNER_TG_ID resolved at upgrade() entry; fail-loud on empty/zero/non-int (T-11-02-02 mitigation)"
metrics:
  tasks_completed: 3
  files_created: 1
  files_modified: 0
  duration_min: ~5
  completed_date: "2026-05-06"
  commits:
    - "1f60a38: feat(11-02): add multitenancy migration skeleton with enum + user_id columns"
    - "4c86f67: feat(11-02): add backfill, NOT NULL, FK, scoped uniques, indexes (phases 3-7)"
    - "3d530ab: feat(11-02): add RLS phase 8 + symmetric downgrade for multitenancy migration"
---

# Phase 11 Plan 02: Single Alembic Revision (enum + role + user_id + backfill + RLS + uniques + indexes) Summary

Single atomic Alembic revision `0006_multitenancy_user_id_rls_role.py` adds `user_role` enum, `app_user.role`, `user_id BIGINT NOT NULL FK ON DELETE RESTRICT` on 9 domain tables, scoped unique constraints, per-table indexes, and PostgreSQL Row Level Security with coalesce-friendly default policy.

## What was built

- New file `alembic/versions/0006_multitenancy_user_id_rls_role.py` (236 lines).
- Position in chain: `0001 → 0002 → 0003 → 0004 → 0005_enable_ai_categorization → 0006_multitenancy_user_id_rls_role` (head).
- Module-level constant `DOMAIN_TABLES` enumerates the 9 multi-tenant tables (single source of truth — every loop iterates this tuple).
- Helper `_resolve_owner_tg_id()` reads `OWNER_TG_ID` from `os.environ`; raises `RuntimeError` on missing/empty/non-int/zero.

## Phases in `upgrade()` (executed in order, single transaction)

| # | Phase | Effect |
|---|-------|--------|
| 1 | enum + role | `CREATE TYPE user_role AS ENUM ('owner','member','revoked')`; `app_user.role NOT NULL DEFAULT 'member'`; `UPDATE app_user SET role='owner' WHERE tg_user_id=:owner_tg_id` |
| 2 | user_id NULL columns | `ADD COLUMN user_id BIGINT NULL` on each of 9 domain tables |
| 3 | backfill | `UPDATE <table> SET user_id = (SELECT id FROM app_user WHERE tg_user_id = :owner_tg_id) WHERE user_id IS NULL` for each table |
| 3.5 | sanity check | `SELECT count(*) FROM <table> WHERE user_id IS NULL` for each — `RuntimeError` if any > 0 (T-11-02-01 mitigation) |
| 4 | NOT NULL | `ALTER COLUMN user_id SET NOT NULL` on each table |
| 5 | FK | `fk_<table>_user_id_app_user` FK → `app_user(id) ON DELETE RESTRICT` on each table |
| 6 | scoped uniques | drop `uq_budget_period_start`; create `uq_budget_period_user_id_period_start`, `uq_category_user_id_name`, `uq_subscription_user_id_name` |
| 7 | indexes | `ix_<table>_user_id` on each of 9 tables |
| 8 | RLS | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY <table>_user_isolation … USING (user_id = coalesce(current_setting('app.current_user_id', true)::bigint, -1)) WITH CHECK (...)` for each |

## Phases in `downgrade()` (symmetric reverse)

1. `DROP POLICY IF EXISTS <table>_user_isolation` + `NO FORCE ROW LEVEL SECURITY` + `DISABLE ROW LEVEL SECURITY` on each table.
2. `DROP INDEX ix_<table>_user_id` on each table.
3. Drop scoped unique constraints (`uq_subscription_user_id_name`, `uq_category_user_id_name`, `uq_budget_period_user_id_period_start`); restore legacy `uq_budget_period_start UNIQUE(period_start)`.
4. `DROP CONSTRAINT fk_<table>_user_id_app_user` on each table.
5. `DROP COLUMN user_id` on each table.
6. `DROP COLUMN role` on `app_user`; `DROP TYPE user_role`.

Note (per threat T-11-02-08): downgrade discards `user_id` data permanently. Production downgrade is not envisioned; restore from backup if needed.

## New constraint / index / policy names (reference for Plan 11-07 verification)

### Constraints
- `fk_category_user_id_app_user`, `fk_budget_period_user_id_app_user`, `fk_plan_template_item_user_id_app_user`, `fk_planned_transaction_user_id_app_user`, `fk_actual_transaction_user_id_app_user`, `fk_subscription_user_id_app_user`, `fk_category_embedding_user_id_app_user`, `fk_ai_conversation_user_id_app_user`, `fk_ai_message_user_id_app_user` — 9 FKs `ON DELETE RESTRICT`.
- `uq_budget_period_user_id_period_start` (replaces dropped `uq_budget_period_start`)
- `uq_category_user_id_name`
- `uq_subscription_user_id_name`

### Indexes
- `ix_category_user_id`, `ix_budget_period_user_id`, `ix_plan_template_item_user_id`, `ix_planned_transaction_user_id`, `ix_actual_transaction_user_id`, `ix_subscription_user_id`, `ix_category_embedding_user_id`, `ix_ai_conversation_user_id`, `ix_ai_message_user_id`.

### Enum types
- `user_role` (`'owner', 'member', 'revoked'`).

### RLS policies
- `category_user_isolation`, `budget_period_user_isolation`, `plan_template_item_user_isolation`, `planned_transaction_user_isolation`, `actual_transaction_user_isolation`, `subscription_user_isolation`, `category_embedding_user_isolation`, `ai_conversation_user_isolation`, `ai_message_user_isolation` — each `USING (user_id = coalesce(current_setting('app.current_user_id', true)::bigint, -1)) WITH CHECK (...)`.

## Operational notes

- **OWNER_TG_ID required.** Migration aborts with `RuntimeError` before any DDL if `OWNER_TG_ID` is unset/empty/non-int/zero. Run with `OWNER_TG_ID=<real-id> alembic upgrade head`.
- **Downtime ~30 sec.** Recommended sequence: `docker compose stop api bot worker; OWNER_TG_ID=<id> alembic upgrade head; docker compose start`.
- **Migration role.** Migration writes `app.current_user_id`-aware policies; if running migration via a role with `BYPASSRLS` is desired, that is configured at role level (out of scope for this revision). `coalesce(...,-1)` keeps RLS safe for the migration even without `BYPASSRLS` since this revision only inserts/updates immediately after creating the user_id column (rows match policy via direct SQL, not via filtering).
- **App-user role policy.** Production deploy must ensure api/bot/worker roles do NOT have `BYPASSRLS` (T-11-02-07). Migration does not manage roles.
- **Single-transaction safety.** Postgres DDL is transactional; any `RuntimeError` (or DDL failure) in any phase rolls back the entire revision (T-11-02-04).

## Threat model coverage (per plan `<threat_model>`)

| Threat ID | Mitigated? | Where |
|-----------|-----------|-------|
| T-11-02-01 | Yes | Phase 3.5 sanity-check loop raises before Phase 4 SET NOT NULL |
| T-11-02-02 | Yes | `_resolve_owner_tg_id()` fail-loud at upgrade entry |
| T-11-02-03 | Yes (inherited) | Alembic advisory lock on `alembic_version` |
| T-11-02-04 | Yes (inherited) | Single transactional DDL |
| T-11-02-05 | Yes | RLS ENABLE + FORCE on 9 tables |
| T-11-02-06 | Yes | `::bigint` cast in policy + bind-param backfill |
| T-11-02-07 | Accepted | Out of scope — role mgmt at deploy time |
| T-11-02-08 | Accepted | Documented in this SUMMARY (downgrade is DDL-only) |
| T-11-02-09 | Accepted | Pet-project scale; migration runs in ms |

## Deviations from Plan

### Notes (no deviations)

- The plan's acceptance criterion for Task 1 included an AST snippet that walks `ast.Assign` nodes to verify `DOMAIN_TABLES` membership. The actual code uses an annotated assignment (`DOMAIN_TABLES: tuple[str, ...] = (...)`) which is an `ast.AnnAssign` — exactly matching the verbatim code-block the plan instructed to write. The textual file content matches the plan's prescribed code; the plan's auxiliary verification snippet would skip the annotated form. Manual walk over `ast.AnnAssign` confirms all 9 expected names are present (`category, budget_period, plan_template_item, planned_transaction, actual_transaction, subscription, category_embedding, ai_conversation, ai_message`). No code change needed.

Otherwise: plan executed exactly as written. No automatic rule-1/rule-2/rule-3 fixes triggered. No checkpoints. No auth gates.

## Verification status

- `python3 -m py_compile alembic/versions/0006_multitenancy_user_id_rls_role.py` — exit 0.
- `python3 -c "import ast; ast.parse(...)"` — exit 0.
- All 22 frontmatter `must_haves.truths` programmatically verified (see audit at end of execution).
- All Task 1/2/3 acceptance criteria pass.
- Final `<verification>` suite (5 checks) passes.
- Manual `OWNER_TG_ID=<real-id> alembic upgrade head` + `alembic downgrade -1` + reapply — deferred to Plan 11-07 (per execution rules: "Do NOT run alembic upgrade head from this executor").

## Self-Check: PASSED

- [x] `alembic/versions/0006_multitenancy_user_id_rls_role.py` exists (FOUND).
- [x] Commit `1f60a38` exists (FOUND in `git log`).
- [x] Commit `4c86f67` exists (FOUND in `git log`).
- [x] Commit `3d530ab` exists (FOUND in `git log`).
