---
phase: "04-actual-transactions-and-bot-commands"
plan: "05"
subsystem: "frontend"
tags: ["frontend", "react", "typescript", "actual-transactions", "wave-3"]
dependency_graph:
  requires:
    - "04-03 (backend actual CRUD + balance endpoints)"
  provides:
    - "frontend/src/api/types.ts — EXTENDED with Phase 4 actual + balance types"
    - "frontend/src/api/actual.ts — listActual, createActual, updateActual, deleteActual, getBalance"
    - "frontend/src/hooks/useActual.ts — useActual(periodId) hook"
    - "frontend/src/components/ActualEditor.tsx — form for add/edit actual transaction"
    - "frontend/src/components/ActualEditor.module.css — segmented kind toggle + form styles"
    - "frontend/src/components/Fab.tsx — FAB floating action button"
    - "frontend/src/components/Fab.module.css — position fixed, circular, accent-colored"
  affects:
    - "04-06 (ActualScreen + HomeScreen integration — all building blocks ready)"
tech_stack:
  added: []
  patterns:
    - "Mirror pattern — useActual mirrors usePlanned API (cancellation guard, refetch, loading/error)"
    - "Kopeck helpers inline — parseRublesToKopecks / formatKopecksToRubles copied per D-63 (no shared util)"
    - "Kind-invalidation useEffect — switching expense/income resets categoryId if old cat was wrong kind"
    - "maxTxDateDefault — today+7d client-side guard (T-04-45 defence-in-depth)"
    - "canSubmit guard — amount > 0 && category selected && txDate non-empty (T-04-40 defence-in-depth)"
key_files:
  created:
    - "frontend/src/api/actual.ts"
    - "frontend/src/hooks/useActual.ts"
    - "frontend/src/components/ActualEditor.tsx"
    - "frontend/src/components/ActualEditor.module.css"
    - "frontend/src/components/Fab.tsx"
    - "frontend/src/components/Fab.module.css"
  modified:
    - "frontend/src/api/types.ts"
decisions:
  - "ActualEditorInitial and ActualEditorSavePayload exported as named interfaces (not inline anonymous types) for Plan 04-06 reuse"
  - "isEdit derived from onDelete !== undefined; JSX uses isEdit alone (not isEdit && onDelete) to avoid TS2774 error"
  - "maxTxDate prop nullable; fallback maxTxDateDefault() applied in JSX max attribute (T-04-45 client guard always active)"
  - "autoFocus on amount input in create mode (!isEdit) — accelerates entry flow per UI-SPEC"
metrics:
  duration: "20 minutes"
  completed_date: "2026-05-03"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 1
---

# Phase 4 Plan 05: Frontend Infrastructure (Wave 3) Summary

**One-liner:** 6 новых frontend модулей — TS типы ActualRead/BalanceResponse, apiFetch обёртки actual API, useActual hook с cancellation guard, ActualEditor форма с kind toggle + date guard, FAB компонент — всё готово для Plan 04-06 ActualScreen.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Phase 4 TS types, actual API wrappers, useActual hook | c213a38 | frontend/src/api/types.ts, actual.ts, hooks/useActual.ts |
| 2 | ActualEditor form component | 3d762ca | frontend/src/components/ActualEditor.tsx, .module.css |
| 3 | Fab floating action button | 0353a73 | frontend/src/components/Fab.tsx, .module.css |

## What Was Built

### frontend/src/api/types.ts — Extended (Phase 4 section)

Добавлены 6 типов в конец файла (после Phase 3 блока):
- `ActualSource` — `'mini_app' | 'bot'`
- `ActualRead` — mirrors backend ActualRead schema (id, period_id, kind, amount_cents, description, category_id, tx_date, source, created_at)
- `ActualCreatePayload` — kind + amount_cents + optional description + category_id + tx_date (required)
- `ActualUpdatePayload` — все поля optional (PATCH semantics)
- `BalanceCategoryRow` — строка по категории с planned/actual/delta_cents
- `BalanceResponse` — полный баланс периода включая by_category[]

### frontend/src/api/actual.ts — Новый

5 функций-обёрток над `apiFetch`:
- `listActual(periodId, filters?)` → GET /api/v1/periods/{id}/actual?kind=&category_id=
- `createActual(payload)` → POST /api/v1/actual
- `updateActual(id, patch)` → PATCH /api/v1/actual/{id}
- `deleteActual(id)` → DELETE /api/v1/actual/{id}
- `getBalance()` → GET /api/v1/actual/balance

### frontend/src/hooks/useActual.ts — Новый

Mirror `usePlanned` hook:
- Cancellation guard (`let cancelled = false` в useEffect) — T-04-44 mitigation
- `refetch()` callback для post-mutation reload
- `periodId === null` → пустой state, не запускает fetch
- Returns `{ rows, loading, error, refetch }`

### frontend/src/components/ActualEditor.tsx — Новый

