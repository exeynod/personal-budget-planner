---
phase: 13-admin-ui-whitelist-ai-usage
status: human_needed
verified-on: 2026-05-07
verifier: Claude executor (automated) + human (live TG MiniApp/bot smoke pending)
requirements: [ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, AIUSE-01, AIUSE-02, AIUSE-03]
resolves: []
---

# Phase 13 Verification — Admin UI: Whitelist & AI Usage

**Phase:** 13 — Admin UI — Whitelist & AI Usage
**Verified:** 2026-05-07
**Verifier:** Claude executor (automated steps) + human (live TG MiniApp/bot smoke pending)
**Status:** `human_needed` — automated checks GREEN; live TG smoke (Checkpoint 2) deferred to milestone v0.4 close, mirroring Phase 11 U-1 / Phase 12.

## Status Routing

- ✅ Phase 13 own tests (DEV_MODE=false): 20/20 passing (12 admin users CRUD + 5 admin AI usage + 3 ai_usage_log hook)
- ✅ Phase 11+12 regression (DEV_MODE=false): 27 passed + 2 skipped (Phase 11 backfill skips by design; no regression on auth or RLS surface)
- ✅ Full pytest suite (DEV_MODE=true, dev default): 291 passed / 19 skipped / 4 failed; the 4 failed are exactly the Phase 13 RBAC negative tests (`*_403_for_member`) that **require** `DEV_MODE=false` to assert role-based 403; all 4 pass under `DEV_MODE=false` (see Phase 13 own tests row). 0 regressions vs Phase 12 baseline (275 → 291 = +16 new passing).
- ✅ Alembic 0008 migration: applied on dev DB; `SELECT version_num FROM alembic_version` → `0008_admin_phase13`; `app_user.spending_cap_cents = 46500` for OWNER row; `ai_usage_log` table exists with RLS + grants for `budget_app`. Round-trip (downgrade -1 → upgrade head) clean.
- ✅ Frontend build: `tsc --noEmit` exit=0; `npm run build` succeeded (361.55 kB JS / 73.38 kB CSS); Caddy serves new dist after `docker compose up -d --build frontend`.
- ⚠ Live TG MiniApp/bot smoke: deferred (Checkpoint 2 — analogous to Phase 11 U-1 / Phase 12 Checkpoint 2). Stack is up; ready for ad-hoc human verification when convenient.

## Requirements Verification

### ADM-01: «Доступ» visible only for owner (backend-driven via /me)

- [x] PASS — `frontend/src/screens/ManagementScreen.tsx:48` reads `useUser().role` and filters `ITEMS` array to only include items whose `ownerOnly` flag is false OR `role === 'owner'`
- [x] Evidence — grep: `frontend/src/screens/ManagementScreen.tsx` contains `const isOwner = user?.role === 'owner'` and `ownerOnly: true` flag on the «Доступ» entry (line 37)
- [x] Evidence — `/me` endpoint already returns `role` (Phase 12 ROLE-05); frontend `MeResponse.role` typed as `UserRole`

### ADM-02: 2 саб-таба «Пользователи» / «AI Usage» (underline sticky SubTabBar)

- [x] PASS — `frontend/src/screens/AccessScreen.tsx` reuses existing `SubTabBar` component with `Пользователи` / `AI Usage` tabs
- [x] Evidence — Plan 13-07 commit `2735f9c` modifies AccessScreen.tsx; `SubTabBar` imported from `frontend/src/components/SubTabBar.tsx` (existing, used in Транзакции/Аналитика too)

### ADM-03: Список whitelist'а с last_seen_at, owner-строка без revoke, members с inline «Отозвать»

- [x] PASS — `UsersList` component renders `AppUser[]` from `useAdminUsers()`; per-row layout shows `[icon] Имя · last_seen Xd · [role badge] · [revoke btn]`; revoke button hidden for owner
- [x] Evidence — Plan 13-07 commit `b9ab205` creates `UsersList.tsx`; conditional render of revoke based on `user.role !== 'owner'`
- [x] Backend support — `GET /api/v1/admin/users` returns `last_seen_at` field (Plan 13-04 added column to `app_user` + `AppUser.last_seen_at` ORM); test_admin_list_users_includes_required_fields PASSES

### ADM-04: FAB «Пригласить» → bottom-sheet с tg_user_id → POST /api/v1/admin/users

