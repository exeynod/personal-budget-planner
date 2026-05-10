---
phase: 25-home-transactions-add-sheet
plan: 8
type: execute
wave: 2
depends_on: [2, 3, 4, 6]
files_modified:
  - frontend/src/screensV10/Transactions/TransactionsView.tsx
  - frontend/src/screensV10/Transactions/TransactionsView.module.css
  - frontend/src/screensV10/Transactions/TransactionsMount.tsx
  - frontend/src/screensV10/Transactions/computeTransactions.ts
  - frontend/src/screensV10/Transactions/__tests__/computeTransactions.test.ts
  - frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx
  - frontend/src/screensV10/Transactions/index.ts
  - frontend/src/screensV10/Home/HomeMount.tsx
autonomous: true
gap_closure: true
requirements:
  - TXN-V10-01
  - TXN-V10-02
  - TXN-V10-03
  - TXN-V10-04
  - TXN-V10-05

must_haves:
  truths:
    - "TransactionsView renders cobalt bg + eyebrow «SECTION II» + Mass italic «Реестр.» + eyebrow «N ЗАПИСЕЙ · X ₽» (TXN-V10-01)."
    - "Single-select chip-bar (Все / Кафе / Продукты / Транспорт / Подписки / Копилка) filters the registry; «Все» default; client-side filter (TXN-V10-02)."
    - "Transactions grouped by day (Сегодня / Вчера / «N мая» via formatDay), each header in DM Serif italic 28px with day-sum on right (TXN-V10-03)."
    - "Each row: time mono · name · `категория · СЧЁТ uppercase` · amount mono with U+2212 for negatives (TXN-V10-04)."
    - "Roundup rows show inline yellow plate «↻ ОКРУГЛ.»; deposit rows show inline plate «→ КОПИЛКА» (TXN-V10-04)."
    - "Tap row → opens edit modal/sheet (PosterSheet wrapping a thin TransactionEditor stub for now); right-click context-menu → confirm-sheet «УДАЛИТЬ ОПЕРАЦИЮ?» (TXN-V10-05)."
    - "TransactionsMount swap target: HomeMount imports TransactionsMount (replaces TransactionsViewPlaceholder); push from Home «ВСЕ ОПЕРАЦИИ →» now lands on real registry (T-T-01)."
  artifacts:
    - path: "frontend/src/screensV10/Transactions/TransactionsView.tsx"
      provides: "Pure presentational registry component (cobalt bg, header, filter chips, day-grouped list, edit/delete handlers as props)"
      min_lines: 180
      exports: ["TransactionsView", "type TransactionsViewProps"]
    - path: "frontend/src/screensV10/Transactions/TransactionsMount.tsx"
      provides: "Data fetcher: parallel listActualV10 + listCategoriesV10 + listAccounts; computes filter+grouping via computeTransactions; renders TransactionsView"
      min_lines: 80
      exports: ["TransactionsMount"]
    - path: "frontend/src/screensV10/Transactions/computeTransactions.ts"
      provides: "Pure helpers: applyFilterChip, groupByDay, computeHeaderSummary, formatTxAmount (with U+2212), tagFor (roundup/deposit/null)"
      exports: ["applyFilterChip", "groupByDay", "computeHeaderSummary", "formatTxAmount", "tagFor", "type TxFilterChip", "type TxDayGroup"]
    - path: "frontend/src/screensV10/Transactions/index.ts"
      provides: "Barrel re-export"
      exports: ["TransactionsView", "TransactionsMount", "type TransactionsViewProps"]
  key_links:
    - from: "frontend/src/screensV10/Transactions/TransactionsMount.tsx"
      to: "api/v10/{actual,categories,accounts}"
      via: "Promise.all + listActualV10(periodId)"
      pattern: "listActualV10\\|listCategoriesV10\\|listAccounts"
    - from: "frontend/src/screensV10/Home/HomeMount.tsx"
      to: "TransactionsMount (replaces TransactionsViewPlaceholder import)"
      via: "import + push as router target"
      pattern: "TransactionsMount\\|TransactionsView"
    - from: "TransactionsView row tap"
      to: "onRowTap(txId) callback → opens edit PosterSheet"
      via: "props callback"
      pattern: "onRowTap\\|onRowDelete"
