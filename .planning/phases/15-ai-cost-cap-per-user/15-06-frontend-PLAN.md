---
phase: 15-ai-cost-cap-per-user
plan: 06
type: execute
wave: 3
depends_on: [15-04, 15-05]
files_modified:
  - frontend/src/api/types.ts
  - frontend/src/api/admin.ts
  - frontend/src/hooks/useAdminUsers.ts
  - frontend/src/screens/SettingsScreen.tsx
  - frontend/src/screens/SettingsScreen.module.css
  - frontend/src/components/CapEditSheet.tsx
  - frontend/src/components/CapEditSheet.module.css
  - frontend/src/components/UsersList.tsx
  - frontend/src/components/UsersList.module.css
  - frontend/src/screens/AccessScreen.tsx
autonomous: false
requirements: [AICAP-04]

must_haves:
  truths:
    - "SettingsScreen в новом блоке «AI расход» показывает $X.XX / $Y.YY (self spend / cap)"
    - "Если ai_spending_cap_cents == 0 → блок показывает «AI отключён» вместо $/$"
    - "AccessScreen UsersList в каждой строке имеет кнопку cap-edit (значок монеты или текстовая кнопка)"
    - "CapEditSheet bottom-sheet — input cents (или $ с конверсией), submit вызывает PATCH /admin/users/{id}/cap"
    - "useAdminUsers.updateCap optimistic — UsersList обновляется немедленно после server response"
    - "TypeScript build passes (npm run build)"
    - "Vitest unit tests для CapEditSheet проходят"
  artifacts:
    - path: "frontend/src/api/types.ts"
      provides: "MeResponse extension + CapUpdate type"
      contains: "ai_spend_cents"
    - path: "frontend/src/api/admin.ts"
      provides: "updateAdminUserCap api function"
      contains: "updateAdminUserCap"
    - path: "frontend/src/hooks/useAdminUsers.ts"
      provides: "updateCap method (optimistic)"
      contains: "updateCap"
    - path: "frontend/src/components/CapEditSheet.tsx"
      provides: "Bottom-sheet form для edit cap, mirror'ит InviteSheet"
      min_lines: 60
      contains: "spending_cap_cents"
    - path: "frontend/src/screens/SettingsScreen.tsx"
      provides: "AI расход block показывает self-spend / cap"
      contains: "ai_spend_cents"
    - path: "frontend/src/screens/AccessScreen.tsx"
      provides: "wires cap-edit sheet open/close"
      contains: "CapEditSheet"
  key_links:
    - from: "frontend/src/screens/SettingsScreen.tsx"
      to: "GET /me ai_spend_cents + ai_spending_cap_cents (Plan 15-05)"
      via: "useUser hook"
      pattern: "ai_spend_cents|ai_spending_cap_cents"
    - from: "frontend/src/components/CapEditSheet.tsx"
      to: "PATCH /admin/users/{id}/cap (Plan 15-04)"
      via: "updateAdminUserCap api call"
      pattern: "updateAdminUserCap|/cap"
    - from: "frontend/src/screens/AccessScreen.tsx"
      to: "CapEditSheet"
      via: "import + render"
      pattern: "<CapEditSheet"
---

<objective>
Frontend implementation of AICAP-04 D-15-04:

1. **Types**: Расширить `MeResponse` полями `ai_spend_cents`, `ai_spending_cap_cents` + добавить `CapUpdateRequest`.
2. **API client**: `updateAdminUserCap(userId, spending_cap_cents)` для PATCH `/api/v1/admin/users/{id}/cap`.
3. **Hook**: `useAdminUsers().updateCap(userId, cents)` — optimistic update в users list.
4. **Settings UI**: Новый блок «AI расход» отображает `$X.XX / $Y.YY` (self) или «AI отключён» при cap=0.
5. **Admin UI**: В UsersList добавить cap-edit button для каждой строки (включая owner-self); открывает CapEditSheet bottom-sheet.
6. **CapEditSheet**: Mirror InviteSheet structure. Input — USD-доллары (читабельно), внутри конвертируется в cents для PATCH.

Purpose: Закрыть AICAP-04 frontend-side; юзер видит свой spend, owner редактирует cap всем включая себе.