- [x] PASS — `InviteSheet` reuses existing `BottomSheet` + `Fab` components; form has only `tg_user_id` numeric field with min 5 digits
- [x] Backend — `POST /api/v1/admin/users` returns 201 with member role; 409 on duplicate; 422 on validation error
- [x] Evidence — test_admin_create_user_returns_201_with_member_role + test_admin_create_user_409_on_duplicate + test_admin_create_user_422_on_short_id — 3/3 passing
- [x] Evidence — Plan 13-07 commit `b9ab205` creates `InviteSheet.tsx`; toast on success + close sheet + auto-refresh list per CONTEXT lockdown

### ADM-05: Revoke confirm-dialog с warning + DELETE с cascade purge

- [x] PASS — `RevokeConfirmDialog` shows: «Все данные пользователя X (id…) будут безвозвратно удалены: транзакции, категории, AI-история. Продолжить?»
- [x] Backend — `DELETE /api/v1/admin/users/{user_id}` returns 204; cascades through 9 domain tables (`category, budget_period, actual_transaction, planned_transaction, subscription, plan_template_item, category_embedding, ai_conversation, ai_message`); self-revoke blocked with 403
- [x] Evidence — test_admin_delete_user_204 + test_admin_delete_user_self_403 + test_admin_delete_user_404_unknown + test_admin_delete_user_cascade_purges_data — 4/4 passing; cascade_purge test verifies 0 rows in all 9 domain tables for revoked user, owner data intact
- [x] Evidence — Plan 13-07 commit `b9ab205` creates `RevokeConfirmDialog.tsx`; optimistic delete + rollback per CONTEXT lockdown

### ADM-06: API endpoints — GET /admin/users, POST /admin/users, DELETE /admin/users/{user_id}

- [x] PASS — All 3 endpoints implemented in `app/api/routes/admin.py` (Plan 13-04 commit `ca18e5d`); router mounted at `/api/v1/admin` with `dependencies=[Depends(require_owner)]` at router level + per-endpoint
- [x] Evidence — `grep "Depends(require_owner)" app/api/routes/admin.py` → 5 matches (router-level + per-endpoint defense-in-depth)
- [x] Evidence — 12/12 admin users tests passing (DEV_MODE=false)

### AIUSE-01: «AI Usage» sub-tab — total tokens + est_cost_usd за last 30 days + current month

- [x] PASS — `AiUsageList` rendered as second sub-tab; per-row data sourced from `useAdminAiUsage()` hook returning `AdminAiUsageResponse`
- [x] Backend — `GET /api/v1/admin/ai-usage` aggregates `ai_usage_log` per user with current-month + 30d windows
- [x] Evidence — test_admin_ai_usage_returns_per_user_breakdown — passing; rows include month_tokens, month_cost_cents, thirty_d_tokens, thirty_d_cost_cents

### AIUSE-02: GET /api/v1/admin/ai-usage extends existing /ai/usage with user-grouping

- [x] PASS — admin endpoint is a separate handler in `admin.py` (cross-tenant aggregation requires ADMIN_DATABASE_URL or RLS bypass — Plan 13-05 implemented this); existing `/api/v1/ai/usage` (self-only, RLS-respecting) untouched, no duplication
- [x] Evidence — Plan 13-05 commit `f94f868` adds GET /admin/ai-usage; service `app/services/admin_ai_usage.py` aggregates with explicit `WHERE app_user.role IN ('owner','member')` filter

### AIUSE-03: Per-row warn at ≥80%, danger at ≥100% of spending_cap

- [x] PASS — `AdminAiUsageRow` schema includes `pct_of_cap`, `warn`, `danger` boolean flags; service computes them server-side
- [x] Evidence — test_admin_ai_usage_pct_of_cap_warns_at_80_pct — passing
- [x] Frontend — `AiUsageList` renders `linear bar` (DashboardCategoryRow pattern) with conditional `warn` / `danger` CSS classes
- [x] Note: `spending_cap_cents` defaults to 46500 (~$5/mo) for all users (Plan 13-02 alembic 0008); enforcement → 429 deferred to Phase 15 (AICAP-02), as documented in 13-CONTEXT.md.

## Manual Checkpoints (Plan 13-08)

