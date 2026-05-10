// Phase 26-04 Task 2: pure compute helpers for PlanView (PLAN-V10-02..06).
//
// All helpers are deterministic, side-effect-free; no React, no fetch.
// 18+ test cases covering happy / edge / immutability invariants.

import { describe, it, expect } from 'vitest';
import {
  computeSurplus,
  computeIsOverflow,
  computeRolloverAggregates,
  computeRegularsList,
  applyPlanEdit,
  plansFromCategories,
} from '../computePlan';
import type { CategoryV10, ActualV10Read } from '../../../api/v10';
import type { SubscriptionV10Read } from '../../../api/v10';

// ─────────── factories ───────────

function makeCat(over: Partial<CategoryV10>): CategoryV10 {
  return {
    id: 1,
    name: 'Food',
    kind: 'expense',
    is_archived: false,
    sort_order: 0,
    created_at: '2026-05-01T00:00:00Z',
    code: 'food',
    plan_cents: 0,
    ord: '01',
    rollover: 'misc',
    paused: false,
    parent_id: null,
    ...over,
  };
}

function makeActual(over: Partial<ActualV10Read>): ActualV10Read {
  return {
    id: 1,
    period_id: 10,
    kind: 'expense',
    amount_cents: 0,
    description: null,
    category_id: 1,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T12:00:00Z',
    account_id: null,
    parent_txn_id: null,
    ...over,
  };
}

function makeSub(over: Partial<SubscriptionV10Read>): SubscriptionV10Read {
  return {
    id: 1,
    name: 'Netflix',
    amount_cents: 49900,
    cycle: 'monthly',
    next_charge_date: '2026-06-15',
    category_id: 1,
    notify_days_before: 3,
    is_active: true,
    category: {
      id: 1,
      name: 'Food',
      kind: 'expense',
      is_archived: false,
      sort_order: 0,
      created_at: '2026-05-01T00:00:00Z',
    },
    day_of_month: 15,
    account_id: null,
    posted_txn_id: null,
    ...over,
  };
}

// ─────────── computeSurplus ───────────

describe('computeSurplus', () => {
  it('returns income minus sum of plans (positive)', () => {
    expect(
      computeSurplus(100_000, [
        { category_id: 1, plan_cents: 30_000 },
        { category_id: 2, plan_cents: 20_000 },
      ]),
    ).toBe(50_000);
  });

  it('returns negative when sum exceeds income', () => {
    expect(
      computeSurplus(100_000, [
        { category_id: 1, plan_cents: 60_000 },
        { category_id: 2, plan_cents: 60_000 },
      ]),
    ).toBe(-20_000);
  });

  it('returns 0 when income equals sum of plans', () => {
    expect(computeSurplus(0, [])).toBe(0);
    expect(
      computeSurplus(50_000, [{ category_id: 1, plan_cents: 50_000 }]),
    ).toBe(0);
  });
});

// ─────────── computeIsOverflow ───────────

describe('computeIsOverflow', () => {
  it('returns true when surplus is negative', () => {
    expect(computeIsOverflow(-1)).toBe(true);
    expect(computeIsOverflow(-100_000)).toBe(true);
  });

  it('returns false when surplus is zero or positive', () => {
    expect(computeIsOverflow(0)).toBe(false);
    expect(computeIsOverflow(1)).toBe(false);
    expect(computeIsOverflow(100_000)).toBe(false);
  });
});

// ─────────── computeRolloverAggregates ───────────

describe('computeRolloverAggregates', () => {
  it('aggregates remainders into misc when rollover=misc', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 100_000, rollover: 'misc' }),
      makeCat({ id: 2, plan_cents: 50_000, rollover: 'misc' }),
    ];
    const plans = [
      { category_id: 1, plan_cents: 100_000 },
      { category_id: 2, plan_cents: 50_000 },
    ];
    const actuals = [
      makeActual({ id: 1, category_id: 1, amount_cents: 30_000 }),
      makeActual({ id: 2, category_id: 2, amount_cents: 10_000 }),
    ];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.miscCents).toBe(70_000 + 40_000);
    expect(out.savingsCents).toBe(0);
  });

  it('aggregates remainders into savings when rollover=savings', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 100_000, rollover: 'savings' }),
      makeCat({ id: 2, plan_cents: 50_000, rollover: 'savings' }),
    ];
    const plans = [
      { category_id: 1, plan_cents: 100_000 },
      { category_id: 2, plan_cents: 50_000 },
    ];
    const actuals = [
      makeActual({ id: 1, category_id: 1, amount_cents: 60_000 }),
      makeActual({ id: 2, category_id: 2, amount_cents: 10_000 }),
    ];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.savingsCents).toBe(40_000 + 40_000);
    expect(out.miscCents).toBe(0);
  });

  it('mixes misc and savings buckets', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 50_000, rollover: 'misc' }),
      makeCat({ id: 2, plan_cents: 100_000, rollover: 'savings' }),
    ];
    const plans = [
      { category_id: 1, plan_cents: 50_000 },
      { category_id: 2, plan_cents: 100_000 },
    ];
    const actuals = [
      makeActual({ id: 1, category_id: 1, amount_cents: 20_000 }),
      makeActual({ id: 2, category_id: 2, amount_cents: 25_000 }),
    ];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.miscCents).toBe(30_000);
    expect(out.savingsCents).toBe(75_000);
  });

  it('skips paused categories', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 100_000, rollover: 'misc', paused: true }),
    ];
    const plans = [{ category_id: 1, plan_cents: 100_000 }];
    const actuals = [
      makeActual({ id: 1, category_id: 1, amount_cents: 30_000 }),
    ];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.miscCents).toBe(0);
    expect(out.savingsCents).toBe(0);
  });

  it("skips category with code='savings'", () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 100_000, rollover: 'savings', code: 'savings' }),
    ];
    const plans = [{ category_id: 1, plan_cents: 100_000 }];
    const actuals: ActualV10Read[] = [];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.miscCents).toBe(0);
    expect(out.savingsCents).toBe(0);
  });

  it('contributes 0 when fact >= plan (over-budget cats)', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 50_000, rollover: 'misc' }),
    ];
    const plans = [{ category_id: 1, plan_cents: 50_000 }];
    const actuals = [
      makeActual({ id: 1, category_id: 1, amount_cents: 60_000 }),
    ];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.miscCents).toBe(0);
    expect(out.savingsCents).toBe(0);
  });

  it('uses category.plan_cents fallback when not in plans array', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 80_000, rollover: 'misc' }),
    ];
    const plans: { category_id: number; plan_cents: number }[] = [];
    const actuals = [
      makeActual({ id: 1, category_id: 1, amount_cents: 30_000 }),
    ];
    const out = computeRolloverAggregates(cats, plans, actuals);
    expect(out.miscCents).toBe(50_000);
  });
});

