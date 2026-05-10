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
    sum += cat.plan_cents ?? 0;
  }
  return sum;
}
