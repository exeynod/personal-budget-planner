---
gsd_state_version: 1.0
milestone: v1.1.2
milestone_name: — iOS v06 Native Rebuild)
current_phase: 70
status: completed
stopped_at: Phase 70 COMPLETE (5 plans + WR-01/02 codegen-BusinessDate fix 94e0b9a) — 4/4 PASS; iOS 639 green; both shells build; APIClientForbiddenTests unmodified; BusinessDate + injectable error-policy + shared SubscriptionsDomain/Store; sync-guard green. ENTIRE CONVERGENCE-AND-DEBT-PLAN (68 tech-debt -> 69 codegen R4 -> 70 convergence R3/R6/R7) DONE. Next: UI/UX review loop (owner /goal). ||| Phase 70-05 (D/R6 shared SubscriptionsStore) COMPLETE — FINAL plan of Phase 70. Extracted the duplicated Subscriptions load+mutation logic + the injectable network API seam into a shared @Observable SubscriptionsStore (ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsStore.swift) consumed by BOTH shells; the v06 SubscriptionsViewModel + V10 SubscriptionsV10ViewModel became thin adapters holding ONLY shell-specific presentation (v06 maps store Bool outcomes to fixed-RU mutationError banner / V10 keeps menuSub/pendingDeleteSub/toastMessage). v06 superset ported VERBATIM into the store: submitting-guard (T-63-01), reload-on-success (T-63-04), WR-06 stale-4xx reload on post/unpost (delete/patch no-reload-on-failure kept EXACTLY), reloadPending re-entrancy (WR-01). Store init(api:loadsCategoriesAccounts:sort:) — loadsCategoriesAccounts gates cats/accounts fetch + notification reschedule (v06 true / V10 false); injectable sort closure keeps display order byte-identical (v06=sortV06 stored sorted / V10=identity + own sortedSubs derived getter via sortV10). API seam = v06 WR-04 closure struct lifted to domain layer (static .live proxies SubscriptionsV10API/Categories/Accounts/LocalNotifications). V10 reloadPending-SAFETY VERIFIED: old V10 load() dropped a concurrent load (if inFlight { return }); the superset instead remembers+re-runs it — strictly safer, no V10 caller depends on the drop, no V10 unit test asserted it (V10 VM was never unit-tested). SubscriptionsViewModelTests (19) ran UNMODIFIED (git 0 changes) + green via API/Status typealias + delegated _setStateForTesting backdoor (added DEBUG backdoor to the store). 14 new SubscriptionsStoreTests (seam-injected: v06+V10 load paths, all mutations, submitting-guard, WR-06, WR-01 coalesce). Both shells BUILD SUCCEEDED; full iOS suite 639 green (625 baseline + 14). Minor deviation: V10 failure-toast detail simplified to fixed RU copy (store reports Bool only; matches plan interfaces + T-70-05-03 no-leak; toast still shows on every failure; errMessage helper removed; no test affected). R6 STORE-EXTRACTION PATTERN PROVEN — Subscriptions fully on shared layer (compute via 70-04 + store via 70-05), Views/presentation per-shell; Savings = next D backlog domain. Commits f8a0522 + f0f45d0. Phase 70 (R3/R6/R7, all 5 plans) COMPLETE.

PREVIOUS — Phase 70-04 (D/R6 shared SubscriptionsDomain) COMPLETE — consolidated the two duplicated Subscriptions compute enums (SubscriptionsData V10 + SubscriptionsViewData v06) into ONE shared SubscriptionsDomain namespace (ios/BudgetPlanner/Domain/Subscriptions/). Shared helpers by plain name (activeCount/isPosted/isValidDraft); intentional per-shell differences PRESERVED as explicitly-named variants — monthlyTotalV10 vs monthlyLoadCentsV06; sortV10 vs sortV06; cadenceRuV10 vs cadenceRuV06. Both shells repoint-ONLY (R6 keep-both-shells); merged into SubscriptionsDomainTests (31 cases). Both shells BUILD SUCCEEDED; full iOS suite 625 green. Commits d4db8b6 + 812982c + e686bb7.