Output: 4 новых файла + 6 patches.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/15-ai-cost-cap-per-user/15-CONTEXT.md
@.planning/phases/15-ai-cost-cap-per-user/15-04-SUMMARY.md
@.planning/phases/15-ai-cost-cap-per-user/15-05-SUMMARY.md

@frontend/src/api/types.ts
@frontend/src/api/admin.ts
@frontend/src/api/client.ts
@frontend/src/hooks/useAdminUsers.ts
@frontend/src/hooks/useUser.ts
@frontend/src/screens/SettingsScreen.tsx
@frontend/src/screens/AccessScreen.tsx
@frontend/src/components/InviteSheet.tsx
@frontend/src/components/UsersList.tsx
@frontend/src/components/BottomSheet.tsx

<interfaces>
<!-- Backend ships /me returns MeResponse with ai_spend_cents and ai_spending_cap_cents (Plan 15-05). -->
<!-- Backend ships PATCH /api/v1/admin/users/{user_id}/cap body {spending_cap_cents: int (ge=0, le=10000000)} returns AdminUserResponse (Plan 15-04). -->

# Frontend types update needed:
interface MeResponse {
  // existing fields...
  ai_spend_cents: number;          // NEW (required)
  ai_spending_cap_cents: number;   // NEW (required)
}

interface CapUpdateRequest {
  spending_cap_cents: number;
}

# Frontend api/admin.ts добавление:
async function updateAdminUserCap(userId: number, spending_cap_cents: number): Promise<AdminUserResponse>;

# Frontend hook extension (mirror invite/revoke pattern):
useAdminUsers().updateCap(userId: number, spending_cap_cents: number): Promise<void>;

# Money convention (CONTEXT D-15-02 explicit code):
# Backend `ai_spend_cents` and `ai_spending_cap_cents` use USD-cents = USD * 100 (NOT *10000).
# Default cap 46500 → $465.00. Comment in code that this differs from
# AdminAiUsageRow.spending_cap_cents which uses *100_000 scale (Phase 13 legacy).
# Frontend formatting: `(cents / 100).toFixed(2)` for ai_spend / ai_spending_cap fields.
# This is intentional: spend_cap.py service reads `est_cost_usd` and computes
# spend_cents via ceil(usd * 100). spending_cap_cents в БД хранится в той же шкале.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Types + api client + hook (foundation)</name>
  <files>frontend/src/api/types.ts, frontend/src/api/admin.ts, frontend/src/hooks/useAdminUsers.ts</files>
  <read_first>
    - frontend/src/api/types.ts (MeResponse strucure lines 1-15, AdminUserResponse lines 388-396)
    - frontend/src/api/admin.ts (existing CRUD patterns inviteAdminUser/revokeAdminUser/listAdminUsers)
    - frontend/src/hooks/useAdminUsers.ts (existing invite/revoke optimistic pattern)
  </read_first>
  <behavior>
    - `MeResponse.ai_spend_cents` typed as number, required.
    - `MeResponse.ai_spending_cap_cents` typed as number, required.
    - `updateAdminUserCap(123, 500000)` calls `apiFetch('/admin/users/123/cap', {method: 'PATCH', body: '{"spending_cap_cents":500000}'})` and returns AdminUserResponse.
    - `useAdminUsers().updateCap` updates the user's cap field в local state (на самом деле AdminUserResponse не имеет spending_cap_cents — нужно подождать backend response который возвращает full snapshot, но AdminUserResponse в types.ts тоже не имеет cap; проверить).
  </behavior>
  <action>
**1.1 Types**: в `frontend/src/api/types.ts`:

a) Расширить `MeResponse` (lines 5-13):
```typescript
export interface MeResponse {
  tg_user_id: number;
  tg_chat_id: number | null;
  cycle_start_day: number;
  onboarded_at: string | null;
  chat_id_known: boolean;
  role: UserRole;
  /** Phase 15 AICAP-04 — current MSK month spend in USD-cents (scale 100/USD). */
  ai_spend_cents: number;
  /** Phase 15 AICAP-04 — current cap in USD-cents (scale 100/USD); 0 = AI off. */
  ai_spending_cap_cents: number;
}
```

