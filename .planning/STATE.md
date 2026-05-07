---
gsd_state_version: 1.0
milestone: v0.4
milestone_name: Multi-Tenant & Admin
status: executing
stopped_at: Phase 13 complete — 13-VERIFICATION.md status=human_needed (live TG smoke deferred to milestone close, mirroring Phase 11 U-1 and Phase 12 Checkpoint 2). 8/8 plans + 0 regressions; 20/20 own tests + 16 net-new GREEN. Ready for Phase 14.
last_updated: "2026-05-07T09:30:00.000Z"
last_activity: 2026-05-07 -- Phase 13 verification complete (13-08)
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 22
  completed_plans: 22
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06 after v0.3 milestone close)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика.
**Current focus:** Phase 14 — multi-tenant-onboarding (next; Phase 13 complete)

## Current Position

Phase: 14 (multi-tenant-onboarding) — NOT STARTED
Plan: 0 of N (planning pending)
Status: Ready to discuss/plan
Last activity: 2026-05-07 -- Phase 13 verification complete

Previous milestones:

- v0.3 (Analytics & AI) — Complete 2026-05-06, 6 phases / 25 plans → archive `.planning/milestones/v0.3-*`
- v0.2 (MVP) — Complete 2026-05-03, 6 phases / 38 plans → archived retroactively at v0.3 close

