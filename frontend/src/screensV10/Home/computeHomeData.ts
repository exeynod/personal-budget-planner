// Phase 25-04: pure compute helpers for HomeView (HOME-V10-01..06).
//
// All functions are deterministic, side-effect-free, and accept plain
// JS values so they can be unit-tested without React/jsdom or network.
//
// Surface:
//   - computeDailyPace({plan, fact, daysLeft}) → integer cents/day
//   - computeSurplus({plan, fact})              → signed integer cents
//   - computeWalletTotal(accounts)               → integer cents
//   - computeCategoryAggregates({categories, actuals}) → CategoryAggregateRow[]
//   - sortCategoriesForHome(rows)                → CategoryAggregateRow[] (new array)
//
// Threat coverage:
//   - T-25-04-01: computeCategoryAggregates filters out `code === 'savings'`
//                 and `paused === true` so the system 'savings' category
//                 (visible to backend, not to user) never reaches the UI.
//   - T-25-04-02: computeDailyPace uses `max(1, daysLeft)` denominator so a
//                 negative or zero daysLeft (clock skew, future tx_date) does
//                 not crash with division-by-zero or produce NaN.

import type {
  AccountResponse,
  ActualV10Read,
  CategoryV10,
} from '../../api/v10';
import type { BalanceCategoryRow } from '../../api/types';

// ─────────────────── Types ───────────────────

export interface CategoryAggregateRow {
  /** Category id (used as React key + onCategoryTap arg). */
  id: number;
  /** Display name for the row. */
  name: string;
  /** v1.0 short code (`'cafe' | 'food' | 'savings' | ...`); null if missing. */
  code: string | null;
  /** v1.0 ord (CHAR(2)) — '01'..'99'; falls back to '00' when missing. */
  ord: string;
  /** Plan amount in cents (0 when no plan or schema-gap fallback). */
  plan_cents: number;
  /** Sum of expense actuals attributed to this category, in cents. */
  fact_cents: number;
  /**
   * fact / plan, or:
   *   - 0 when both fact and plan are 0 (neutral, no spend & no plan).
   *   - +Infinity when plan === 0 and fact > 0 (any spend without plan = OVER).
   * Used as primary sort key (DESC) — over-budget categories surface first.
   */
  ratio: number;
  /** True iff fact > plan; renders OVER plate + bar break tick. */
  isOver: boolean;
}

// ─────────────────── computeDailyPace ───────────────────

export interface DailyPaceInputs {
  planTotalCents: number;
  factTotalExpenseCents: number;
  /** Days remaining in the current period (today inclusive). */
  daysLeft: number;
}

/**
 * `dailyPace = max(0, floor((plan - fact) / max(1, daysLeft)))`.
 *
 * Returns integer cents per day a user can still spend without breaching
 * the plan. The `max(1, daysLeft)` denominator (T-25-04-02 mitigation)
 * defends against clock-skew or stale period bounds producing 0 / negative
 * daysLeft. The outer `max(0, ...)` clamps already-over-budget situations
 * to 0 (never display a negative daily pace).
 */
export function computeDailyPace(input: DailyPaceInputs): number {
  const denom = Math.max(1, input.daysLeft);
  const remaining = input.planTotalCents - input.factTotalExpenseCents;
  if (remaining <= 0) return 0;
  return Math.floor(remaining / denom);
}

// ─────────────────── computeSurplus ───────────────────

export interface SurplusInputs {
  planTotalCents: number;
  factTotalExpenseCents: number;
}

/**
 * `surplus = plan - fact` (signed cents).
 *
 * Used by the PLAN bar badge — positive renders yellow «+ X ₽», negative
 * renders red «− X ₽» (U+2212 minus). Sign convention follows the
 * project rule: «положительная = хорошо» (CLAUDE.md §Conventions).
 */
export function computeSurplus(input: SurplusInputs): number {
  return input.planTotalCents - input.factTotalExpenseCents;
}

// ─────────────────── computeWalletTotal ───────────────────

/**
 * Σ `balance_cents` across all accounts (primary + others).
 *
 * Honors negative balances (overdraft) without clamping — the wallet
 * link displays the true financial position. AccountResponse has no
 * archive flag in Phase 22 so we sum every entry returned.
 */
export function computeWalletTotal(
  accounts: ReadonlyArray<AccountResponse>,
): number {
  return accounts.reduce((sum, a) => sum + a.balance_cents, 0);
}

// ─────────────────── computeCategoryAggregates ───────────────────

export interface CategoryAggregateInputs {
  categories: ReadonlyArray<CategoryV10>;
  actuals: ReadonlyArray<ActualV10Read>;
}

