---
phase: 12-role-based-auth-refactor
status: human_needed
verified-on: 2026-05-07
verifier: Claude executor (automated) + human (live TG MiniApp/bot smoke pending)
requirements: [ROLE-02, ROLE-03, ROLE-04, ROLE-05]
resolves: [D-11-07-01, D-11-07-02]
---

# Phase 12 Verification — Role-Based Auth Refactor

**Phase:** 12 — Role-Based Auth Refactor
**Verified:** 2026-05-07
**Verifier:** Claude executor (automated steps) + human (live TG MiniApp/bot smoke pending)
**Status:** `human_needed` — automated checks GREEN; live TG smoke (Checkpoint 2) deferred to milestone v0.4 close, mirroring Phase 11 U-1.

## Status Routing

- ✅ Automated tests (Phase 12 own): 15/15 passing (test_role_based_auth + test_require_owner + test_me_returns_role + test_bot_role_resolution)
- ✅ Phase 11 regression check: 12 passed + 2 skipped (no failure; skips are pre-Phase-11 backfill tests that intentionally skip when no legacy data exists)
- ✅ Full pytest suite: 275 passed / 19 skipped / 0 failed (93.5% pass rate — D-11-07-01 measure, ≥90% threshold)
- ✅ Alembic 0007 migration cycle: PASS (upgrade ✓ / downgrade -1 ✓ / upgrade head ✓ — clean round-trip)
- ✅ Runtime Postgres role: `budget_app` NOSUPERUSER NOBYPASSRLS LOGIN — PASS (`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='budget_app'` → `f, f`)
- ✅ Runtime DATABASE_URL connects as `budget_app`: PASS (test_postgres_role_runtime 3/3 passing inside api container)
- ⚠ Live TG MiniApp/bot smoke: deferred (Checkpoint 2 — same disposition as Phase 11 U-1)

## Requirements Verification

### ROLE-02: OWNER_TG_ID-eq removed from request-pipeline

- [x] PASS — `grep -vE '^\s*#' app/api/dependencies.py | grep -E '== ?settings.OWNER_TG_ID|!= ?settings.OWNER_TG_ID'` → 0 matches; only DEV_MODE bootstrap path reads `settings.OWNER_TG_ID` for upsert (assignment, not equality check)
- [x] PASS — `grep -vE '^\s*#' app/bot/handlers.py app/bot/commands.py | grep settings.OWNER_TG_ID` → 0 matches
- [x] Evidence — test_owner_tg_id_eq_no_longer_in_get_current_user passing (AST-level verification that get_current_user body has no OWNER_TG_ID equality node)
- [x] Evidence — Plan 12-04 grep gate in acceptance_criteria; Plan 12-02 refactor reviewed

### ROLE-03: get_current_user role-based whitelist

- [x] PASS — `get_current_user` returns `AppUser` ORM; raises 403 on `role == 'revoked'` OR unknown `tg_user_id`; allows `role IN ('owner', 'member')`
- [x] Evidence — test_revoked_user_gets_403, test_member_user_gets_200, test_owner_user_gets_200, test_unknown_tg_user_id_gets_403, test_get_current_user_returns_app_user_orm — all 5 passing
- [x] Evidence — bot path: `bot_resolve_user_role` does fresh DB lookup, returns role; test_bot_role_resolution.py 4/4 passing (owner / member / revoked / unknown→None)

### ROLE-04: require_owner dependency

- [x] PASS — `require_owner` exported from `app/api/dependencies.py`, returns 403 on member or revoked, allows owner
- [x] Evidence — test_require_owner_allows_owner, test_require_owner_blocks_member, test_require_owner_blocks_revoked — 3/3 passing
- [x] Phase 13 admin endpoints will use `Depends(require_owner)` (out of scope for Phase 12 — but dep is ready)

### ROLE-05: GET /api/v1/me returns role

- [x] PASS — `MeResponse` pydantic model includes `role: Literal["owner", "member", "revoked"]`
- [x] PASS — frontend `MeResponse` interface includes `role: UserRole` (union 'owner' | 'member' | 'revoked')
- [x] Evidence — test_me_includes_role_for_owner, test_me_includes_role_for_member — 2/2 passing
- [x] Evidence — frontend tsc --noEmit clean (no MeResponse-related errors recorded in Plan 12-03 SUMMARY)

