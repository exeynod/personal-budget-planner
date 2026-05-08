---
gsd_state_version: 1.0
milestone: v0.6
milestone_name: iOS App
status: planning
last_updated: "2026-05-08T17:15:00.000Z"
last_activity: 2026-05-08
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08 — v0.6 milestone started)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика; после v0.4 — multi-tenant whitelist + AI cost cap; v0.6 — native iOS-клиент.
**Current focus:** Phase 17 — iOS Foundation (planning)

## Current Position

Phase: Not started — Phase 17 awaiting plan-phase decomposition
Plan: —
Status: Roadmap created, awaiting plan-phase
Last activity: 2026-05-08 — Milestone v0.6 roadmap drafted (Phases 17-21)

## Milestone v0.6 Phases

| # | Name | Requirements | Status |
|---|------|--------------|--------|
| 17 | iOS Foundation | IOSAUTH-01, IOSAUTH-02, IOS-01, IOS-02, IOS-03, IOS-04, IOS-06, IOS-07, IOS-10, IOS-11 | Not started |
| 18 | iOS Core CRUD | IOS-08, IOS-09, IOS-12, IOS-13, IOS-14 | Not started |
| 19 | iOS Management | IOS-15, IOS-16 | Not started |
| 20 | iOS AI | IOS-05, IOSAI-01, IOSAI-02 | Not started |
| 21 | TestFlight Distribution | IOS-17, IOS-18 | Not started |

**Coverage:** 22/22 requirements mapped ✓

## Performance Metrics

**Velocity (v0.5 — last shipped milestone):**

- Total plans completed: 9 (Phase 16)
- Average duration: ~7 min/plan (range 4-15)
- Total execution time: ~70 min

**By Milestone:**

| Milestone | Plans | Total | Avg/Plan |
|-----------|-------|-------|----------|
| v0.4 (Phases 11-15) | 36 | ~6h | ~10 min |
| v0.5 (Phase 16) | 9 | ~70 min | ~7 min |

**Recent Trend (v0.5):**

- Phase 16 P05: 4 min, 2 tasks, 2 files (`app/api/routes/ai.py` modified, `tests/api/test_ai_chat_tool_loop_guard.py` created)
- Phase 16 P07: ~10 min, 3 tasks, 4 files (`app/services/spend_cap.py` + `app/api/dependencies.py` + `app/api/routes/ai.py` modified, `tests/test_spend_cap_concurrent.py` created); 2 commits feat + fix + test (d4be381 / 86cfdea / bab91c6)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log в PROJECT.md Key Decisions table.

Recent decisions affecting v0.6 planning:

- v0.6 (2026-05-08): 5-phase split (Foundation / Core CRUD / Management / AI / TestFlight) derived from natural delivery boundaries — каждая фаза финализирует одну вертикальную возможность, ничего не висит наполовину между фазами
- v0.6 (2026-05-08): Backend меняется только в Phase 17 — добавляется `POST /auth/dev-exchange` + Bearer-fallback в `get_current_user`. Web-фронт продолжает работать на initData без изменений (защищается regression-тестом в success criterion #1)
- v0.6 (2026-05-08): IOS-04 (APIClient, все CRUD endpoints) полностью лежит в Phase 17 — сетевой слой готов до начала Phase 18 UI-работы; так UI-фазы не вязнут в добавлении новых endpoint-обёрток
- v0.6 (2026-05-08): IOS-05 (SSE-клиент) перенесён в Phase 20 (AI), а не в Phase 17 networking — SSE используется только AI-чатом, добавлять его раньше = dead code в Phases 17-19
- v0.6 (2026-05-08): Локальные UNUserNotifications в Phase 19, APNs server-push отложен в IOS-FUT-07 — pet-app не требует push-инфраструктуры пока подписки == единственный use-case напоминаний
- v0.6 (2026-05-08): Phase 21 (TestFlight) включает замену dev-token flow на production-auth (TG Login Widget или Sign in with Apple) — нельзя приглашать друга с DEV_AUTH_SECRET, это сразу даёт ему права owner

Recent decisions from v0.5 (preserved for context):

- v0.5 (2026-05-07): Single consolidated Phase 16 для всех 9 atomic fixes — общий delivery boundary («code-review tickets closed»), общие файлы (`app/api/routes/ai.py:_event_stream` для SEC-02 / AI-02 / AI-03), фрагментация на backend/frontend не даёт value
- v0.5 (2026-05-07): Каждый fix сопровождается регресс-тестом — без теста fix не считается завершённым (pytest для backend, Playwright для XSS, vitest для money-парсера)

### Pending Todos

None yet — awaiting `/gsd-plan-phase 17` to decompose Phase 17 into atomic plans.

### Blockers/Concerns

- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, отложено за scope v0.6
- v0.4 UAT: 8 live-smoke items (v0.4-U-1..U-8) ждут owner-валидации в реальном TG — НЕ блокируют v0.6 (изолированный iOS scope, web-фронт не трогаем)
- v0.6 Phase 21 dependency на $99 Apple Developer Account — внешний gating-фактор, ETA регистрации Apple 24-48h после оплаты

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260508-fgq | Унифицирован редактор транзакций (план/факт) и карточка плана | 2026-05-08 | 781961b | [260508-fgq-unify-transaction-editor](./quick/260508-fgq-unify-transaction-editor/) |
| 260508-fib | UI rework handoff: 18 mobile screenshots + user-stories.md + README для Claude Design | 2026-05-08 | 3447760 | [260508-fib-tma-playwright-mobile-viewport-dev-mode-](./quick/260508-fib-tma-playwright-mobile-viewport-dev-mode-/) |

## Deferred Items

Items acknowledged and deferred at v0.4 milestone close on 2026-05-07 (carried forward — no v0.6 closure expected to address them):

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

8 v0.4 UAT items (v0.4-U-1..U-8) consolidated в `v0.4-MILESTONE-AUDIT.md` — owner runs live smoke after rebuilding api/bot/worker containers; не блокирует v0.6.

v0.6 deferred (acknowledged at planning):

| Category | Item | Status | Reason |
|----------|------|--------|--------|
| ios_future | IOS-FUT-01 Apple Watch companion | deferred | Outside MVP scope |
| ios_future | IOS-FUT-02 iOS Widgets (Home/Lock Screen) | deferred | Требует WidgetKit-кода, отдельная фаза |
| ios_future | IOS-FUT-03 iPad split-view layout | deferred | Single-tenant pet, фокус на iPhone |
| ios_future | IOS-FUT-04 Offline режим с SwiftData | deferred | Сильно усложняет state-management |
| ios_future | IOS-FUT-05 Apple Sign-in for friend access | deferred | Single-tenant до Phase 21 |
| ios_future | IOS-FUT-06 macOS Catalyst-сборка | deferred | Не запрашивалось |
| ios_future | IOS-FUT-07 APNs server-push | deferred | Локальные нотификации покрывают use-case |

## Session Continuity

Last session: 2026-05-08T17:15:00.000Z
Stopped at: Roadmap для v0.6 (Phases 17-21) создан, REQUIREMENTS.md traceability заполнен. Awaiting `/gsd-plan-phase 17`.
Resume file: None