PREVIOUS — Phase 70-03 (E1/R7 ErrorHandling injection) COMPLETE — extracted APIClient's hardcoded status->domain-error + logout switch into an injectable ErrorHandling strategy, killing the per-call auth-Bool (suppressForbiddenHandler) class of bug at the root. ErrorHandling.swift: ErrorDecision enum (.success / .fail(APIError, logout:Bool)) + struct ErrorHandling { var map: (status,data,skipAuth,decodeDetail)->ErrorDecision }; static .default reproduces the old switch byte-for-byte (401 always logout WR-02; 403 logout iff !skipAuth 67-03; 402 require_pro->serverError no-logout 67-05 silent-nil; 404/409/422 no-logout; 2xx success); composable tolerating(_:) example (illustrative, NOT wired). Policy is side-effect-free — returns logout:Bool, APIClient owns the onUnauthenticated callback. APIClient gained var errorPolicy: ErrorHandling = .default (init-injectable); 429 SPLIT — Retry-After handled INLINE first (needs the HTTPURLResponse header the policy signature omits), every other status delegates to errorPolicy.map; inline switch removed; no suppressForbidden reintroduced. REGRESSION GATE: APIClientForbiddenTests ran UNMODIFIED (git status 0 changes) + green (401 logout=1, 403 !skipAuth logout=1, 403 skipAuth logout=0, 200 logout=0) — byte-equivalence proven; NEW live-client 402-no-logout assertion in ErrorPolicyTests green (placed there to keep the 67-03 lock byte-identical). App shell Build Succeeded; full iOS suite 626 green (615 baseline + 10 ErrorPolicyTests + 1 live-402); zero auth-behavior regression. Commits 4adada6 + be7b172 + 01d092e. Next: 70-04 (or remaining W2 wave).
last_updated: "2026-05-21T02:32:00.000Z"
last_activity: 2026-05-21T02:32:00.000Z
progress:
  total_phases: 39
  completed_phases: 27
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

