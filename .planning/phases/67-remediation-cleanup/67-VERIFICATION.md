---
phase: 67-remediation-cleanup
verified: 2026-05-20T18:05:00Z
status: human_needed
score: 4/4 success criteria verified (iOS 609-test suite needs human run)
overrides_applied: 0
human_verification:
  - test: "iOS full test suite: cd ios && xcodegen generate && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'"
    expected: "Build Succeeded; 609 tests, 0 failures (incl. SavingsViewModelTests, GoalDetailViewModelTests, APIClientForbiddenTests, APIClientDateDecodeTests, APIErrorMapperTests, de-flaked test_notificationTxnCreated_triggersLoad)"
    why_human: "iOS build/test cannot be executed in this verification environment (no XcodeBuildMCP session; full simulator build exceeds the verifier's time/tooling bounds). All test SOURCE files are present on disk and the production seams they exercise are verified in source; only the live compile+run gate is unconfirmed."
---

# Phase 67: v1.1.2 Remediation & Cleanup — Verification Report

**Phase Goal:** Устранить находки 5-лидового кросс-доменного ревью (`.planning/v1.1.2-MULTILEAD-REVIEW.md`) + механический cleanup. Кросс-доменная фаза (iOS Swift + Python backend + React/TS web), 10 планов, 5 волн.
**Verified:** 2026-05-20T18:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + review-doc items)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| SC1a | **P0-1** GET/POST/PATCH /subscriptions отдают day_of_month/account_id/posted_txn_id | ✓ VERIFIED | `app/api/routes/subscriptions.py:47,61,109` все три `response_model=SubscriptionReadV10`; lines 58/101/128 return `SubscriptionReadV10.model_validate(...)`. `SubscriptionReadV10(SubscriptionRead, SubscriptionV10Extension)` (`schemas/subscriptions.py:125`); mixin defines `day_of_month`/`account_id`/`posted_txn_id` (lines 120-122). 34 backend tests incl. round-trip pass. |
| SC1b | **P0-2** `npm run build` (tsc -b) зелёный | ✓ VERIFIED | `analytics.ts:20` `AnalyticsRange` from `'../analytics'`; `AiView.tsx:81` `bottomRef` typed `HTMLLIElement`. Ran `npm run build` → **exit 0**, `✓ built in 260ms`. |
| SC1c | **P0-3** suppressForbiddenHandler удалён, 403→logout восстановлен | ✓ VERIFIED | `grep -rn suppressForbiddenHandler ios/BudgetPlanner/` → **0 matches**. `APIClient.swift:169` `if !skipAuth { onUnauthenticated?() }` on 403; `AISuggestCategoryAPI` relies on nil-on-error (402→serverError→catch→nil). |
| SC2a | **P1-1** эмбеддинги пользовательских категорий пишутся (user_id + set_tenant_scope) | ✓ VERIFIED | `categories.py:91` `_refresh_embedding(category_id, name, user_id)`; `:117` `await set_tenant_scope(session, user_id)`; `:118` `upsert_category_embedding(..., user_id=user_id)`. RED→GREEN tests pass. |
| SC2b | **P1-2** double-post идемпотентен (FOR UPDATE + unique + 409) | ✓ VERIFIED | `subscriptions.py:402` `.with_for_update()`; `:438-446` `IntegrityError → rollback → SubscriptionAlreadyPostedError`; route `:247-251` → HTTP 409. Migration `0025_sub_posted_txn_uq` partial unique index. DB confirms `uq_subscription_posted_txn_id` present. double-post + savepoint tests pass. |
| SC2c | **P1-3** нет утечки error.localizedDescription в UI | ✓ VERIFIED | `APIError.userFacingRu` mapper (`APIError.swift:40,66`); grep `localizedDescription` in 6-file cluster → **0**; `userFacingRu` used 18× across Features. |
| SC2d | **P1-4/R2** Savings/GoalDetail API-seam + reload-coalesce + поведенческие тесты | ✓ VERIFIED (source) | `SavingsViewModel.swift:51` `struct API`, `:60` `static let live`, `:77` `init(api:)`, `:104,118,124` `reloadPending` coalesce. `GoalDetailViewModel.swift:35` `struct API`, `:68` `init(goalId:api:)`. Tests: 23 + 14 funcs. Dead `lastCreatedGoalId` removed (only a doc comment remains). |
| SC2e | **P1-5** SSE 401/403 согласованы с REST auth | ✓ VERIFIED | `SSEClient.swift:134-140` 401→onUnauthenticated+.unauthorized, 403→onUnauthenticated+.forbidden. |
| SC2f | **P1-7** APIClient auth/date regression-тесты | ✓ VERIFIED (source) | `URLProtocolStub.swift` + `APIClientForbiddenTests.swift` (4) + `APIClientDateDecodeTests.swift` (4). Production decoder pins `yyyy-MM-dd` → Europe/Moscow (`APIClient.swift:53-54`). |
| SC2g | **P1-6** web ui.theme key разведён | ✓ VERIFIED | `main.tsx:39` `SHELL_KEY='ui.shell'`, `:40` legacy migration shim; `useTheme.ts:31` `STORAGE_KEY='ui.theme'` (sole owner). |
| SC3a | **R1** дедуп account-label/banner/LocalNotifications + dead code | ✓ VERIFIED | `AccountPickerLogic.label` used in SavingsDepositSheet/SubscriptionsView/TransactionEditor; shared `MutationErrorBanner.swift`; `LocalNotifications` has exactly **1** `func reschedule`; dead lastCreatedGoalId removed. |
| SC3b | **R5** мёртвый web v06-shell разрешён | ✓ VERIFIED | `DEAD-SHELL-INVENTORY.md` — reachability analysis + KEEP decision (split key restored reachability; ~50-file deletion deferred to R6 owner call, documented). |
| SC3c | **R8** backend float→cents, get_db, MeResponse-билдер | ✓ VERIFIED | `ai_usage_log.cost_cents` BIGINT in DB (est_cost_usd Float gone); `spend_cap.py:118` `SUM(cost_cents)`; single `get_db` in `app.db.session`, re-exported by `dependencies.py:36`; `build_me_response` shared by GET+PATCH /me. KindStr alias retained (documented decision — active backward-compat import). |
| SC3d | **R9** docs multi-tenant | ✓ VERIFIED | `CLAUDE.md` + `docs/HLD.md` rewritten to "multi-tenant via RLS" (owner/member roles, set_tenant_scope, alembic 0008). |
| SC4 | **iOS build + suite зелёные; backend pytest зелёный; web build зелёный** | ? PARTIAL → human | Web build **exit 0** + vitest **738 passed (55 files)** verified live. Backend touched-module pytest **34 passed/1 skipped**, embedding/double-post/savepoint pass, DB at alembic head 0026. iOS 609-test suite **claimed** in 4 summaries but NOT independently runnable here → human verification. |
| P2 | **P2-1..13** spot-check | ✓ VERIFIED | P2-1 `patchAlreadyReloaded` single-reload; P2-2 `syncNextChargeDay` clamp 1...28; P2-3 `configInFlight` guard; P2-4 ChatRequest `Field(min_length=1,max_length=4000)`; P2-5 0.35 threshold + real confidence; P2-6 symmetric /me income_cents; P2-7 `_log_embedding_cost` to ai_usage_log; P2-8 useAiCategorize `cancelled` guard; P2-9 `parseWireDate` local parse; P2-10 single `parseMoney`/`parseRublesToKopecks`; P2-11 `window.alert`→Toast (0 alerts in screensV10); P2-12 `onNotificationLoadComplete` seam (0 sleep); P2-13 savepoint test. |
| EXCL | **R3/R4/R6/R7 correctly EXCLUDED (deferred)** | ✓ VERIFIED | 67-CONTEXT.md §"ВНЕ scope" + §deferred explicitly list R3/R4/R6/R7 as out-of-scope deferred (not silently dropped); ROADMAP Phase 67 goal echoes same exclusions. |

