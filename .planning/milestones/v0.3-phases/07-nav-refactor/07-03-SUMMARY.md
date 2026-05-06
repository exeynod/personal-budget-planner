---
phase: 07-nav-refactor
plan: "03"
subsystem: frontend
tags: [screens, transactions, subtab, filter-chips, fab]
dependency_graph:
  requires: ["07-02"]
  provides: ["TransactionsScreen", "HistoryView", "PlannedView"]
  affects: ["frontend/src/screens"]
tech_stack:
  added: []
  patterns: ["forwardRef + useImperativeHandle для межкомпонентного управления FAB", "filter chips горизонтальный скролл"]
key_files:
  created:
    - frontend/src/screens/HistoryView.tsx
    - frontend/src/screens/HistoryView.module.css
    - frontend/src/screens/PlannedView.tsx
    - frontend/src/screens/PlannedView.module.css
    - frontend/src/screens/TransactionsScreen.tsx
    - frontend/src/screens/TransactionsScreen.module.css
  modified: []
decisions:
  - "HistoryView использует forwardRef + useImperativeHandle чтобы TransactionsScreen управлял FAB-открытием sheet"
  - "PlannedView аналогично — PlannedViewHandle { openCreateSheet() }"
  - "inTransactions prop переключает между .root (full-screen) и .rootInner (встроенный контейнер без min-height)"
  - "kindFilter сбрасывается до 'all' при переключении между под-табами"
  - "Старые ActualScreen.tsx и PlannedScreen.tsx НЕ удалены — удалятся в Plan 05"
metrics:
  duration_minutes: 3
  completed_date: "2026-05-05"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 0
---

# Phase 7 Plan 03: Transactions Screen Summary

**One-liner:** TransactionsScreen с SubTabBar История/План, filter chips Все/Расходы/Доходы, context-aware FAB через forwardRef на HistoryView + PlannedView.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | HistoryView (рефакторинг ActualScreen) | 277bb96 | HistoryView.tsx, HistoryView.module.css |
| 2 | PlannedView + TransactionsScreen | 131c537 | PlannedView.tsx, PlannedView.module.css, TransactionsScreen.tsx, TransactionsScreen.module.css |

## What Was Built

### HistoryView.tsx
- Рефакторинг `ActualScreen` с сохранением всей бизнес-логики
- `inTransactions?: boolean` — переключает рендер header; при `true` используется `.rootInner` без `min-height: 100dvh`
- `activeKindFilter?: 'all' | 'expense' | 'income'` — фильтрация списка транзакций по типу
- `groupByDate()` расширен: добавлен `totalCents` = сумма `amount_cents` расходов за день; отображается в day-header
- `forwardRef + useImperativeHandle` → `HistoryViewHandle { openCreateSheet() }` для управления из TransactionsScreen
- FAB убран из HistoryView — управляется TransactionsScreen через ref

### PlannedView.tsx
- Рефакторинг `PlannedScreen` с сохранением всей бизнес-логики (applyTemplate, snapshotFromPeriod, PlanGroupView)
- `inTransactions?: boolean` — скрывает ScreenHeader
- `onBack` сделан optional (не нужен внутри TransactionsScreen)
- `forwardRef + useImperativeHandle` → `PlannedViewHandle { openCreateSheet() }`
- FAB убран — управляется TransactionsScreen

### TransactionsScreen.tsx
- `SubTabBar` с под-табами `{ id: 'history', label: 'История' }` и `{ id: 'plan', label: 'План' }`
- Filter chips: горизонтальный скролл с Все / Расходы / Доходы + все категории через `useCategories`
- `kindFilter` передаётся в `HistoryView` как `activeKindFilter`; сбрасывается при смене под-таба
- Context-aware FAB: `historyRef.current?.openCreateSheet()` или `plannedRef.current?.openCreateSheet()`
- `ariaLabel` FAB меняется в зависимости от активного под-таба

## Verification Results

```
TypeScript: 0 errors (npx tsc --noEmit)
ActualScreen.tsx: НЕ удалён (будет в Plan 05)
PlannedScreen.tsx: НЕ удалён (будет в Plan 05)
```

### Acceptance Criteria Check

| Criteria | Result |
|----------|--------|
| export HistoryView | 3 совпадения (тип Handle, интерфейс Props, компонент) |
| inTransactions в HistoryView | 4 вхождения |
| totalCents в HistoryView | 4 вхождения |
| activeKindFilter в HistoryView | 4 вхождения |
| forwardRef/useImperativeHandle в HistoryView | 3 вхождения |
| .dateTotal в HistoryView.module.css | 1 |
| export PlannedView | 3 совпадения |
| inTransactions в PlannedView | 5 вхождений |
| forwardRef/useImperativeHandle в PlannedView | 3 вхождения |
| export TransactionsScreen | 2 (interface + function) |
| SubTabBar в TransactionsScreen | 2 вхождения |
| kindFilter/KindFilter в TransactionsScreen | 7 вхождений |
| chipActive в CSS | 1 |
| overflow-x: auto в CSS | 1 |

## Deviations from Plan

None — план выполнен точно как написан.

## Known Stubs

- `onClick={() => {/* категориальная фильтрация — Phase 7 discretion */}}` в TransactionsScreen для категориальных чипов — намеренный stub, категории видны но фильтрации нет (задача plan 05 или discretion по контексту Phase 7)

## Threat Flags

Нет новых незапланированных угроз. Все мутации через API с HMAC-валидацией. FilterState локален в компоненте (не URL параметры).

## Self-Check: PASSED

- frontend/src/screens/HistoryView.tsx — FOUND
- frontend/src/screens/HistoryView.module.css — FOUND
- frontend/src/screens/PlannedView.tsx — FOUND
- frontend/src/screens/PlannedView.module.css — FOUND
- frontend/src/screens/TransactionsScreen.tsx — FOUND
- frontend/src/screens/TransactionsScreen.module.css — FOUND
- Commit 277bb96 — FOUND
- Commit 131c537 — FOUND
