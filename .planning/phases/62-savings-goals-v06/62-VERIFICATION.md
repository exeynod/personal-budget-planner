---
phase: 62-savings-goals-v06
verified: 2026-05-20T15:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "GoalDetailView показывает детали цели (name + progress + cents/target + due) + Deposit CTA + delete Menu"
    - "NewGoalSheet (Form) даёт создать цель: name + targetCents (MoneyParser) + optional due (DatePicker)"
    - "DepositSheet (Form) даёт пополнить: amount (MoneyParser) + accountId (Picker required) + optional goalId (Picker, pre-filled)"
    - "Phase 62 добавляет недостающий 62-03 plan — phase закрыта без этого плана"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Tap Управление → Копилка → master list, затем tap goal-row → GoalDetailView LOADS реальную цель (Hero: name + зелёный ProgressView + cents/target + percentage + due), НЕ бесконечный спиннер"
    expected: "Detail-экран рендерит данные цели; .ready state, не вечный ProgressView()"
    why_human: "Runtime + реальный GoalsAPI.list/AccountsAPI.list фетч требуют запущенного backend + симулятора; verifier не запускает приложение. Код load() корректен (list+filter-by-id, status .ready), но live round-trip не перепроверяется автоматически."
  - test: "GoalDetailView → … Menu → «Удалить цель» → confirmationDialog «Удалить цель?» → «Удалить» → цель удаляется и экран dismiss'ится"
    expected: "Диалог появляется, deleteGoal() вызывает GoalsAPI.delete, на success dismiss(); на failure — mutationError banner"
    why_human: "Сетевой mutation + навигационный dismiss требуют live-окружения"
  - test: "GoalDetailView → «Пополнить» CTA → pre-filled SavingsDepositSheet (цель preselected) → ввод суммы + счёт → «Пополнить» → на success hero/progress обновляются"
    expected: "Депозит идёт через viewModel.deposit (submitting guard, CR-01), POST SavingsAPI.postDeposit + reload (T-62-05); double-tap заблокирован submitting"
    why_human: "Money-mutation round-trip + reload + submitting-guard поведение требуют live backend"
  - test: "Menu «Новая цель» → SavingsNewGoalSheet → ввод name + target + optional due (DatePicker) → «Создать» → цель создаётся; due-дата на бэкенде совпадает с выбранным днём (IN-04)"
    expected: "createGoal POST с yyyy-MM-dd == выбранный календарный день (MSK, без off-by-one)"
    why_human: "Wire-формат due проверен unit-тестом (WR-03), но end-to-end создание + появление цели в списке требует live backend"
  - test: "Master list / DepositSheet: попытка пополнить без выбранного счёта или с суммой 0 → кнопка «Пополнить» disabled"
    expected: "canDeposit gate (amount>0 && accountId>0, WR-05) держит кнопку disabled"
    why_human: "Логика gate покрыта unit-тестами (accountId 0/-3/nil → false), но визуальный disabled-state требует симулятора"
---

# Phase 62: Savings & Goals (v06 native) Verification Report

**Phase Goal:** Копилка. Список целей (List с прогресс-баром), GoalDetailView, NewGoalSheet (Form), DepositSheet (Form). API: GoalsAPI.
**Verified:** 2026-05-20
**Status:** human_needed
**Re-verification:** Yes — after gap closure (62-03 plan + follow-up code-fix pass CR-01/WR-01/WR-03/WR-04)

## Goal Achievement