**Score:** 4/4 ROADMAP success criteria substantively verified in source + live build/test (SC4 iOS arm pending human run).

### Required Artifacts (spot-checked, all real)

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/api/routes/subscriptions.py` | V10 response_model | ✓ VERIFIED | 3 routes wired |
| `app/api/schemas/subscriptions.py` | SubscriptionReadV10 | ✓ VERIFIED | mixin composition |
| `app/api/routes/categories.py` | embedding user_id+scope | ✓ VERIFIED | lines 91/117/118 |
| `app/services/subscriptions.py` | FOR UPDATE + 409 | ✓ VERIFIED | lines 402/438 |
| `alembic/versions/0025_*.py` | partial unique index | ✓ VERIFIED | applied in DB |
| `alembic/versions/0026_*.py` | cost_cents BIGINT | ✓ VERIFIED | DB at head 0026 |
| `ios/.../APIClient.swift` | strict 403, MSK date | ✓ VERIFIED | no suppress flag |
| `ios/.../SSEClient.swift` | 401/403 split | ✓ VERIFIED | both logout |
| `ios/.../APIError.swift` | userFacingRu | ✓ VERIFIED | mapper present |
| `ios/.../Common/MutationErrorBanner.swift` | shared banner | ✓ VERIFIED | ViewModifier |
| `ios/.../Savings/{SavingsViewModel,GoalDetailViewModel}.swift` | API seam + coalesce | ✓ VERIFIED | struct API + reloadPending |
| `ios/BudgetPlannerTests/Networking/*` | URLProtocol regression | ✓ VERIFIED (source) | 3 test files + stub |
| `frontend/src/api/v10/analytics.ts` | AnalyticsRange import | ✓ VERIFIED | line 20 |
| `frontend/src/screensV10/Ai/AiView.tsx` | bottomRef type | ✓ VERIFIED | HTMLLIElement |
| `frontend/src/main.tsx` | ui.shell key | ✓ VERIFIED | + migration shim |
| `frontend/src/utils/{parseWireDate,parseMoney}.ts` | web utils | ✓ VERIFIED | + parseMoney.test.ts |
| `app/db/models.py`, `app/services/spend_cap.py` | cost_cents no-float | ✓ VERIFIED | est_cost_usd Float removed |
| `CLAUDE.md`, `docs/HLD.md` | multi-tenant docs | ✓ VERIFIED | RLS reframe |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Web production build (P0-2) | `npm run build` | exit 0, built in 260ms | ✓ PASS |
| Web vitest suite | `npx vitest run` | 738 passed (55 files) | ✓ PASS |
| Backend touched modules | `pytest test_subscriptions/test_me/test_ai_suggest/test_ai_usage_cost_cents` | 34 passed, 1 skipped | ✓ PASS |
| P1-1 embedding refresh | `pytest test_categories -k embed or refresh` | 1 passed | ✓ PASS |
| P1-2/P2-13 double-post + savepoint | `pytest test_subscriptions -k savepoint or double` | 2 passed | ✓ PASS |
| DB migration chain | `SELECT version_num FROM alembic_version` | 0026_ai_usage_cost_cents | ✓ PASS |
| DB partial unique index | `pg_indexes` | uq_subscription_posted_txn_id present | ✓ PASS |
| DB cost_cents column | `information_schema.columns` | cost_cents bigint (est_cost_usd gone) | ✓ PASS |
| iOS 609-test suite | `xcodebuild test` | not runnable in env | ? SKIP → human |

### Deferred / Pre-existing Failures (NOT phase-67 gaps)

Confirmed orthogonal to phase-67 changes (logged in `deferred-items.md`):
- `test_categories.py::test_seed_creates_14_categories` — `POST /onboarding/complete` 422 (onboarding schema), NOT in embedding/double-post code. Reproduced: pre-existing baseline.
- `test_ai_cap_integration.py` (3) + `test_spend_cap_concurrent.py` (2) — 429 expected, 402 PRO_TIER_REQUIRED. Root cause: `require_pro` (Phase 35, last edited e161686) fires before `enforce_spending_cap`. 67-08's `dependencies.py` diff was the get_db re-export only — require_pro/dep-order untouched. Pre-existing.
- `test_e2e_multi_user_lifecycle.py` (4) — `category.code` NOT NULL seed-helper mismatch, before the ai_usage_log line 67-08 edited. Pre-existing.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `ios/.../Endpoints/AISuggestCategoryAPI.swift` | 23 | Stale doc comment "0.5 threshold" (backend is 0.35 post-P2-5) | ℹ️ Info | Comment-only drift in a non-P2-5 file; no functional impact. The functional comment at line 10 correctly states require_pro=402. Cosmetic. |

No blocker or warning anti-patterns. No stubs, no hardcoded-empty data, no placeholder returns. All grep-confirmed "0 matches" gates (suppressForbiddenHandler, localizedDescription cluster, window.alert) pass.

### Human Verification Required

#### 1. iOS full test suite

**Test:** `cd ios && xcodegen generate && xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`
**Expected:** Build Succeeded; **609 tests, 0 failures**, including the new suites SavingsViewModelTests / GoalDetailViewModelTests / APIClientForbiddenTests / APIClientDateDecodeTests / APIErrorMapperTests and the de-flaked `test_notificationTxnCreated_triggersLoad`.
**Why human:** The iOS compile+run gate cannot be executed in this verification environment (no XcodeBuildMCP session available; a full simulator build exceeds the verifier's time/tooling bounds). Every test source file is present on disk and every production seam they exercise (API struct, reloadPending, strict 403, SSE split, userFacingRu, configInFlight, onNotificationLoadComplete, MSK date pin) is verified in source. Only the live green-suite confirmation remains. The four iOS summaries consistently report 609/0; this is a confirmation, not a discovery.

### Gaps Summary

No in-scope review-doc item is missing or broken. All P0 (3), P1 (7), P2 (13), and cleanup R1/R2/R5/R8/R9 closures were spot-checked against current source and confirmed real — not just SUMMARY claims. Two cross-stack gates were executed live and pass: web build (exit 0) + vitest (738), backend touched-module pytest (34) + embedding/double-post/savepoint + DB migration head 0026 with both new schema objects present. R3/R4/R6/R7 are correctly documented as deferred (not dropped). The only unverified item is the iOS 609-test suite, which is not runnable here and is routed to human verification. The single anti-pattern (stale "0.5" iOS doc comment) is cosmetic and not a gap.

---

_Verified: 2026-05-20T18:05:00Z_
_Verifier: Claude (gsd-verifier)_