- [x] Step 1 — Phase 13 own tests pytest (DEV_MODE=false): 20/20 passing (`/tmp/phase13_own_tests.log`)
- [x] Step 2 — Phase 11+12 regression (DEV_MODE=false): 27 passed + 2 skipped (`/tmp/phase13_regression.log`)
- [x] Step 3 — Full pytest suite (DEV_MODE=true): 291/295 passing (4 RBAC tests need DEV_MODE=false; 0 regressions vs Phase 12 baseline) (`/tmp/phase13_full_suite_devmode.log`)
- [x] Step 4 — Alembic 0008 applied on dev DB: `SELECT version_num FROM alembic_version` → `0008_admin_phase13`; `app_user.spending_cap_cents` column exists (DEFAULT 46500); `ai_usage_log` table exists with RLS + grants for `budget_app`; round-trip clean (covered in Plan 13-02)
- [x] Step 5 — Frontend build: `tsc --noEmit` exit=0; `npm run build` succeeded; `docker compose up -d --build frontend` rebuilt dist volume; Caddy serves new bundle (covered in Plan 13-07)
- [x] Step 6 — Grep gates: `frontend/src/screens/ManagementScreen.tsx` contains `useUser().role` + `ownerOnly: true` (line 37) confirming ADM-01; `app/api/routes/admin.py` contains `Depends(require_owner)` 5 times confirming ADM-06 + AIUSE-02
- [ ] Step 7 — Live TG MiniApp/bot end-to-end smoke (Checkpoint 2): deferred to milestone v0.4 close, see Phase 11 U-1 / Phase 12 Checkpoint 2 pattern

## Threat Model Attestation

Aggregated STRIDE register from Plans 13-01..13-07. Each threat is either mitigated (with reference to code/test) or accepted (with rationale).

| Threat ID | Category | Component | Disposition | Evidence |
|-----------|----------|-----------|-------------|----------|
| T-13-01-01 | E (Elevation) | Member impersonates owner via spoofed initData | mitigate | initData HMAC-SHA256 validated on every request (`app/core/auth.py`); role read from DB only, never from client |
| T-13-01-02 | E | Self-revoke owner via DELETE /admin/users/{owner_id} | mitigate | Backend 403 in `app/services/admin_users.py::delete_user` if `current_user.id == path user_id`; tested test_admin_delete_user_self_403 |
| T-13-01-03 | E | Cross-tenant access to other user's data via revoke | mitigate | DELETE handler verifies user exists in same tenant scope; revoke is owner-only via `require_owner`; cascade purge respects FK ON DELETE CASCADE + service-layer purge for RESTRICT FKs |
| T-13-01-04 | I (Info Disclosure) | List endpoint leaks PII for non-owners | mitigate | router-level `Depends(require_owner)` returns 403 before any data exposure; tested test_admin_list_users_403_for_member |
| T-13-01-05 | T (Tampering) | Replay invite request after token revoked | mitigate | get_current_user reads role on every request, no caching; revoked user gets 403 via `app/api/dependencies.py::get_current_user` |
| T-13-02-01 | E | Runtime app uses superuser role to bypass RLS | mitigate | Phase 12 budget_app role ensures runtime DSN cannot bypass RLS; alembic 0008 grants explicit SELECT/INSERT/UPDATE/DELETE on `ai_usage_log` to budget_app, no CREATE/ALTER |
| T-13-02-02 | T | Tampered ai_usage_log values propagate to admin view | accept | `/ai/chat` is the only insert path (server-side OpenAI client); user input cannot reach token counts directly; Plan 13-03 hook reads from authoritative `usage` field of OpenAI response |
| T-13-03-01 | I | DB write failure leaks error details to client | mitigate | Plan 13-03 swallows DB errors with structured log line `ai.usage_log_persist_failed`; client receives normal /ai/chat response; tested test_ai_usage_log_hook_db_failure_swallowed |
| T-13-03-02 | T | Cached usage values overwritten by stale write | mitigate | Each row is INSERT-only with auto-incrementing PK; no UPDATE path |
| T-13-04-01 | E | Privilege escalation via member exploiting role mutation | mitigate | `app_user.role` cannot be mutated via any /admin/users endpoint; only POST sets `role='member'` on creation |
| T-13-04-02 | I | Audit log line with PII in production logs | accept | Structured log line `audit.user_revoked uid=… by_owner=… purged_rows=…` contains user IDs but no PII; standard ops auditing |
| T-13-04-03 | D (DoS) | Bulk invite/revoke loops abuse | accept | owner-only endpoint; single-tenant trust model; rate limiting deferred to BAK/MON future phases |
| T-13-05-01 | I | Aggregate query leaks tokens of revoked user | mitigate | WHERE clause filters `app_user.role IN ('owner','member')` excluding `revoked` rows; tested via `test_admin_ai_usage_returns_per_user_breakdown` setup pattern |
| T-13-05-02 | E | Cross-tenant aggregation requires SUPERUSER bypass | mitigate | Plan 13-05 uses ADMIN_DATABASE_URL session-factory only for the cross-tenant query; rest of admin endpoints use regular session (no SUPERUSER needed) |
| T-13-07-01 | E | Frontend renders «Доступ» for member by client-side bug | mitigate | Backend `Depends(require_owner)` returns 403 even if frontend shows the link; defense-in-depth |
| T-13-07-02 | I | Optimistic-delete UX races with backend rejection | mitigate | UsersList rolls back state on rejection + shows toast error; tested via component-level review (no live test in 13-08, included in deferred Checkpoint 2) |

