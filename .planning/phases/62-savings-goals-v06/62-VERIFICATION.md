---
phase: 62-savings-goals-v06
verified: 2026-05-20T00:00:00Z
status: gaps_found
score: 2/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "GoalDetailView показывает детали цели (name + progress + cents/target + due) + Deposit CTA + delete Menu"
    status: failed
    reason: "GoalDetailView — чистый stub из 62-01. body показывает только бесконечный ProgressView(\"Загрузка…\"); GoalDetailViewModel.load() — пустой no-op (тело «Plan 62-03 fills this body»), deleteGoal() возвращает false без вызова GoalsAPI.delete. Push с master list работает, но открывается пустой загрузочный экран навсегда."
    artifacts:
      - path: "ios/BudgetPlanner/Features/Savings/GoalDetailView.swift"
        issue: "body = List { ProgressView(\"Загрузка…\") }; нет Hero/progress/cents/due/Deposit CTA/delete Menu"
      - path: "ios/BudgetPlanner/Features/Savings/GoalDetailViewModel.swift"
        issue: "load() пустой no-op (комментарий «Plan 62-03 fills this body»); deleteGoal() возвращает false без сетевого вызова; goal остаётся nil"
    missing:
      - "GoalDetailViewModel.load() — fetch цели (GoalsAPI.list + filter по goalId или dedicated endpoint) + accounts (AccountsAPI.list), set goal/accounts/status"
      - "GoalDetailViewModel.deleteGoal() — GoalsAPI.delete(id:) с submitting guard + filtered Russian copy"
      - "GoalDetailView body — Hero (name + ProgressView + currentCents/targetCents + percentage + due) + «Пополнить» CTA + delete Menu с confirmationDialog + loading/error states"
  - truth: "NewGoalSheet (Form) даёт создать цель: name + targetCents (MoneyParser) + optional due (DatePicker)"
    status: failed
    reason: "SavingsNewGoalSheet — stub из 62-01. body показывает буквальный текст «Plan 62-03 заполнит этот sheet» внутри Form; нет ни одного поля ввода и нет кнопки «Создать». Sheet презентуется из SavingsView Menu «Новая цель», closure onCreate проброшен в рабочий VM.createGoal, но пользователь не может ничего ввести — единственное действие «Отмена»."
    artifacts:
      - path: "ios/BudgetPlanner/Features/Savings/SavingsNewGoalSheet.swift"
        issue: "body = Form { Text(\"Plan 62-03 заполнит этот sheet\") }; нет TextField name, нет MoneyParser target, нет DatePicker due, нет кнопки «Создать»"
    missing:
      - "Form body: TextField «Название» (trim ≥1 char), TextField .decimalPad «Целевая сумма» через MoneyParser → cents (≥1 ₽), Toggle+DatePicker optional due"
      - "Toolbar «Создать» в .confirmationAction, disabled !canCreate || submitting, вызов onCreate; inline-обработка failure"
  - truth: "DepositSheet (Form) даёт пополнить: amount (MoneyParser) + accountId (Picker required) + optional goalId (Picker, pre-filled)"
    status: failed
    reason: "SavingsDepositSheet — stub из 62-01. body показывает буквальный текст «Plan 62-03 заполнит этот sheet»; нет полей amount/account/goal Picker. Sheet презентуется из Menu «Пополнить» и из (будущего) GoalDetail flow, closure onDeposit проброшен в рабочий VM.deposit, но ввод невозможен."
    artifacts:
      - path: "ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift"
        issue: "body = Form { Text(\"Plan 62-03 заполнит этот sheet\") }; нет Picker цели, нет MoneyParser amount, нет Picker счёта, нет кнопки «Пополнить»"
    missing:
      - "Form body: optional goal Picker (pre-filled initialGoalId), TextField .decimalPad amount → cents (>0), required account Picker (accounts)"
      - "Toolbar «Пополнить» в .confirmationAction disabled !canDeposit, вызов onDeposit; inline-обработка failure"
  - truth: "Phase 62 doбавляет недостающий 62-03 plan ИЛИ 62-02 расширен, чтобы покрыть GoalDetailView + 2 sheet — phase закрыта без этого плана"
    status: failed
    reason: "Структурный gap: оба SUMMARY (62-01, 62-02) откладывают GoalDetailView + SavingsNewGoalSheet + SavingsDepositSheet на «scope 62-03», но файла 62-03-PLAN.md НЕ существует. Phase имеет ровно 2 плана. 3 из 4 ROADMAP-deliverables ссылаются на несуществующий план — work не deferred (нет later phase, покрывающей Savings goal detail/sheets: Phase 63=Subscriptions, Phase 64=AddSheet), а просто пропущен."
    artifacts:
      - path: ".planning/phases/62-savings-goals-v06/"
        issue: "Только 62-01-PLAN.md и 62-02-PLAN.md; 62-03-PLAN.md отсутствует, хотя оба SUMMARY на него ссылаются как на scope для 3 deliverables"
    missing:
      - "Добавить 62-03-PLAN.md (GoalDetailViewModel.load/delete + GoalDetailView body + 2 Form sheet bodies + VM/sheet validation tests) ИЛИ перепланировать scope. Phase 62 не может быть закрыта как достигшая ROADMAP-goal без этого."
