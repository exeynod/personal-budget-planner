---
gsd_state_version: 1.0
milestone: v0.4
milestone_name: — Multi-Tenant & Admin
status: executing
last_updated: "2026-05-06T16:20:00.000Z"
last_activity: 2026-05-06 -- Phase 11 Plan 02 completed (alembic 0006 multitenancy revision)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 7
  completed_plans: 1
  percent: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06 after v0.3 milestone close)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика.
**Current focus:** v0.4 (Multi-Tenant & Admin) — roadmap зафиксирован, готовы к `/gsd-plan-phase 11`

## Current Position

Phase: 11 — Multi-Tenancy DB Migration & RLS (in progress, 1/7 plans done)
Plan: 11-02 (alembic 0006 revision) — completed 2026-05-06
Status: Wave 1 plan 11-02 done. Wave 1 plan 11-01 (RED tests + 2-tenant fixture) pending.
Last activity: 2026-05-06 — alembic revision 0006_multitenancy_user_id_rls_role.py created

Previous milestones:
- v0.3 (Analytics & AI) — Complete 2026-05-06, 6 phases / 25 plans → archive `.planning/milestones/v0.3-*`
- v0.2 (MVP) — Complete 2026-05-03, 6 phases / 38 plans → archived retroactively at v0.3 close

Progress: [          ] 3% (milestone v0.4, 0/5 phases complete; 1/7 plans of Phase 11 done)

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: ~5 min
- Total execution time: ~0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11 | 1 | ~5 min | ~5 min |

**Recent Trend:**

- Last 5 plans: 11-02 (~5 min, 1 file, 3 commits)
- Trend: Phase 11 Wave 1 in progress

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

Last session: 2026-05-06T16:20:00.000Z
Stopped at: Plan 11-02 complete (alembic 0006 revision created); Wave 1 plan 11-01 still pending
Resume file: .planning/phases/11-multi-tenancy-db-migration/11-01-PLAN.md
