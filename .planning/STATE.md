---
gsd_state_version: 1.0
milestone: v1.1.2
milestone_name: — iOS v06 Native Rebuild)
current_phase: 71
status: completed
stopped_at: "v1.1.2 followup COMPLETE & GSD closed (2026-05-21). Phases 68→71 all SHIPPED on branch v1.0-maximal-poster (NOT yet merged to master). 99 commits. 68 Tech-Debt (backend pytest 62fail/64err→0, RLS-guard 14 tables, seed-helper). 69 Codegen R4 (openapi→TS+Swift DTO, sync-guard). 70 Convergence R3/R6/R7 (legacy deprecate+registry, BusinessDate, injectable error-policy, shared SubscriptionsDomain/Store). 71 UI/UX & functional polish: 23 issues closed (3×P0: AI-chat broken SSE URL, Home balance 500, ПЛАН=0 core-value; 5×P1; income-toggle; ACCESS-1 v06 Доступ; themes→2; all pixel-polish), всё verified on sim/tests. FINAL TESTS: iOS 686 / backend 787 / web 755 green. Details in per-phase SUMMARY/VERIFICATION + 71-FINDINGS.md. SHIPPED & MERGED 2026-05-21: branch v1.0-maximal-poster + master + tag v1.1.2 pushed to origin (all at merge commit ee36f14; origin/master's 4 stale pre-v06 styling commits superseded by the v06 rebuild during the merge — kept verified v06 impl). 5 HUMAN-UAT (62/63/64/66/67) ACCEPTED by owner. Remaining (optional): subjective pixel-perfect vs web-prototype. Dev env (docker :8000, seeded DB, owner Pro) torn down at cleanup — restart: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d."

PREVIOUS — Phase 70-04 (D/R6 shared SubscriptionsDomain) COMPLETE — consolidated the two duplicated Subscriptions compute enums (SubscriptionsData V10 + SubscriptionsViewData v06) into ONE shared SubscriptionsDomain namespace (ios/BudgetPlanner/Domain/Subscriptions/). Shared helpers by plain name (activeCount/isPosted/isValidDraft); intentional per-shell differences PRESERVED as explicitly-named variants — monthlyTotalV10 vs monthlyLoadCentsV06; sortV10 vs sortV06; cadenceRuV10 vs cadenceRuV06. Both shells repoint-ONLY (R6 keep-both-shells); merged into SubscriptionsDomainTests (31 cases). Both shells BUILD SUCCEEDED; full iOS suite 625 green. Commits d4db8b6 + 812982c + e686bb7.

PREVIOUS — Phase 70-03 (E1/R7 ErrorHandling injection) COMPLETE — extracted APIClient's hardcoded status->domain-error + logout switch into an injectable ErrorHandling strategy, killing the per-call auth-Bool (suppressForbiddenHandler) class of bug at the root. ErrorHandling.swift: ErrorDecision enum (.success / .fail(APIError, logout:Bool)) + struct ErrorHandling { var map: (status,data,skipAuth,decodeDetail)->ErrorDecision }; static .default reproduces the old switch byte-for-byte (401 always logout WR-02; 403 logout iff !skipAuth 67-03; 402 require_pro->serverError no-logout 67-05 silent-nil; 404/409/422 no-logout; 2xx success); composable tolerating(_:) example (illustrative, NOT wired). Policy is side-effect-free — returns logout:Bool, APIClient owns the onUnauthenticated callback. APIClient gained var errorPolicy: ErrorHandling = .default (init-injectable); 429 SPLIT — Retry-After handled INLINE first (needs the HTTPURLResponse header the policy signature omits), every other status delegates to errorPolicy.map; inline switch removed; no suppressForbidden reintroduced. REGRESSION GATE: APIClientForbiddenTests ran UNMODIFIED (git status 0 changes) + green (401 logout=1, 403 !skipAuth logout=1, 403 skipAuth logout=0, 200 logout=0) — byte-equivalence proven; NEW live-client 402-no-logout assertion in ErrorPolicyTests green (placed there to keep the 67-03 lock byte-identical). App shell Build Succeeded; full iOS suite 626 green (615 baseline + 10 ErrorPolicyTests + 1 live-402); zero auth-behavior regression. Commits 4adada6 + be7b172 + 01d092e. Next: 70-04 (or remaining W2 wave).
last_updated: "2026-05-21T02:32:00.000Z"
last_activity: 2026-05-21T02:32:00.000Z
progress:
  total_phases: 39
  completed_phases: 31
  total_plans: 83
  completed_plans: 83
  percent: 100
---

## Active Milestone: v1.1.2 — iOS v06 Native Rebuild

