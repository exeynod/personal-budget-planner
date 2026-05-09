---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Maximal Poster Full
status: planning
last_updated: "2026-05-09T17:00:00.000Z"
last_activity: 2026-05-09
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09 — v1.0 milestone «Maximal Poster Full» started)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика; после v0.4 — multi-tenant whitelist + AI cost cap; v0.6 — native iOS-клиент. v1.0 — pixel-perfect Maximal Poster дизайн-система + Account/Goal/Recurrent/SavingsConfig + auto-roundup + rollover.
**Current focus:** Phase 22 — Backend Schema & Logic Foundation (planning)

## Current Position

Phase: Not started (roadmap created, awaiting `/gsd-plan-phase 22`)
Plan: —
Status: Roadmap для v1.0 создан, REQUIREMENTS.md traceability заполнен (92/92 REQs)
Last activity: 2026-05-09 — Roadmap v1.0 создан (Phases 22-28)

## Milestone v1.0 Phases

| # | Name | Requirements | Status |
|---|------|--------------|--------|
| 22 | Backend Schema & Logic Foundation | BE-01..BE-16 (16) | Not started |
| 23 | Design System Foundation | DS-01..DS-08 (8) | Not started |
| 24 | Onboarding 4-step | ONB-V10-01..07 (7) | Not started |
| 25 | Home + Transactions + Add Sheet | HOME-V10-01..06, TXN-V10-01..06, ADD-V10-01..05 (17) | Not started |
| 26 | Category Detail + PLAN мая + Subscriptions | CAT-V10-01..06, PLAN-V10-01..06, SUBS-V10-01..04 (16) | Not started |
| 27 | AI + Savings + Accounts + Analytics + Management | AI-V10-01..05, SAV-V10-01..04, ACCT-V10-01..04, ANAL-V10-01..04, MGMT-V10-01..04 (21) | Not started |
| 28 | Animations Polish + Acceptance | POL-01..07 (7) | Not started |

**Coverage:** 92/92 requirements mapped ✓

**Branching strategy (per PROJECT.md):**
- Integration branch: `v1.0-maximal-poster` (отщеплена от master, коммит `bc013a9`)
- Per-phase ветки: `v1.0/{NN}-{web|ios}` через git worktrees + `/gsd-workstreams`
- Phase 22 — единственный workstream (backend-only)
- Phase 23-28 — параллельные web ║ iOS workstreams

**Dependency graph:** Phase 22 (blocker) → Phase 23 → Phase 24 → [25 ║ 26 ║ 27] → Phase 28

## Performance Metrics

**Velocity (v0.6 — last shipped milestone):**

- Total plans completed: ~25 commits across Phases 17-21 + wise-tide refactor
- iOS app shipped 2026-05-09 (XcodeGen workflow, free Apple ID install на iPhone Denis)

**By Milestone:**

| Milestone | Plans | Total | Avg/Plan |
|-----------|-------|-------|----------|
| v0.4 (Phases 11-15) | 36 | ~6h | ~10 min |
| v0.5 (Phase 16) | 9 | ~70 min | ~7 min |
| v0.6 (Phases 17-21 + wise-tide) | ~25 | — | — |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log в PROJECT.md Key Decisions table.

Recent decisions affecting v1.0 planning:

- v1.0 (2026-05-09): 7-phase split (Backend / Design / Onboarding / Home+Tx+Add / CatDet+PLAN+Subs / AI+Sav+Accts+Anal+Mgmt / Polish) — derived from REQUIREMENTS.md категорий, не imposed structure. Каждая фаза = coherent delivery boundary с verifiable user-observable outcomes.
- v1.0 (2026-05-09): ADR-001 — DM Serif Display Italic не имеет cyrillic subset на Google Fonts; решение: web использует dual-font через `unicode-range` (DM Serif для Latin + PT Serif Italic для cyrillic); iOS использует единый PT Serif Italic как pragmatic fallback. Это не блокирует Phase 23, но требует designer review для acceptance §14.7.
- v1.0 (2026-05-09): ADR-002 — Native `NavigationStack` нельзя override на 28px-slide + 420ms-easeOut (`posterSlideInFwd`); решение: custom `PosterNavStack` (50 LOC, ZStack + asymmetric transitions + @Observable router) + ручной edge-swipe-back через `UIScreenEdgePanGestureRecognizer` (minimumDistance 24, threshold 80px). Risk — gesture conflict с TabView swipe — POC на real device первую неделю Phase 23.
- v1.0 (2026-05-09): Subscription→Recurrent merge (рекомендация из ARCHITECTURE.md §2): extend существующую `subscription` таблицу полями `day_of_month`, `account_id`, `posted_txn_id` вместо создания новой `recurrent` таблицы — reduces churn ~40 file edits, переиспользует existing `charge_subscriptions_job` + advisory lock pattern, public route остаётся `/api/v1/subscriptions/...`.
- v1.0 (2026-05-09): Account balance — service-layer (delta accounting) вместо PG triggers — easier debugging, тесты, defer optimization до >10K txns/account; сохраняем `BudgetPeriod.starting_balance_cents` для per-period accounting независимо от Account balance.
- v1.0 (2026-05-09): Roundup как explicit return value из `create_actual` (tuple parent, roundup | None) — не event hook, не background queue; clean control flow, testable, bot/AI/Mini App share same logic.
- v1.0 (2026-05-09): Rollover в `close_period_job` — pre-close, after compute_balance, before status flip; идемпотентность через `period.rollover_processed_at` + UNIQUE INDEX on `(period_id, category_id) WHERE kind='deposit'`; для misc — virtual `period.misc_rollover_cents` (без txn).
- v1.0 (2026-05-09): Dual-shell coexistence — feature flag at `MainShell` уровне (не per-screen): `AppRouter` switch на `@AppStorage("ui.theme")`, web — `localStorage.getItem('ui.theme')` или `VITE_UI_THEME=v10`; v0.6 код untouched до Phase 28; default flips на v10 в acceptance.
- v1.0 (2026-05-09): Token codegen — single source `tokens.json` → `scripts/gen-css.ts` + `scripts/gen-swift.ts` → web/iOS generated файлы; CI-check `make tokens-check` валит билд если generated ≠ committed; trade-off ~half-day setup vs ≥3 sync bugs over Phase 23-27.
- v1.0 (2026-05-09): Phase 22 sub-ordering (ARCHITECTURE.md §12) — 22.1 alembic migrations (BLOCKER) → 22.2a-d параллельно (Account, Goal, Savings, Recurrent services + endpoints) → 22.3 RoundupService → 22.4 modify create_actual → 22.5 RolloverService + close_period augment → 22.6 atomic onboarding extension.

Recent decisions from v0.6 (preserved for context):

- v0.6 (2026-05-09): wise-tide refactor — pixel-perfect web port → native iOS 26 rewrite; user feedback «детская игрушка» triggered −500 LOC removal of peach aurora + 6-layer fake glass + Material Design FAB; replaced with native `.glassEffect()`, semantic typography, system materials, Form/List(.insetGrouped). Branded orange как `Color.accentColor`.
- v0.6 (2026-05-08): IOS-04 (APIClient, все CRUD endpoints) полностью лежит в Phase 17 — сетевой слой готов до начала Phase 18 UI-работы.

### Pending Todos

None yet — awaiting `/gsd-plan-phase 22` to decompose Phase 22 into atomic plans.

**Recommended next action:**
1. `/gsd-plan-phase 22` — decompose Phase 22 (Backend Schema & Logic Foundation) into atomic plans following sub-phase ordering 22.1-22.6 from ARCHITECTURE.md §12.
2. After Phase 22 plans validated → execute via `/gsd-execute-phase 22`.
3. After Phase 22 merged into `v1.0-maximal-poster` → unblock Phase 23 (web ║ iOS параллельно через worktrees).

### Blockers/Concerns

