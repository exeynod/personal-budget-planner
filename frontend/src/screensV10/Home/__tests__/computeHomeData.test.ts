// Phase 25-04 Task 1: pure compute helpers for HomeView.
//
// Behaviour-focused: delta sign (plan−fact), kopeks, and the 4-level
// "Расписано" ladder (unpostedByCategory/plannedUnpostedTotal) protected.

import { describe, it, expect } from 'vitest';
import {
  computeDailyPace,
  computeSurplus,
  computeWalletTotal,
  computeCategoryAggregates,
  sortCategoriesForHome,
  unpostedByCategory,
  plannedUnpostedTotal,
  type CategoryAggregateRow,
} from '../computeHomeData';
import type { PlannedV11Read } from '../../../api/v10';
import type {
  AccountResponse,
  ActualV10Read,
  CategoryV10,
} from '../../../api/v10';

// ─────────────────── helpers ───────────────────

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Т-Банк',
    mask: '1234',
    kind: 'card',
    balance_cents: 0,
    primary: true,
    created_at: '2026-04-15T08:30:00+00:00',
    ...over,
  };
}

function mkCategory(over: Partial<CategoryV10> = {}): CategoryV10 {
  return {
    id: 1,
    name: 'Кафе',
    kind: 'expense',
    is_archived: false,
    sort_order: 10,
    created_at: '2026-04-01T00:00:00+00:00',
    code: 'cafe',
    ord: '01',
    plan_cents: 0,
    parent_id: null,
    ...over,
  };
}

function mkActual(over: Partial<ActualV10Read> = {}): ActualV10Read {
  return {
    id: 1,
    period_id: 1,
    kind: 'expense',
    amount_cents: 0,
    description: null,
    category_id: 1,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T12:00:00+00:00',
    account_id: 1,
    parent_txn_id: null,
    ...over,
  };
}

describe('computeDailyPace', () => {
  it('floor((plan-fact)/daysLeft), clamp ≥0, denom max(1,daysLeft)', () => {
    expect(
      computeDailyPace({
        planTotalCents: 100_000_00,
        factTotalExpenseCents: 20_000_00,
        daysLeft: 20,
      }),
    ).toBe(4000_00);
    expect(
      computeDailyPace({
        planTotalCents: 100_000_00,
        factTotalExpenseCents: 120_000_00,
        daysLeft: 10,
      }),
    ).toBe(0); // over-budget
    expect(
      computeDailyPace({
        planTotalCents: 200,
        factTotalExpenseCents: 50,
        daysLeft: -5,
      }),
    ).toBe(150); // T-25-04-02
    expect(
      computeDailyPace({
        planTotalCents: 1001,
        factTotalExpenseCents: 0,
        daysLeft: 3,
      }),
    ).toBe(333); // floor
  });
});

describe('computeSurplus', () => {
  it('returns signed plan − fact (positive = good)', () => {
    expect(
      computeSurplus({
        planTotalCents: 50_000_00,
        factTotalExpenseCents: 30_000_00,
      }),
    ).toBe(20_000_00);
    expect(
      computeSurplus({
        planTotalCents: 50_000_00,
        factTotalExpenseCents: 60_000_00,
      }),
    ).toBe(-10_000_00);
    expect(
      computeSurplus({ planTotalCents: 1000, factTotalExpenseCents: 1000 }),
    ).toBe(0);
  });
});

describe('computeWalletTotal', () => {
  it('sums balances incl. negatives; empty → 0', () => {
    expect(computeWalletTotal([])).toBe(0);
    expect(
      computeWalletTotal([
        mkAccount({ id: 1, balance_cents: 10_000_00 }),
        mkAccount({ id: 2, balance_cents: -3_000_00 }),
      ]),
    ).toBe(7_000_00);
  });
});

