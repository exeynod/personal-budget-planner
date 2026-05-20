---
status: partial
phase: 62-savings-goals-v06
source: [62-VERIFICATION.md]
started: 2026-05-20
updated: 2026-05-20
---

## Current Test

[awaiting human testing — live backend + simulator]

## Tests

### 1. GoalDetailView load round-trip
expected: Tap Управление → Копилка → master list → tap goal-row → GoalDetailView рендерит реальную цель (Hero: name + зелёный ProgressView + cents/target + percentage + due), НЕ бесконечный спиннер; .ready state.
result: [pending]

### 2. GoalDetailView delete
expected: … Menu → «Удалить цель» → confirmationDialog → «Удалить» → GoalsAPI.delete → на success экран dismiss; на failure — mutationError banner.
result: [pending]

### 3. GoalDetailView deposit CTA
expected: «Пополнить» → pre-filled SavingsDepositSheet (цель preselected) → сумма + счёт → «Пополнить» → success обновляет hero/progress. Депозит через viewModel.deposit (submitting guard, CR-01); double-tap заблокирован.
result: [pending]

### 4. NewGoalSheet create + due-day correctness
expected: Menu «Новая цель» → Form name + target + optional due (DatePicker) → «Создать» → цель создаётся; due-дата на бэкенде == выбранный календарный день (MSK, без off-by-one, IN-04).
result: [pending]

### 5. Deposit validation disabled-state
expected: DepositSheet без выбранного счёта или сумма 0 → кнопка «Пополнить» disabled (canDeposit gate: amount>0 && accountId>0, WR-05).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