/**
 * Build per-category aggregate rows for HomeView.
 *
 * Pipeline:
 *   1. Filter categories: drop `code === 'savings'` (system category, not
 *      user-facing — T-25-04-01) and `paused === true` (user-archived).
 *      Categories with `code` undefined survive (back-compat with old wire
 *      schema where v1.0 fields aren't yet emitted).
 *   2. For each surviving category, sum actuals where:
 *        actual.category_id === cat.id
 *        actual.kind === 'expense'
 *      Roundup / deposit / income kinds DO NOT count toward category fact
 *      (they have their own visualisation surfaces — savings flow, income
 *      header — per CONTEXT 25 §decisions / DATA-MODEL §2.2).
 *   3. Compute `ratio` = fact / plan, with edge cases:
 *        plan=0 fact=0  → 0     (neutral: no plan, no spend)
 *        plan=0 fact>0  → Inf   (OVER: any spend without plan)
 *        plan>0         → fact/plan (finite)
 *   4. `isOver` = fact > plan.
 */
export function computeCategoryAggregates(
  input: CategoryAggregateInputs,
): CategoryAggregateRow[] {
  const rows: CategoryAggregateRow[] = [];
  for (const cat of input.categories) {
    // T-25-04-01: drop system 'savings' category and paused categories.
    if (cat.code === 'savings') continue;
    if (cat.paused === true) continue;
    // Expense home bars are expense-scoped. Income categories are surfaced
    // separately (computeIncomeAggregates → native Доходы tab). Categories
    // with no `kind` (older wire schema) are kept for back-compat.
    if (cat.kind && cat.kind !== 'expense') continue;

    const planCents = cat.plan_cents ?? 0;
    let factCents = 0;
    for (const tx of input.actuals) {
      if (tx.category_id !== cat.id) continue;
      if (tx.kind !== 'expense') continue;
      factCents += tx.amount_cents;
    }

    let ratio: number;
    if (planCents === 0) {
      ratio = factCents === 0 ? 0 : Infinity;
    } else {
      ratio = factCents / planCents;
    }

    rows.push({
      id: cat.id,
      name: cat.name,
      code: cat.code ?? null,
      ord: cat.ord ?? '00',
      plan_cents: planCents,
      fact_cents: factCents,
      ratio,
      isOver: factCents > planCents,
    });
  }
  return rows;
}

// ─────────────────── sortCategoriesForHome ───────────────────

/**
 * Sort by `ratio DESC` (over-budget first), tie-break `plan_cents DESC`
 * (bigger budget categories first when ratios match).
 *
 * Returns a NEW array — does not mutate the input (caller may keep the
 * original order for other UI surfaces, e.g. management list).
 *
 * Note: `Infinity` (plan=0, fact>0) sorts before any finite ratio
 * naturally because `Infinity - 5 = Infinity > 0`.
 */
export function sortCategoriesForHome(
  rows: ReadonlyArray<CategoryAggregateRow>,
): CategoryAggregateRow[] {
  return [...rows].sort((a, b) => {
    if (a.ratio !== b.ratio) return b.ratio - a.ratio;
    return b.plan_cents - a.plan_cents;
  });
}

// ─────────────────── computeCategoryAggregatesFromBalance ───────────────────

export interface BalanceAggregateInputs {
  /** `by_category` rows from GET /periods/{id}/balance (period-scoped). */
  byCategory: ReadonlyArray<BalanceCategoryRow>;
  /**
   * Full category list — used only to recover `code` / `ord` (the balance
   * row carries neither). Categories absent from this map fall back to
   * `code = null`, `ord = '00'` and are NOT dropped (the period balance is
   * authoritative for which categories had plan/fact in that period).
   */
  categories: ReadonlyArray<CategoryV10>;
}

/**
 * Phase P2 (period switching): build HomeView aggregate rows for a PAST /
 * closed period from its `getPeriodBalance(...).by_category` payload.
 *
 * For a past period the live `listCategoriesV10()` plan no longer reflects
 * what was planned THEN — only the period balance does. We therefore source
 * `plan_cents` (= row.planned_cents) and `fact_cents` (= row.actual_cents)
 * from the balance row, and recover `code` / `ord` from the category list
 * for display + the savings filter.
 *
 * Mirrors `computeCategoryAggregates` semantics:
 *   - expense rows only (income categories are surfaced elsewhere);
 *   - drop the system 'savings' category (T-25-04-01 parity);
 *   - ratio / isOver computed identically.
 */