describe('computeCategoryAggregates', () => {
  it('filters savings, sums expense-only fact, derives ratio/isOver', () => {
    const categories = [
      mkCategory({ id: 1, code: 'cafe', plan_cents: 10_000_00 }),
      mkCategory({ id: 2, code: 'savings', plan_cents: 2000 }),
    ];
    const actuals = [
      mkActual({
        id: 100,
        category_id: 1,
        kind: 'expense',
        amount_cents: 1500_00,
      }),
      mkActual({
        id: 101,
        category_id: 1,
        kind: 'expense',
        amount_cents: 500_00,
      }),
      mkActual({ id: 102, category_id: 1, kind: 'roundup', amount_cents: 50 }), // not counted
      mkActual({
        id: 103,
        category_id: 1,
        kind: 'deposit',
        amount_cents: 200_00,
      }), // not counted
    ];
    const rows = computeCategoryAggregates({ categories, actuals });
    expect(rows.map((r) => r.id)).toEqual([1]); // savings filtered (T-25-04-01)
    expect(rows[0]).toMatchObject({
      fact_cents: 2000_00,
      plan_cents: 10_000_00,
    });
  });

  it('ratio edge cases: plan=0 fact=0 → 0, plan=0 fact>0 → Infinity/over', () => {
    const zero = computeCategoryAggregates({
      categories: [mkCategory({ id: 1, plan_cents: 0 })],
      actuals: [],
    });
    expect(zero[0]).toMatchObject({ ratio: 0, isOver: false });
    const over = computeCategoryAggregates({
      categories: [mkCategory({ id: 1, plan_cents: 0 })],
      actuals: [
        mkActual({ category_id: 1, kind: 'expense', amount_cents: 100 }),
      ],
    });
    expect(over[0]).toMatchObject({ ratio: Infinity, isOver: true });
  });
});

describe('sortCategoriesForHome', () => {
  function row(over: Partial<CategoryAggregateRow>): CategoryAggregateRow {
    return {
      id: 0,
      name: 'X',
      code: null,
      ord: '01',
      plan_cents: 0,
      fact_cents: 0,
      ratio: 0,
      isOver: false,
      ...over,
    };
  }

  it('ratio DESC (Infinity first), plan_cents DESC tie-break, no mutation', () => {
    const rows: CategoryAggregateRow[] = [
      row({ id: 1, ratio: 0.5, plan_cents: 1000 }),
      row({ id: 2, ratio: 0.5, plan_cents: 5000 }),
      row({ id: 3, ratio: Infinity }),
    ];
    const snapshot = [...rows];
    expect(sortCategoriesForHome(rows).map((r) => r.id)).toEqual([3, 2, 1]);
    expect(rows).toEqual(snapshot); // input not mutated
  });
});

// ─────────────────── unposted planned (4-level ladder) ───────────────────

function mkPlanned(over: Partial<PlannedV11Read> = {}): PlannedV11Read {
  return {
    id: 1,
    period_id: 10,
    category_id: 100,
    amount_cents: 50000,
    description: null,
    kind: 'expense',
    planned_date: null,
    posted_txn_id: null,
    source: 'manual',
    subscription_id: null,
    ...over,
  };
}

describe('unpostedByCategory / plannedUnpostedTotal', () => {
  it('sums only unposted, non-subscription rows (anti-double-count)', () => {
    const planned: PlannedV11Read[] = [
      // counts → category 100
      mkPlanned({ id: 1, category_id: 100, amount_cents: 50000 }),
      mkPlanned({ id: 2, category_id: 100, amount_cents: 20000 }),
      // posted → excluded
      mkPlanned({
        id: 3,
        category_id: 100,
        amount_cents: 99999,
        posted_txn_id: 7,
      }),
      // subscription_auto → excluded (anti-double-count)
      mkPlanned({
        id: 4,
        category_id: 100,
        amount_cents: 30000,
        source: 'subscription_auto',
        subscription_id: 5,
      }),
      // counts → category 200 (template is a deliberate plan, kept)
      mkPlanned({
        id: 5,
        category_id: 200,
        amount_cents: 12345,
        source: 'template',
      }),
      // negative magnitude → abs
      mkPlanned({ id: 6, category_id: 200, amount_cents: -1000 }),
    ];

    const byCat = unpostedByCategory(planned);
    expect(byCat.get(100)).toBe(70000);
    expect(byCat.get(200)).toBe(13345);
    expect(byCat.has(999)).toBe(false);

    expect(plannedUnpostedTotal(planned)).toBe(83345);
  });

  it('empty input → empty map and 0 total', () => {
    expect(unpostedByCategory([]).size).toBe(0);
    expect(plannedUnpostedTotal([])).toBe(0);
  });
});
