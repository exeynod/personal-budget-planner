---
phase: 60
title: Accounts (v06 native, новый домен) — Verification
status: passed
human_smoke_status: auto-approved-deferred
verified: 2026-05-12T12:20:00Z
plans:
  - 60-01
  - 60-02
  - 60-03
  - 60-04
must_haves_covered: all
threats_covered:
  - T-60-01
  - T-60-02
  - T-60-03
---

# Phase 60 — Accounts (v06 native) — Verification

**Status:** ✅ **PASSED**
**Date:** 2026-05-12
**Verifier:** Claude Opus 4.7 (1M context) — executor agent under autonomous wave 4 with user override (auto-approved smoke)

## Plans Closed

| Plan  | Title                                                           | Status   | Commits | Files Δ  |
| ----- | --------------------------------------------------------------- | -------- | ------- | -------- |
| 60-01 | ManagementItem.accounts registration + scaffold files           | complete | 2       | 1M / 5C  |
| 60-02 | AccountsViewModel.load + AccountsView body + tests              | complete | 3       | 2M / 1C  |
| 60-03 | AccountsNewSheet Form + createAccount + scroll-to-new + tests   | complete | 4       | 3M / 1C  |
| 60-04 | AccountDetailViewModel.load + AccountDetailView body + tests    | complete | 3       | 2M / 1C  |