Phase: 69 (contract-codegen, R4 workstream B) — in progress
Plan: 69-03 (B3 iOS codegen) complete. contract/gen_swift_dto.py (Python stdlib): walks contract/openapi.json components.schemas -> Gen-namespaced vanilla `Codable, Equatable` Swift DTOs (83 structs + Gen.SubCycle enum) in ios/.../Networking/Generated/GeneratedDTO.swift (816 lines). camelCase props (no CodingKeys — rides the existing APIClient .convertFromSnakeCase decoder + MSK date strategy; transport untouched). Required-set-driven optionality (in `required` & not nullable -> non-optional; absent/defaulted -> Swift optional, kept optional for 69-05 fixture safety — the deliberate divergence from web openapi-typescript which promotes defaulted to non-optional). Int-only money (no Double on *_cents). Idempotent (regen byte-identical) + swift-format-stable (format no-op — feeds B5 git-diff guard). Collision strategy: caseless `enum Gen` namespace so Gen.* coexists with handwritten DTO/*.swift until 69-05 migrates consumers. Transitive skip of HTTPValidationError+ValidationError (untyped/free-form Pydantic 422 envelope; not domain DTOs). B3 tool decision recorded: custom script over swift-openapi-generator (decisive: preserves URLSession transport + MSK decoder; Apple generator forces Client/ClientTransport + swift-openapi-runtime). drift-report.md = 69-05 checklist: CategoryV10 code/ord/createdAt -> non-optional (drop decodeIfPresent stubs), planCents/rollover/paused stay optional, ADD `tag` (missing on wire); UserDTO ADD incomeCents:Int? + onboardedAt String? vs Date? watch; SubscriptionV10 name-collision (SubscriptionRead billing != SubscriptionReadV10) + nested category vs flat categoryId; ActualV10 ADD tag + v0.x kind 2-val vs wire 4-val. make gen-dto target. xcodegen clean; iOS build green; full iOS suite 609 green (Phase 67 baseline, 0 regression). Commits f86c9d0 + 90e0b8c. Next: 69-04.
69-02 (B2) complete. openapi-typescript@^7.13.0 + gen:api script (../contract/openapi.json -o src/api/generated/schema.ts); generated schema.ts (6640 lines, paths+components, idempotent — regen twice byte-identical) + README (generated-only) + drift-report.md. drift-report = the 69-04 migration checklist: (1) ADD `tag` (CategoryRead/V10 = "personal"|"business"|"mixed" default; ActualRead/V10 = string|null) — missing from ALL handwritten DTOs; (2) CategoryV10 code/ord now required (drop `?`/`|null` stubs), plan_cents/rollover/paused defaulted→non-optional-on-wire (drop "pending schema" comments), parent_id stays optional+nullable (matches); (3) name-collision flag: contract SubscriptionRead = tier/billing shape, CRUD wire DTO = SubscriptionReadV10; (4) v0.x ActualRead.kind too narrow (CategoryKind 2-val vs wire 4-val) + ActualV10Read.account_id/parent_txn_id generated optional vs handwritten required (keep optional). MeV10Response = exact match. NO consumer code changed (migration deferred to 69-04). 3 web gates green: build + typecheck:test + vitest 738 (Phase 68 baseline preserved). Commits 113104c + 4354d22. Next: 69-03. openapi-typescript@^7.13.0 + gen:api script (../contract/openapi.json -o src/api/generated/schema.ts); generated schema.ts (6640 lines, paths+components, idempotent — regen twice byte-identical) + README (generated-only) + drift-report.md. drift-report = the 69-04 migration checklist: (1) ADD `tag` (CategoryRead/V10 = "personal"|"business"|"mixed" default; ActualRead/V10 = string|null) — missing from ALL handwritten DTOs; (2) CategoryV10 code/ord now required (drop `?`/`|null` stubs), plan_cents/rollover/paused defaulted→non-optional-on-wire (drop "pending schema" comments), parent_id stays optional+nullable (matches); (3) name-collision flag: contract SubscriptionRead = tier/billing shape, CRUD wire DTO = SubscriptionReadV10; (4) v0.x ActualRead.kind too narrow (CategoryKind 2-val vs wire 4-val) + ActualV10Read.account_id/parent_txn_id generated optional vs handwritten required (keep optional). MeV10Response = exact match. NO consumer code changed (migration deferred to 69-04). 3 web gates green: build + typecheck:test + vitest 738 (Phase 68 baseline preserved). Commits 113104c + 4354d22. Next: 69-03.
69-01 (B1) complete. response_model audit + deterministic openapi.json dump + make contract + guard test; full backend suite 778 green (0 regression).
69-01 (B1): audited all 8 in-scope domains for response_model. subscriptions/categories/actual/accounts/savings/goals already fully typed (reads typed, deletes 204). ai.py covered (history/usage/observation typed; SSE /ai/chat exempt as StreamingResponse; _agg is a nested helper inside get_usage, not a route). The bare-dict gap was concentrated on the `me` domain: typed POST/DELETE /me/consent (ConsentGrantResponse/ConsentRevokeResponse) + DELETE /me/account (AccountDeleteResponse, fixed shape) in me.py; left GET /me/export response_model=None + EXEMPTED (arbitrary nested right-of-access dump — synthesising a model risks reshaping compliance keys). The new contract guard test surfaced 3 ADDITIONAL me-prefix bare-dict routes in billing.py (Phase 34, outside the literal 8-file list but inside the `me` domain by URL): typed GET /me/tier (TierResponse) + POST /me/subscription/cancel (SubscriptionCancelResponse); GET /me/subscription was already typed (Optional[SubscriptionRead]). All new models mirror exact existing wire bodies (byte-identical; no float; no migration). Created contract/dump_openapi.py (json.dumps indent=2 sort_keys=True ensure_ascii=False + trailing newline; --stdout mode because the api image bakes code and the repo is NOT bind-mounted — only ./tests + ./pyproject.toml), contract/openapi.json (regenerable, idempotent — regen twice = byte-identical; 8 domains present, actuals under /api/v1/actual), make contract (pipes the script via stdin into docker api, redirects --stdout to host file), tests/test_openapi_contract.py (8-domain + 2xx schema-ref coverage anyOf-aware with export/SSE exemption allowlist + CategoryRead required={code,ord,created_at} vs optional defaulted plan_cents/rollover/paused/parent_id/tag — the fact that kills the pending-schema stubs in 69-04/05). Guard runs against live app.openapi() so a future bare-dict regression fails CI. Full suite 778 passed / 34 skipped / 1 xpassed / 0 failed / 0 errors (Phase 68 baseline 774 + 4 new guard cases). Stack restored docker compose up -d. Commits f25a7f0 + 0f15007.
68-05 (A2-suite): finished the 68-02 systemic seed/contract migration suite-wide — 126 pre-existing TEST-DEBT failures (62 failed + 64 errors) → 0 across 7 classes. seed_user gained optional pdn_consent_at; seed_category gained optional plan_cents/rollover/paused (model-default fallbacks, stays authoritative for code/ord); new tests/helpers/onboarding.py (complete_onboarding_v10 / v10_onboarding_body / grant_pdn_consent). Zero raw Category() outside seed.py. Classes: A (~70 raw Category→seed_category; conftest two_tenants fix cleared 10 errors alone), B (24 onboarding-v10 fixtures grant consent), C (13 legacy onboarding body→v1.0 contract; v1.0 creates NO period at onboarding — lazy on first txn D-52; already_onboarded 409 is structured dict on existing accounts; 2 embedding tests skipped — backfill decoupled in BE-15), D (4 roundup balance re-reads use select(...).execution_options(populate_existing=True) — expire_all() raised MissingGreenlet under async), E (3 drop plan_template_item from admin-purge + RLS table lists, nine→eight), F (1 migration head allow-list →0026_ai_usage_cost_cents), G (~17 template/snapshot WRITE assert 410 Gone per CR-05; apply-template asserts v1.0 no-op created=0 since plan_template_item materialisation removed D-02). FINAL: 774 passed, 34 skipped, 1 xpassed, 0 failed, 0 errors. TEST-ONLY (zero app/route/migration changes). Commits dc556f7 + 7b2a9dd + fcbc408 + 085f535.
Status: v1.1.2 followup in progress (CONVERGENCE-AND-DEBT-PLAN.md). Sequence 68 tech-debt DONE -> 69 codegen R4 (B1 done) -> 70 convergence R3/R6/R7. plan-checker ON, worktrees OFF. Phase 67 + 68 complete. 68-03 (A3 web tsc test-gate): added @types/node@^22 + tsconfig.test.json + `typecheck:test` script (tsc -p tsconfig.test.json --noEmit) re-covering test files under type-check WITHOUT slowing the prod `tsc -b` (Phase 67 test-exclude in tsconfig.app.json untouched — two separate gates). Fixed prop-drift: AiView.test baseProps typed to AiViewProps (literal-narrowing was rejecting valid observation/observationError null<->string overrides); SettingsView.test makeProps gained 8 missing required props (homeColor/pickerOpen/onSelectHomeColor/onTogglePicker from Phase 30-07 + theme/themePickerOpen/onSelectTheme/onToggleThemePicker from Phase 54-01). TxV10TabDemote needed no fixture change (node:fs/path resolved by @types/node alone). No @ts-ignore, no production prop-type changes. Three gates green: npm run build (vite ~280ms) + npm run typecheck:test (0 err) + npx vitest run (55 files / 738 tests). Commits dbe8b47 + 1c8b3dd. 68-01: extended seed_user with optional pro_active_until/trial_ends_at (default free, backward-compatible); seeded Pro users (pro_active_until +30d) in all 6 AI spend-cap tests so require_pro (402) passes and enforce_spending_cap (429) fires — tests/test_ai_cap_integration.py (4) + tests/test_spend_cap_concurrent.py (2) all green; gate order require_pro→enforce_spending_cap confirmed intentional, dependencies.py untouched (fixture-fix). Commits eece9ae + 0287eda. 67-10: single-reload subscription create (patchAlreadyReloaded skips redundant onSaved, P2-1); nextChargeDate source-of-truth for monthly day_of_month clamped 1..28 with Stepper/DatePicker bidirectional sync (P2-2); toggleRoundup/selectBase serialized via separate configInFlight guard (P2-3); flaky test_notificationTxnCreated_triggersLoad de-flaked via injected onNotificationLoadComplete seam + withCheckedContinuation, no Task.sleep (P2-12); CLAUDE.md + docs/HLD.md reframed single-tenant -> multi-tenant-via-RLS reality (RLS alembic 0008, owner/member roles, set_tenant_scope per request) as a security asset (R9). 67-05 banner + 67-07 Savings seam preserved; APIClient/backend/web/FeaturesV10 untouched. Full iOS suite 609 green.
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
