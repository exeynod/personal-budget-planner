---
phase: 25-home-transactions-add-sheet
plan: 10
type: execute
wave: 2
depends_on: [2, 3, 6]
files_modified:
  - frontend/src/screensV10/AddSheet/AddSheet.tsx
  - frontend/src/screensV10/AddSheet/AddSheet.module.css
  - frontend/src/screensV10/AddSheet/Keypad.tsx
  - frontend/src/screensV10/AddSheet/Keypad.module.css
  - frontend/src/screensV10/AddSheet/computeAddSheet.ts
  - frontend/src/screensV10/AddSheet/__tests__/Keypad.test.tsx
  - frontend/src/screensV10/AddSheet/__tests__/AddSheet.test.tsx
  - frontend/src/screensV10/AddSheet/__tests__/computeAddSheet.test.ts
  - frontend/src/screensV10/AddSheet/index.ts
  - frontend/src/screensV10/V10MainShell.tsx
autonomous: true
gap_closure: true
requirements:
  - ADD-V10-01
  - ADD-V10-02
  - ADD-V10-03
  - ADD-V10-04
  - ADD-V10-05

must_haves:
  truths:
    - "AddSheet rendered inside PosterSheet (backgroundColor='#0E0E0E') triggered by V10MainShell's FAB binding (ADD-V10-01)."
    - "Header «NEW ENTRY · {date_short} · {time_HHMM}» + `×` close button top-right; tap × with dirty form → confirm-sheet «ОТМЕНИТЬ ЗАПИСЬ?» (ADD-V10-01, ADD-V10-05)."
    - "BigFig 86px yellow displays current amount; Keypad 3×4 (1..9, ., 0, ⌫) is the ONLY input — no native input element renders (ADD-V10-02)."
    - "Description input (italic-серif placeholder), date chips (Сегодня/Вчера/Своя дата → DatePicker), category chip-scroll (filtered code != 'savings' && !paused), account row (primary by default) (ADD-V10-03, ADD-V10-04)."
    - "CTA states: 'ВВЕДИТЕ СУММУ' (gray disabled) → 'ВЫБЕРИТЕ КАТЕГОРИЮ' (gray disabled) → 'СОХРАНИТЬ ↵' (active yellow); submit calls createActualV10 with account_id (ADD-V10-04, ADD-V10-05)."
    - "V10MainShell's AddSheetPlaceholderContent is REPLACED by importing AddSheet from screensV10/AddSheet (real sheet body)."
  artifacts:
    - path: "frontend/src/screensV10/AddSheet/AddSheet.tsx"
      provides: "Full AddSheet component (data inputs, CTA, submit, unsaved-close gate)"
      min_lines: 220
      exports: ["AddSheet", "type AddSheetProps"]
    - path: "frontend/src/screensV10/AddSheet/Keypad.tsx"
      provides: "3x4 numeric keypad (1..9, ., 0, ⌫) with onAppend/onBackspace/onDot callbacks"
      min_lines: 60
      exports: ["Keypad", "type KeypadProps"]
    - path: "frontend/src/screensV10/AddSheet/computeAddSheet.ts"
      provides: "Pure helpers: buildAmountString (digits → '12.50'), parseAmountToCents, ctaState, defaultDateForChip"
      exports: ["buildAmountString", "parseAmountToCents", "ctaState", "defaultDateForChip", "type AddSheetCtaState", "type AddSheetDateChip"]
    - path: "frontend/src/screensV10/V10MainShell.tsx"
      provides: "FAB binding now opens real AddSheet (replaces AddSheetPlaceholderContent)"
      contains: "AddSheet"
  key_links:
    - from: "frontend/src/screensV10/AddSheet/AddSheet.tsx"
      to: "createActualV10 from api/v10/actual + listAccounts/listCategoriesV10"
      via: "Promise.all parallel fetch + POST on submit"
      pattern: "createActualV10\\|listAccounts\\|listCategoriesV10"
    - from: "frontend/src/screensV10/V10MainShell.tsx"
      to: "import { AddSheet } from './AddSheet'"
      via: "Replaces AddSheetPlaceholderContent JSX"
      pattern: "import.*AddSheet.*from.*screensV10/AddSheet"
