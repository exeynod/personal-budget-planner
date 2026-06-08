// Phase 26-04 Task 2: pure compute helpers for PlanView (PLAN-V10-02..06).
//
// All helpers are deterministic, side-effect-free; no React, no fetch.
// 18+ test cases covering happy / edge / immutability invariants.

import { describe, it, expect } from 'vitest';
import {
  computeSurplus,
  computeIsOverflow,
  computeDistributeProgress,
  computeRegularsList,
  formatRegularDate,
  applyPlanEdit,
  plansFromCategories,
} from '../computePlan';
import type { CategoryV10 } from '../../../api/v10';
import type { SubscriptionV10Read, PlannedV11Read } from '../../../api/v10';

function makePlanned(over: Partial<PlannedV11Read>): PlannedV11Read {
  return {
    id: 1,
    category_id: 1,
    amount_cents: 1_000_00,
    description: null,
    kind: 'expense',
    period_id: 5,
    planned_date: '2026-06-10',
    posted_txn_id: null,
    source: 'manual',
    subscription_id: null,
    ...over,
  } as PlannedV11Read;
}

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
    parent_id: null,
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
      code: 'food',
      ord: '01',
      plan_cents: 0,
      rollover: 'misc',
      paused: false,
      tag: 'personal',
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

// ─────────── computeDistributeProgress ───────────

describe('computeDistributeProgress', () => {
  it('reports distributed / total and clamped ratio', () => {
    const p = computeDistributeProgress(180_000_00, [
      { category_id: 1, plan_cents: 100_000_00 },
      { category_id: 2, plan_cents: 42_000_00 },
    ]);
    expect(p.distributedCents).toBe(142_000_00);
    expect(p.totalCents).toBe(180_000_00);
    expect(p.ratio).toBeCloseTo(142 / 180, 5);
  });

  it('clamps ratio to 1 on overflow and to 0 when income is 0', () => {
    expect(
      computeDistributeProgress(100_00, [
        { category_id: 1, plan_cents: 500_00 },
      ]).ratio,
    ).toBe(1);
    expect(computeDistributeProgress(0, []).ratio).toBe(0);
  });
});

// ─────────── formatRegularDate ───────────

describe('formatRegularDate', () => {
  it('uses the period month genitive name', () => {
    expect(formatRegularDate(1, '2026-06-01')).toBe('1 июня');
    expect(formatRegularDate(15, '2026-01-01')).toBe('15 января');
  });

  it('falls back to «N числа» without a period', () => {
    expect(formatRegularDate(5, null)).toBe('5 числа');
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
    const cats: CategoryV10[] = [makeCat({ id: 42, name: 'Развлечения' })];
    const out = computeRegularsList(subs, cats);
    expect(out[0].categoryName).toBe('Развлечения');
    expect(out[1].categoryName).toBe('—'); // unknown category falls back
  });

  it('flags posted subscriptions and tags source=subscription', () => {
    const subs: SubscriptionV10Read[] = [
      makeSub({ id: 7, day_of_month: 10, posted_txn_id: 555 }),
      makeSub({ id: 8, day_of_month: 12, posted_txn_id: null }),
    ];
    const cats: CategoryV10[] = [makeCat({ id: 1 })];
    const out = computeRegularsList(subs, cats);
    expect(out[0].source).toBe('subscription');
    expect(out[0].posted).toBe(true);
    expect(out[1].posted).toBe(false);
  });

  it('adds recurring planned rows not backed by a listed subscription', () => {
    const subs: SubscriptionV10Read[] = [makeSub({ id: 1, day_of_month: 20 })];
    const cats: CategoryV10[] = [makeCat({ id: 1, name: 'Дом' })];
    const planned: PlannedV11Read[] = [
      // recurring planned, parent sub NOT in `subs` → becomes its own row
      makePlanned({
        id: 90,
        source: 'subscription_auto',
        subscription_id: 99,
        description: 'Аренда',
        amount_cents: 45_000_00,
        planned_date: '2026-06-01',
      }),
      // recurring planned whose parent sub (id 1) is already listed → deduped out
      makePlanned({
        id: 91,
        source: 'subscription_auto',
        subscription_id: 1,
        planned_date: '2026-06-20',
      }),
      // manual planned → never a regular
      makePlanned({ id: 92, source: 'manual', planned_date: '2026-06-05' }),
    ];
    const out = computeRegularsList(subs, cats, planned);
    // sub#1 (day 20) + planned#90 (day 1) → sorted by day asc
    expect(out.map((r) => r.key)).toEqual(['plan-90', 'sub-1']);
    const arenda = out.find((r) => r.key === 'plan-90');
    expect(arenda?.source).toBe('planned');
    expect(arenda?.plannedId).toBe(90);
    expect(arenda?.name).toBe('Аренда');
    expect(arenda?.dayOfMonth).toBe(1);
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
      makeCat({ id: 3, plan_cents: 20_000, code: 'cafe' }),
      makeCat({ id: 4, plan_cents: 10_000, code: 'transport' }),
    ];
    const out = plansFromCategories(cats);
    // Only the system 'savings' category is filtered out.
    expect(out).toEqual([
      { category_id: 1, plan_cents: 50_000 },
      { category_id: 3, plan_cents: 20_000 },
      { category_id: 4, plan_cents: 10_000 },
    ]);
  });
});
