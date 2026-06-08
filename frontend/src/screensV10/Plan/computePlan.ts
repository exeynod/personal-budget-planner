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

import type {
  CategoryV10,
  SubscriptionV10Read,
  PlannedV11Read,
} from '../../api/v10';
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

/** True iff `surplus < 0`; plate red, «Превышено» badge. */
export function computeIsOverflow(surplusCents: number): boolean {
  return surplusCents < 0;
}

// ─────────── computeDistributeProgress ───────────

/**
 * Progress of «Осталось распределить» — how much of the income is already
 * allocated to expense limits. Drives the bar + «X из Y» caption in refs #21-23
 * («142 000 из 180 000»).
 *
 *   distributedCents — Σ expense plan_cents (clamped ≥ 0).
 *   totalCents       — income (denominator; the bar's full width).
 *   ratio            — distributed / total clamped to [0, 1] (>1 when overflow
 *                      would otherwise overflow the track → kept full + red).
 */
export interface DistributeProgress {
  distributedCents: number;
  totalCents: number;
  /** distributed / total clamped to [0, 1] for the bar width. */
  ratio: number;
}

export function computeDistributeProgress(
  incomeCents: number,
  plans: ReadonlyArray<PlanMonthItem>,
): DistributeProgress {
  const distributed = Math.max(
    0,
    plans.reduce((s, p) => s + p.plan_cents, 0),
  );
  const total = Math.max(0, incomeCents);
  const ratio = total > 0 ? Math.min(1, Math.max(0, distributed / total)) : 0;
  return { distributedCents: distributed, totalCents: total, ratio };
}

// ─────────── computeRegularsList ───────────

export interface RegularRow {
  /** Stable React key (`sub-<id>` or `plan-<id>`). */
  key: string;
  /** Subscription id — the post/unpost arg for subscription-derived rows. */
  id: number;
  /** Display name. */
  name: string;
  /** Day-of-month (1..28). */
  dayOfMonth: number;
  /** Category id (drives the row CategoryIcon). */
  categoryId: number;
  /** Joined category name; '—' if category not found in `categories`. */
  categoryName: string;
  /** Cents to charge per month. */
  amountCents: number;
  /** True once this regular obligation is recorded as a real fact this period. */
  posted: boolean;
  /**
   * Source of the row:
   *  - 'subscription' → post/unpost via /subscriptions/{id} (uses `id`).
   *  - 'planned'      → post/unpost via /planned/{plannedId}  (uses `plannedId`).
   */
  source: 'subscription' | 'planned';
  /** planned_transaction id for `source === 'planned'` rows (else null). */
  plannedId: number | null;
  /** ISO planned_date for planned-derived rows (post-date clamp), else null. */
  plannedDate: string | null;
}

/**
 * «Регулярные платежи» — ONE list combining recurring obligations from two
 * sources (refs #21-23 «Аренда / Кредит / Подписки»):
 *
 *   1. Monthly subscriptions with a `day_of_month` (materialized for the period;
 *      posted state from `subscription.posted_txn_id`).
 *   2. Recurring `subscription_auto` planned rows that DON'T map to a listed
 *      subscription (defensive: the planned row exists but its parent sub isn't
 *      in the subscriptions response). These post via /planned/{id}.
 *
 * Subscriptions win the dedup (richer schedule + post state); a planned row is
 * only added when its `subscription_id` is absent from the subscriptions list.
 * Sorted by day-of-month ASC for deterministic order.
 */
export function computeRegularsList(
  subs: ReadonlyArray<SubscriptionV10Read>,
  categories: ReadonlyArray<CategoryV10>,
  planned: ReadonlyArray<PlannedV11Read> = [],
): RegularRow[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const fromSubs = subs
    .filter((s) => s.cycle === 'monthly' && s.day_of_month != null)
    .map<RegularRow>((s) => ({
      key: `sub-${s.id}`,
      id: s.id,
      name: s.name,
      dayOfMonth: s.day_of_month as number,
      categoryId: s.category_id,
      categoryName: catName.get(s.category_id) ?? '—',
      amountCents: s.amount_cents,
      posted: (s.posted_txn_id ?? null) != null,
      source: 'subscription',
      plannedId: null,
      plannedDate: null,
    }));

  // Subscription ids already represented by a subscription row.
  const coveredSubIds = new Set(subs.map((s) => s.id));

  const fromPlanned = planned
    .filter(
      (p) =>
        p.source === 'subscription_auto' &&
        p.planned_date != null &&
        (p.subscription_id == null || !coveredSubIds.has(p.subscription_id)),
    )
    .map<RegularRow>((p) => ({
      key: `plan-${p.id}`,
      id: p.subscription_id ?? p.id,
      name: p.description?.trim() || 'Регулярный платёж',
      dayOfMonth: Number((p.planned_date as string).slice(8, 10)) || 1,
      categoryId: p.category_id,
      categoryName: catName.get(p.category_id) ?? '—',
      amountCents: Math.abs(p.amount_cents),
      posted: (p.posted_txn_id ?? null) != null,
      source: 'planned',
      plannedId: p.id,
      plannedDate: p.planned_date,
    }));

  return [...fromSubs, ...fromPlanned].sort(
    (a, b) => a.dayOfMonth - b.dayOfMonth,
  );
}

// ─────────── date label «N июня» ───────────

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/**
 * Day-of-month → «1 июня» style label using the period's month (refs #21-23).
 * `periodStart` is the period's ISO `YYYY-MM-DD`; we take its month for the
 * genitive name. Falls back to «N числа» when the period month is unknown.
 */
export function formatRegularDate(
  dayOfMonth: number,
  periodStart: string | null,
): string {
  if (periodStart) {
    const monthIdx = Number(periodStart.slice(5, 7)) - 1;
    const name = MONTHS_GENITIVE[monthIdx];
    if (name) return `${dayOfMonth} ${name}`;
  }
  return `${dayOfMonth} числа`;
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