User-direction 2026-05-11: вернуть нативный iOS UI (`MainShell`) как полноценную альтернативу `V10MainShell`. Оба шелла сосуществуют через `@AppStorage("ui.theme")` тумблер. Параллельная разработка в ветке `v1.0-maximal-poster`.

**Current Phase:** 67

**Next Phases (planned, see ROADMAP.md):**

- 57: ✅ Onboarding 4-step (v06 native)
- 59: ✅ Transactions (миграция на ActualV10API + hotfix CategoryCreateRequest code)
- 60: ✅ Accounts (новый домен) — SHIPPED 2026-05-12
- 61: ✅ Plan Editor (новый домен) — SHIPPED 2026-05-12
- 62: Savings & Goals (новый домен)
- 63: Subscriptions расширенные
- 64: AddSheet нативный
- 65: ✅ CategoryDetail drill-down
- 66: Settings + AI + Management polish

---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09 — v1.0 milestone «Maximal Poster Full» started)

**Core value:** В один тап записать факт-трату и видеть актуальную дельту план/факт по категориям бюджета — быстрее, чем открывать Google-таблицу. После v0.3 — conversational AI-помощник + аналитика; после v0.4 — multi-tenant whitelist + AI cost cap; v0.6 — native iOS-клиент. v1.0 — pixel-perfect Maximal Poster дизайн-система + Account/Goal/Recurrent/SavingsConfig + auto-roundup + rollover.
**Current focus:** Phase 64 — addsheet-v06

## Current Position

Phase: 71 — COMPLETE. v1.1.2 followup (phases 68→71) SHIPPED on branch v1.0-maximal-poster (not merged to master). GSD workflow CLOSED 2026-05-21.
- 68 Tech-Debt: backend pytest 62fail/64err→0; systemic seed-helper; RLS-guard 14 tables.
- 69 Codegen R4: openapi.json→TS+Swift DTO (idempotent); CI sync-guard + DTO-mirror check.
- 70 Convergence R3/R6/R7: legacy deprecate+registry; BusinessDate; injectable error-policy; shared SubscriptionsDomain/Store (both shells).
- 71 UI/UX & functional: 23 issues closed (3×P0 incl. broken AI-chat URL, Home balance 500, ПЛАН=0 core-value; income-toggle; ACCESS-1 v06 Доступ; themes→2; all pixel-polish) — verified on sim/tests.
Tests: iOS 686 / backend 787 / web 755 green. Per-phase detail in SUMMARY/VERIFICATION + 71-FINDINGS.md.
Not blocking: subjective pixel-perfect vs web-prototype; merge branch→master when ready; 5 pending HUMAN-UAT live-smoke (62/63/64/66/67). Dev env torn down at cleanup.
Last activity: 2026-05-21

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
| Phase 29 P02 | 6min | 1 tasks | 1 files |
| Phase 29 P05 | 6min | 2 tasks | 9 files |
| Phase 61 P02 | 25min | 3 tasks | 5 files |
| Phase 61 P04 | 8min | 2 tasks | 1 files |
| Phase 62 P01 | 2min | 2 tasks | 9 files |
| Phase 62 P02 | 5min | 3 tasks | 5 files |
| Phase 62 P03 | 12min | 3 tasks | 7 files |
| Phase 63 P01 | 4min | 2 tasks | 3 files |
| Phase 63 P02 | 25min | 3 tasks | 3 files |
| Phase 64 P01 | 4min | 3 tasks | 5 files |
| Phase 64 P02 | 3min | 3 tasks | 5 files |
| Phase 66 P01 | 2min | 2 tasks | 3 files |
| Phase 67 P01 | 3min | 2 tasks | 3 files |
| Phase 67 P02 | 2min | 1 tasks | 3 files |
| Phase 67 P04 | 5min | 3 tasks | 5 files |
| Phase 67 P05 | 12min | 3 tasks | 17 files |
| Phase 67 P06 | 3min | 2 tasks | 4 files |
| Phase 67 P07 | ~15min | 3 tasks | 7 files |
| Phase 67 P09 | 22m | 3 tasks | 15 files |
| Phase 67 P10 | 9min | 3 tasks | 6 files |
| Phase 68 P02 | 25min | 2 tasks | 4 files |
| Phase 68 P03 | ~12min | 2 tasks | 5 files |
| Phase 68 P04 | ~5min | 1 tasks | 1 files |
| Phase 70 P03 | 3min | 3 tasks | 3 files |
| Phase 70 P05 | ~7min | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Full decision log в PROJECT.md Key Decisions table.

Recent decisions affecting v1.0 planning:

- 68-04 (2026-05-20): iOS A4 cosmetic — AISuggestCategoryAPI.swift stale doc-comment 0.5→0.35 (verified live backend SUGGEST_THRESHOLD=0.35 in ai_suggest.py post-P2-5). Fixed BOTH locations: the SuggestCategoryDTO doc-comment AND the file-header "filters confidence < 0.5" note (Rule 1 — same stale value). Comment-only, no logic. `make format` reformatted ~80 unrelated files (pre-existing drift) → reverted; only target file committed (scope boundary). Commit 6bd18b6.
- 68-02 (2026-05-20): seed_category now systemically supplies NOT-NULL code (slugified-name + itertools.count monotonic suffix — collision-resistant on the partial-unique (user_id, code) WHERE NOT is_archived index; NOT f"c{sort_order}") + ord (sort_order clamped 00..99, satisfies CHECK ^[0-9]{2}$; regex is on ord, not code). All inline Category seed hacks removed (test_categories + e2e). onboarding/complete 422 root = the live endpoint is v1.0 onboarding_v10 (income_cents/accounts/category_plans, extra=forbid) — legacy starting_balance_cents body is unmounted; tests migrated to v1.0 contract + pdn_consent grant (9 system categories = 8 defaults + savings). Rule 1 deviation: removed dropped plan_template_item from admin_users._PURGE_TABLES_ORDERED (every user-revoke crashed with UndefinedTableError). 16 tests green. Commits 84b0656 + 81309e3.
- 67-05 (2026-05-20): SSE 403 also calls onUnauthenticated() — AI chat stream is always authed (= REST !skipAuth), so 403 there is a genuine auth failure; mirrors final 67-03 REST semantics.
- 67-05 (2026-05-20): `userFacingRu` (UI-only, never surfaces server detail) kept distinct from `errorDescription` (still interpolates detail for logs/dev).
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
- [Phase ?]: 29-02 audit complete
- [Phase v1.0.1 Phase 29-02]: Web UI audit found 26 BLOCKERs concentrated in 7 screens; only Home passes. 3 setup-issue BLOCKERs (W-05 selector materialised, /savings + /ai/observation fixtures missing) gate 29-04. Cross-platform DS §1 palette violations between web and iOS (Subscriptions ink-on-coral, AI bg-black) coincide — single per-platform fix can close 4 BLOCKERs.
- [Phase ?]: v1.0.1 Phase 29-05 (2026-05-11): DIVERGENCES.md numbering schema confirmed platform-based (W- web, I- iOS, X- cross-platform), not severity-based — WARNINGs and INFOs share same platform namespace. 15 audit findings migrated as W-06..W-17 + I-06..I-08; v1.1 backlog clustered by work-type tag.
- [Phase ?]: PlanEditorData как distinct namespace; RolloverAggregates как nested struct устраняет name-collision с FeaturesV10/Plan/PlanData
- [Phase ?]: PlanEditorView routes через typed PlanEditorRoute (enum case row(categoryId:)) — избегает collision с AccountsView Int.self destination в shared ManagementView NavigationStack
- [Phase ?]: T-61-03 mitigation: load() catch блок → filtered RU copy 'Не удалось загрузить план месяца'; raw error через print() only; 0 occurrences of error.localizedDescription
- [Phase 61]: PlanEditorIntegrationTests exercises closure chain end-to-end without network — onSaved closure → applyOptimisticUpdate replaces CategoryV10DTO by id; PlanEditorData helpers (computeSurplus, computeRolloverAggregates, sortCategoriesForDisplay) re-validated post-mutation; 7 integration tests добавлены к 18+7+13 unit tests = 45 combined Phase 61 tests pass.
- [Phase ?]: [Phase 62-01]: SavingsData.swift renamed to SavingsViewData.swift — Xcode/Swift forbids duplicate file basenames in one target (not only type-name collision); v06 file basename uniquified vs FeaturesV10/Savings/SavingsData.swift
- [Phase ?]: [Phase 62-02]: SavingsViewModel optimistic config update + filtered Russian copy + submitting guard (T-62-04/05); 0 error.localizedDescription (T-62-03); SavingsViewData 5 Foundation-only pure helpers; 32 unit tests pass
- [Phase ?]: [Phase 62-03]: GoalDetail/NewGoal/Deposit stubs closed; WR-05 (accountId>0) + IN-04 (MSK due encoding) fixed; GoalDetail deposit self-contained via SavingsAPI.postDeposit+load; WR-01/02/03/04/06 remain OPEN in master mutation paths (out of scope); 488 tests green
- [Phase ?]: [Phase 63-01]: SubscriptionsViewModel migrated to SubscriptionsV10API (list/post/unpost/patch/delete); create-path stays legacy (V10API has no create); LocalNotifications.reschedule dropped as known-gap (legacy Decodable-only DTO); SubscriptionsViewData 6 Foundation-only pure helpers + 18 tests green; T-63-01 submitting guard + T-63-02 filtered RU + T-63-04 full reload
- [Phase ?]: 63-02: edit-path date stays on legacy String yyyy-MM-dd path (avoid .iso8601 UTC day-shift); day_of_month/account_id via follow-up V10 PATCH
- [Phase ?]: 63-02: LocalNotifications.reschedule(subscriptionsV10:) overload restores 63-01 dropped rescheduling
- [Phase ?]: [Phase 64-01]: account picker «Счёт списания» in-place в TransactionEditor (actual-режимы); accountId через encodeIfPresent в ActualCreate/UpdateRequest; default primary ?? first; AccountPickerLogic pure-helpers; 3 call-site неизменны; 11 тестов green
- [Phase ?]: [Phase 64-02]: inline AI category hint — AISuggestCategoryAPI silent wrapper (suppressUnauthHandler:true → non-pro 403 не логаутит owner, T-64-02-02); @Observable AISuggestHint debounce/cancel (Task.isCancelled после await — stale-race T-64-02-03); tappable chip create-only, не авто-применять; 11 тестов green
- [Phase 66-01]: ThemeOption pure helper зеркалит Theme.resolve (неизвестный raw → maximalPoster, sentinel "v06" → legacyV06); v06 Settings «Дизайн» native picker (4 Button-ряда + swatch + checkmark) пишет @AppStorage("ui.theme"), без PosterRouter/.posterSheet (v06 вне poster-контекста); 14 helper-тестов + полный прогон 568 tests green; AI cost cap / AI chat SSE / Management rows подтверждены verify-only (код не тронут)
- [Phase ?]: [Phase 67-01]: /subscriptions GET/POST/PATCH switched to SubscriptionReadV10 (P0-1/BE-F1 closed); read-only widening via SubscriptionRead+SubscriptionV10Extension mixin, request bodies keep extra=forbid; iOS phase 63 day_of_month/account_id/posted_txn_id now round-trip
- [Phase ?]: [Phase 67-04]: backend P1-1/P1-2/P2-13 — _refresh_embedding threads user_id + set_tenant_scope (embeddings persist); post_subscription FOR UPDATE + partial unique index uq_subscription_posted_txn_id + IntegrityError->409; savepoint-rollback test proves no orphan; alembic revision ids must be <=32 chars (varchar32)
- [Phase 67-06]: web P1-6/FE-F4 — split colliding localStorage 'ui.theme' into 'ui.shell' (dispatch v06/v10) + 'ui.theme' (theme); useTheme.ts sole owner of theme key; migration shim adopts legacy ui.theme shell value; VITE_UI_THEME env still wins for shell. R5: v06 web shell KEEP (reachable post-split, maintained); ~50 v06-only files (App.tsx+screens/13+hooks/16+api/6+components/38) deletion DEFERRED pending R6/ARCH-A1 owner decision (DEAD-SHELL-INVENTORY.md)
- [Phase ?]: parseMoney.ts re-exports canonical parseRublesToKopecks (format.ts), adds Or0 wrapper + sanitizeMoneyInput; no duplicate parser
- [Phase ?]: 67-10 (2026-05-20): single reload on subscription create via patchAlreadyReloaded (P2-1); nextChargeDate source-of-truth for day_of_month clamped 1..28 (P2-2); configInFlight serializes config PATCH separate from submitting (P2-3); deterministic notification test via onNotificationLoadComplete seam, no sleep (P2-12); CLAUDE.md+HLD reframed multi-tenant-via-RLS as security asset (R9)

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

Last session: 2026-05-21T02:16:00.000Z
Stopped at: Completed 70-03-PLAN.md (E1/R7 ErrorHandling injection — highest-risk auth-semantics refactor; APIClientForbiddenTests UNMODIFIED + green, 626 suite green)
Resume file: None

## Deferred Items

Items acknowledged and deferred at v1.0 milestone close on 2026-05-10:

| Category | Item | Status |
|----------|------|--------|
| verification_gaps | Phase 22 (22-VERIFICATION.md) | human_needed |
| verification_gaps | Phase 23 (23-VERIFICATION.md) | human_needed |
| quick_task | ux-fixes (20260506) | unknown |
| quick_task | 260508-fib-tma-playwright-mobile-viewport-dev-mode- | awaiting-human-verify |

Pre-existing items inherited from earlier phases / quick tasks — do not block v1.0
shipping but should be reviewed by owner. Documented for follow-up in v1.1.