Re-verification после gap-closure plan 62-03 + follow-up code-fix пасса. Предыдущая верификация (2/4) зафиксировала три stub-экрана (GoalDetailView вечный спиннер, два sheet с placeholder-текстом «Plan 62-03 заполнит этот sheet») и структурный gap (отсутствующий 62-03-PLAN.md). **Все четыре ROADMAP-deliverable теперь функциональны на уровне кода**, structural gap закрыт (62-03-PLAN.md создан и выполнен). Остаются только runtime/live-device smoke-проверки — они классифицированы как human_verification, НЕ как gaps.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Список целей — List с прогресс-баром (master SavingsView) | ✓ VERIFIED | `SavingsView.swift` без изменений (вне scope 62-03), остаётся функциональным: `SavingsGoalRow` line 324 `ProgressView(value:total:).tint(.green)` + `progressPercentage` (line 296). 4 render-state, swipe-to-delete, Menu toolbar, navigationDestination, sheet bindings. |
| 2 | GoalDetailView — load+render цели (не вечный спиннер) + delete + Deposit CTA | ✓ VERIFIED | `GoalDetailViewModel.load()` (lines 46-75) реализован: `inFlight` guard + `async let` parallel `GoalsAPI.list()` + `AccountsAPI.list()`, filter-by-goalId, `status = .ready`, cross-tenant → `.error("Цель не найдена")` (T-62-03), outer catch → `.error("Не удалось загрузить цель")`. `GoalDetailView.swift` (196 lines): 4-state List, heroSection (name + `ProgressView(value:total:).tint(.green)` line 151 + cents/target + percentage + due + achievement seal), `…` Menu → confirmationDialog (lines 74-87) → `deleteGoal()` → `dismiss()`. `deleteGoal()` (lines 103-117) вызывает `GoalsAPI.delete` за submitting guard. Placeholder спиннер УДАЛЁН. |
| 3 | NewGoalSheet (Form): name + targetCents (MoneyParser) + optional due (DatePicker) | ✓ VERIFIED | `SavingsNewGoalSheet.swift` (119 lines): Form с TextField «Название» (line 72), `.decimalPad` «Целевая сумма» → `MoneyParser.parseToCents` (line 50), Toggle «Добавить срок» + DatePicker (`minDueDate...` MSK, lines 87-96). Toolbar «Создать» (.confirmationAction, `disabled(!canCreate)`) → `onCreate(trimmedName, targetCents, hasDue ? dueDate : nil)`. Placeholder-текст УДАЛЁН. |
| 4 | DepositSheet (Form): amount (MoneyParser) + accountId (Picker required) + optional goalId (Picker, pre-filled) | ✓ VERIFIED | `SavingsDepositSheet.swift` (127 lines): init seeds `selectedGoalId` из `initialGoalId` + `selectedAccountId` из primary/first. Form: «Цель» Picker (nil=«Общая копилка»+goals, line 74), `.decimalPad` «Сумма» → MoneyParser (line 55), «Счёт списания» Picker required (line 93). Toolbar «Пополнить» (`disabled(!canDeposit)`) → `onDeposit(amountCents, acc, selectedGoalId)`. Placeholder-текст УДАЛЁН. |

