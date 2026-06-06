// Phase 26-04 (PLAN-V10-02..06): pure compute helpers for PlanView.
//
// All functions are deterministic, side-effect-free, accept plain JS values.
// Surface (consumed by PlanMount + PlanView):
//   computeSurplus(income, plans)             → signed integer cents
//   computeIsOverflow(surplus)                → boolean
//   computeRegularsList(subs, categories)     → RegularRow[]
//   applyPlanEdit(plans, catId, newCents)     → new plans array (immutable)
//   plansFromCategories(categories)           → PlanMonthItem[] (initial draft)
//
// Threat coverage (mirrors compute-helpers tests):
//   - T-26-04-04: applyPlanEdit performs immutable updates so React state
//                 transitions stay predictable; PATCH only fires on submit.
//
// (Category rollover aggregates were removed in the v1.1 planning rework.)
//
// Sister symmetry: iOS `PlanData.swift` (Plan 26-05) implements the same
// formulas to byte-identical numbers — KEEP IN SYNC.

import type { CategoryV10, SubscriptionV10Read } from '../../api/v10';
import type { PlanMonthItem } from '../../api/types';

// ─────────── computeSurplus / computeIsOverflow ───────────

/**
 * Signed surplus = income − Σplan_cents. Negative means overflow.
 *
 * Used by the «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» plate; sign decides OK (yellow) vs
 * OVER (red) tone + blocks the СОХРАНИТЬ CTA when negative.
 */
export function computeSurplus(
  incomeCents: number,
  plans: ReadonlyArray<PlanMonthItem>,
): number {
  const sum = plans.reduce((s, p) => s + p.plan_cents, 0);
  return incomeCents - sum;
}

/** True iff `surplus < 0`; CTA disabled, plate red, inline error visible. */
export function computeIsOverflow(surplusCents: number): boolean {
  return surplusCents < 0;
}

// ─────────── computeRegularsList ───────────

export interface RegularRow {
  /** Subscription id (used as React key + onPostRegular arg). */
  id: number;
  /** Subscription name (UPPERCASED at render time). */
  name: string;
  /** Day-of-month (1..28) — guaranteed non-null after filter. */
  dayOfMonth: number;
  /** Joined category name; '—' if category not found in `categories`. */
  categoryName: string;
  /** Cents to charge per month. */
  amountCents: number;
  /** Non-null when subscription was already posted to actuals (toggle source). */
  postedTxnId: number | null;
}

/**
 * Filter monthly subscriptions с day_of_month set; join category.name; sort
 * by day_of_month ASC for deterministic display order.
 *
 * Skips:
 *   - cycle !== 'monthly'  (yearly subs render in Subscriptions screen, not Plan)
 *   - day_of_month == null (legacy subs without v1.0 schedule field)
 */
export function computeRegularsList(
  subs: ReadonlyArray<SubscriptionV10Read>,
  categories: ReadonlyArray<CategoryV10>,
): RegularRow[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return subs
    .filter((s) => s.cycle === 'monthly' && s.day_of_month != null)
    .map<RegularRow>((s) => ({
      id: s.id,
      name: s.name,
      dayOfMonth: s.day_of_month as number,
      categoryName: catName.get(s.category_id) ?? '—',
      amountCents: s.amount_cents,
      postedTxnId: s.posted_txn_id ?? null,
    }))
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
}

// ─────────── applyPlanEdit ───────────

/**
 * Immutable update: returns a NEW plans array.
 *
 *   - if categoryId in plans → replace plan_cents (preserve order)
 *   - if not in plans       → append new entry
 *
 * Original input array is never mutated (test asserts JSON snapshot
 * unchanged + reference inequality).
 */
export function applyPlanEdit(
  plans: ReadonlyArray<PlanMonthItem>,
  categoryId: number,
  newCents: number,
): PlanMonthItem[] {
  const idx = plans.findIndex((p) => p.category_id === categoryId);
  if (idx === -1) {
    return [...plans, { category_id: categoryId, plan_cents: newCents }];
  }
  return plans.map((p, i) =>
    i === idx ? { category_id: p.category_id, plan_cents: newCents } : p,
  );
}

// ─────────── plansFromCategories ───────────

/**
 * Initial plans array from list of categories' current `plan_cents`.
 * Skips the system 'savings' category (mirror of compute filter).
 *
 * Used by PlanMount on first load — the draft starts equal to the persisted
 * plan and diverges as user moves sliders before submit.
 */
export function plansFromCategories(
  categories: ReadonlyArray<CategoryV10>,
): PlanMonthItem[] {
  const out: PlanMonthItem[] = [];
  for (const c of categories) {
    if (c.code === 'savings') continue;
    out.push({ category_id: c.id, plan_cents: c.plan_cents ?? 0 });
  }
  return out;
}