Progress: [######    ] 60% (milestone v0.4, 3/5 phases complete; Phase 11 + Phase 12 + Phase 13 all human_needed pending live TG smoke)

## Performance Metrics

**Velocity:**

- Total plans completed: 22
- Average duration: ~10 min
- Total execution time: ~4.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11 | 7 | ~84 min | ~12 min |
| 12 | 7 | ~95 min | ~14 min |
| 13 | 8 | ~33 min | ~4 min |

**Recent Trend:**

- Last 5 plans: 13-08 (~5 min, 2 docs, 1 commit, full pytest 291/295 + 13-VERIFICATION.md), 13-07 (~5 min, AccessScreen UI + role gate, 4 commits), 13-06 (~2 min, frontend admin types/API/hooks, 4 commits), 13-05 (~6 min, admin AI usage breakdown, 4 commits), 13-04 (~6 min, admin users CRUD + cascade purge, 3 commits)
- Trend: Phase 13 functionally complete in <1 hour autonomous; admin endpoints + UI + AI usage tracking all delivered; 20/20 own tests GREEN, 0 regressions; live smoke deferred (consistent with Phase 11/12)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log is in PROJECT.md Key Decisions table.

Recent decisions affecting v0.4 planning:

- v0.4 (2026-05-06): Multi-tenant — shared schema + `user_id` FK + Postgres RLS как defense-in-depth
- v0.4 (2026-05-06): Whitelist через role enum (owner / member / revoked); удаление `OWNER_TG_ID`-eq из dependencies; OWNER_TG_ID определяет owner-роль только при первом запуске
- v0.4 (2026-05-06): Admin-вкладка в «Управление» (видна только owner); все действия через UI, не бот-команды
- v0.4 (2026-05-06): AI cost cap per user — `spending_cap_cents` (default $5/month) с enforcement → 429
- v0.4 (2026-05-06): Onboarding для приглашённых юзеров — сам выбирает starting_balance + cycle_start_day; категории seed per-user
- v0.4 (2026-05-06): Revoke = hard delete + purge всех данных юзера
- v0.4 (2026-05-06): Phase structure 11-15 — DB foundation (11) → auth refactor (12) → Admin UI (13) → onboarding (14) → AI cap (15); ROLE-01 (role column добавление) включён в Phase 11 (часть DB-миграции), не в Phase 12
- 11-02 (2026-05-06): Single atomic Alembic revision (rollback атомарный); coalesce(...,-1) trick в RLS policy для migration-friendly default; FK ON DELETE RESTRICT (не CASCADE — Phase 13 service-layer purge); FORCE ROW LEVEL SECURITY для defense-in-depth
- 11-03 (2026-05-06): ORM models mirror migration 0006 exactly — UserRole(str, Enum) lowercase values; PgEnum(create_type=False) для reuse migration-created type; user_id placed last (preserves column order); BudgetPeriod.period_start unique перенесён в __table_args__; AppUser→domain back-refs не добавлены (one-way, по discretion); AppHealth не модифицирован (system table)
- 11-05 (2026-05-06): Service signatures `*, user_id: int` keyword-only — caller cannot accidentally swap with another int positional; mypy/Pylance flag missing kwarg loudly. App-side filtering primary, RLS backstop. settings.py + routes/onboarding.py NOT changed (AppUser-only / Phase 14 future redesign). Cross-tenant ID access returns 404 (no existence leak). Bug fixes: snapshot_from_period DELETE was unscoped (would have wiped all tenants) — fixed; templates+planned `db.get(Model, id)` replaced with select+where for explicit scope.
- 11-06 (2026-05-06): Worker per-tenant pattern — outer session for active-users enumeration → per-user inner session with set_tenant_scope → scoped logic; advisory lock global per job (NOT per user). Internal-bot routes keep get_db (X-Internal-Token, no initData); service resolves user_id from tg_user_id INSIDE service then set_tenant_scope. AI conversation per-user (AiConversation row per app_user.id). AI tool dispatch strips user_id from LLM kwargs (defence: LLM cannot override). Settings bypass via direct AppUser column read (Plan 11-05 left settings.py with tg_user_id signature — direct PK read in my files is cleanest fix). Bug fix: ai/tools.py propose_actual/planned_transaction had NameError reference to deleted `category_hint` — replaced with `description or ""`.
- 11-07 (2026-05-06): Integration verification flushed three production Rule-1 bugs: (1) alembic revision_id 0006_multitenancy_user_id_rls_role (34 chars) > version_num VARCHAR(32) → renamed to 0006_multitenancy; (2) set_tenant_scope used parameterised SET LOCAL (not allowed) → switched to SELECT set_config('app.current_user_id', :uid, true); (3) RLS policy cast '' to bigint when GUC unset → wrapped with NULLIF(..., '')::bigint. Test infra: dev/prod DB role 'budget' is SUPERUSER (bypasses RLS); _rls_test_role conftest fixture provisions NOSUPERUSER NOBYPASSRLS role used via SET LOCAL ROLE so RLS-enforcement tests verify policies actually fire. D-11-04-01 RESOLVED. D-11-07-01 (legacy fixture sweep, ~63 tests) + D-11-07-02 (move runtime off superuser) deferred to Phase 12 prerequisites.

### Pending Todos

None yet.

### Blockers/Concerns

- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, отложено за scope v0.4.
- Q-v0.4-1: pgvector embeddings при multi-tenant — добавить `user_id` к `category_embedding` или хранить unique по (user_id, name)? Решено: `user_id` FK добавляется в Phase 11, unique по `(user_id, category_id)`.
- Q-v0.4-2: AI conversation persistence при revoke — purge `ai_conversation`/`ai_message` юзера? Yes, по политике hard delete (zafiksirano в Phase 13 success criteria 4).
- Q-v0.4-3: Admin tab visibility — feature flag в UI или backend-driven (через `/me` response с role)? Решено: backend-driven через `/me` (Phase 12 ROLE-05).

## Deferred Items

Items acknowledged and deferred at v0.3 milestone close on 2026-05-06:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 04 — 04-HUMAN-UAT.md (5 pending scenarios) | partial | 2026-05-06 (v0.3 close) |
| uat_gap | Phase 10 — 10-HUMAN-UAT.md (6 pending scenarios) | partial | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 01 — 01-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 02 — 02-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 03 — 03-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 04 — 04-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 05 — 05-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 09 — 09-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| verification_gap | Phase 10 — 10-VERIFICATION.md | human_needed | 2026-05-06 (v0.3 close) |
| quick_task | deploy-fixes (20260504) | missing | 2026-05-06 (v0.3 close) |
| quick_task | ux-fixes (20260506) | unknown | 2026-05-06 (v0.3 close) |

## Session Continuity

Last session: 2026-05-07T09:30:00.000Z
Stopped at: Phase 13 complete — 13-VERIFICATION.md status=human_needed (live TG smoke deferred to milestone close, mirroring Phase 11 U-1 and Phase 12). 8/8 plans + 0 regressions; admin UI + endpoints + AI usage tracking shipped. alembic 0008 (spending_cap_cents stub + ai_usage_log + last_seen_at) applied.
Resume file: Phase 14 (multi-tenant-onboarding) — discuss/plan/execute next. Bot bind for invited members; member-self onboarding flow (starting_balance + cycle_start_day); 14 seed categories per-user; auto-gen embeddings. Requirements: MTONB-01..04. Depends on Phase 11 (per-user data isolation) and Phase 12 (role-check for invite-flow).