b) Расширить `AdminUserResponse` (lines 388-396) добавив поле `spending_cap_cents` (backend AdminUserResponse уже включает его через AppUser ORM `from_attributes=True`? — **проверьте**: см. app/api/schemas/admin.py:19-35. Если поле НЕ в schema — **MUST update backend schema в Plan 15-04** to include `spending_cap_cents: int` чтобы фронт мог optimistic update. **Дополнение к Plan 15-04: добавить в AdminUserResponse поле `spending_cap_cents: int = 0`** — но Plan 15-04 уже завершён к этому моменту. **Проверка**: при разработке Plan 15-06 — если AdminUserResponse в backend НЕ возвращает spending_cap_cents, frontend hook должен делать дополнительный refetch listAdminUsers после updateCap. План: использовать refetch fallback (нет optimistic для cap; optimistic только для invite/revoke где snapshot known).):

```typescript
export interface AdminUserResponse {
  id: number;
  tg_user_id: number;
  tg_chat_id: number | null;
  role: UserRole;
  last_seen_at: string | null;
  onboarded_at: string | null;
  created_at: string;
  /** Phase 15 AICAP-04 — current cap; backend exposes via AppUser ORM. May be undefined if backend hasn't shipped this field; treat as missing → fall back to 46500 default. */
  spending_cap_cents?: number;
}
```

c) Добавить `CapUpdateRequest` после `AdminUserCreateRequest` (around line 405):
```typescript
/**
 * Mirrors `CapUpdate` (app/api/schemas/admin.py) — body для PATCH
 * /api/v1/admin/users/{user_id}/cap.
 *
 * Bounds: 0 ≤ spending_cap_cents ≤ 10_000_000 (= $100k cap).
 */
export interface CapUpdateRequest {
  spending_cap_cents: number;
}
```

**1.2 API client** в `frontend/src/api/admin.ts` добавить функцию после `revokeAdminUser`:

```typescript
/**
 * PATCH /api/v1/admin/users/{user_id}/cap
 *
 * Update spending_cap_cents for self or other user. Owner-only — 403 для member.
 * 422 при negative cap or extra fields. 404 если user_id отсутствует.
 *
 * Returns обновлённый AdminUserResponse snapshot.
 */
export async function updateAdminUserCap(
  userId: number,
  spending_cap_cents: number,
): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/admin/users/${userId}/cap`, {
    method: 'PATCH',
    body: JSON.stringify({ spending_cap_cents } satisfies CapUpdateRequest),
  });
}
```

И добавить `CapUpdateRequest` в импорты файла:
```typescript
import type {
  AdminAiUsageResponse,
  AdminUserCreateRequest,
  AdminUserResponse,
  CapUpdateRequest,
} from './types';
```

**1.3 Hook**: в `frontend/src/hooks/useAdminUsers.ts` расширить `UseAdminUsersResult` и реализацию:

a) Добавить `updateCap` в interface:
```typescript
export interface UseAdminUsersResult {
  // existing...
  updateCap: (userId: number, spending_cap_cents: number) => Promise<void>;
}
```

b) Импорт нового api: `import { ... updateAdminUserCap, ... } from '../api/admin';`.

c) Реализация (после `revoke`):
```typescript
const updateCap = useCallback(
  async (userId: number, spending_cap_cents: number) => {
    // Server возвращает updated AdminUserResponse — мерджим в local state.
    const updated = await updateAdminUserCap(userId, spending_cap_cents);
    if (mountedRef.current) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    }
  },
  [],
);
```

d) Добавить `updateCap` в return statement:
```typescript
return { users, loading, error, refetch, invite, revoke, updateCap };
```

Не делайте rollback при failure — caller (CapEditSheet) сам catch'ит и показывает error inline.

**1.4 Vitest unit test** (опционально — пропустить если у проекта нет vitest setup для api/hooks). Не блокирующее. Критичные тесты будут в Task 4.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm run typecheck 2>&1 | tail -10 || npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "ai_spend_cents" frontend/src/api/types.ts` >= 1
    - `grep -c "ai_spending_cap_cents" frontend/src/api/types.ts` >= 1
    - `grep -c "CapUpdateRequest" frontend/src/api/types.ts` >= 1
    - `grep -c "updateAdminUserCap" frontend/src/api/admin.ts` >= 1
    - `grep -c "updateCap" frontend/src/hooks/useAdminUsers.ts` >= 2 (interface + impl + return)
    - `cd frontend && npx tsc --noEmit` passes (no type errors)
  </acceptance_criteria>
  <done>Types/api/hook foundation готовы; tsc passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SettingsScreen «AI расход» block</name>
  <files>frontend/src/screens/SettingsScreen.tsx, frontend/src/screens/SettingsScreen.module.css</files>
  <read_first>
    - frontend/src/screens/SettingsScreen.tsx (existing card structure: cycle_start_day, notify, enable_ai_cat)
    - frontend/src/hooks/useUser.ts (returns user from /me)
    - frontend/src/screens/SettingsScreen.module.css (card / disclaimer / muted patterns)
    - frontend/src/components/AiUsageList.tsx:9-12 (formatUsd reference — но scale разный; см. CONTEXT)
  </read_first>
  <behavior>
    - SettingsScreen рендерит новую `<section className={styles.card}>` ПОСЛЕ существующих cards (cycle / notify / ai-cat).
    - Заголовок: «AI расход».
    - При `ai_spending_cap_cents > 0`: текст `$X.XX / $Y.YY` где X = spend/100 toFixed(2), Y = cap/100 toFixed(2).
    - При `ai_spending_cap_cents === 0`: текст «AI отключён» + муйный disclaimer «Обратитесь к администратору».
    - Visual progress bar опционально — если упрощаем, просто два числа + disclaimer "Сбрасывается 1-го числа месяца (МСК)".
    - При `ai_spend_cents` undefined (legacy /me response без поля) → fallback "—" / не рендерить (defensive).
  </behavior>
  <action>
