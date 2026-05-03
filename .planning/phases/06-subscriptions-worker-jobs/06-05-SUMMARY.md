---
phase: 06-subscriptions-worker-jobs
plan: "05"
subsystem: frontend
tags: [subscriptions, typescript, api-client, hooks, components, react]
dependency_graph:
  requires: [06-03]
  provides: [subscription-api-client, useSubscriptions-hook, SubscriptionEditor-component]
  affects: [06-06]
tech_stack:
  added: []
  patterns:
    - apiFetch wrapper (existing pattern from planned.ts/actual.ts)
    - useCallback + useEffect with cancellation flag (existing hook pattern)
    - BottomSheet wrapper for editor forms (existing component)
    - CSS Modules with design tokens (var(--color-*), var(--radius-*))
key_files:
  created:
    - frontend/src/api/subscriptions.ts
    - frontend/src/hooks/useSubscriptions.ts
    - frontend/src/components/SubscriptionEditor.tsx
    - frontend/src/components/SubscriptionEditor.module.css
  modified:
    - frontend/src/api/types.ts
decisions:
  - useCategories receives boolean (not object) — matches existing hook signature `useCategories(false)`
  - SettingsUpdatePayload made optional fields (was `cycle_start_day: number`, now `cycle_start_day?: number`) — backward compatible; SettingsScreen still passes correct value
  - SubscriptionEditor uses inline confirm() for delete — matches plan spec; no custom confirm dialog needed
metrics:
  duration: "~10 min"
  completed: "2026-05-03"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 1
---

# Phase 6 Plan 05: Frontend Data Layer — Subscription Types, API, Hook & Editor

Frontend foundation для подписок: типы, API-клиент, хук и форма-компонент. Готово к использованию в SubscriptionsScreen (06-06).

## What Was Built

### API Surface (5 функций)

**`frontend/src/api/subscriptions.ts`** — 5 экспортируемых функций:

| Функция | HTTP | Путь |
|---------|------|------|
| `listSubscriptions()` | GET | `/subscriptions` |
| `createSubscription(payload)` | POST | `/subscriptions` |
| `updateSubscription(id, payload)` | PATCH | `/subscriptions/{id}` |
| `deleteSubscription(id)` | DELETE | `/subscriptions/{id}` |
| `chargeNow(id)` | POST | `/subscriptions/{id}/charge-now` |

### TS-типы (`frontend/src/api/types.ts`)

Добавлены:
- `SubCycle = 'monthly' | 'yearly'`
- `SubscriptionRead` — полный объект с nested `category: CategoryRead`
- `SubscriptionCreatePayload` — обязательные поля + optional notify_days_before, is_active
- `SubscriptionUpdatePayload` — все поля optional (PATCH semantics)
- `ChargeNowResponse` — `{ planned_id, next_charge_date }`

Расширены:
- `SettingsRead.notify_days_before: number` (D-77)
- `SettingsUpdatePayload` — поля стали необязательными для partial updates

### useSubscriptions хук

**`frontend/src/hooks/useSubscriptions.ts`**

Возвращает: `{ subscriptions, loading, error, refetch, mutate }`

- Загружает список при mount (cancellation flag против stale renders)
- `refetch()` — принудительная перезагрузка
- `mutate(fn)` — выполняет операцию + refetch (удобно для create/update/delete)

### SubscriptionEditor компонент (D-83)

**`frontend/src/components/SubscriptionEditor.tsx`**

Props:
```typescript
interface Props {
  mode: 'create' | 'edit';
  initial?: SubscriptionRead;      // для edit mode
  defaultNotifyDays: number;       // из SettingsRead.notify_days_before
  onClose: () => void;
  onSubmit: (payload) => Promise<void>;
  onDelete?: () => Promise<void>;  // для edit mode
}
```

**7 полей формы (все явно в JSX):**