export function computeCategoryAggregatesFromBalance(
  input: BalanceAggregateInputs,
): CategoryAggregateRow[] {
  const catById = new Map<number, CategoryV10>();
  for (const c of input.categories) catById.set(c.id, c);

  const rows: CategoryAggregateRow[] = [];
  for (const br of input.byCategory) {
    // Only expense categories drive the Home category bars.
    if (br.kind !== 'expense') continue;
    const cat = catById.get(br.category_id);
    // T-25-04-01 parity: drop the system 'savings' category.
    if (cat?.code === 'savings') continue;

    const planCents = br.planned_cents;
    const factCents = br.actual_cents;

    let ratio: number;
    if (planCents === 0) {
      ratio = factCents === 0 ? 0 : Infinity;
    } else {
      ratio = factCents / planCents;
    }

    rows.push({
      id: br.category_id,
      name: br.name,
      code: cat?.code ?? null,
      ord: cat?.ord ?? '00',
      plan_cents: planCents,
      fact_cents: factCents,
      ratio,
      isOver: factCents > planCents,
    });
  }
  return rows;
}

// ─────────────────── income aggregates (Liquid Glass native Доходы) ───────────────────
//
// The native iOS Home has a Расходы/Доходы segment. The poster Home shows only
// expense categories; the native view additionally renders income categories
// under «Доходы». These helpers mirror the expense aggregation but invert the
// kind filter (income categories + income actuals). They are additive — the
// poster path never calls them, so Maximal Poster is unaffected.

/**
 * Build per-category income aggregate rows for the native Home «Доходы» tab.
 *
 * Pipeline mirrors `computeCategoryAggregates` but:
 *   - keeps categories with `kind === 'income'` (drops expense + system savings);
 *   - sums actuals where `kind === 'income'` and `category_id` matches.
 * Sign convention for income (CLAUDE.md): delta = Факт − План, so `isOver`
 * here means «exceeded the income plan» (a GOOD outcome), but we keep the same
 * field shape for rendering symmetry; the native view colours income deltas
 * with the positive convention.
 */
export function computeIncomeAggregates(
  input: CategoryAggregateInputs,
): CategoryAggregateRow[] {
  const rows: CategoryAggregateRow[] = [];
  for (const cat of input.categories) {
    if (cat.kind !== 'income') continue;
    if (cat.paused === true) continue;

    const planCents = cat.plan_cents ?? 0;
    let factCents = 0;
    for (const tx of input.actuals) {
      if (tx.category_id !== cat.id) continue;
      if (tx.kind !== 'income') continue;
      factCents += tx.amount_cents;
    }

    let ratio: number;
    if (planCents === 0) {
      ratio = factCents === 0 ? 0 : Infinity;
    } else {
      ratio = factCents / planCents;
    }

    rows.push({
      id: cat.id,
      name: cat.name,
      code: cat.code ?? null,
      ord: cat.ord ?? '00',
      plan_cents: planCents,
      fact_cents: factCents,
      ratio,
      isOver: factCents > planCents,
    });
  }
  return rows;
}

/** Income variant of `computeCategoryAggregatesFromBalance` (past periods). */
export function computeIncomeAggregatesFromBalance(
  input: BalanceAggregateInputs,
): CategoryAggregateRow[] {
  const catById = new Map<number, CategoryV10>();
  for (const c of input.categories) catById.set(c.id, c);

  const rows: CategoryAggregateRow[] = [];
  for (const br of input.byCategory) {
    if (br.kind !== 'income') continue;
    const cat = catById.get(br.category_id);

    const planCents = br.planned_cents;
    const factCents = br.actual_cents;

    let ratio: number;
    if (planCents === 0) {
      ratio = factCents === 0 ? 0 : Infinity;
    } else {
      ratio = factCents / planCents;
    }

    rows.push({
      id: br.category_id,
      name: br.name,
      code: cat?.code ?? null,
      ord: cat?.ord ?? '00',
      plan_cents: planCents,
      fact_cents: factCents,
      ratio,
      isOver: factCents > planCents,
    });
  }
  return rows;
}

// ─────────────────── computePlanTotalCents ───────────────────

/**
 * Σ `plan_cents` across the FILTERED category list (active, non-savings).
 *
 * Helper for HomeMount when computing dailyPace / surplus inputs. Mirrors
 * the same filter semantics as `computeCategoryAggregates` so the two
 * stay in lock-step.
 */
export function computePlanTotalCents(
  categories: ReadonlyArray<CategoryV10>,
): number {
  let sum = 0;
  for (const cat of categories) {
    if (cat.code === 'savings') continue;
    if (cat.paused === true) continue;
    if (cat.kind && cat.kind !== 'expense') continue;
    sum += cat.plan_cents ?? 0;
  }
  return sum;
}
