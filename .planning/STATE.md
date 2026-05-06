---
gsd_state_version: 1.0
milestone: v0.4
milestone_name: — Multi-Tenant & Admin
status: planning
last_updated: "2026-05-06T13:30:00.000Z"
last_activity: 2026-05-06 -- v0.3 milestone closed
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06 after v0.3 milestone close)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика.
**Current focus:** Planning v0.4 (Multi-Tenant & Admin) via `/gsd-new-milestone`

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-06 — Milestone v0.4 started

Previous milestones:
- v0.3 (Analytics & AI) — Complete 2026-05-06, 6 phases / 25 plans → archive `.planning/milestones/v0.3-*`
- v0.2 (MVP) — Complete 2026-05-03, 6 phases / 38 plans → archived retroactively at v0.3 close

Progress: [          ] 0% (milestone v0.4)

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

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

### Pending Todos

None yet.

### Blockers/Concerns

- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, отложено за scope v0.4.
- Q-v0.4-1: pgvector embeddings при multi-tenant — добавить `user_id` к `category_embedding` или хранить unique по (user_id, name)? Решить в Phase 1 v0.4.
- Q-v0.4-2: AI conversation persistence при revoke — purge `ai_conversation`/`ai_message` юзера? Yes, по политике hard delete.
- Q-v0.4-3: Admin tab visibility — feature flag в UI или backend-driven (через `/me` response с role)? Backend-driven предпочтительнее (defense-in-depth).

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

Last session: 2026-05-06T04:27:14.334Z
Stopped at: context exhaustion at 75% (2026-05-06)
Resume file: None