---

<objective>
Build the web AddSheet covering ADD-V10-01..05 — black bg modal, custom 3×4 keypad replacing the system keyboard, BigFig amount display, description input, date chips, category chip-scroll, account picker, dynamic CTA, atomic submit via createActualV10 — and replace the AddSheetPlaceholderContent stub in V10MainShell with this real component.

Purpose: close ADD-V10-01..05 (entirely absent in Phase 25 to date).
Output: 5 new source files (AddSheet + Keypad + compute + barrel + 3 test files) + V10MainShell modification.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/phases/25-home-transactions-add-sheet/25-must-haves.md
@.planning/phases/25-home-transactions-add-sheet/25-02-web-routing-bottomnav-SUMMARY.md
@.planning/phases/25-home-transactions-add-sheet/25-03-api-clients-SUMMARY.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@frontend/src/api/v10/actual.ts
@frontend/src/api/v10/categories.ts
@frontend/src/api/v10/accounts.ts
@frontend/src/screensV10/common/format.ts
@frontend/src/screensV10/common/PosterSheet.tsx
@frontend/src/componentsV10/BigFig.tsx
@frontend/src/componentsV10/Eyebrow.tsx
@frontend/src/componentsV10/Mass.tsx
@frontend/src/componentsV10/Chip.tsx
@frontend/src/screensV10/V10MainShell.tsx

<interfaces>
<!-- Wave-1/2/3 outputs the executor consumes. -->

From frontend/src/api/v10/actual.ts (Plan 25-03):
```typescript
export async function createActualV10(payload: ActualV10CreatePayload): Promise<ActualV10Read>;
export interface ActualV10CreatePayload {
  kind: 'expense' | 'income' | 'roundup' | 'deposit';
  amount_cents: number;
  description?: string | null;
  category_id: number;
  tx_date: string;            // 'YYYY-MM-DD'
  account_id?: number | null; // when present, server fires v10 path (balance + roundup)
}
```

From frontend/src/api/v10/categories.ts:
```typescript
export interface CategoryV10 { id: number; name: string; code: string | null; paused: boolean; ... }
export async function listCategoriesV10(): Promise<CategoryV10[]>;
```

From frontend/src/api/v10/accounts.ts:
```typescript
export interface AccountResponse { id: number; bank: string; mask: string | null; primary: boolean; ... }
export async function listAccounts(): Promise<AccountResponse[]>;
```

From frontend/src/screensV10/common/format.ts:
```typescript
export function formatTimeHM(d: Date): string;          // 'HH:MM'
// formatDay handles dates; need to add a short-date helper if absent — check format.ts first.
```

From frontend/src/componentsV10/BigFig.tsx:
```typescript
export interface BigFigProps {
  value: number;             // integer (rubles or other unit)
  sup?: string;              // e.g. '₽'
  size?: number;
  color?: string;
  animate?: boolean;
}
```

From frontend/src/screensV10/common/PosterSheet.tsx:
```typescript
export interface PosterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  backgroundColor?: string;  // '#0E0E0E' for AddSheet
}
```