---

<objective>
Build the web Transactions registry (TXN-V10-01..05) — cobalt push-stack screen with day-grouping headers (DM Serif italic), single-select filter chip-bar, formatted rows with roundup/deposit spec-tags, edit/delete action plumbing — and wire it into HomeMount as the real target for «ВСЕ ОПЕРАЦИИ →» (replacing the existing TransactionsViewPlaceholder).

Purpose: close TXN-V10-01..05 (entirely absent in Phase 25 to date).
Output: 4 new source files (View + Mount + compute + barrel) + 2 unit tests + 1 modification to HomeMount.tsx import + edit sheet stub (real editor refactor deferred to Phase 26 per CONTEXT D-Defer).
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
@.planning/phases/25-home-transactions-add-sheet/25-04-web-home-view-SUMMARY.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@frontend/src/api/v10/actual.ts
@frontend/src/api/v10/categories.ts
@frontend/src/api/v10/accounts.ts
@frontend/src/screensV10/common/format.ts
@frontend/src/componentsV10/Eyebrow.tsx
@frontend/src/componentsV10/Mass.tsx
@frontend/src/componentsV10/Plate.tsx
@frontend/src/componentsV10/Chip.tsx
@frontend/src/screensV10/Home/HomeMount.tsx
@frontend/src/screensV10/_placeholders.tsx

<interfaces>
<!-- Wave-1/2/3 outputs the executor consumes. -->

From frontend/src/api/v10/actual.ts (Plan 25-03):
```typescript
export async function listActualV10(
  periodId: number,
  filters?: { kind?: 'expense'|'income'|'roundup'|'deposit'; category_id?: number },
): Promise<ActualV10Read[]>;

export interface ActualV10Read {
  id: number;
  period_id: number;
  kind: 'expense' | 'income' | 'roundup' | 'deposit';
  amount_cents: number;
  description: string | null;
  category_id: number;
  tx_date: string;             // ISO date "YYYY-MM-DD"
  source: string;
  created_at: string;
  account_id: number | null;
  parent_txn_id: number | null;
}
```

From frontend/src/api/v10/categories.ts:
```typescript
export interface CategoryV10 {
  id: number; name: string; kind: 'expense'|'income';
  code: string | null;          // 'food'|'cafe'|'transit'|'subs'|'savings'|...
  is_archived: boolean; sort_order: number;
  plan_cents: number; rollover: 'misc'|'savings'; paused: boolean;
  parent_id: number | null; ord: number; created_at: string;
}
export async function listCategoriesV10(): Promise<CategoryV10[]>;
```

From frontend/src/api/v10/accounts.ts:
```typescript
export interface AccountResponse {
  id: number; bank: string; mask: string | null;
  kind: 'card'|'cash'|'savings';
  balance_cents: number; primary: boolean; created_at: string;
}
export async function listAccounts(): Promise<AccountResponse[]>;
```

From frontend/src/screensV10/common/format.ts:
```typescript
export function formatDay(d: Date, today: Date): string;     // 'Сегодня'/'Вчера'/'7 мая'
export function formatTimeHM(d: Date): string;               // 'HH:MM' zero-padded
export function pluralDays(n: number): string;
```

From frontend/src/api/periods.ts (Plan 25-04 added):
```typescript
export async function getCurrentPeriod(): Promise<PeriodRead | null>;  // null on 404
```