**2.1 Импорт useUser в SettingsScreen.tsx** (если ещё не импортирован):

```typescript
import { useUser } from '../hooks/useUser';
```

**2.2 Внутри `SettingsScreen` функции** добавить хук:

```typescript
const { user } = useUser();
```

**2.3 Добавить новый JSX-блок ПОСЛЕ блока «AI-категоризация» (после строки ~164 `enableAiCat checkbox` block) и ПЕРЕД `savedFlash`**:

```tsx
{user && (
  <section className={styles.card}>
    <div className={styles.cardTitle}>AI расход</div>
    {user.ai_spending_cap_cents === 0 ? (
      <>
        <div className={styles.aiSpendOff}>AI отключён</div>
        <div className={styles.disclaimer}>
          ⓘ Обратитесь к администратору, если нужен доступ к AI-функциям.
        </div>
      </>
    ) : (
      <>
        <div className={styles.aiSpendValue}>
          ${(user.ai_spend_cents / 100).toFixed(2)} /{' '}
          ${(user.ai_spending_cap_cents / 100).toFixed(2)}
        </div>
        <div className={styles.disclaimer}>
          ⓘ Сбрасывается 1-го числа каждого месяца (Europe/Moscow).
        </div>
      </>
    )}
  </section>
)}
```

`{user &&` — defensive guard на случай /me ещё loading; в prod /me уже резолвлен на момент рендера SettingsScreen. Но guard сохраняет тип — `user` could be null per useUser hook signature.

**2.4 CSS** в `frontend/src/screens/SettingsScreen.module.css` добавить:

```css
.aiSpendValue {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 8px 0;
}

.aiSpendOff {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-muted);
  margin: 8px 0;
}
```

(Используйте существующие css vars если они в проекте отличаются — посмотрите файл первой строкой; адаптируйте.)

**ВАЖНО — money convention** (D-15-02 CONTEXT explicit): backend ai_spend_cents и ai_spending_cap_cents используют scale **100/USD** (т.е. cents = USD * 100). Default 46500 → $465.00. Это вычисляется как `(cents / 100).toFixed(2)` в frontend. Не путайте с AdminAiUsageRow.spending_cap_cents которое использует scale 100_000/USD (Phase 13 legacy AiUsageList). Эти два несовместимы — Phase 15 calibrates spending_cap_cents к 100/USD scale per CONTEXT D-15-02.

**Опасность**: Существующий Phase 13 AiUsageList.tsx читает `u.spending_cap_cents` через scale 10000/USD; он **продолжает работать через AdminAiUsage endpoint** и НЕ ЗАТРОНУТ Plan 15-06. Phase 15 не модифицирует admin AI Usage breakdown — только Settings и AccessScreen.