CTA state machine (ADD-V10-05):
| State | Condition | Label | Active |
|-------|-----------|-------|--------|
| empty | amount === 0 | 'ВВЕДИТЕ СУММУ' | false (gray) |
| no-cat | amount > 0 && !categoryId | 'ВЫБЕРИТЕ КАТЕГОРИЮ' | false (gray) |
| ready | amount > 0 && categoryId | 'СОХРАНИТЬ ↵' | true (yellow) |
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Keypad input → amount string state | local; no untrusted source |
| Form submit → POST /actual | server validates; client sends account_id from listAccounts only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-10-01 | Tampering | Free-form description with HTML | accept | React JSX escapes; server stores as plain text. |
| T-25-10-02 | Repudiation | Lost work on accidental × close | mitigate | Dirty-form gate: tap × with non-empty amount/description → confirm-sheet «ОТМЕНИТЬ ЗАПИСЬ?»; «Продолжить» returns to edit. |
| T-25-10-03 | Tampering | Pre-selecting wrong account_id | mitigate | Default = primary account from listAccounts; user must explicitly switch via picker. RLS prevents cross-tenant; server-side guard already in 25-01. |
| T-25-10-04 | Tampering | Negative amount via keypad somehow | mitigate | Keypad emits only digits + dot; parseAmountToCents always returns positive integer. createActualV10 client-guard rejects amount_cents <= 0. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure compute helpers + tests</name>
  <files>frontend/src/screensV10/AddSheet/computeAddSheet.ts, frontend/src/screensV10/AddSheet/__tests__/computeAddSheet.test.ts</files>
  <read_first>
    - frontend/src/screensV10/Onboarding/format.ts (formatRubles pattern with U+202F)
    - frontend/src/screensV10/Home/computeHomeData.ts (pure helper pattern)
  </read_first>
  <behavior>
    - `type AddSheetCtaState = 'empty' | 'no-cat' | 'ready'`.
    - `type AddSheetDateChip = 'today' | 'yesterday' | 'custom'`.
    - `buildAmountString(digits: string, hasDot: boolean, decimals: string): string`:
      - Tracks the keypad state machine. Inputs: integer-part digits, dot toggle, decimal-part digits (max 2).
      - Returns the displayed amount string (no thousand separators in input mode — formatting happens in the BigFig wrapper).
      - Empty + dot → '0.'.
      - 5 + dot + 5 + 0 → '5.50'.
      - Backspace removes last char respecting dot-state.
    - `parseAmountToCents(amountString: string): number`:
      - '5.50' → 550, '5.5' → 550, '5' → 500, '5.' → 500, '0' → 0, '' → 0, '0.05' → 5.
      - Negative input is impossible (keypad has no minus); guard: throws if input contains anything other than [0-9.].
    - `ctaState(amountCents: number, categoryId: number | null): AddSheetCtaState`:
      - 0, _ → 'empty'.
      - >0, null → 'no-cat'.
      - >0, number → 'ready'.
    - `defaultDateForChip(chip: AddSheetDateChip, today: Date): string`:
      - 'today' → today.toISOString().slice(0,10).
      - 'yesterday' → (today - 1d).toISOString().slice(0,10).
      - 'custom' → returns null (caller must supply a custom date).
      - Implementation: `const d = new Date(today); d.setDate(d.getDate() - 1);` etc.

    Tests (vitest):
    - buildAmountString state-machine: 6 transitions including dot, double-dot rejection, decimal cap at 2.
    - parseAmountToCents: 8 cases including edge inputs.
    - ctaState: 4 cases (empty, no-cat, ready, no-cat-with-zero-cat-id-fallthrough).
    - defaultDateForChip: today/yesterday correct ISO strings; custom returns null.
  </behavior>
  <action>
    Implement all 4 helpers as pure functions; export types.

    **For Keypad state model**, use a simpler representation than the spec above: track just `amountString: string` (e.g. "12.50") and have buildAmountString append/backspace operations:
    ```typescript
    export function appendDigit(current: string, digit: string): string {
      // Reject if past 2 decimal places after dot.
      if (current.includes('.')) {
        const [, decimals] = current.split('.');
        if (decimals.length >= 2) return current;
      }
      // No leading zeros (except "0." case): if current === '0' and digit !== '.', replace.
      if (current === '0' && digit !== '.') return digit;
      return current + digit;
    }
    export function appendDot(current: string): string {
      if (current.includes('.')) return current;
      if (current === '') return '0.';
      return current + '.';
    }
    export function backspace(current: string): string {
      return current.slice(0, -1);
    }
    ```
    Then `buildAmountString` is the orchestrator wrapping these. (Or just export the three primitive functions directly — cleaner; tests cover each.)

    Tests cover each primitive plus parseAmountToCents.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/AddSheet/__tests__/computeAddSheet.test.ts --run 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - All compute tests pass (≥ 18 cases).
    - tsc clean.
    - Exports include `appendDigit, appendDot, backspace, parseAmountToCents, ctaState, defaultDateForChip` (or equivalent named API).
  </acceptance_criteria>
  <done>Pure helpers tested; state machine for amount input + CTA + date chip ready.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Keypad component + tests</name>
  <files>frontend/src/screensV10/AddSheet/Keypad.tsx, frontend/src/screensV10/AddSheet/Keypad.module.css, frontend/src/screensV10/AddSheet/__tests__/Keypad.test.tsx</files>
  <read_first>
    - frontend/src/screensV10/AddSheet/computeAddSheet.ts (Task 1 helpers)
    - frontend/src/componentsV10/PosterButton.tsx (button styling reference)
    - .planning/v1.0-handoff/handoff/prototype/poster-screens.jsx (PosterAddSheet keypad ~lines 900-1200)
  </read_first>
  <behavior>
    Props:
    ```typescript
    export interface KeypadProps {
      onAppendDigit: (digit: string) => void;
      onAppendDot: () => void;
      onBackspace: () => void;
    }
    ```
    Renders a 3×4 grid (4 rows × 3 columns):
    - Row 1: 1 / 2 / 3
    - Row 2: 4 / 5 / 6
    - Row 3: 7 / 8 / 9
    - Row 4: . / 0 / ⌫
    Each cell: large font (24px Manrope), paper bg with 10% black border, tap → respective callback. Press feedback: scale 0.95 on `:active`.

    Tests (vitest):
    - Renders 12 buttons with labels '1'..'9', '.', '0', '⌫'.
    - Click '5' → onAppendDigit called with '5'.
    - Click '.' → onAppendDot called.
    - Click '⌫' → onBackspace called.
    - Keyboard accessibility: each button has role='button' and tabIndex=0.
  </behavior>
  <action>
    Create `Keypad.tsx`:
    ```tsx
    import styles from './Keypad.module.css';

    const DIGITS = ['1','2','3','4','5','6','7','8','9'] as const;

    export interface KeypadProps {
      onAppendDigit: (digit: string) => void;
      onAppendDot: () => void;
      onBackspace: () => void;
    }

    export function Keypad({ onAppendDigit, onAppendDot, onBackspace }: KeypadProps) {
      return (
        <div className={styles.grid} role="group" aria-label="Цифровая клавиатура">
          {DIGITS.map((d) => (
            <button
              key={d}
              type="button"
              className={styles.key}
              onClick={() => onAppendDigit(d)}
            >
              {d}
            </button>
          ))}
          <button type="button" className={styles.key} onClick={onAppendDot}>
            .
          </button>
          <button type="button" className={styles.key} onClick={() => onAppendDigit('0')}>
            0
          </button>
          <button
            type="button"
            className={`${styles.key} ${styles.keyBackspace}`}
            onClick={onBackspace}
            aria-label="Удалить последнюю цифру"
          >
            ⌫
          </button>
        </div>
      );
    }
    ```

    `Keypad.module.css`:
    ```css
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      width: 100%;
    }
    .key {
      background: var(--poster-paper);
      color: var(--poster-ink);
      border: 1px solid rgba(0,0,0,0.1);
      font-family: var(--poster-font-manrope), system-ui, sans-serif;
      font-size: 24px;
      font-weight: 600;
      padding: 18px 0;
      cursor: pointer;
      transition: transform 0.08s ease-out;
    }
    .key:active { transform: scale(0.95); }
    .keyBackspace { background: rgba(255,246,232,0.18); color: var(--poster-paper); }
    ```

    Tests in `__tests__/Keypad.test.tsx`:
    - render Keypad with mock callbacks; assert 12 buttons.
    - fireEvent.click on '5' button → expect mockOnAppendDigit called with '5'.
    - fireEvent.click on '.' → expect mockOnAppendDot called.
    - fireEvent.click on '⌫' → expect mockOnBackspace called.

    Use `afterEach(cleanup)` per Plan 25-02 SUMMARY pattern.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/AddSheet/__tests__/Keypad.test.tsx --run 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - Keypad tests pass (≥ 5 cases).
    - tsc clean.
    - 12 buttons rendered (9 digits + '.', '0', '⌫').
  </acceptance_criteria>
  <done>Keypad renders 3×4 grid; all click handlers wired; tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: AddSheet body — header / amount / description / date / category / account / CTA / submit</name>
  <files>frontend/src/screensV10/AddSheet/AddSheet.tsx, frontend/src/screensV10/AddSheet/AddSheet.module.css, frontend/src/screensV10/AddSheet/__tests__/AddSheet.test.tsx, frontend/src/screensV10/AddSheet/index.ts</files>
  <read_first>
    - frontend/src/screensV10/Onboarding/Step02Accounts.tsx (sheet form pattern with multiple inputs)
    - frontend/src/screensV10/Onboarding/format.ts (formatRubles)
    - frontend/src/componentsV10/BigFig.tsx
    - frontend/src/componentsV10/Chip.tsx
    - frontend/src/screensV10/AddSheet/Keypad.tsx (Task 2)
    - frontend/src/screensV10/AddSheet/computeAddSheet.ts (Task 1)
  </read_first>
  <behavior>
    Props:
    ```typescript
    export interface AddSheetProps {
      onSubmitted: (txId: number) => void;
      onClose: () => void;
    }
    ```

    State (useReducer or several useState):
    - amountString: '' (input format like '12.50').
    - description: ''.
    - dateChip: 'today' | 'yesterday' | 'custom'; customDate: string (ISO).
    - categoryId: number | null.
    - accountId: number | null (initialized to primary on accounts fetch).
    - categories, accounts: fetched on mount.
    - showCancelConfirm: boolean.
    - submitting: boolean.

    Renders (per prototype lines 900-1200):
    - Header row: Eyebrow «NEW ENTRY · {today_short} · {time_HM}» + `×` button top-right.
    - Big amount block: BigFig 86px yellow showing parseAmountToCents/100 (formatted as integer rubles + decimals if any).
    - Custom 3×4 Keypad component below BigFig.
    - Description input: `<input type="text" placeholder="кафе / продукты / …" className={styles.descInput}/>`. Placeholder uses italic-серif font (var(--poster-font-pt-serif), italic).
    - Date chip-bar: 3 chips (Сегодня / Вчера / Своя дата). 'Своя дата' click → opens native `<input type="date">` overlay or DatePicker.
    - Category chip-scroll: horizontal scroll, single-select. Categories filtered by `code !== 'savings' && !paused`. Each chip has cat.name; tap → setCategoryId(cat.id).
    - Account row: shows current account «{bank} ·· {mask}» with «→» chevron; tap → opens picker (a small inline list expansion or another PosterSheet — for v1, use a simple `<select>` styled element; document deferred polish).
    - CTA bar pinned to bottom: large button. Label and styling from `ctaState`:
      - 'empty' → «ВВЕДИТЕ СУММУ» gray bg, disabled.
      - 'no-cat' → «ВЫБЕРИТЕ КАТЕГОРИЮ» gray bg, disabled.
      - 'ready' → «СОХРАНИТЬ ↵» yellow bg, active.
    - Click CTA when ready → submit handler:
      ```typescript
      const tx_date = dateChip === 'today' || dateChip === 'yesterday'
        ? defaultDateForChip(dateChip, new Date())!
        : customDate;
      try {
        const result = await createActualV10({
          kind: 'expense',
          amount_cents: parseAmountToCents(amountString),
          description: description || null,
          category_id: categoryId!,
          tx_date,
          account_id: accountId,
        });
        onSubmitted(result.id);
      } catch {
        // show inline error toast / banner
      }
      ```
    - Click `×` with dirty form (any of amountString/description/categoryId set) → setShowCancelConfirm(true).
    - Cancel confirm overlay: «ОТМЕНИТЬ ЗАПИСЬ?» + 2 buttons («ПРОДОЛЖИТЬ» yellow → close confirm; «ОТМЕНИТЬ» red → onClose()).

    Tests `__tests__/AddSheet.test.tsx`:
    - Mock listAccounts/listCategoriesV10/createActualV10.
    - Renders header «NEW ENTRY · ...»; assert × button.
    - Click '5' on keypad → BigFig shows 5; CTA reads «ВЫБЕРИТЕ КАТЕГОРИЮ».
    - Click a category chip → CTA reads «СОХРАНИТЬ ↵» with active styling (data attribute or class assertion).
    - Click ready CTA → expect createActualV10 called with `{kind:'expense', amount_cents:500, category_id:N, account_id: primaryAcctId}`; onSubmitted called with returned id.
    - Click × with dirty form → confirm overlay visible.
    - Click «ПРОДОЛЖИТЬ» → confirm overlay gone, form preserved.
    - Click «ОТМЕНИТЬ» from confirm → onClose called.
    - Click × with empty form → onClose called immediately (no confirm).
    - Click «.» → '0.' in BigFig.
    - Click '⌫' → last char removed.
  </behavior>
  <action>
    Implement AddSheet.tsx with the layout per prototype. Use useReducer for compactness or split into useState — both acceptable (5+ pieces of state).

    On mount: `Promise.all([listAccounts(), listCategoriesV10()])` then set state + initial accountId = `accs.find(a => a.primary)?.id ?? accs[0]?.id ?? null`.

    Submit guard: disable CTA while `submitting === true` regardless of state.

    For the date picker, use a native `<input type="date" hidden ref={dateInputRef} onChange={...} />` and trigger `dateInputRef.current?.showPicker()` on the «Своя дата» chip click. Falls back to `click()` if showPicker isn't supported (Safari < 16).

    Implement also:
    - barrel `frontend/src/screensV10/AddSheet/index.ts`:
      ```typescript
      export { AddSheet, type AddSheetProps } from './AddSheet';
      export { Keypad, type KeypadProps } from './Keypad';
      ```

    Test mocks via `vi.mock('../../api/v10/actual', ...)` and `vi.mock('../../api/v10/accounts', ...)`.

    For `await waitFor(...)` patterns, use `findByText` / `findByRole` from @testing-library/react.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/AddSheet --run 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - AddSheet tests pass (≥ 9 cases).
    - tsc strict clean.
    - `grep -c "createActualV10\|listAccounts\|listCategoriesV10" frontend/src/screensV10/AddSheet/AddSheet.tsx` ≥ 3.
    - `grep -c "ВВЕДИТЕ СУММУ\|ВЫБЕРИТЕ КАТЕГОРИЮ\|СОХРАНИТЬ" frontend/src/screensV10/AddSheet/AddSheet.tsx` ≥ 3.
    - `grep -c "ОТМЕНИТЬ ЗАПИСЬ" frontend/src/screensV10/AddSheet/AddSheet.tsx` ≥ 1 (cancel-confirm gate).
  </acceptance_criteria>
  <done>AddSheet integrates Keypad + form fields + CTA state + submit + cancel-confirm; tests pass.</done>
