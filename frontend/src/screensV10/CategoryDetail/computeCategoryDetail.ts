// Phase 26-02 Task 1: pure compute helpers for CategoryDetailView (CAT-V10-01..06).
//
// Surface (all pure, no React, no fetch — unit-testable in isolation):
//   - computeOverPercent(fact, plan)        → integer percent over plan, 0 if not over
//   - computeUnderPercent(fact, plan)       → integer percent of plan used, 0 if plan=0
//   - computeBarSegments(fact, plan)        → { fillRatio, tickAt? } for the 6px bar
//   - filterActualsForCategory(actuals, id) → ActualV10Read[] preserving input order
//   - computeFactForCategory(actuals, id)   → integer cents (sum of |amount| of expense rows)
//
// Threat coverage:
//   - T-26-02-03 (info disclosure across categories): filterActualsForCategory uses
//     strict ===; if a row references a category not visible to the current user,
//     the upstream RLS-gated listActualV10 will not return it in the first place.

import type { ActualV10Read } from '../../api/v10';

// ─────────────────── computeOverPercent ───────────────────

/**
 * Returns rounded integer percent by which fact exceeds plan.
 *
 * Returns 0 when:
 *  - fact ≤ plan (caller should not display «превышено» in this case)
 *  - plan ≤ 0 (no plan defined; «over by N%» is undefined — caller renders the
 *    «under» variant or a no-plan placeholder)
 */
export function computeOverPercent(factCents: number, planCents: number): number {
  if (planCents <= 0) return 0;
  if (factCents <= planCents) return 0;
  return Math.round(((factCents - planCents) / planCents) * 100);
}

// ─────────────────── computeUnderPercent ───────────────────

/**
 * Returns rounded integer percent of plan used by fact.
 *
 * - 0 when plan = 0 (avoid div-by-zero; caller treats as a no-plan state)
 * - 0 when fact = 0
 * - 100 when fact = plan
 * - Math.round otherwise
 */
export function computeUnderPercent(factCents: number, planCents: number): number {
  if (planCents <= 0) return 0;
  return Math.round((factCents / planCents) * 100);
}

// ─────────────────── computeBarSegments ───────────────────

export interface BarSegments {
  /** 0..1 — width of filled bar (capped at 1 for over-budget). */
  fillRatio: number;
  /** 0..1 position of the break-tick; defined ONLY when over-budget. */
  tickAt?: number;
}

/**
 * Returns `{ fillRatio, tickAt? }` for the 6px progress bar:
 *
 *  - fact = 0 → fillRatio 0, no tick (empty bar)
 *  - 0 < fact ≤ plan → fillRatio = fact/plan, no tick (under-budget)
 *  - plan = 0 ∧ fact > 0 → fillRatio 1, tickAt 0 (any spend without plan = full + tick at start)
 *  - fact > plan ∧ plan > 0 → fillRatio 1, tickAt = plan/fact (over-budget; tick marks plan position)
 *
 * The bar visualisation interprets `tickAt` as a 1px vertical break inside the
 * filled bar (rendered at `left: ${tickAt*100}%`), separating the "within plan"
 * portion from the "over plan" portion.
 */
export function computeBarSegments(factCents: number, planCents: number): BarSegments {
  if (factCents <= 0) return { fillRatio: 0 };
  if (planCents <= 0) return { fillRatio: 1, tickAt: 0 };
  if (factCents <= planCents) return { fillRatio: factCents / planCents };
  // Over-budget: cap fill at 1, mark threshold inside the bar.
  return { fillRatio: 1, tickAt: planCents / factCents };
}

// ─────────────────── filterActualsForCategory ───────────────────

/**
 * Filter actuals to a single category id, preserving input order.
 *
 * Returns a NEW array (never mutates input). Empty input or no matches → [].
 */
export function filterActualsForCategory(
  actuals: ReadonlyArray<ActualV10Read>,
  categoryId: number,
): ActualV10Read[] {
  return actuals.filter((a) => a.category_id === categoryId);
}

// ─────────────────── computeFactForCategory ───────────────────

/**
 * Sum of expense cents for a single category (display magnitude — uses |amount|).
 *
 * Mirrors the same semantics as Home/computeHomeData → only `kind === 'expense'`
 * contributes to the category fact total. Roundup / deposit / income kinds have
 * their own visualisation surfaces (savings flow, income header) and are excluded.
 */
export function computeFactForCategory(
  actuals: ReadonlyArray<ActualV10Read>,
  categoryId: number,
): number {
  let sum = 0;
  for (const a of actuals) {
    if (a.category_id !== categoryId) continue;
    if (a.kind !== 'expense') continue;
    sum += Math.abs(a.amount_cents);
  }
  return sum;
}