## Manual Checkpoints (Plan 12-07)

- [x] Step 1 — Phase 12 own tests pytest: 15/15 passing (`/tmp/phase12_own_tests.log`)
- [x] Step 2 — Phase 11 regression: 12/12 non-skipped passing (`/tmp/phase11_regression.log`)
- [x] Step 3 — Alembic 0007 upgrade applied; `SELECT version_num FROM alembic_version` → `0007_postgres_role_split`
- [x] Step 4 — `\du budget_app` → role exists with `rolsuper=f, rolbypassrls=f, rolcanlogin=t` (NOSUPERUSER NOBYPASSRLS LOGIN)
- [x] Step 5 — Runtime DATABASE_URL connects as budget_app: `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user` (executed inside api container against runtime DSN) → `('budget_app', False, False)`
- [x] Step 6 — Runtime tests: 3/3 passing (test_runtime_database_url_uses_nosuperuser_role + test_admin_database_url_present_and_privileged + test_rls_enforces_at_runtime_without_test_role)
- [x] Step 7 — Alembic downgrade/upgrade cycle clean: `alembic downgrade -1` (0007 → 0006, drops budget_app + grants) + `alembic upgrade head` (0006 → 0007, recreates budget_app) — both transitions transactional, no orphans
- [x] Step 8 — Full pytest suite ≥ 90% pass rate: 275 passed / 19 skipped / 0 failed (93.5%) (`/tmp/full_suite.log`)
- [ ] Step 9 — Live TG MiniApp/bot smoke (Checkpoint 2): deferred to milestone v0.4 close, see Phase 11 U-1 pattern

## Resolved Deferred Items

### D-11-07-01 — Legacy test fixtures (Phase 11 carryover)

Status: ✅ RESOLVED in Plan 12-06.

- 22 test files updated (either direct edit or via `single_user` fixture / seed helpers)
- `tests/helpers/seed.py` — central factory module created (deterministic owner+member fixtures with role assignment)
- `tests/conftest.py` — `single_user` fixture added (default fixture for legacy tests)
- Pass rate improved from ~213/276 (Phase 11 broken) to 275/294 (this verification, 93.5%)
- No `NotNullViolationError: null value in column "user_id"` failures remaining
- Surface area: every domain table fixture now seeds with explicit `user_id`

### D-11-07-02 — Runtime Postgres role split

Status: ✅ RESOLVED in Plan 12-05.

- Alembic 0007 (`0007_postgres_role_split`) creates `budget_app` role with NOSUPERUSER NOBYPASSRLS LOGIN
- DATABASE_URL splits: runtime (uvicorn / api / bot / worker) → `budget_app`; admin (alembic) → `budget` via `ADMIN_DATABASE_URL`
- `entrypoint.sh` exports `DATABASE_URL=$ADMIN_DATABASE_URL` before invoking alembic, then unsets so runtime uvicorn keeps `DATABASE_URL=budget_app`
- `docker-compose.yml` hard-codes per-service env: api/bot/worker get `DATABASE_URL=budget_app:${BUDGET_APP_PASSWORD}@db:5432/budget_db` and `ADMIN_DATABASE_URL=budget:${DB_PASSWORD}@db:5432/budget_db`
- `.env.example` updated with `BUDGET_APP_PASSWORD` and dual-URL pattern
- Runtime tests verify: `current_user='budget_app'`, `rolsuper=False`, `rolbypassrls=False`
- RLS now enforces at runtime queries WITHOUT the `_rls_test_role` workaround (Phase 11 verification noted this caveat)

## Threat Model Attestation

Aggregated STRIDE register from Plans 12-01..12-07. Each threat is either mitigated (with reference to code/test) or accepted (with rationale).