</task>

<task type="auto">
  <name>Task 4: Wire AddSheet into V10MainShell — replace AddSheetPlaceholderContent</name>
  <files>frontend/src/screensV10/V10MainShell.tsx</files>
  <read_first>
    - frontend/src/screensV10/V10MainShell.tsx (Plan 25-06 — AddSheetPlaceholderContent rendered inside PosterSheet)
    - frontend/src/screensV10/AddSheet/index.ts (barrel from Task 3)
  </read_first>
  <action>
    1. In `V10MainShell.tsx`:
       - Replace `import { AddSheetPlaceholderContent }` (or inline definition) with `import { AddSheet } from './AddSheet';`.
       - Inside the `<PosterSheet ...>` wrapper, replace `<AddSheetPlaceholderContent onClose={...} />` with:
         ```tsx
         <AddSheet
           onSubmitted={(_id) => {
             setAddSheet(false);
             // Optional: trigger a HomeMount/TransactionsMount refetch via a key bump.
             // For now: leave reload to user pull-to-refresh; document in SUMMARY.
           }}
           onClose={() => setAddSheet(false)}
         />
         ```
       - If V10MainShell defined `AddSheetPlaceholderContent` inline (Plan 25-06 Task 1), DELETE that inline definition.
       - Update file header comment: «Phase 25-10: AddSheet wired in (replaces AddSheetPlaceholderContent)».

    2. **Refresh strategy after submit** — CONTEXT specifics says «txn появляется в Home / Transactions» after submit. Two options:
       a. Bump a key on PosterRouter root to force HomeMount/TransactionsMount refetch.
       b. Plumb a global refresh-counter via context.

       For Plan 25-10 simplicity: do NOT add the refetch wiring; document as known minor UX gap (user needs to pop back to Home for fresh data). Plan 25-12 acceptance can verify this and decide if a per-screen refetch hook is needed.

       **Alternative:** add a `txMutationKey` state at V10MainShell level, increment on submit, pass to HomeMount/TransactionsMount via React context (`PosterTxBumpContext`). HomeMount/TransactionsMount include the bump in their useEffect deps to trigger refetch.

       **Decision:** keep it simple in Plan 25-10 — document the gap, defer the refetch wiring to Plan 25-12 polish if user testing flags it. Submit just closes the sheet.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -5 && npm test -- screensV10/__tests__/V10MainShell.test.tsx --run 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "import.*AddSheet.*from.*'./AddSheet'" frontend/src/screensV10/V10MainShell.tsx` ≥ 1.
    - `grep -c "AddSheetPlaceholderContent" frontend/src/screensV10/V10MainShell.tsx` == 0 (removed/replaced).
    - tsc strict clean.
    - V10MainShell tests still green (some assertions may need updating since the placeholder text «WIP — Real AddSheet ships in Plan 25-10» is gone).
  </acceptance_criteria>
  <done>V10MainShell renders real AddSheet on FAB tap; placeholder removed; existing shell tests updated to match.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` clean.