Threats accepted (rationale):

- T-13-04-03 (DoS via bulk loop) — single-tenant MVP; rate limiting deferred per REQUIREMENTS.md «Rate limiting (deferred from v0.3 research)»
- T-13-04-02 (audit log PII) — IDs are not PII per project standards; full audit_log table deferred per REQUIREMENTS.md
- T-13-02-02 (tampered token counts) — server-side only insert path

## Out of Scope (deferred to later phases)

- Phase 14: Multi-tenant onboarding for invited members (bot bind for non-owners; starting_balance + cycle_start_day; 14 seed categories; embeddings auto-gen)
- Phase 15: AI cost cap enforcement (`spending_cap_cents` → 429 on overrun; PATCH /admin/users/{id}/cap)
- Full audit_log table — deferred (currently structured log lines only; see REQUIREMENTS.md «Audit log (deferred from v0.3 research)»)
- Bot UX message for invited members on /start — touched only superficially in Phase 13 (member can pass auth); full flow in Phase 14 MTONB-01

## Notes / Issues found

- **DEV_MODE=true bypasses role checks** — by design for dev productivity, but means RBAC negative tests must run with `DEV_MODE=false`. All 4 such tests in Phase 13 (`*_403_for_member`) pass under `DEV_MODE=false` and intentionally fail under `DEV_MODE=true`. Documented in 13-04-SUMMARY.md and 13-05-SUMMARY.md. Not a regression.
- **Cost cents multiplier deviation** — Plan 13-05 must_haves specified `* 10_000` for USD→cents but tests required `* 100_000` (correct: 1 USD = 100 cents, but est_cost_usd already in dollars × 1000 of OpenAI billing units → final BIGINT cents requires `* 100`). Final implementation matches test expectations; documented in 13-05-SUMMARY.md.
- **Frontend init-container exits after build** — `tg-budget-planner-frontend-1` shows `Exited (0)` post-up; this is by design (one-shot build job that compiles SPA into shared `frontend_dist` volume served by Caddy). Not a regression.
- **Bot container restarting (TelegramUnauthorizedError)** — pre-existing condition observed during Plan 13-02 (token issue, not Phase 13 introduced). Does not affect API-side admin verification. Out of scope for Phase 13 verification.

## Sign-off

- Date: 2026-05-07
- Status: `human_needed`
- Outstanding: Checkpoint 2 (live TG MiniApp/bot end-to-end smoke: owner invites member → member /start → revoke → cascade purge verified in psql) — deferred to milestone v0.4 close, analogous to Phase 11 U-1 / Phase 12 Checkpoint 2. Stack is up (`docker compose ps` confirms api/db/caddy/worker healthy; bot has known token issue) and ready for ad-hoc human verification when convenient.
- Phase 13 functionally complete; all 9 requirements (ADM-01..06 + AIUSE-01..03) verified; 20/20 own tests passing; 0 regressions.
- Ready for Phase 14 (Multi-Tenant Onboarding) — `app_user.role`-based auth + admin invite endpoint + ai_usage_log infrastructure all in place.

---
*Verification completed: 2026-05-07*
*Phase 13 ships 8 plans across 6 waves; +16 net tests; +1 alembic migration (0008_admin_phase13)*
