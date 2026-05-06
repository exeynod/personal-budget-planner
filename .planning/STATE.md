---
gsd_state_version: 1.0
milestone: v0.4
milestone_name: — Multi-Tenant & Admin
status: executing
last_updated: "2026-05-06T17:00:00.000Z"
last_activity: 2026-05-06 -- Phase 11 Plan 05 completed (services+routes PART A — user_id scoping for categories, periods, templates, planned, onboarding)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 7
  completed_plans: 4
  percent: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06 after v0.3 milestone close)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика.
**Current focus:** v0.4 (Multi-Tenant & Admin) — roadmap зафиксирован, готовы к `/gsd-plan-phase 11`

## Current Position

Phase: 11 — Multi-Tenancy DB Migration & RLS (in progress, 4/7 plans done)
Plan: 11-05 (services+routes PART A) — completed 2026-05-06
Status: Plans 11-02, 11-03, 11-04, 11-05 done. Plan 11-01 (RED tests + 2-tenant fixture) and 11-06 (services+routes PART B — actuals/subs/analytics/AI/internal_bot/worker) and 11-07 (integration verify) pending.
Last activity: 2026-05-06 — app/services/{categories,periods,templates,planned,onboarding}.py + 4 routes scoped by user_id (MUL-03/MUL-04)

Previous milestones:
- v0.3 (Analytics & AI) — Complete 2026-05-06, 6 phases / 25 plans → archive `.planning/milestones/v0.3-*`
- v0.2 (MVP) — Complete 2026-05-03, 6 phases / 38 plans → archived retroactively at v0.3 close

Progress: [##        ] 11% (milestone v0.4, 0/5 phases complete; 4/7 plans of Phase 11 done)

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: ~10 min
- Total execution time: ~0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11 | 4 | ~40 min | ~10 min |

**Recent Trend:**

- Last 5 plans: 11-05 (~30 min, 9 files, 3 commits), 11-04 (~?, deps + dev-seed), 11-03 (~3 min, 1 file, 1 commit), 11-02 (~5 min, 1 file, 3 commits)
- Trend: Phase 11 Waves 1-4 progressing; 11-05 PART A done — 11-06 PART B parallel/next

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

Last session: 2026-05-06T17:00:00.000Z
Stopped at: Plan 11-05 complete (services+routes PART A — categories, periods, templates, planned, onboarding scoped by user_id)
Resume file: .planning/phases/11-multi-tenancy-db-migration/11-06-PLAN.md (PART B) or 11-01-PLAN.md (RED tests + 2-tenant fixture, can run in parallel)