// ─────────── computeRegularsList ───────────

describe('computeRegularsList', () => {
  it('filters monthly subscriptions only', () => {
    const subs: SubscriptionV10Read[] = [
      makeSub({ id: 1, cycle: 'monthly', day_of_month: 15 }),
      makeSub({ id: 2, cycle: 'yearly', day_of_month: 5 }),
    ];
    const cats: CategoryV10[] = [makeCat({ id: 1, name: 'Развлечения' })];
    const out = computeRegularsList(subs, cats);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it('drops monthly subs with day_of_month null', () => {
    const subs: SubscriptionV10Read[] = [
      makeSub({ id: 1, cycle: 'monthly', day_of_month: null }),
      makeSub({ id: 2, cycle: 'monthly', day_of_month: 10 }),
    ];
    const cats: CategoryV10[] = [makeCat({ id: 1 })];
    const out = computeRegularsList(subs, cats);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(2);
  });

  it('sorts by day_of_month ascending', () => {
    const subs: SubscriptionV10Read[] = [
      makeSub({ id: 1, day_of_month: 25, name: 'Spotify' }),
      makeSub({ id: 2, day_of_month: 5, name: 'Netflix' }),
      makeSub({ id: 3, day_of_month: 15, name: 'YouTube' }),
    ];
    const cats: CategoryV10[] = [makeCat({ id: 1 })];
    const out = computeRegularsList(subs, cats);
    expect(out.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('joins category name from category map', () => {
    const subs: SubscriptionV10Read[] = [
      makeSub({ id: 1, category_id: 42, day_of_month: 10 }),
      makeSub({ id: 2, category_id: 99, day_of_month: 15 }),
    ];
    const cats: CategoryV10[] = [
      makeCat({ id: 42, name: 'Развлечения' }),
    ];
    const out = computeRegularsList(subs, cats);
    expect(out[0].categoryName).toBe('Развлечения');
    expect(out[1].categoryName).toBe('—'); // unknown category falls back
  });
});

// ─────────── applyPlanEdit ───────────

describe('applyPlanEdit', () => {
  it('replaces existing plan_cents for the category', () => {
    const plans = [
      { category_id: 1, plan_cents: 10_000 },
      { category_id: 2, plan_cents: 20_000 },
    ];
    const out = applyPlanEdit(plans, 1, 50_000);
    expect(out).toEqual([
      { category_id: 1, plan_cents: 50_000 },
      { category_id: 2, plan_cents: 20_000 },
    ]);
  });

  it('adds a new entry when category is not in plans', () => {
    const plans = [{ category_id: 1, plan_cents: 10_000 }];
    const out = applyPlanEdit(plans, 99, 5_000);
    expect(out).toEqual([
      { category_id: 1, plan_cents: 10_000 },
      { category_id: 99, plan_cents: 5_000 },
    ]);
  });

  it('does not mutate the input array (immutability)', () => {
    const plans = [{ category_id: 1, plan_cents: 10_000 }];
    const snapshot = JSON.stringify(plans);
    const out = applyPlanEdit(plans, 1, 99_999);
    expect(JSON.stringify(plans)).toBe(snapshot);
    expect(out).not.toBe(plans);
  });

  it('handles multiple sequential edits', () => {
    let plans = [{ category_id: 1, plan_cents: 10_000 }];
    plans = applyPlanEdit(plans, 1, 20_000);
    plans = applyPlanEdit(plans, 2, 30_000);
    plans = applyPlanEdit(plans, 1, 40_000);
    expect(plans).toEqual([
      { category_id: 1, plan_cents: 40_000 },
      { category_id: 2, plan_cents: 30_000 },
    ]);
  });
});

// ─────────── plansFromCategories ───────────

describe('plansFromCategories', () => {
  it('builds plans array from active non-savings categories', () => {
    const cats: CategoryV10[] = [
      makeCat({ id: 1, plan_cents: 50_000, code: 'food' }),
      makeCat({ id: 2, plan_cents: 30_000, code: 'savings' }),
      makeCat({ id: 3, plan_cents: 20_000, code: 'cafe', paused: true }),
      makeCat({ id: 4, plan_cents: 10_000, code: 'transport' }),
    ];
    const out = plansFromCategories(cats);
    expect(out).toEqual([
      { category_id: 1, plan_cents: 50_000 },
      { category_id: 4, plan_cents: 10_000 },
    ]);
  });
});
