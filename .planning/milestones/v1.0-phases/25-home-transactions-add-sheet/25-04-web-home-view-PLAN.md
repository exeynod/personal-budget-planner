---
phase: 25-home-transactions-add-sheet
plan: 4
type: execute
wave: 3
depends_on: [2, 3]
files_modified:
  - frontend/src/screensV10/Home/HomeView.tsx
  - frontend/src/screensV10/Home/HomeView.module.css
  - frontend/src/screensV10/Home/HomeMount.tsx
  - frontend/src/screensV10/Home/computeHomeData.ts
  - frontend/src/screensV10/Home/__tests__/computeHomeData.test.ts
  - frontend/src/screensV10/Home/__tests__/HomeView.test.tsx
  - frontend/src/screensV10/Home/index.ts
autonomous: true
requirements:
  - HOME-V10-01
  - HOME-V10-02
  - HOME-V10-03
  - HOME-V10-04
  - HOME-V10-05
  - HOME-V10-06

must_haves:
  truths:
    - "HomeView (coral bg) renders eyebrow VOL.NN/MONTH YYYY · N ДНЕЙ + italic Дневной темп — + BigFig with count-up."
    - "Wallet link «осталось N дней · в кошельке X ₽ →» tappable; X = Σ account.balance_cents."
    - "Plan-bar badge «PLAN МЕСЯЦА · ± X ₽ →» where X = surplus = planTotal - totalExpense."
    - "Category list filtered (code != 'savings' AND paused = false), sorted by act/plan DESC, plan_cents DESC; each row staggered posterRowIn + posterBarFill."
    - "OVER plate visible when act > plan; tap on row → router.push(CategoryDetailPlaceholder); ВСЕ ОПЕРАЦИИ → router.push(TransactionsView)."
  artifacts:
    - path: "frontend/src/screensV10/Home/HomeView.tsx"
      provides: "Pure presentational component"
      min_lines: 120
    - path: "frontend/src/screensV10/Home/HomeMount.tsx"
      provides: "Data-fetching wrapper using listAccounts / listCategoriesV10 / listActualV10"
      min_lines: 60
    - path: "frontend/src/screensV10/Home/computeHomeData.ts"
      provides: "Pure functions: computeDailyPace, computeSurplus, sortCategoriesForHome, computeWalletTotal, MeOnboardedPredicate"
      exports: ["computeDailyPace","computeSurplus","sortCategoriesForHome","computeWalletTotal","computeCategoryAggregates","type CategoryAggregateRow"]
  key_links:
    - from: "HomeMount"
      to: "api/v10/{accounts,categories,actual}"
      via: "Promise.all parallel fetch in useEffect"
      pattern: "Promise\\.all.*listAccounts.*listCategoriesV10"
    - from: "HomeView"
      to: "componentsV10 (BigFig, Eyebrow, Mass, Plate)"
      via: "named imports"
      pattern: "from '../../componentsV10'"
    - from: "HomeView category row"
      to: "PosterRouter.push (CategoryDetailPlaceholder)"
      via: "usePosterRouter().push from common/PosterRouter"
      pattern: "usePosterRouter"
---

<objective>
Build web HomeView covering HOME-V10-01..06 — coral hero, count-up daily pace, wallet link, plan bar, sorted category list with stagger, OVER plate, push routes.

Purpose: deliver the V10 entry-point screen; enables wiring (Plan 25-09) and downstream Transactions push.
Output: pure View + Mount data-fetcher + pure compute helpers + 2 unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-home-transactions-add-sheet/25-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@frontend/src/componentsV10/BigFig.tsx
@frontend/src/componentsV10/Eyebrow.tsx
@frontend/src/componentsV10/Mass.tsx
@frontend/src/componentsV10/Plate.tsx
@frontend/src/screensV10/Onboarding/format.ts
@frontend/src/api/types.ts

<interfaces>
<!-- Wave 1 + 2 outputs that this plan consumes. -->

From frontend/src/screensV10/common/index.ts (Plan 25-02):
```typescript
export function usePosterRouter(): PosterRouterAPI;       // {push, pop, popToRoot, ...}
export function formatPeriodEyebrow(d: Date): string;     // 'VOL.17 / MAY 2026 · 22 ДНЯ'
export function pluralDays(n: number): string;
```