Запустите `cd frontend && npm run build` чтобы убедиться что TS не ломается.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -10 && grep -c "ai_spend_cents\|ai_spending_cap_cents" frontend/src/screens/SettingsScreen.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `frontend/src/screens/SettingsScreen.tsx` содержит JSX block с заголовком "AI расход"
    - `grep -c "ai_spend_cents" frontend/src/screens/SettingsScreen.tsx` >= 1
    - `grep -c "ai_spending_cap_cents" frontend/src/screens/SettingsScreen.tsx` >= 1
    - `grep -c "AI отключён" frontend/src/screens/SettingsScreen.tsx` >= 1
    - SettingsScreen.module.css содержит классы aiSpendValue и aiSpendOff
    - `npx tsc --noEmit` passes
  </acceptance_criteria>
  <done>Settings UI shows self spend/cap or AI-off; visual confirmed in dev container.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: CapEditSheet component + AccessScreen wiring + UsersList cap-edit button</name>
  <files>frontend/src/components/CapEditSheet.tsx, frontend/src/components/CapEditSheet.module.css, frontend/src/components/UsersList.tsx, frontend/src/components/UsersList.module.css, frontend/src/screens/AccessScreen.tsx</files>
  <read_first>
    - frontend/src/components/InviteSheet.tsx (template для CapEditSheet — структура form, validation, ApiError handling)
    - frontend/src/components/InviteSheet.module.css (style copy)
    - frontend/src/components/BottomSheet.tsx (BottomSheet API)
    - frontend/src/components/UsersList.tsx (existing layout — нужно добавить cap-edit button)
    - frontend/src/screens/AccessScreen.tsx (existing state pattern — добавить capEditTarget state + sheet)
  </read_first>
  <behavior>
    - CapEditSheet получает `target: AdminUserResponse | null`; render only if target != null (не open=true когда target=null).
    - Input: `<input type="number" min="0" step="0.01">` — пользователь вводит USD; на submit converts `Number(input) * 100` → cents (или просто math `Math.round(Number(input) * 100)` чтобы избежать float-mantissa).
    - Submit: вызывает `onSubmit(targetId, capCents)` который вызывает hook updateCap → PATCH.
    - 422 (Pydantic) → inline error «Неверное значение лимита».
    - 403 → inline error «Только владелец может редактировать».
    - 404 → inline error «Пользователь не найден» + close sheet (refetch).
    - UsersList показывает cap-edit button (например «Лимит» текст или Coins icon) рядом с revoke (но включая owner — owner может self-edit).
    - AccessScreen state `capEditTarget: AdminUserResponse | null`; при click button → setCapEditTarget(user); on submit close + showToast.
  </behavior>
  <action>
**3.1 Создать `frontend/src/components/CapEditSheet.tsx`**:

```typescript
import { useState, useEffect, type FormEvent } from 'react';
import { BottomSheet } from './BottomSheet';
import { ApiError } from '../api/client';
import type { AdminUserResponse } from '../api/types';
import styles from './CapEditSheet.module.css';

export interface CapEditSheetProps {
  target: AdminUserResponse | null;
  onClose: () => void;
  /**
   * Submitted in cents (USD * 100). Caller is responsible for hook update.
   * Throws on backend errors so this component can surface inline message.
   */
  onSubmit: (userId: number, spending_cap_cents: number) => Promise<void>;
}

/**
 * Phase 15 AICAP-04 D-15-04 — bottom-sheet для edit AI cap.
 *
 * Mirror'ит InviteSheet. Input — USD (читабельно, $X.XX); конвертация в cents
 * Math.round(value * 100) на submit. 0 разрешено (= AI off для юзера).
 *
 * Backend bound: 0 ≤ cap_cents ≤ 10_000_000 ($100k); UI клампит до $99,999.99.
 */
export function CapEditSheet({ target, onClose, onSubmit }: CapEditSheetProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // When target opens, prefill input from current cap.
  useEffect(() => {
    if (target) {
      const dollars = (target.spending_cap_cents ?? 46500) / 100;
      setValue(dollars.toFixed(2));
      setError(null);
    } else {
      setValue('');
      setError(null);
    }
  }, [target]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError('Введите неотрицательное число');
      return;
    }
    if (numeric > 99_999.99) {
      setError('Максимум $99,999.99');
      return;
    }
    const cents = Math.round(numeric * 100);
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(target.id, cents);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setError('Только владелец может редактировать');
      } else if (e instanceof ApiError && e.status === 422) {
        setError('Неверное значение лимита');
      } else if (e instanceof ApiError && e.status === 404) {
        setError('Пользователь не найден');
      } else {
        setError(e instanceof Error ? e.message : 'Ошибка обновления');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const open = target !== null;
  const submitDisabled = submitting || value.trim() === '';

  return (
    <BottomSheet open={open} onClose={handleClose} title="Изменить AI-лимит">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Лимит, USD (0 = AI отключён)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="99999.99"
            step="0.01"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className={styles.input}
            placeholder="5.00"
            disabled={submitting}
            aria-invalid={error ? 'true' : 'false'}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button
          type="submit"
          className={styles.submit}
          disabled={submitDisabled}
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
        <p className={styles.hint}>
          Сбрасывается 1-го числа каждого месяца (МСК).
        </p>
      </form>
    </BottomSheet>
  );
}
```