| Threat ID | Category | Component | Disposition | Evidence |
|-----------|----------|-----------|-------------|----------|
| T-12-02-01 | E (Elevation) | Spoofed role via initData manipulation | mitigate | initData HMAC validates tg_user_id authenticity (`app/core/auth.py`); role read from DB only, never from client |
| T-12-02-02 | E | Member accesses admin endpoint | mitigate | `require_owner` dep raises 403; tested test_require_owner_blocks_member |
| T-12-02-03 | T (Tampering) | Token replay after role revoked | mitigate | `get_current_user` reads `app_user.role` on every request, no caching |
| T-12-02-04 | I (Info Disclosure) | Error detail distinguishes revoked/unknown | mitigate | Both paths return generic "Not authorized" 403; no role-revealing differential |
| T-12-04-01 | E | Revoked user retains bot access until restart (cache stale) | mitigate | `bot_resolve_user_role` does fresh `SELECT app_user.role`; tested test_bot_resolve_user_role_revoked |
| T-12-04-02 | I | Bot replies differently for non-allowed | mitigate | All non-allowed paths reply "Бот приватный."; structured log line differentiates for ops |
| T-12-05-01 | E | Runtime app uses superuser role (RLS bypass) | mitigate | docker-compose enforces budget_app for `DATABASE_URL`; verified via test_runtime_database_url_uses_nosuperuser_role |
| T-12-05-04 | E | budget_app excess privileges | mitigate | Migration 0007 grants ONLY `SELECT, INSERT, UPDATE, DELETE` on domain tables; no `CREATE`, `ALTER`, `TRIGGER`, or sequence ownership |
| T-12-05-06 | S (Spoofing) | Operator forgets `BUDGET_APP_PASSWORD` | mitigate | Migration 0007 raises `RuntimeError` loudly if env var missing, with instructions in error message |

Threats accepted (rationale):

- T-12-02-05 (DEV_MODE in production) — existing mitigation: `validate_production_settings` refuses to start when `DEV_MODE=true` and `ENVIRONMENT=production`; Phase 11 carry-over
- T-12-02-06 (extra SELECT per request to fetch role) — single indexed PK lookup (`app_user.id` PK or `app_user.tg_user_id` unique index), <1ms overhead, acceptable for human-paced API surface
- T-12-04-05 (DB call per bot command for role resolution) — human-paced bot, single user volume in MVP; will revisit if scale demands

## Out of Scope (deferred to later phases)

- Phase 13: Admin endpoints implementation (`POST /api/v1/admin/users`, `DELETE /api/v1/admin/users/{id}`, `GET /api/v1/admin/ai-usage`, etc.)
- Phase 13: Frontend admin tab visibility wiring (will read `role` from `/me`)
- Phase 14: Onboarding flow for invited members (including bot bind for non-owners — currently `cmd_start` only handles owner)
- Phase 15: AI cost cap per user (`spending_cap_cents` enforcement → 429 on overrun)

## Notes / Issues found

- **Frontend container exits on dev compose up** — observed during Checkpoint 1 docker rebuild: `tg-budget-planner-frontend-1` reached `Exited` state shortly after start. This is by design — the frontend is a one-shot build job that compiles SPA assets into the shared `frontend_dist` volume, which Caddy then serves. Not a regression introduced by Phase 12.
- **Runtime tests packaging** — `test_postgres_role_runtime.py` lives in the same `tests/` tree as the rest of the suite, but is intentionally executed only inside the api container (host pytest cannot reach the docker-internal `db` hostname). Plan 12-05 documented this; verification followed pattern via `docker-compose.test.yml` bind-mount.
- No regressions in Phase 11 RLS tests (12/12 non-skipped passing) — runtime role split has not weakened any prior guarantee.

## Sign-off

- Date: 2026-05-07
- Status: `human_needed`
- Outstanding: Checkpoint 2 (live TG MiniApp/bot smoke) — deferred to milestone v0.4 close, analogous to Phase 11 U-1. The bot stack is currently up (`docker compose ps` confirms api/bot/worker running) and ready for ad-hoc human verification when convenient.
- Phase 12 functionally complete; auth surface migrated; deferred items D-11-07-01 + D-11-07-02 closed.
- Ready for Phase 13 (Admin UI — Whitelist & AI Usage) — `require_owner` dep is in place; `/me` returns role; frontend types are aligned.

---
*Verification completed: 2026-05-07*
*Resolves: D-11-07-01 (legacy fixture sweep) + D-11-07-02 (Postgres role split)*