- Q-9 (HLD): Стратегия выноса pg_dump (S3 vs локальный том) — открыто, отложено за scope v1.0
- v0.4 UAT: 8 live-smoke items (v0.4-U-1..U-8) ждут owner-валидации в реальном TG — НЕ блокируют v1.0
- v1.0 Phase 23 ADR-001 — DM Serif cyrillic coverage test (`pyftsubset --unicodes='U+0410-044F'`) на старте Phase 23 до final font bundling
- v1.0 Phase 23 ADR-002 — PosterNavStack edge-swipe gesture conflict с TabView swipe — POC на real device первую неделю Phase 23
- v1.0 acceptance §14.7 «нет FOUT-моментов» переформулировано в «нет видимого FOUT после первого визита» — `font-display: optional` + service-worker cache + preload top-2 critical weights (Manrope 500 + JetBrains 600)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260508-fgq | Унифицирован редактор транзакций (план/факт) и карточка плана | 2026-05-08 | 781961b | [260508-fgq-unify-transaction-editor](./quick/260508-fgq-unify-transaction-editor/) |
| 260508-fib | UI rework handoff: 18 mobile screenshots + user-stories.md + README для Claude Design | 2026-05-08 | 3447760 | [260508-fib-tma-playwright-mobile-viewport-dev-mode-](./quick/260508-fib-tma-playwright-mobile-viewport-dev-mode-/) |

## Deferred Items

Items acknowledged and deferred at v0.4 milestone close on 2026-05-07 (carried forward):

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

8 v0.4 UAT items (v0.4-U-1..U-8) consolidated в `v0.4-MILESTONE-AUDIT.md` — owner runs live smoke after rebuilding api/bot/worker containers; не блокирует v1.0.

v0.6 deferred (carried forward):

| Category | Item | Status | Reason |
|----------|------|--------|--------|
| ios_future | IOS-FUT-01 Apple Watch companion | deferred | Outside MVP scope |
| ios_future | IOS-FUT-02 iOS Widgets (Home/Lock Screen) | deferred | Требует WidgetKit-кода, отдельная фаза |
| ios_future | IOS-FUT-03 iPad split-view layout | deferred | Single-tenant pet, фокус на iPhone |
| ios_future | IOS-FUT-04 Offline режим с SwiftData | deferred | Сильно усложняет state-management |
| ios_future | IOS-FUT-05 Apple Sign-in for friend access | deferred | Single-tenant до Phase 21 |
| ios_future | IOS-FUT-06 macOS Catalyst-сборка | deferred | Не запрашивалось |
| ios_future | IOS-FUT-07 APNs server-push | deferred | Локальные нотификации покрывают use-case |

v0.6 verification gaps (carried forward):

| Category | Item | Status |
|----------|------|--------|
| verification_gap | Phase 17 — 17-VERIFICATION.md | human_needed |
| verification_gap | Phase 18 — 18-VERIFICATION.md | human_needed |
| verification_gap | Phase 19 — 19-VERIFICATION.md | human_needed |
| verification_gap | Phase 20 — 20-VERIFICATION.md | human_needed |
| verification_gap | Phase 21 — 21-VERIFICATION.md | human_needed |
| quick_task | deploy-fixes (20260504) | missing |
| quick_task | ux-fixes (20260506) | unknown |
| quick_task | 260508-fib-tma-playwright-mobile-viewport-dev-mode- | awaiting-human-verify |

v1.0 deferred (acknowledged at planning):

| REQ-ID | Description | Defer reason |
|---|---|---|
| DF-V11-01 | Account-to-account transfer (CTA «ПЕРЕВОД» функциональный) | OQ-10: scope reduction для v1.0 |
| DF-V11-02 | AI-driven recurrent suggestions | После наблюдения за usage v1.0 |
| DF-V11-03 | Multiple goals с goal-specific deposits | DATA-MODEL.md §3.4 |
| DF-V11-04 | Tweak-цвет toggle (coral / cobalt / cream на Home) | Phase 25 hardcode coral |
| DF-V11-05 | Apple Watch companion + iOS Widgets | iOS-specific extensions |
| DF-V11-06 | Bank statement import (Open Banking) | RU non-existent в 2026 |
| DF-V11-07 | Подкатегории (Category.parent_id используется UI-side) | R3 в handoff §13 |

## Session Continuity

Last session: 2026-05-09T17:00:00.000Z
Stopped at: Roadmap для v1.0 (Phases 22-28) создан, REQUIREMENTS.md traceability заполнен (92/92 REQs). Awaiting `/gsd-plan-phase 22`.
Resume file: None