human_verification:
  - test: "Tap Управление → Копилка → master list рендерит Hero/Roundup/Goals с progress bar на реальных данных"
    expected: "Список целей с зелёным прогресс-баром, процентами, due-датами; пустое состояние ContentUnavailableView «Нет целей»"
    why_human: "Визуальный рендер и реальный API-фетч требуют запущенного backend + симулятора; verifier не запускает приложение"
  - test: "Swipe-to-delete на goal row → confirmationDialog «Удалить цель?» → подтверждение удаляет цель и список обновляется"
    expected: "Диалог появляется, удаление вызывает GoalsAPI.delete и reload"
    why_human: "Runtime-поведение + сетевой mutation требуют live-окружения"
---

# Phase 62: Savings & Goals (v06 native) Verification Report

**Phase Goal:** Копилка. Список целей (List с прогресс-баром), GoalDetailView, NewGoalSheet (Form), DepositSheet (Form). API: GoalsAPI.
**Verified:** 2026-05-20
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The ROADMAP goal enumerates **four** user-facing deliverables plus the GoalsAPI dependency. Only **one** of the four (the master list) is functionally implemented. The other three (GoalDetailView, NewGoalSheet, DepositSheet) remain the literal 62-01 scaffold stubs, deferred in both SUMMARYs to a "Plan 62-03" that **does not exist**. The phase has exactly two plans (62-01 scaffold, 62-02 core logic of the master view only).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Список целей — List с прогресс-баром (master SavingsView) | ✓ VERIFIED | `SavingsView.swift` полностью реализован: 4 render-state, Hero/Roundup/Goals sections, `SavingsGoalRow` с `ProgressView(value:total:).tint(.green)` + percentage + due, swipe-to-delete + confirmationDialog, Menu toolbar, navigationDestination, sheet bindings. VM `load()`/`createGoal`/`deleteGoal`/`deposit`/`toggleRoundup`/`selectBase` все вызывают реальные API (SavingsAPI/GoalsAPI/AccountsAPI) + `await load()`. 32 unit-теста pass. |
| 2 | GoalDetailView (detail: hero + progress + delete + Deposit CTA) | ✗ FAILED | `GoalDetailView.swift` body = `List { ProgressView("Загрузка…") }`. `GoalDetailViewModel.load()` — пустой no-op; `deleteGoal()` возвращает false без сетевого вызова. Push открывает вечный спиннер. |
| 3 | NewGoalSheet (Form: name + target + due) | ✗ FAILED | `SavingsNewGoalSheet.swift` body = `Form { Text("Plan 62-03 заполнит этот sheet") }`. Нет полей ввода, нет кнопки «Создать». |
| 4 | DepositSheet (Form: amount + account + goal) | ✗ FAILED | `SavingsDepositSheet.swift` body = `Form { Text("Plan 62-03 заполнит этот sheet") }`. Нет полей, нет кнопки «Пополнить». |