**3.2 Создать `frontend/src/components/CapEditSheet.module.css`** — копия `InviteSheet.module.css` (используйте Read + Write с тем же содержимым).

**3.3 Изменить `frontend/src/components/UsersList.tsx`**:

Добавить prop `onEditCap: (user: AdminUserResponse) => void;`:
```typescript
export interface UsersListProps {
  users: AdminUserResponse[];
  onRevoke: (user: AdminUserResponse) => void;
  onEditCap: (user: AdminUserResponse) => void;   // NEW Plan 15-06
}
```

В loop добавить cap-edit button в каждой строке (для owner — тоже, owner может self-edit) ПЕРЕД revoke button (около строк 70-78):
```tsx
<button
  type="button"
  className={styles.capBtn}
  aria-label={`Изменить AI-лимит для ${u.tg_user_id}`}
  onClick={() => onEditCap(u)}
>
  Лимит
</button>
{!isOwner && !isRevoked && (
  <button
    type="button"
    className={styles.revokeBtn}
    ...
  >
```

CSS class `.capBtn` (добавьте в `UsersList.module.css`):
```css
.capBtn {
  background: transparent;
  border: 1px solid var(--color-border, #ddd);
  color: var(--color-text);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  margin-right: 6px;
}
.capBtn:hover { background: var(--color-bg-hover, #f5f5f5); }
```

**3.4 Изменить `frontend/src/screens/AccessScreen.tsx`**:

a) Импорт:
```typescript
import { CapEditSheet } from '../components/CapEditSheet';
```

b) Новый state и handler:
```typescript
const [capEditTarget, setCapEditTarget] = useState<AdminUserResponse | null>(null);

const handleUpdateCap = async (userId: number, cents: number) => {
  await usersHook.updateCap(userId, cents);
  showToast('Лимит обновлён');
};
```

c) Передать `onEditCap` в UsersList:
```tsx
<UsersList
  users={usersHook.users}
  onRevoke={setRevokeTarget}
  onEditCap={setCapEditTarget}
/>
```

d) Render `<CapEditSheet>` после `<RevokeConfirmDialog>` (около строки 117):
```tsx
<CapEditSheet
  target={capEditTarget}
  onClose={() => setCapEditTarget(null)}
  onSubmit={handleUpdateCap}
/>
```

После запустите `cd frontend && npm run build`; если есть vitest tests — `npm test`.

ВАЖНО: владельца (owner) edit cap — owner edits self. Отдельной валидации нет; через PATCH owner-self handled на backend (Plan 15-04 разрешает self-edit).