2. `npm test -- screensV10/AddSheet --run` → all tests pass.
3. `npm test -- --run` → full project suite green.
4. `grep -c "AddSheet\b" frontend/src/screensV10/V10MainShell.tsx` ≥ 2 (import + JSX usage).
5. `grep -c "AddSheetPlaceholderContent" frontend/src/screensV10/V10MainShell.tsx` == 0.
6. `npm run build` succeeds.
</verification>

<success_criteria>
- ADD-V10-01: FAB on every screen → AddSheet opens via PosterSheet (backgroundColor=#0E0E0E); BottomNav hidden while open.
- ADD-V10-02: Keypad 3×4 is the ONLY input; no native input element; BigFig 86px yellow shows the amount.
- ADD-V10-03: description input + 3 date chips functional.
- ADD-V10-04: category chip-scroll filters savings + paused; account row shows primary by default.
- ADD-V10-05: 3-state CTA («ВВЕДИТЕ СУММУ» → «ВЫБЕРИТЕ КАТЕГОРИЮ» → «СОХРАНИТЬ ↵»); dirty-close confirm gate.
- Submit calls createActualV10 with account_id (server fires v10 path: balance delta + roundup hook from Plan 25-01).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-10-web-addsheet-SUMMARY.md` documenting:
- Keypad state-machine implementation choice (primitives vs orchestrator).
- Date picker fallback chain (showPicker vs click).
- Account picker UX (defer richer picker to Plan 25-12).
- Refetch-after-submit strategy chosen vs deferred.
- Cancel-confirm gate UX.
</output>
</content>
</invoke>