Filter chip mapping (per CONTEXT specifics):
| Chip label | Filter logic |
|------------|--------------|
| Все | no filter (all kinds, all categories) |
| Кафе | category.code === 'cafe' |
| Продукты | category.code === 'food' |
| Транспорт | category.code === 'transit' |
| Подписки | category.code === 'subs' (CONTEXT: defer subscription-link join) |
| Копилка | kind IN ('roundup', 'deposit') |
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API responses → TransactionsView state | server-validated; client trusts after RLS gate |
| Filter chip → client-side filter | no network — local state only |
| Delete → DELETE /actual/{id} | needs confirmation gate (T-25-08-02 mitigation) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-08-01 | Tampering | Filter chip showing wrong category | mitigate | Mapping is hardcoded const; filter is `cat.code === 'cafe'` etc. — no user input, no XSS surface. |
| T-25-08-02 | Repudiation | Accidental delete on right-click | mitigate | Right-click → context-menu → confirm-sheet «УДАЛИТЬ ОПЕРАЦИЮ?» — two clicks required before DELETE fires. |
| T-25-08-03 | Information Disclosure | Showing other-user's txns | accept | RLS server-side; listActualV10 returns only authenticated user's rows. |
| T-25-08-04 | DoS | Rendering 10K+ rows freezes browser | accept | Single-tenant, single-period; expected ~50-200 rows max per period. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure compute helpers + tests</name>
  <files>frontend/src/screensV10/Transactions/computeTransactions.ts, frontend/src/screensV10/Transactions/__tests__/computeTransactions.test.ts</files>
  <read_first>
    - frontend/src/screensV10/common/format.ts (formatDay / formatTimeHM signatures)
    - frontend/src/api/v10/actual.ts (ActualV10Read shape)
    - frontend/src/screensV10/Home/computeHomeData.ts (pattern for pure helpers + test layout)
  </read_first>
  <behavior>
    - `applyFilterChip(actuals: ActualV10Read[], categories: CategoryV10[], chip: TxFilterChip): ActualV10Read[]`:
      - chip='all' → returns all
      - chip='cafe' → returns rows where `categories.find(c => c.id === a.category_id)?.code === 'cafe'`
      - chip='food' / 'transit' / 'subs' → similar code-match
      - chip='savings' → returns rows where `kind === 'roundup' || kind === 'deposit'`
    - `groupByDay(actuals: ActualV10Read[], today: Date): TxDayGroup[]`:
      - Returns array of `{ dateLabel: string; dateKey: string; rows: ActualV10Read[]; sumCents: number }`.
      - dateLabel via `formatDay(new Date(tx.tx_date), today)`.
      - dateKey = ISO date string for stable React keys.
      - sumCents = sum of `Math.abs(tx.amount_cents)` for all rows in group.
      - Groups sorted by dateKey DESC (most recent first).
      - Within a group rows sorted by `created_at DESC` (most recent first).
    - `computeHeaderSummary(actuals: ActualV10Read[]): { count: number; sumCents: number }`:
      - count = actuals.length.
      - sumCents = sum of `Math.abs(amount_cents)` over filtered actuals.
    - `formatTxAmount(amount_cents: number): string`:
      - Negative numbers prefixed with U+2212 (NOT ASCII '-') and absolute value formatted with U+202F thin space grouping.
      - Positive numbers prefixed with '+' and same formatting.
      - Zero → '0 ₽'.
      - Tests: `formatTxAmount(-12500_00)` → `'−12${U+202F}500 ₽'`; `formatTxAmount(1000_00)` → `'+1${U+202F}000 ₽'`.
    - `tagFor(tx: ActualV10Read): 'roundup' | 'deposit' | null`:
      - Returns 'roundup' if kind === 'roundup'; 'deposit' if kind === 'deposit'; null otherwise.
    - `type TxFilterChip = 'all' | 'cafe' | 'food' | 'transit' | 'subs' | 'savings'`.
    - `type TxDayGroup = { dateLabel: string; dateKey: string; rows: ActualV10Read[]; sumCents: number }`.

    Tests in `__tests__/computeTransactions.test.ts` (vitest):
    - applyFilterChip: 6 cases, one per chip including 'all' returns identity.
    - groupByDay: empty input → empty output; mixed-day input → 2+ groups sorted DESC.
    - computeHeaderSummary: empty → {count:0, sumCents:0}; mixed → correct sums.
    - formatTxAmount: negative, positive, zero, large (1M+ rubles), and U+2212 + U+202F char point assertions.
    - tagFor: each kind value returns expected tag.
  </behavior>
  <action>
    Implement the 5 pure functions in `computeTransactions.ts`. Use `formatRubles` from Onboarding/format.ts as the underlying number formatter (U+202F separators) — ONLY add the sign prefix and ₽ suffix differently.

    Type definitions exported. No React imports.

    Tests use the same vitest patterns as `screensV10/Home/__tests__/computeHomeData.test.ts` (Plan 25-04).
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/Transactions/__tests__/computeTransactions.test.ts --run 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - All compute tests pass (≥ 15 cases).
    - `grep -c "U+2212\|\\u2212\|−" frontend/src/screensV10/Transactions/computeTransactions.ts` ≥ 1 (negative-prefix character).
    - tsc clean.
  </acceptance_criteria>
  <done>Pure helpers + types exported; tests cover happy + edge cases.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TransactionsView presentational component + tests</name>
  <files>frontend/src/screensV10/Transactions/TransactionsView.tsx, frontend/src/screensV10/Transactions/TransactionsView.module.css, frontend/src/screensV10/Transactions/__tests__/TransactionsView.test.tsx</files>
  <read_first>
    - frontend/src/componentsV10/Eyebrow.tsx (props: children, opacity, color)
    - frontend/src/componentsV10/Mass.tsx (props: italic, size, color, children)
    - frontend/src/componentsV10/Plate.tsx (props: tone)
    - frontend/src/componentsV10/Chip.tsx (verify props: active, label, onClick)
    - frontend/src/stylesV10/animations.css (`.poster-row-in` keyframe class)
    - frontend/src/screensV10/Home/HomeView.tsx (pattern for absolute-fill colored bg + scroll + section headers)
    - .planning/v1.0-handoff/handoff/prototype/poster-screens.jsx (lines for PosterTransactions ~500-800 reference)
  </read_first>
  <behavior>
    Props:
    ```typescript
    export interface TransactionsViewProps {
      headerCount: number;                 // 'N ЗАПИСЕЙ'
      headerSumCents: number;              // 'X ₽'
      filterChip: TxFilterChip;
      onChipChange: (chip: TxFilterChip) => void;
      dayGroups: TxDayGroup[];             // pre-grouped (already filtered + sorted)
      categories: CategoryV10[];           // for resolving cat.name in row
      accounts: AccountResponse[];         // for resolving account mask in row
      onRowTap: (tx: ActualV10Read) => void;
      onRowDelete: (tx: ActualV10Read) => void;     // confirmed before invocation by view
      onBack: () => void;                  // ← НАЗАД top-left
    }
    ```

    Renders (mirror prototype lines 500-800):
    - Cobalt background (var(--poster-cobalt)) absolute-fill.
    - Top-left «← НАЗАД» mono link → onBack().
    - Eyebrow «SECTION II» on left, eyebrow «{count} ЗАПИСЕЙ · {formatRubles(sumCents)} ₽» on right (top row below back link).
    - Mass italic «Реестр.» size 88, color paper.
    - Filter chip-bar: horizontal scroll, 6 chips (Все/Кафе/Продукты/Транспорт/Подписки/Копилка), active chip highlighted (use `<Chip active={...} />`); single-select via onChipChange.
    - Day groups (ForEach):
      - Header: DM Serif italic 28px paper for dateLabel; right-aligned mono small `formatRubles(sumCents)} ₽` for day-sum.
      - Rows (ForEach):
        - Time mono 11px (formatTimeHM(tx.created_at)).
        - Description (paper, 16px Manrope) — tx.description ?? cat.name fallback.
        - Sub-line: «{cat.name} · {account.bank?.toUpperCase()} · {account.mask}» — small mono opacity 0.6.
        - Right-side amount: `formatTxAmount(tx.amount_cents)` mono 16px (yellow if positive, paper if negative).
        - Inline tag (right of description, before amount):
          - kind='roundup' → yellow plate `↻ ОКРУГЛ.` (10px Archivo Black on yellow bg, 4px padding).
          - kind='deposit' → cobalt-on-paper plate `→ КОПИЛКА`.
          - else → no tag.
        - Row clickable → onRowTap(tx); right-click → opens browser context-menu hijacked: `e.preventDefault()` + display custom inline confirm OR rely on browser confirm() for v1 simplicity (CONTEXT D-Defer: web uses right-click context-menu — implement minimum: right-click → `if (window.confirm('Удалить операцию?'))` → onRowDelete(tx). Acceptable for desktop-only fallback; mobile gets onRowTap = edit; deletion via long-press → defer to mobile polish).
        - Each row stagger: `.poster-row-in` with `style={{ animationDelay: \`${0.07 + dayGroupIdx*0.07 + rowIdx*0.045}s\` }}`.

    Tests `__tests__/TransactionsView.test.tsx`:
    - Render with sample props (3 rows in 2 day groups). Assert:
      - «Реестр.» visible.
      - Header «3 ЗАПИСЕЙ · X ₽» visible.
      - 6 chip buttons rendered.
      - Click chip 'Кафе' → onChipChange called with 'cafe'.
      - Day labels appear (Сегодня / Вчера).
      - Roundup row has «↻ ОКРУГЛ.» plate.
      - Deposit row has «→ КОПИЛКА» plate.
      - Click row → onRowTap called with tx object.
      - ← НАЗАД click → onBack called.
      - Negative amount displayed with U+2212.
      - Empty state (dayGroups=[]) → renders «Реестр пуст — добавьте первую трату» italic.
  </behavior>
  <action>
    Pure presenter — no fetch, no router. CSS module for static styles. Use globally-defined animation classes from `stylesV10/animations.css`.

    For roundup/deposit plates: inline `<span className={styles.tagRoundup}>↻ ОКРУГЛ.</span>` and `<span className={styles.tagDeposit}>→ КОПИЛКА</span>` — small plates beside description, NOT full-width Plate components.

    For DM Serif italic day-group header: use existing CSS variable `var(--poster-font-dm-serif)`; if not set, fall back to `var(--poster-font-pt-serif)` (cyrillic via ADR-001).

    For filter chips: import `Chip` from `componentsV10`. Each chip has `active={filterChip === 'cafe'}` and `onClick={() => onChipChange('cafe')}` etc.

    Empty state: when `dayGroups.length === 0`, render a centered italic Mass «Реестр пуст —» + mono hint «добавьте первую трату через FAB».
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/Transactions/__tests__/TransactionsView.test.tsx --run 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - All view tests pass (≥ 10 cases).
    - `grep -c "↻ ОКРУГЛ.\|→ КОПИЛКА" frontend/src/screensV10/Transactions/TransactionsView.tsx` ≥ 2.
    - `grep -c "Все\|Кафе\|Продукты\|Транспорт\|Подписки\|Копилка" frontend/src/screensV10/Transactions/TransactionsView.tsx` ≥ 6.
    - tsc strict clean.
  </acceptance_criteria>
  <done>TransactionsView renders all TXN-V10-01..04 elements; tap/delete/back/chip handlers wired; tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: TransactionsMount fetcher + edit/delete plumbing + barrel + HomeMount swap</name>
  <files>frontend/src/screensV10/Transactions/TransactionsMount.tsx, frontend/src/screensV10/Transactions/index.ts, frontend/src/screensV10/Home/HomeMount.tsx</files>
  <read_first>
    - frontend/src/screensV10/Home/HomeMount.tsx (pattern for fetch + state machine + router; placeholder import to swap)
    - frontend/src/screensV10/_placeholders.tsx (TransactionsViewPlaceholder export — that gets superseded but kept for back-compat)
    - frontend/src/api/v10/actual.ts + accounts.ts + categories.ts
    - frontend/src/api/periods.ts (getCurrentPeriod helper)
    - frontend/src/api/actual.ts (existing v0.x DELETE endpoint — reuse if signature matches; else add to v10/actual.ts)
    - frontend/src/screensV10/common/PosterSheet.tsx (props: isOpen, onClose, children, backgroundColor)
  </read_first>
  <action>
    1. Create `frontend/src/screensV10/Transactions/TransactionsMount.tsx`:
       ```tsx
       import { useEffect, useMemo, useState } from 'react';
       import {
         listActualV10,
         type ActualV10Read,
       } from '../../api/v10/actual';
       import { listCategoriesV10, type CategoryV10 } from '../../api/v10/categories';
       import { listAccounts, type AccountResponse } from '../../api/v10/accounts';
       import { getCurrentPeriod } from '../../api/periods';
       import { usePosterRouter, PosterSheet } from '../common';
       import { TransactionsView } from './TransactionsView';
       import {
         applyFilterChip, groupByDay, computeHeaderSummary,
         type TxFilterChip,
       } from './computeTransactions';
       // Existing v0.x delete endpoint — reuse:
       import { deleteActual } from '../../api/actual';   // verify import path; if absent add minimal wrapper

       export function TransactionsMount() {
         const router = usePosterRouter();
         const [status, setStatus] = useState<'loading'|'error'|'ready'>('loading');
         const [errMsg, setErrMsg] = useState<string | null>(null);
         const [actuals, setActuals] = useState<ActualV10Read[]>([]);
         const [categories, setCategories] = useState<CategoryV10[]>([]);
         const [accounts, setAccounts] = useState<AccountResponse[]>([]);
         const [chip, setChip] = useState<TxFilterChip>('all');
         const [editingTx, setEditingTx] = useState<ActualV10Read | null>(null);

         const today = useMemo(() => new Date(), []);

         const reload = async () => {
           setStatus('loading');
           try {
             const [period, cats, accs] = await Promise.all([
               getCurrentPeriod(),
               listCategoriesV10(),
               listAccounts(),
             ]);
             const acts = period ? await listActualV10(period.id) : [];
             setActuals(acts);
             setCategories(cats);
             setAccounts(accs);
             setStatus('ready');
           } catch {
             setErrMsg('не удалось загрузить транзакции');
             setStatus('error');
           }
         };

         useEffect(() => { void reload(); }, []);

         const filteredActuals = useMemo(
           () => applyFilterChip(actuals, categories, chip),
           [actuals, categories, chip],
         );
         const dayGroups = useMemo(() => groupByDay(filteredActuals, today), [filteredActuals, today]);
         const summary = useMemo(() => computeHeaderSummary(filteredActuals), [filteredActuals]);

         const handleDelete = async (tx: ActualV10Read) => {
           // Browser-level confirm (T-25-08-02 mitigation — desktop-only path; mobile uses long-press in Plan 25-12 polish)
           if (!window.confirm('Удалить операцию?')) return;
           try {
             await deleteActual(tx.id);
             await reload();
           } catch {
             window.alert('не удалось удалить — попробуйте снова');
           }
         };

         if (status === 'loading') return <LoadingPlate />;
         if (status === 'error') return <ErrorPlate msg={errMsg} onRetry={reload} />;

         return (
           <>
             <TransactionsView
               headerCount={summary.count}
               headerSumCents={summary.sumCents}
               filterChip={chip}
               onChipChange={setChip}
               dayGroups={dayGroups}
               categories={categories}
               accounts={accounts}
               onRowTap={setEditingTx}
               onRowDelete={handleDelete}
               onBack={() => router.pop()}
             />
             <PosterSheet
               isOpen={editingTx !== null}
               onClose={() => setEditingTx(null)}
               backgroundColor="var(--poster-paper)"
             >
               <EditPlaceholder tx={editingTx} onClose={() => setEditingTx(null)} />
             </PosterSheet>
           </>
         );
       }

       function LoadingPlate() {
         return <div style={{position:'absolute', inset:0, background:'var(--poster-cobalt)', color:'var(--poster-paper)', padding:'56px 22px'}}>Загрузка реестра…</div>;
       }
       function ErrorPlate({msg, onRetry}: {msg: string | null; onRetry: () => void}) {
         return (
           <div style={{position:'absolute', inset:0, background:'var(--poster-cobalt)', color:'var(--poster-paper)', padding:'56px 22px'}}>
             <div>{msg}</div>
             <button onClick={onRetry} style={{marginTop:16}}>Повторить</button>
           </div>
         );
       }
       function EditPlaceholder({tx, onClose}: {tx: ActualV10Read | null; onClose: () => void}) {
         return (
           <div style={{padding:'56px 22px'}}>
             <h3>Редактировать операцию #{tx?.id}</h3>
             <p style={{fontSize:11, opacity:0.6}}>WIP — TransactionEditor poster retrofit shipped in Phase 26 (CONTEXT D-Defer).</p>
             <button onClick={onClose}>Закрыть</button>
           </div>
         );
       }
       ```

    2. **Verify deleteActual import path**: grep `export.*deleteActual` in `frontend/src/api/`; if absent, add a thin v10 wrapper:
       ```typescript
       // frontend/src/api/v10/actual.ts addition:
       export async function deleteActualV10(id: number): Promise<void> {
         await apiFetch<void>(`/actual/${id}`, { method: 'DELETE' });
       }
       ```
       and import that instead. Document in SUMMARY which path was taken.

    3. Create `frontend/src/screensV10/Transactions/index.ts` barrel:
       ```typescript
       export { TransactionsView, type TransactionsViewProps } from './TransactionsView';
       export { TransactionsMount } from './TransactionsMount';
       export {
         applyFilterChip, groupByDay, computeHeaderSummary, formatTxAmount, tagFor,
         type TxFilterChip, type TxDayGroup,
       } from './computeTransactions';
       ```

    4. Modify `frontend/src/screensV10/Home/HomeMount.tsx`:
       - Replace the `TransactionsViewPlaceholder` import + push target with `TransactionsMount`:
         - Was: `import { TransactionsViewPlaceholder } from '../_placeholders';` + `router.push(<TransactionsViewPlaceholder />)`.
         - Now: `import { TransactionsMount } from '../Transactions';` + `router.push(<TransactionsMount />)`.
       - Keep TransactionsViewPlaceholder export in `_placeholders.tsx` (other tests may depend on it; safe to leave).
       - Add inline comment: «Phase 25-08: TransactionsViewPlaceholder superseded by TransactionsMount.».
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -5 && npm test -- screensV10/Transactions screensV10/Home --run 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - tsc strict clean.
    - `grep -c "TransactionsMount" frontend/src/screensV10/Home/HomeMount.tsx` ≥ 1.
    - `grep -c "TransactionsViewPlaceholder" frontend/src/screensV10/Home/HomeMount.tsx` == 0 (replaced).
    - All Transactions + Home tests still green.
  </acceptance_criteria>
  <done>TransactionsMount mounted as Home «ВСЕ ОПЕРАЦИИ →» target; edit sheet stub opens; delete works with confirm; tsc clean.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` clean.
2. `npm test -- screensV10/Transactions --run` → all tests pass.
3. `npm test -- --run` → full project suite green (no regressions).
4. `grep -c "TransactionsMount" frontend/src/screensV10/Home/HomeMount.tsx` ≥ 1.
5. `grep -c "↻ ОКРУГЛ.\|→ КОПИЛКА" frontend/src/screensV10/Transactions/TransactionsView.tsx` ≥ 2.
6. `npm run build` succeeds.
</verification>

<success_criteria>
- TXN-V10-01: cobalt bg + Mass italic «Реестр.» + eyebrow header rendered.
- TXN-V10-02: 6 filter chips functional, single-select.
- TXN-V10-03: day grouping with DM Serif italic headers + day-sum on right.
- TXN-V10-04: rows formatted with U+2212 negatives + roundup/deposit inline plates.
- TXN-V10-05: row tap → edit sheet (stub); right-click → confirm → DELETE; v0.x editor reuse via PosterSheet container.
- HomeMount push «ВСЕ ОПЕРАЦИИ →» now lands on real TransactionsView (not placeholder).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-08-web-transactions-SUMMARY.md` with:
- Filter chip mapping table.
- Edit sheet strategy (stub now → real TransactionEditor poster retrofit in Phase 26).
- Delete UX (browser confirm vs context menu — chosen path).
- Empty-state copy.
- Stagger animation pattern.
</output>
</content>
</invoke>