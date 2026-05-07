---
gsd_state_version: 1.0
milestone: v0.5
milestone_name: Security & AI Hardening
status: planning
stopped_at: ROADMAP.md созданa для v0.5 — Phase 16 готова к планированию
last_updated: "2026-05-07T17:43:38.511Z"
last_activity: 2026-05-07 — Roadmap создан, 9/9 v0.5 requirements замаплены на Phase 16
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 9
  completed_plans: 2
  percent: 22
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07 — v0.5 milestone started)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика; после v0.4 — multi-tenant whitelist + AI cost cap.
**Current focus:** Phase 16 — Security & AI Hardening (hotfix milestone)

## Current Position

Phase: 16 of 16 (Security & AI Hardening)
Plan: — (not started, awaiting `/gsd-plan-phase 16`)
Status: Ready to plan
Last activity: 2026-05-07 — Roadmap создан, 9/9 v0.5 requirements замаплены на Phase 16

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed (v0.4): 36
- Average duration: ~10 min
- Total execution time: ~6 hours

**By Phase (v0.4):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11 | 7 | ~84 min | ~12 min |
| 12 | 7 | ~95 min | ~14 min |
| 13 | 8 | ~33 min | ~4 min |
| 14 | 7 | ~75 min | ~11 min |
| 15 | 7 | ~80 min | ~11 min |

**Recent Trend:**

- Last v0.4 phase (15) — 7 plans, ~80 min total, frontend + backend + admin endpoint, 26/27 new tests green
- Trend (v0.4): стабильный, ~10 min/plan; live TG smoke consistently deferred

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log в PROJECT.md Key Decisions table.

Recent decisions affecting v0.5 planning:

- v0.5 (2026-05-07): Single consolidated Phase 16 для всех 9 atomic fixes — общий delivery boundary («code-review tickets closed»), общие файлы (`app/api/routes/ai.py:_event_stream` для SEC-02 / AI-02 / AI-03), фрагментация на backend/frontend не даёт value
- v0.5 (2026-05-07): Каждый fix сопровождается регресс-тестом — без теста fix не считается завершённым (pytest для backend, Playwright для XSS, vitest для money-парсера)
- v0.5 (2026-05-07): Out of scope в v0.5 — миграция `est_cost_usd` Float→BIGINT, embedding cache invalidation на rename категории, CSP-заголовок Caddy (всё ушло в backlog)
- v0.5 (2026-05-07): CON-02 закрывается per-user `asyncio.Lock` (грубо, но дёшево); полноценный pre-charge token reservation отложен до post-v0.5 если pet-app вырастет
- v0.5 (2026-05-07): AI-03 — total tool-calls per session ≤ 8 + детект повтора одного tool с одинаковыми args в соседних раундах
- 16-03 (2026-05-07): AI-01 закрыт через positive-check сразу после try/except парсинга amount_cents в propose_*_transaction (минимальный диф D-16-04, 4 строки кода). Edge-кейс 0.001 rub отвергается естественно через round() → 0 cents → fail. 17 pytest unit-тестов (parametrized + happy/edge), 0 регрессов.

### Pending Todos

None yet.

### Blockers/Concerns

- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, отложено за scope v0.5
- v0.4 UAT: 8 live-smoke items (v0.4-U-1..U-8) ждут owner-валидации в реальном TG — НЕ блокируют v0.5 фиксы (изолированный hotfix scope)

## Deferred Items

Items acknowledged and deferred at v0.4 milestone close on 2026-05-07:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| verification_gap | Phase 11 — 11-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 12 — 12-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 13 — 13-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 14 — 14-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| verification_gap | Phase 15 — 15-VERIFICATION.md | human_needed | 2026-05-07 (v0.4 close) |
| arch_debt | `est_cost_usd Float` → BIGINT migration | deferred | 2026-05-07 (v0.5 OoS) |
| arch_debt | Embedding cache invalidation on category rename | deferred | 2026-05-07 (v0.5 OoS) |
| security_defense | Caddy CSP header (defence-in-depth для XSS) | deferred | 2026-05-07 (v0.5 OoS) |
| arch_debt | Pre-charge AI token reservation (vs Lock) | deferred | 2026-05-07 (v0.5 OoS) |
| arch_debt | Audit pipeline для невалидных tool-call попыток | deferred | 2026-05-07 (v0.5 OoS) |

8 v0.4 UAT items (v0.4-U-1..U-8) consolidated в `v0.4-MILESTONE-AUDIT.md` — owner runs live smoke after rebuilding api/bot/worker containers; не блокирует v0.5.

## Session Continuity

Last session: 2026-05-07T17:43:38.508Z
Stopped at: ROADMAP.md созданa для v0.5 — Phase 16 готова к планированию
Resume file: None