ВАЖНО: При `target.spending_cap_cents === undefined` (если backend AdminUserResponse не возвращает поле — см. Plan 15-04 schema), prefill уйдёт в 46500/100 = 465 USD по `?? 46500` fallback. Это OK, но лучше: после Plan 15-04 убедиться backend AdminUserResponse имеет spending_cap_cents. **Если AdminUserResponse в schema его не возвращает — это блокирующий issue для Plan 15-06**, его надо закрыть в Plan 15-04 (добавить `spending_cap_cents: int = 0` в AdminUserResponse). **Plan 15-06 ASSUMES backend возвращает поле**; verify с Plan 15-04 SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -15 && grep -c "CapEditSheet" frontend/src/screens/AccessScreen.tsx frontend/src/components/CapEditSheet.tsx 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - File `frontend/src/components/CapEditSheet.tsx` exists; >= 70 lines
    - `grep -c "spending_cap_cents" frontend/src/components/CapEditSheet.tsx` >= 1
    - `grep -c "Math.round.*\\* 100" frontend/src/components/CapEditSheet.tsx` >= 1
    - `frontend/src/components/UsersList.tsx` имеет prop `onEditCap` и `<button.*capBtn`
    - `frontend/src/screens/AccessScreen.tsx` импортирует и рендерит `<CapEditSheet`
    - `cd frontend && npx tsc --noEmit` passes (no type errors)
    - `cd frontend && npm run build` (если конфигурация имеется) succeeds
  </acceptance_criteria>
  <done>Cap edit sheet shipped; AccessScreen wires it; TS clean; ready for human-verify.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human verify Settings + Cap edit flow</name>
  <action>Pause — wait for human to manually verify SettingsScreen «AI расход» display + AccessScreen CapEditSheet edit flow. See <how-to-verify> for steps.</action>
  <what-built>
Frontend Phase 15 UI changes (Plans 15-04, 15-05, 15-06 backend already shipped):
- SettingsScreen теперь имеет блок «AI расход» показывающий self-spend / cap (или «AI отключён» при cap=0).
- AccessScreen → Users tab каждая строка теперь имеет кнопку «Лимит» которая открывает CapEditSheet bottom-sheet.
- В CapEditSheet input в USD, на submit конвертируется в cents и PATCH'ится.
  </what-built>
  <how-to-verify>
1. **Запустите dev**: `cd frontend && npm run dev` (или ваш стандартный dev-stack — see infra-deploy.md memory).
2. **Откройте Settings**: должен появиться блок «AI расход» с числами `$X.XX / $Y.YY` (default $0.00 / $465.00 для нового owner).
3. **Откройте AccessScreen → Users**: возле каждой строки должна быть кнопка «Лимит».
4. **Нажмите «Лимит»** на owner-строке: bottom-sheet открывается, input prefilled значением `465.00` (или текущим cap).
5. **Введите 100, submit**: после ~1 сек список обновляется (cap=10000), toast «Лимит обновлён».
6. **Откройте Settings** снова: cap теперь $100.00.
7. **Введите 0, submit**: cap=0; Settings показывает «AI отключён».
8. **Try /ai/chat**: должен вернуть 429 (cap=0).
9. **Cancel/back to AccessScreen → Лимит для self → 5.00 → submit**: cap restored.

Если есть ошибка: report сюда text с screenshot или message.
  </how-to-verify>
  <resume-signal>Type "approved" if UI работает; "issues: <details>" otherwise.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → frontend state | Trust |
| frontend → /me /admin/users API | Validated by initData; cap edit by require_owner |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-15-06-01 | Tampering | CapEditSheet input → backend bypass | mitigate | Backend `Field(ge=0, le=10000000)` + `extra="forbid"` (Plan 15-04) — UI клампинг defense-in-depth |
| T-15-06-02 | Information disclosure | non-owner accidentally sees Лимит button | accept | UsersList renders для owner-only screen (visibility uses useUser().role в ManagementScreen filter) |
| T-15-06-03 | Spoofing | client constructs PATCH с другим userId | mitigate | Backend `require_owner` blocks; UI just convenience |
| T-15-06-04 | UX safety | accidental cap=0 on self → AI lockout | accept | reversible (PATCH again); confirmation dialog deferred (CONTEXT minimal MVP) |
</threat_model>

<verification>
- `cd frontend && npx tsc --noEmit` passes.
- `cd frontend && npm run build` succeeds.
- Manual UAT (checkpoint Task 4): Settings shows self-spend, AccessScreen edit cap → reflects in /me и в /ai/chat behaviour.
</verification>

<success_criteria>
- 4 new files (CapEditSheet.tsx + .css) + 6 patches.
- Все TypeScript типы корректны.
- AccessScreen owner может редактировать cap; member exclude'ен screen-level (existing).
- Settings показывает self-spend для всех users (включая members).
- Cap=0 visually distinct.
</success_criteria>

<output>
After completion, create `.planning/phases/15-ai-cost-cap-per-user/15-06-SUMMARY.md`.
</output>