Форма добавления/редактирования факт-транзакции:
- Kind toggle (segmented: Расход/Доход)
- Amount text input с `inputMode="decimal"`, parseRublesToKopecks helper
- Category select — filtered by current kind + non-archived (T-04-41 mitigation)
- useEffect сбрасывает categoryId если смена kind инвалидирует выбор
- Description textarea (max 500 chars)
- tx_date date input с `max={maxTxDate ?? maxTxDateDefault()}` (today+7d, T-04-45 mitigation)
- autoFocus на amount в create mode
- canSubmit guard: amount>0 && category set && txDate non-empty (T-04-40 mitigation)
- Edit mode (onDelete prop): кнопка "Удалить" + window.confirm
- Inline error display после неудачного save/delete

### frontend/src/components/ActualEditor.module.css — Новый

Полная палитра стилей:
- `.form`, `.field`, `.label` — flex column layout
- `.input`, `.select`, `.textarea` — uniform surface-2 styling
- `.actions` — flex-end с deleteBtn margin-right auto
- `.kindToggle`, `.kindBtn`, `.kindBtnActive` — segmented control

### frontend/src/components/Fab.tsx — Новый

Stateless FAB:
- Props: `onClick`, `ariaLabel`, `label` (default `'+'`)
- Один button с `className={styles.fab}`

### frontend/src/components/Fab.module.css — Новый

- `position: fixed; bottom: calc(24px + var(--safe-bottom, 0px)); right: 24px`
- 56x56, border-radius 50%
- z-index 50 (ниже BottomSheet 100/101)
- hover scale(1.05), active scale(0.95)

## Build Verification

```
tsc -b (TypeScript): 0 errors
vite build: 72 modules transformed, built in 92ms
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2774 — always-true condition in JSX**
- **Found during:** Task 2, vite build verification
- **Issue:** `{isEdit && onDelete && ...}` — TypeScript warns "this condition always returns true" because `isEdit = onDelete !== undefined` so `onDelete` is narrowed to non-undefined. TS error TS2774.
- **Fix:** Changed to `{isEdit && ...}` — isEdit alone is the correct guard
- **Files modified:** frontend/src/components/ActualEditor.tsx
- **Commit:** 3d762ca

**2. [Rule 2 - Missing Critical Functionality] Added maxTxDateDefault helper + fallback in JSX**
- **Found during:** Task 2 review against threat model T-04-45
- **Issue:** Original file had `max={maxTxDate}` — when prop omitted, field has no max constraint, allowing arbitrary future dates (T-04-45 violation)
- **Fix:** Added `todayISO()` + `maxTxDateDefault()` helpers; JSX uses `max={maxTxDate ?? maxTxDateDefault()}`
- **Files modified:** frontend/src/components/ActualEditor.tsx
- **Commit:** 3d762ca

**3. [Rule 2 - Missing Critical Functionality] Added autoFocus on amount input in create mode**
- **Found during:** Task 2 review against plan requirements
- **Issue:** Plan explicitly requires autoFocus to accelerate entry flow in create mode; original file missing it
- **Fix:** Added `autoFocus={!isEdit}` to amount input
- **Files modified:** frontend/src/components/ActualEditor.tsx
- **Commit:** 3d762ca

**4. [Rule 2 - Missing Interface Exports] Added named ActualEditorInitial and ActualEditorSavePayload**
- **Found during:** Task 2 review against plan interfaces
- **Issue:** Plan requires these as named exported interfaces for Plan 04-06 to import explicitly; original had them inline as anonymous object types
- **Fix:** Extracted to named exports before ActualEditorProps
- **Files modified:** frontend/src/components/ActualEditor.tsx
- **Commit:** 3d762ca

## Known Stubs

Нет — все 7 модулей полностью реализованы. Данные не hardcoded, API wrappers реальные.

## Threat Flags

Реализованные mitigations из threat register (все выполнены):
- T-04-40: canSubmit guard (amount > 0, category selected)
- T-04-41: filteredCats + useEffect reset categoryId on kind switch
- T-04-42: React auto-escape (нет dangerouslySetInnerHTML)
- T-04-44: cancelled flag в useActual useEffect
- T-04-45: maxTxDateDefault() + max attribute на date input

Новых поверхностей атаки не введено.

## Self-Check: PASSED

- frontend/src/api/types.ts: FOUND (extended)
- frontend/src/api/actual.ts: FOUND
- frontend/src/hooks/useActual.ts: FOUND
- frontend/src/components/ActualEditor.tsx: FOUND
- frontend/src/components/ActualEditor.module.css: FOUND
- frontend/src/components/Fab.tsx: FOUND
- frontend/src/components/Fab.module.css: FOUND
- Commit c213a38: FOUND
- Commit 3d762ca: FOUND
- Commit 0353a73: FOUND
- TypeScript build: 0 errors
- Vite build: SUCCESS (92ms)