1. **name** — `<input type="text">`, placeholder "Например, Netflix", maxLength=255
2. **amount** — `<input type="text" inputMode="decimal">`, rub → kopecks (`Math.round(parseFloat * 100)`)
3. **cycle** — segmented control: `[Месяц | Год]`, active кнопка с accent-фоном
4. **next_charge_date** — `<input type="date">`, default = today (create) или initial.next_charge_date (edit)
5. **category** — `<select>` с options из `useCategories(false)` (только активные)
6. **notify_days_before** — `<input type="number" min=0 max=30>`, default = defaultNotifyDays
7. **is_active** — `<input type="checkbox">` только в edit mode (в create всегда true)

**Кнопки:**
- Submit (Создать/Сохранить) — disabled при `!name || !categoryId || !amountRub || busy`
- Delete (edit mode + onDelete присутствует) — с `confirm('Удалить подписку?')`
- Отмена — всегда, вызывает onClose

**CSS-модуль** (`SubscriptionEditor.module.css`): design tokens (`var(--color-*)`, `var(--space-*)`, `var(--radius-*)`), segmented control с `.seg`/`.segActive`, toggle row для checkbox, `.primary`/`.cancel`/`.danger` кнопки.

## Заметки для 06-06 (SubscriptionsScreen)

1. **Импорты готовы:**
   ```typescript
   import { useSubscriptions } from '../hooks/useSubscriptions';
   import { SubscriptionEditor } from '../components/SubscriptionEditor';
   import { createSubscription, updateSubscription, deleteSubscription, chargeNow } from '../api/subscriptions';
   ```

2. **Паттерн использования SubscriptionEditor:**
   ```typescript
   // Create mode
   <SubscriptionEditor
     mode="create"
     defaultNotifyDays={settings.notify_days_before}
     onClose={() => setEditorOpen(false)}
     onSubmit={(p) => mutate(() => createSubscription(p as SubscriptionCreatePayload))}
   />

   // Edit mode
   <SubscriptionEditor
     mode="edit"
     initial={selectedSub}
     defaultNotifyDays={settings.notify_days_before}
     onClose={() => setSelected(null)}
     onSubmit={(p) => mutate(() => updateSubscription(selectedSub.id, p))}
     onDelete={() => mutate(() => deleteSubscription(selectedSub.id))}
   />
   ```

3. **chargeNow** — доступен для кнопки «Списать сейчас» в списке подписок
4. **SettingsRead.notify_days_before** — нужно получать через `useUser` или отдельный `useSettings` хук

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useCategories signature**
- **Found during:** Task 3
- **Issue:** Plan-шаблон использовал `useCategories({ includeArchived: false })` (объект), но реальная сигнатура хука принимает `boolean`
- **Fix:** Использован `useCategories(false)` — соответствует существующей реализации
- **Files modified:** frontend/src/components/SubscriptionEditor.tsx

**2. [Rule 2 - Missing functionality] SettingsUpdatePayload made partial**
- **Found during:** Task 1
- **Issue:** Оригинальный `SettingsUpdatePayload` имел обязательное `cycle_start_day: number`, что не позволяло делать partial PATCH для обновления только `notify_days_before`
- **Fix:** Оба поля сделаны опциональными (PATCH-семантика); SettingsScreen по-прежнему работает корректно
- **Files modified:** frontend/src/api/types.ts

## Threat Coverage

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-06-10 | Mitigated | parseFloat + Math.round в handleSubmit; backend Pydantic gt=0 — двойная защита |
| T-06-11 | Accepted | Single-tenant, error message — только domain message |

## Self-Check: PASSED

- [x] `frontend/src/api/subscriptions.ts` — существует
- [x] `frontend/src/hooks/useSubscriptions.ts` — существует
- [x] `frontend/src/components/SubscriptionEditor.tsx` — существует
- [x] `frontend/src/components/SubscriptionEditor.module.css` — существует
- [x] Commit dded37c — feat(06-05): add Subscription TS types
- [x] Commit 89484b8 — feat(06-05): add useSubscriptions hook
- [x] Commit ec214e8 — feat(06-05): add SubscriptionEditor component
- [x] TypeScript `--noEmit` — без ошибок
- [x] `npm run build` (основное репо) — successful 84 modules