**Score:** 2/4 truths verified (truth 1 + GoalsAPI dependency = 2 of 4 weighted items; 3 of the 4 ROADMAP deliverables FAILED).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Features/Management/ManagementView.swift` | `.savings` enum + entry «Копилка» + destination | ✓ VERIFIED | line 136 enum case, line 155-157 entry (`banknote.fill`, ownerOnly:false), line 118 `case .savings: SavingsView()` |
| `Features/Savings/SavingsView.swift` | Functional master list с progress bar | ✓ VERIFIED | 348 lines; полный body + SavingsGoalRow ProgressView |
| `Features/Savings/SavingsViewModel.swift` | load + 5 mutations, wired to APIs | ✓ VERIFIED | 223 lines; async let parallel fetch, все mutations → API + reload |
| `Features/Savings/SavingsViewData.swift` | 5 pure helpers | ✓ VERIFIED | 100 lines; progressPercentage/formatDue/sortGoalsForDisplay/isValidGoalDraft/isValidDepositDraft |
| `Networking/Endpoints/GoalsAPI.swift` | list/create/delete | ✓ VERIFIED | enum GoalsAPI, list/create/delete присутствуют |
| `Features/Savings/GoalDetailView.swift` | Detail с hero/progress/delete/CTA | ✗ STUB | placeholder ProgressView; no detail body |
| `Features/Savings/GoalDetailViewModel.swift` | load + delete wired | ✗ STUB | load() no-op, deleteGoal() returns false |
| `Features/Savings/SavingsNewGoalSheet.swift` | Form name/target/due + Создать | ✗ STUB | литерал «Plan 62-03 заполнит этот sheet» |
| `Features/Savings/SavingsDepositSheet.swift` | Form amount/account/goal + Пополнить | ✗ STUB | литерал «Plan 62-03 заполнит этот sheet» |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ManagementView.destination | SavingsView | case .savings | ✓ WIRED | line 118 |
| SavingsViewModel.load | SavingsAPI.summary + AccountsAPI.list | async let parallel | ✓ WIRED | lines 71-72 |
| SavingsViewModel.createGoal/deleteGoal | GoalsAPI.create/delete | request + reload | ✓ WIRED | lines 141, 165 |
| SavingsViewModel.deposit | SavingsAPI.postDeposit | POST + reload | ✓ WIRED | line 183 |
| SavingsView | SavingsNewGoalSheet | .sheet(newGoal) | ⚠️ WIRED-TO-STUB | sheet презентуется, но body — placeholder; onCreate closure ведёт в рабочий VM, но ввод невозможен |
| SavingsView | SavingsDepositSheet | .sheet(deposit) | ⚠️ WIRED-TO-STUB | sheet презентуется, но body — placeholder |
| SavingsView | GoalDetailView | navigationDestination(SavingsRoute) | ⚠️ WIRED-TO-STUB | push работает, но GoalDetailView — вечный спиннер |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| SavingsView | viewModel.snapshot/goals/accounts | SavingsAPI.summary + AccountsAPI.list via load() | Yes (real API) | ✓ FLOWING |
| GoalDetailView | viewModel.goal | load() no-op | No (goal stays nil) | ✗ DISCONNECTED |
| SavingsNewGoalSheet | (none — no inputs) | — | No | ✗ HOLLOW (no fields) |
| SavingsDepositSheet | (none — no inputs) | — | No | ✗ HOLLOW (no fields) |

### Behavioral Spot-Checks

SKIPPED для runtime-поведения (требует симулятора + backend). Build/test статус взят из 62-02-SUMMARY (BUILD SUCCEEDED, 32 tests pass) — не перепроверялся, но не влияет на goal-gap: stubs компилируются именно потому, что они stubs.

### Requirements Coverage

Milestone v1.1.2 использует CONTEXT-derived scope (нет REQ-ID в REQUIREMENTS.md). Покрытие против CONTEXT in-scope:

| CONTEXT in-scope item | Status | Evidence |
|----------------------|--------|----------|
| ManagementItem registration | ✓ SATISFIED | ManagementView wired |
| SavingsView master (Hero+Roundup+Goals+progress) | ✓ SATISFIED | full body |
| GoalDetailView (push, hero, delete, CTA) | ✗ BLOCKED | stub |
| NewGoalSheet (Form name/target/due) | ✗ BLOCKED | stub |
| DepositSheet (Form amount/account/goal) | ✗ BLOCKED | stub |
| GoalsAPI list/create/delete | ✓ SATISFIED | exists, wired |
| Roundup toggle + segmented base | ✓ SATISFIED | roundupSection |
| Swipe-to-delete + confirmationDialog | ✓ SATISFIED | goalsSection |
| Pre-filled DepositSheet flow | ✗ BLOCKED | sheet stub (initialGoalId проброшен, но нет UI) |
| ViewModel tests для всех 4 экранов | ✗ PARTIAL | только Savings master VM + helpers; GoalDetailVM/sheet validation — 0 tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| GoalDetailViewModel.swift | 42-44 | `func load() async { }` no-op | 🛑 Blocker | detail screen не загружает данные |
| GoalDetailViewModel.swift | 47-50 | `deleteGoal() { return false }` | 🛑 Blocker | удаление из detail не работает |
| SavingsNewGoalSheet.swift | 21 | placeholder text «Plan 62-03 заполнит этот sheet» | 🛑 Blocker | создание цели невозможно |
| SavingsDepositSheet.swift | 23 | placeholder text «Plan 62-03 заполнит этот sheet» | 🛑 Blocker | пополнение невозможно |
| (phase dir) | — | ссылки на несуществующий 62-03 plan в обоих SUMMARY | 🛑 Blocker | scope пропущен, не deferred |

### Code Review (62-REVIEW.md) Cross-Check

62-REVIEW.md: 0 critical, 6 warnings, 4 info. Оценка против goal achievement:

- **WR-01..WR-04, WR-06** — quality/robustness дефекты в реализованном master VM/View (stale banner, sheet dismiss on failure, inFlight race, redundant PATCH, missing mutation tests). Это **polish**, не блокируют goal master-list deliverable (он функционален). Рекомендованы к фиксу, но не gate.
- **WR-05** (`accountId == 0` проходит валидацию) — реальный баг, но проявляется только при работающем DepositSheet, который **сам по себе stub** → перекрыт более крупным gap (truth 4).
- **IN-01** (dead goalId в GoalDetailView) — внутри stub-файла, разрешится при реализации detail.
- **IN-04** (UTC due date shift) — латентный, всплывёт при реализации NewGoalSheet DatePicker (truth 3) — связан с тем же missing scope.

Вывод: ни один REVIEW-warning не является самостоятельным gate; реальные блокеры — отсутствующие 3 deliverables, не качество кода.

### Gaps Summary

Phase 62 поставляет **1 из 4** ROADMAP-deliverables: функциональный master-список «Копилка» с прогресс-баром (отлично сделан, wired к реальным API, покрыт тестами). Однако **GoalDetailView, NewGoalSheet и DepositSheet** остаются буквальными stub-заглушками из 62-01 — два sheet показывают текст «Plan 62-03 заполнит этот sheet», а GoalDetailView — вечный спиннер с no-op `load()`.

Корневая причина — структурная: оба SUMMARY откладывают эти три экрана на «scope 62-03», но **62-03-PLAN.md не существует** и phase имеет ровно 2 плана. Это не deferred work — ни одна последующая фаза milestone (Phase 63 = Subscriptions, Phase 64 = AddSheet) не покрывает Savings goal detail/sheets. Work просто пропущен.

Критично с точки зрения UX: stubs **достижимы** из рабочего master-списка. Tap «Новая цель» / «Пополнить» / любой goal-row выводит пользователя на нефункциональный placeholder. Master VM создан с рабочими createGoal/deposit closures, но без UI-ввода они недостижимы — половина копилки (постановка целей и пополнение) недоступна конечному пользователю.

**Рекомендация:** не закрывать Phase 62 как достигшую goal. Создать 62-03-PLAN.md (GoalDetailViewModel.load/delete + GoalDetailView body + два Form sheet bodies + тесты), затем re-verify. Если намеренно решено сузить scope Phase 62 только до master-списка — это требует override с явным пересмотром ROADMAP-goal, т.к. текущая формулировка goal перечисляет все четыре экрана.

---

_Verified: 2026-05-20_
_Verifier: Claude (gsd-verifier)_
