---
status: partial
phase: 64-addsheet-v06
source: [64-VERIFICATION.md]
started: 2026-05-20
updated: 2026-05-20
---

## Current Test

[awaiting human testing — live backend + simulator/device, Pro + non-Pro accounts]

## Tests

### 1. AI category chip (Pro)
expected: В TransactionEditor (create) ввести описание ≥3 символов → через ~500ms появляется chip «AI: <категория>» (confidence≥0.5) → tap проставляет категорию (только если она есть локально). Стейл-ответ не перетирает более новый.
result: [pending]

### 2. Account Picker save round-trip
expected: actual create/edit → секция «Счёт списания» (default primary) → выбор счёта или «Не указан» → сохранение; account_id уходит на бэкенд (или отсутствует при nil, без null).
result: [pending]

### 3. Non-Pro 403 silent (no logout)
expected: на non-Pro аккаунте AI-подсказка просто не появляется; 403 НЕ логаутит пользователя; никакого error-баннера. (genuine 401/expired-token при этом всё ещё логаутит.)
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