**Score:** 4/4 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Features/Savings/SavingsView.swift` | Functional master list с progress bar (untouched) | ✓ VERIFIED | progress bar line 324, helpers line 296; вне scope 62-03 — нетронут |
| `Features/Savings/GoalDetailViewModel.swift` | load() + deleteGoal() + deposit() wired | ✓ VERIFIED | 139 lines; load() filter-by-id, deleteGoal()→GoalsAPI.delete, deposit()→SavingsAPI.postDeposit+reload, DEBUG backdoor |
| `Features/Savings/GoalDetailView.swift` | Hero/progress/delete Menu/Deposit CTA | ✓ VERIFIED | 196 lines; 4-state body, heroSection, confirmationDialog, pre-filled DepositSheet sheet |
| `Features/Savings/SavingsNewGoalSheet.swift` | Form name/target/due + Создать | ✓ VERIFIED | 119 lines; full Form + toolbar |
| `Features/Savings/SavingsDepositSheet.swift` | Form amount/account/goal + Пополнить | ✓ VERIFIED | 127 lines; full Form + init seeding + toolbar |
| `Features/Savings/SavingsViewData.swift` | helpers + WR-05 fix | ✓ VERIFIED | `isValidDepositDraft` line 101 `amountCents > 0 && accountId > 0` |
| `Networking/DTO/GoalDTO.swift` | GoalCreateRequest MSK due (IN-04) | ✓ VERIFIED | line 68 `TimeZone(identifier: "Europe/Moscow")`; UTC только как `??` fallback (3 совпадения Europe/Moscow) |
| `Networking/Endpoints/GoalsAPI.swift` | list/create/delete | ✓ VERIFIED | enum GoalsAPI; list (line 18), create (24), delete (31) |
| `BudgetPlannerTests/.../GoalDetailViewModelTests.swift` | VM unit tests ≥4 | ✓ VERIFIED | 113 lines; 6 tests (initial idle, ready-backdoor, clearMutationError, 2 deposit-guard, Status equality); registered in pbxproj (4 refs) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| GoalDetailViewModel.load | GoalsAPI.list + AccountsAPI.list | async let parallel | ✓ WIRED | lines 56-58 |
| GoalDetailViewModel.deleteGoal | GoalsAPI.delete | submitting guard + DELETE | ✓ WIRED | line 109 |
| GoalDetailViewModel.deposit | SavingsAPI.postDeposit | guard + POST + reload | ✓ WIRED | lines 91-94 (CR-01: deposit маршрутизируется через VM) |
| GoalDetailView «Пополнить» CTA | SavingsDepositSheet | .sheet(isPresented) pre-filled | ✓ WIRED | lines 88-106; onDeposit → viewModel.deposit (submitting guard) |
| GoalDetailView delete Menu | viewModel.deleteGoal | confirmationDialog → dismiss | ✓ WIRED | lines 74-87 |
| SavingsNewGoalSheet «Создать» | onCreate closure (→ SavingsViewModel.createGoal) | .confirmationAction | ✓ WIRED | line 109 |
| SavingsDepositSheet «Пополнить» | onDeposit closure | .confirmationAction | ✓ WIRED | line 115 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| GoalDetailView | viewModel.goal | load() → GoalsAPI.list filter-by-id | Yes (real API) | ✓ FLOWING |
| GoalDetailView | viewModel.accounts | load() → AccountsAPI.list | Yes (real API) | ✓ FLOWING |
| SavingsNewGoalSheet | name/targetText/dueDate → onCreate | local @State → real createGoal closure | Yes | ✓ FLOWING |
| SavingsDepositSheet | amountText/selectedAccountId/selectedGoalId → onDeposit | local @State (seeded from props) → real deposit closure | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

SKIPPED для runtime-поведения (требует симулятора + backend; verifier не запускает приложение). Статический анализ исходников выполнен:
- Нет placeholder-текста «Plan 62-03 заполнит/fills» (grep = 0).
- Нет no-op `func load() async {}` (grep = 0).
- Нет `ProgressView("Загрузка…")` placeholder (grep = 0).
- WR-05 `accountId > 0` присутствует (line 101).
- IN-04 `Europe/Moscow` в GoalDTO encoder (3 совпадения).
- `GoalsAPI.list|delete` в detail VM = 4 совпадения.

Build/test статус из 62-03-SUMMARY (BUILD SUCCEEDED, TEST SUCCEEDED, 488 tests) + follow-up code-fix commits (b86f77a CR-01/WR-01, ebea279 WR-03, 643e6ad WR-04, b4fcde1 IN-03 — добавили deposit-guard tests, ~494 итого). Расхождение 488→494 — это дополнительные тесты follow-up пасса, не регрессия. Не перепроверялся автоматически; компиляция подтверждена косвенно (отсутствие stub-маркеров + test file зарегистрирован в pbxproj).

### Requirements Coverage

Milestone v1.1.2 использует CONTEXT-derived scope. Покрытие против CONTEXT in-scope:

| CONTEXT in-scope item | Status | Evidence |
|----------------------|--------|----------|
| ManagementItem registration | ✓ SATISFIED | ManagementView wired (verified ранее) |
| SavingsView master (Hero+Roundup+Goals+progress) | ✓ SATISFIED | full body, нетронут |
| GoalDetailView (push, hero, delete, CTA) | ✓ SATISFIED | реализован 62-03 |
| NewGoalSheet (Form name/target/due) | ✓ SATISFIED | реализован 62-03 |
| DepositSheet (Form amount/account/goal) | ✓ SATISFIED | реализован 62-03 |
| GoalsAPI list/create/delete | ✓ SATISFIED | exists, wired |
| Roundup toggle + segmented base | ✓ SATISFIED | roundupSection |
| Swipe-to-delete + confirmationDialog | ✓ SATISFIED | goalsSection + GoalDetail Menu |
| Pre-filled DepositSheet flow | ✓ SATISFIED | GoalDetail CTA → initialGoalId проброшен + Picker pre-filled |
| ViewModel tests для всех 4 экранов | ✓ SATISFIED | Savings master VM + helpers + GoalDetailViewModelTests (6) + deposit-validation cases |

### Anti-Patterns Found

Нет блокеров. Все stub-маркеры из предыдущей верификации устранены.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | (нет) | — | — |

### Code Review Cross-Check (62-REVIEW + follow-up fixes)

- **CR-01** (blocker из 62-03-REVIEW: deposit обходил submitting guard) — ИСПРАВЛЕНО (commit b86f77a): GoalDetailView.onDeposit теперь вызывает `viewModel.deposit(...)` (lines 99-101), который имеет `guard !submitting` (VM line 85) + reload на success.
- **WR-01** (failure не surface'илась) — ИСПРАВЛЕНО: `viewModel.deposit` ставит `mutationError`, GoalDetailView рендерит mutationErrorBanner (lines 55-57, 113-132).
- **WR-03** (MSK due encoding pinned тестом) — commit ebea279.
- **WR-04** (DatePicker calendar = Europe/Moscow, matches encoder) — commit 643e6ad; SavingsNewGoalSheet mskCalendar lines 36-40.
- **WR-05** (accountId>0 gate) — ИСПРАВЛЕНО, SavingsViewData line 101 + tests.
- **IN-04** (MSK due-date wire) — ИСПРАВЛЕНО, GoalDTO line 68.
- **WR-02 / WR-06 и др.** (в master SavingsViewModel mutation paths) — остаются OPEN, вне scope 62-03 (objective явно запрещал трогать SavingsViewModel.swift). Это polish, не блокируют ROADMAP-goal — master deliverable функционален.

### Human Verification Required

Все 4 ROADMAP-deliverable функциональны на уровне кода. Остаются runtime/live-device smoke-проверки (не gaps):

1. **GoalDetailView загрузка** — tap goal-row → detail рендерит реальную цель (Hero), не вечный спиннер.
2. **Delete flow** — … Menu → «Удалить цель» → confirmationDialog → удаление + dismiss.
3. **Deposit flow** — «Пополнить» CTA → pre-filled sheet → POST + reload hero/progress; double-submit заблокирован.
4. **Create flow + due day** — «Новая цель» → создание; due на бэкенде == выбранный календарный день (IN-04).
5. **Validation gate** — «Пополнить» disabled без счёта / при сумме 0 (WR-05).

### Gaps Summary

**Нет gaps.** Все три ранее зафиксированных stub-экрана реализованы функционально (GoalDetailView 4-state + Hero + delete + Deposit CTA; SavingsNewGoalSheet полный Form; SavingsDepositSheet полный Form с pre-fill), structural gap (отсутствующий 62-03-PLAN.md) закрыт. Code-review блокер CR-01 + WR-01/WR-03/WR-04/WR-05/IN-04 исправлены follow-up пассом. GoalsAPI (list/create/delete) подтверждён. Score 4/4.

Статус **human_needed** (не passed), т.к. финальное подтверждение поведения (load round-trip, delete/deposit mutations, due-day на проде, disabled-states) требует запущенного backend + симулятора — verifier не запускает приложение. Это ожидаемо для iOS UI-фазы; ни один из этих пунктов не является кодовым gap.

---

_Re-verified: 2026-05-20_
_Verifier: Claude (gsd-verifier)_