From frontend/src/api/v10/index.ts (Plan 25-03):
```typescript
export async function listAccounts(): Promise<AccountResponse[]>;
export async function listCategoriesV10(): Promise<CategoryV10[]>;
export async function listActualV10(periodId: number): Promise<ActualV10Read[]>;
```

From frontend/src/api/periods.ts (existing v0.x):
```typescript
export async function getCurrentPeriod(): Promise<PeriodRead | null>;
// Path: GET /api/v1/periods/current → 200 with PeriodRead OR 404 (no active period yet)
```

From frontend/src/screensV10/Onboarding/format.ts:
```typescript
export function formatRubles(cents: number): string;  // U+202F thin-space grouping
```

Reference impl: prototype/poster-screens.jsx lines 202-299 (PosterHome). Layout patterns to mirror exactly.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API responses → HomeView state | server-validated; trust after RLS gate |
| Category filter `code != 'savings'` | client-side hide of system 'savings' category — server still returns it |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-04-01 | Information Disclosure | Showing system 'savings' category in user-facing list | mitigate | Filter `cat.code !== 'savings'` in computeCategoryAggregates AND `cat.paused === false` per CONTEXT D-Home. Asserted in compute test. |
| T-25-04-02 | Tampering | Negative daysLeft when tx_date in future | mitigate | `Math.max(1, daysLeft)` denominator guard already in formula; covered by computeDailyPace test. |
| T-25-04-03 | Denial of Service | Unbounded category list rendering | accept | 8-14 categories max in this app; React reconciliation handles trivially. |
| T-25-04-04 | XSS | Category.name rendered unescaped | accept | React JSX escapes by default; no dangerouslySetInnerHTML used. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure compute helpers + tests</name>
  <files>frontend/src/screensV10/Home/computeHomeData.ts, frontend/src/screensV10/Home/__tests__/computeHomeData.test.ts</files>
  <behavior>
    - computeDailyPace({planTotalCents, factTotalExpenseCents, daysLeft}) returns max(0, floor((plan-fact)/daysLeft)).
      - plan=100000_00, fact=20000_00, daysLeft=20 → 4000_00 (4000₽/day).
      - plan=100000_00, fact=120000_00, daysLeft=10 → 0 (clamp).
      - daysLeft=0 → uses denominator max(1, daysLeft); plan=100, fact=0, daysLeft=0 → 100.
    - computeSurplus({planTotalCents, factTotalExpenseCents}) returns plan - fact (signed).
    - computeWalletTotal(accounts) sums balance_cents across non-archived (well, accounts have no archive flag — sum all primary+others).
    - computeCategoryAggregates({categories, actuals}):
      - Filter categories: `code !== 'savings' && !paused`.
      - For each category: compute fact = sum of actuals where `category_id === cat.id AND kind === 'expense'` (do NOT count roundup/deposit toward category fact).
      - Return rows `{id, name, code, ord, plan_cents, fact_cents, ratio: fact/plan if plan>0 else +Infinity, isOver: fact > plan}`.
    - sortCategoriesForHome(rows): primary sort by `ratio DESC`, secondary by `plan_cents DESC`.
      - Test: 3 rows [{ratio:1.5}, {ratio:0.5}, {ratio:1.0}] → order [1.5, 1.0, 0.5].
      - Tie-break: same ratio → higher plan_cents first.
    - planTotalCents helper: sum cat.plan_cents over filtered (active, non-savings) categories.
  </behavior>
  <action>
    Create `frontend/src/screensV10/Home/computeHomeData.ts` with pure functions matching behavior. Each function takes plain inputs, returns plain outputs (no React hooks, no async).

    Tests in `__tests__/computeHomeData.test.ts` use vitest; cover each behavior bullet plus edge cases:
    - Empty actuals array → factTotalExpense = 0.
    - Negative balance accounts (overdraft) → walletTotal can be < 0.
    - All categories paused → empty list returned.
    - Category with plan_cents=0 and fact_cents=0 → ratio handled (returns 0 or Infinity? — choose Infinity for «no plan, any fact = over»; actually plan=0/fact=0 = NaN — clamp to 0; plan=0/fact>0 = Infinity = OVER. Document.)
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/Home/__tests__/computeHomeData.test.ts --run 2>&1 | tail -20</automated>
  </verify>
  <done>All tests pass; pure function signatures stable for HomeView consumption.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: HomeView presentational component</name>
  <files>frontend/src/screensV10/Home/HomeView.tsx, frontend/src/screensV10/Home/HomeView.module.css, frontend/src/screensV10/Home/__tests__/HomeView.test.tsx</files>
  <behavior>
    Props:
    ```typescript
    interface HomeViewProps {
      eyebrow: string;          // 'VOL.17 / MAY 2026 · 22 ДНЯ'
      dailyPaceCents: number;
      daysLeft: number;
      walletCents: number;
      surplusCents: number;     // signed; positive = good
      categoryRows: CategoryAggregateRow[];  // pre-sorted via sortCategoriesForHome
      onWalletTap: () => void;
      onPlanTap: () => void;
      onCategoryTap: (id: number) => void;
      onAllOperationsTap: () => void;
    }
    ```
    Renders (mirror prototype/poster-screens.jsx PosterHome lines 202-299):
    - Coral background (#FF5A3C) covering full viewport.
    - Top-left Eyebrow with `eyebrow` prop. Top-right placeholder «МЕНЮ ↗» mono mini-link (no behavior in this plan — Phase 27 mgmt; render as static span for now, opacity 0.7).
    - Mass italic «Дневной темп —» size 28, opacity 0.75, color paper.
    - BigFig with sup="₽" size 88, color paper, value=dailyPaceCents (count-up via existing BigFig component).
    - Mono mini text «· осталось N дней · в кошельке X ₽ →» — clickable on the «X ₽ →» substring for `onWalletTap`.
    - Plan-bar plate: black-ish overlay (rgba(0,0,0,0.22) on coral), shows «PLAN МЕСЯЦА» + (surplus formatted: «+ X ₽» yellow if surplus>=0, «− X ₽» red if surplus<0); whole plate clickable → onPlanTap.
    - Eyebrow «КАТЕГОРИИ» + right link «ВСЕ ОПЕРАЦИИ →» (clickable → onAllOperationsTap).
    - Category list: each row has top border, padding 10px 0, animation `.poster-row-in` with inline `style={{ animationDelay: \`${0.08 + i*0.045}s\` }}`. Row contains:
      - LHS: ord (mono small), uppercase name with letter-spacing 0.04em, both clickable → onCategoryTap(cat.id).
      - RHS top: OVER plate (Plate tone='paper' — uppercase «OVER» — render only if cat.isOver), pct mono.
      - Bar 3px height, with `.poster-bar-fill` animation, scaleX bounded to min(100, ratio*100); break tick at plan position if isOver.
      - Below: `${formatRubles(fact_cents)} ₽` left, `из ${formatRubles(plan_cents)}` right; both mono small.

    Tests `__tests__/HomeView.test.tsx`:
    - Render with eyebrow='VOL.17 / MAY 2026 · 22 ДНЯ' + dailyPaceCents=400000 + walletCents=12345600 + surplusCents=2000000. Assert text presence: «Дневной темп —», «4000» appears (the BigFig animates in ~900ms; allow time via `await waitFor` or check `data-testid="big-fig-final-value"` attribute).
    - Render with 3 categoryRows; assert 3 row entries, all 3 receive `style.animationDelay` matching `0.08 + i*0.045`.
    - Click on a row → onCategoryTap called with row.id.
    - Click ВСЕ ОПЕРАЦИИ → onAllOperationsTap called.
    - Click wallet substring → onWalletTap called.
    - Click plan plate → onPlanTap called.
    - Render with row.isOver=true → «OVER» visible inside that row.
    - Render with surplus < 0 → text contains «− »  (U+2212 or ASCII minus per prototype — prototype uses ASCII «−» which is U+2212). Use U+2212 for consistency with TXN-V10-04 spec.
  </behavior>
  <action>
    Implement the View per behavior. Use existing components from `componentsV10` (Eyebrow, Mass, BigFig, Plate). Use `formatRubles` from Onboarding/format.ts (re-export via common barrel if helpful).

    BigFig already animates count-up — ensure HomeView passes the value once on mount and that the BigFig animates from 0 to value automatically (existing useCountUp hook).

    Use CSS module for static styles; rely on global animation classes (`.poster-row-in`, `.poster-bar-fill`) from `stylesV10/animations.css`.

    For OVER plate use existing Plate component or inline render — prototype uses inline Archivo Black text on inverted background; using `<Plate tone="paper">OVER</Plate>` is closest.

    For dashed-underline wallet link: inline style `borderBottom: '1px dashed rgba(255,246,232,0.4)'`.

    For tests, mock BigFig if needed by setting `dur=0` to skip animation, OR use `findByText` with timeout.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npm test -- screensV10/Home/__tests__/HomeView.test.tsx --run 2>&1 | tail -25</automated>
  </verify>
  <done>All tests pass; HomeView renders correctly with sample props; click handlers wire correctly.</done>
</task>

<task type="auto">
  <name>Task 3: HomeMount data fetcher + barrel</name>
  <files>frontend/src/screensV10/Home/HomeMount.tsx, frontend/src/screensV10/Home/index.ts</files>
  <action>
    Create `HomeMount.tsx`:
    - State: loading | error | ready({eyebrow, dailyPaceCents, ..., categoryRows}).
    - On mount, fetch in parallel:
      ```typescript
      const [accounts, categories, period] = await Promise.all([
        listAccounts(),
        listCategoriesV10(),
        getCurrentPeriod().catch((e) => null),  // 404 = no active period (shouldn't happen post-onboarding)
      ]);
      const actuals = period ? await listActualV10(period.id) : [];
      ```
    - Compute via `computeHomeData` helpers; store in state.
    - On error (any fetch fails) → render error plate with retry button.
    - When ready → render `<HomeView eyebrow={formatPeriodEyebrow(today)} dailyPaceCents={...} ... onWalletTap={() => router.push(<AccountsListPlaceholder/>)} onAllOperationsTap={() => router.push(<TransactionsViewPlaceholder/>)} />`.
    - Use `usePosterRouter` from common/PosterRouter to get push handler.
    - Placeholder views for now (will be replaced in Plan 25-09 with real wired views):
      - `<AccountsListPlaceholder>` — simple page rendering «WIP — Accounts list (Phase 27)».
      - `<PlanViewPlaceholder>` — simple page rendering «WIP — PLAN мая (Phase 26)».
      - `<CategoryDetailPlaceholder catId={id}>` — simple page rendering «WIP — Category #{id} (Phase 26)».
      - `<TransactionsViewPlaceholder>` — replaced in Plan 25-06 with real component; for now render «WIP — Transactions (Plan 25-06)».
      Define these placeholders inline in HomeMount.tsx OR in a shared `screensV10/_placeholders.tsx` file (latter preferred — Plan 25-09 will replace each with real impl).

    Create `frontend/src/screensV10/Home/index.ts` barrel:
    ```typescript
    export { HomeMount } from './HomeMount';
    export { HomeView } from './HomeView';
    export type { HomeViewProps } from './HomeView';
    ```

    Do NOT mount HomeMount into AppV10 yet — that wiring happens in Plan 25-09.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner/frontend && npx tsc --noEmit 2>&1 | tail -10</automated>
  </verify>
  <done>tsc clean; HomeMount imports cleanly; placeholders exist for all push routes.</done>
</task>

</tasks>

<verification>
1. `npm test -- screensV10/Home --run` → all 2 test files pass.
2. `npx tsc --noEmit` clean (strict).
3. `grep -c "usePosterRouter\|router.push" frontend/src/screensV10/Home/HomeMount.tsx` ≥ 4 (4 push routes: wallet, plan, category, allOps).
4. `grep -c "code !== 'savings'\|paused === false\|paused\\b" frontend/src/screensV10/Home/computeHomeData.ts` confirms filters present.
</verification>

<success_criteria>
- HomeView renders all 6 HOME-V10-* requirements: eyebrow, hero count-up, wallet link, plan bar, category list with stagger, OVER plate.
- Compute helpers pure + unit-tested.
- Push routes wired through PosterRouter (placeholder targets).
- v0.6 home untouched; AppV10.tsx not modified yet (Plan 25-09 wires it).
</success_criteria>

<output>
After completion, create `.planning/phases/25-home-transactions-add-sheet/25-04-web-home-view-SUMMARY.md` with: compute formulas (final shapes), key decisions on count-up handling, placeholder strategy.
</output>