**Total deliverables:**
- 12 commits (feat × 8, test × 2, docs × 2 implied within executor SUMMARIES)
- 8 files created (5 stubs filled with body) + 4 modified
- 32/32 unit tests pass (AccountsVM 9 + NewSheetValidation 14 + AccountDetailVM 9)
- 0 build warnings new
- 0 coexistence violations (FeaturesV10/* + MainShell.swift untouched)

## Must-Haves Verification

### Plan 60-01 — Scaffolding (`v1.1.2-60-CONTEXT-area-1-navigation`)
- [x] `ManagementItem.ID.accounts` enum case добавлен (между `.template` и `.categories` — CONTEXT D-1).
- [x] `ManagementItem.all` entry «Счета» с creditcard.fill icon, ownerOnly: false.
- [x] `ManagementView.destination(for:.accounts) → AccountsView()` dispatch.
- [x] 5 stub-файлов в `Features/Accounts/`: AccountsView, AccountsViewModel, AccountDetailView, AccountDetailViewModel, AccountsNewSheet.

### Plan 60-02 — AccountsView + load (`v1.1.2-60-CONTEXT-area-2-accounts-list`)
- [x] AccountsViewModel.load() с inFlight guard + Status state machine.
- [x] T-60-03 filtered Russian copy «Не удалось загрузить счета»; 0 `error.localizedDescription` occurrences.
- [x] AccountsView body — List(.insetGrouped) с 4 рендер-состояниями (loading / error / empty / ready).
- [x] Hero summary section: «Всего на счетах» + monospacedDigit sum + русская pluralization («счёт / счёта / счетов»).
- [x] «Счета» section с rows: kind icon (creditcard.fill / banknote / tray.full.fill) + bank + subtitle + balance + primary star.
- [x] Empty state: ContentUnavailableView «Нет счетов».
- [x] Toolbar `+` → opens AccountsNewSheet (Plan 60-03 fills body).
- [x] NavigationLink(value: Int) + .navigationDestination(for: Int.self) → AccountDetailView.
- [x] 9 unit tests pass.

### Plan 60-03 — NewAccountSheet + createAccount (`v1.1.2-60-CONTEXT-area-4-new-account-sheet`)
- [x] AccountsNewSheet native Form: Bank TextField + segmented Picker (AccountKind) + conditional Mask (только при .card) + MoneyParser balance + primary Toggle.
- [x] Live validation `canCreate`: bank.trim non-empty + (если .card) mask matches `^\d{4}$` + balance ≥0 + !submitting.
- [x] T-60-02 (mask injection): keystroke onChange filter `\.isNumber` + `prefix(4)`; backend defence-in-depth.
- [x] Submit «Создать» в `.confirmationAction` (label «Создание…» при submit, disabled по `canCreate`).
- [x] Cancel в `.cancellationAction` (disabled при submit).
- [x] AccountsViewModel.createAccount → AccountsAPI.create → load() refetch → lastCreatedAccountId = created.id → sheet = .none.
- [x] T-60-01 (primary race): backend serializes primary uniqueness в одной транзакции + sorted response.
- [x] T-60-03: filtered «Не удалось создать счёт» copy, raw error → print only.
- [x] AccountsView ScrollViewReader + .onChange(lastCreatedAccountId) → withAnimation easeInOut 0.3s scrollTo(.center) → clearLastCreatedAccountId().
- [x] createError inline banner Section в AccountsView (red triangle + xmark dismiss).
- [x] 14 unit tests pass для AccountsNewSheetValidation (canCreate matrix + normaliseMask).

### Plan 60-04 — AccountDetailView + load (`v1.1.2-60-CONTEXT-area-3-account-detail`)
- [x] AccountDetailViewModel.load() parallel-fetch accounts/categories → cross-tenant guard → sequential period (graceful 404) → actuals filtered via AccountsData.filterByAccount.
- [x] T-60-03 cross-tenant guard: «Счёт не найден» single message без existence leak.
- [x] T-60-03 outer catch: «Не удалось загрузить счёт» filtered copy.
- [x] dayGroups computed reuses TransactionsData.groupByDay (Europe/Moscow Calendar).
- [x] AccountDetailView Hero section: bank .title2 semibold + kindLabel («Карта»/«Наличные»/«Сбережения») + mask «•XXXX» + balance .title2.monospacedDigit + orange star.fill при primary.
- [x] History sections: day headers («Сегодня»/«Вчера»/«d мая» via V10Formatters.formatDay) + Σ sum trailing + ActualHistoryRow (description + categoryName + signed coloured amount + time HH:mm Europe/Moscow).
- [x] Empty history: ContentUnavailableView «Нет операций» / «В текущем периоде на этом счёте нет операций».
- [x] Toolbar только default Back (no Menu — CONTEXT D-3, нет API для actions).
- [x] 9 unit tests pass (initial state / categoryName / dayGroups (empty/sort/sum) / hasActuals / calendar TZ / backdoor / status equatable).

## Threat Coverage

### T-60-01 — Tampering: client-side primary race
**Disposition:** mitigate
**Mitigation:** AccountsViewModel.createAccount НЕ делает клиентский primary update других accounts. После POST → `await load()` refetches → backend сериализует primary uniqueness в одной транзакции и возвращает sorted list (`ORDER BY is_primary DESC, id ASC`).
**Status:** ✅ verified (Plan 60-03).

### T-60-02 — Tampering: mask injection
**Disposition:** mitigate
**Mitigation:** Tri-layer defence —
1. UI keystroke filter: `onChange { newVal in mask = newVal.filter(\.isNumber).prefix(4) }`.
2. Validation gate: `AccountsNewSheetValidation.canCreate` enforces `mask.count == 4 && mask.allSatisfy(\.isNumber)` при `kind == .card`.
3. Backend Pydantic `max_length=16` defence-in-depth.
**Status:** ✅ verified — 14 validation tests cover 3-digit / 5-digit / non-digit cases (Plan 60-03).

### T-60-03 — Information Disclosure: raw error leak / cross-tenant existence leak
**Disposition:** mitigate
**Mitigation:**
- Every load() / createAccount() catch блок set'ит `status` / `createError` к фиксированной Russian copy (filtered). Raw Swift error → ТОЛЬКО `print(...)` (Xcode console).
- AccountDetailViewModel cross-tenant guard: «account doesn't exist» и «account belongs to other user» collapsed в один user-facing message «Счёт не найден» — no existence leak.
- Grep gate verified: 0 occurrences of `error.localizedDescription` в всех 5 production files (AccountsViewModel, AccountsView, AccountsNewSheet, AccountDetailViewModel, AccountDetailView).
**Status:** ✅ verified в всех 4 plans.

## Coexistence Compliance

`git diff` для всех 4 plans подтверждает:

**Untouched** (compliance):
- `ios/BudgetPlanner/FeaturesV10/Accounts/*` (AccountsListV10View, AccountDetailV10View, NewAccountSheet poster-styled, AccountsListV10ViewModel, AccountDetailV10ViewModel) — 0 diff lines.
- `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift` — 0 diff (reused через static call).
- `ios/BudgetPlanner/FeaturesV10/Accounts/AccountsData.swift` — 0 diff (reused через static call).
- `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift` — 0 diff (reused).
- `ios/BudgetPlanner/MainShell.swift` — 0 diff (не добавляли 5-й tab).

**Touched** (intentional):
- `ios/BudgetPlanner/Features/Management/ManagementView.swift` — Plan 60-01 (3 правки: enum case + array entry + destination switch).
- `ios/BudgetPlanner/Features/Accounts/*` — 5 файлов (новый каталог, Plan 60-01 scaffold → Plan 60-02/03/04 body).
- `ios/BudgetPlannerTests/Features/Accounts/*` — 3 файла (Plan 60-02 AccountsViewModelTests + Plan 60-03 AccountsNewSheetValidationTests + Plan 60-04 AccountDetailViewModelTests).

## Build & Test Results

- `cd ios && make build` → **Build Succeeded** (0 errors, 0 new warnings).
- `xcodebuild test -only-testing:BudgetPlannerTests/AccountsViewModelTests` → **9/9 pass**.
- `xcodebuild test -only-testing:BudgetPlannerTests/AccountsNewSheetValidationTests` → **14/14 pass**.
- `xcodebuild test -only-testing:BudgetPlannerTests/AccountDetailViewModelTests` → **9/9 pass**.
- **Cumulative Phase 60:** 32/32 pass in 0.027s.

## Out-of-Scope Items (Deferred)

Per CONTEXT.md `<deferred>`:
- Update/Delete/SetPrimary endpoints — нет backend API; phase ждёт BE-deliverable.
- Transfer flow (DF-V11-01) — entire feature.
- History за все периоды — multi-period selector (DSH-06 / отдельный phase).
- HomeView v06 интеграция (primary account display) — отдельный future phase.
- Account-level statistics / chart — отдельный phase или Phase 27 analytics extension.
- Edit account name / mask после создания — нет backend.

## Manual Smoke Note

**Status:** `human_smoke_status: auto-approved-deferred` per user override (см. Plan 60-04 execution_context из spawn-prompt). Реальный manual smoke на симуляторе будет покрыт следующим production-run circuit'ом. Build clean + 32/32 unit tests pass + code review = достаточно для feature-complete signal.

## Conclusion

**Phase 60 — Accounts (v06 native) — feature complete и SHIPPED.**

Все 4 must-have areas (Navigation, AccountsList, AccountDetail, NewAccountSheet) реализованы; 3 threat mitigations verified; coexistence guards clean; 32 unit tests pass; build clean. Phase 60 готов к merge в master при следующем production deploy.

---

*Created: 2026-05-12T12:20:00Z*
*Phase: 60-accounts-v06*
*Verification status: ✅ PASSED*
