// Phase 25-04 Task 1: pure compute helpers for HomeView.
//
// Coverage:
//  - computeDailyPace: floor((plan-fact)/max(1,daysLeft)) clamped to ≥0
//  - computeSurplus: signed plan-fact
//  - computeWalletTotal: Σ account.balance_cents (handles negatives)
//  - computeCategoryAggregates: filters savings + paused; per-row fact = Σ expenses
//  - sortCategoriesForHome: ratio DESC, plan_cents DESC tie-break
//
// Threat coverage:
//  - T-25-04-01 (info disclosure): savings/paused categories filtered out
//  - T-25-04-02 (negative daysLeft): denominator guard max(1, daysLeft)

import { describe, it, expect } from 'vitest';
import {
  computeDailyPace,
  computeSurplus,
  computeWalletTotal,
  computeCategoryAggregates,
  sortCategoriesForHome,
  type CategoryAggregateRow,
} from '../computeHomeData';
import type { AccountResponse, ActualV10Read, CategoryV10 } from '../../../api/v10';

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
    rollover: 'misc',
    paused: false,
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

// ─────────────────── computeDailyPace ───────────────────

describe('computeDailyPace', () => {
  it('returns floor((plan-fact)/daysLeft) for the happy path', () => {
    // plan=100_000₽, fact=20_000₽, days=20 → (100_000-20_000)/20 = 4000₽/day
    expect(
      computeDailyPace({
        planTotalCents: 100_000_00,
        factTotalExpenseCents: 20_000_00,
        daysLeft: 20,
      }),
    ).toBe(4000_00);
  });

  it('clamps to 0 when fact > plan (over-budget)', () => {
    expect(
      computeDailyPace({
        planTotalCents: 100_000_00,
        factTotalExpenseCents: 120_000_00,
        daysLeft: 10,
      }),
    ).toBe(0);
  });

  it('uses denominator max(1, daysLeft) when daysLeft=0 (T-25-04-02)', () => {
    expect(
      computeDailyPace({
        planTotalCents: 100,
        factTotalExpenseCents: 0,
        daysLeft: 0,
      }),
    ).toBe(100);
  });

  it('uses denominator max(1, daysLeft) for negative daysLeft (T-25-04-02)', () => {
    expect(
      computeDailyPace({
        planTotalCents: 200,
        factTotalExpenseCents: 50,
        daysLeft: -5,
      }),
    ).toBe(150);
  });

  it('floors fractional results', () => {
    // (1001 - 0) / 3 = 333.66 → floor 333
    expect(
      computeDailyPace({
        planTotalCents: 1001,
        factTotalExpenseCents: 0,
        daysLeft: 3,
      }),
    ).toBe(333);
  });
});

// ─────────────────── computeSurplus ───────────────────

describe('computeSurplus', () => {
  it('returns plan - fact (signed positive)', () => {
    expect(
      computeSurplus({
        planTotalCents: 50_000_00,
        factTotalExpenseCents: 30_000_00,
      }),
    ).toBe(20_000_00);
  });

  it('returns negative when over budget', () => {
    expect(
      computeSurplus({
        planTotalCents: 50_000_00,
        factTotalExpenseCents: 60_000_00,
      }),
    ).toBe(-10_000_00);
  });

  it('returns 0 when plan === fact', () => {
    expect(
      computeSurplus({
        planTotalCents: 1000,
        factTotalExpenseCents: 1000,
      }),
    ).toBe(0);
  });
});

// ─────────────────── computeWalletTotal ───────────────────

describe('computeWalletTotal', () => {
  it('returns 0 for empty accounts', () => {
    expect(computeWalletTotal([])).toBe(0);
  });

  it('sums balance_cents across multiple accounts', () => {
    const accounts = [
      mkAccount({ id: 1, balance_cents: 12_345_00 }),
      mkAccount({ id: 2, balance_cents: 5_000_00 }),
      mkAccount({ id: 3, balance_cents: 100_00 }),
    ];
    expect(computeWalletTotal(accounts)).toBe(12_345_00 + 5_000_00 + 100_00);
  });

  it('honours negative balances (overdraft accounts)', () => {
    const accounts = [
      mkAccount({ id: 1, balance_cents: 10_000_00 }),
      mkAccount({ id: 2, balance_cents: -3_000_00 }),
    ];
    expect(computeWalletTotal(accounts)).toBe(7_000_00);
  });
});

// ─────────────────── computeCategoryAggregates ───────────────────

describe('computeCategoryAggregates', () => {
  it('returns empty list when categories are empty', () => {
    expect(
      computeCategoryAggregates({ categories: [], actuals: [] }),
    ).toEqual([]);
  });

  it("filters out savings categories (T-25-04-01)", () => {
    const categories = [
      mkCategory({ id: 1, code: 'cafe', plan_cents: 1000 }),
      mkCategory({ id: 2, code: 'savings', plan_cents: 2000 }),
    ];
    const rows = computeCategoryAggregates({ categories, actuals: [] });
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('filters out paused categories (T-25-04-01)', () => {
    const categories = [
      mkCategory({ id: 1, code: 'cafe', paused: false }),
      mkCategory({ id: 2, code: 'transit', paused: true }),
    ];
    const rows = computeCategoryAggregates({ categories, actuals: [] });
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('returns empty list when ALL categories paused', () => {
    const categories = [
      mkCategory({ id: 1, paused: true }),
      mkCategory({ id: 2, paused: true }),
    ];
    expect(
      computeCategoryAggregates({ categories, actuals: [] }),
    ).toEqual([]);
  });

  it('aggregates fact_cents per category from expense actuals only', () => {
    const categories = [
      mkCategory({ id: 1, code: 'cafe', plan_cents: 10_000_00 }),
    ];
    const actuals = [
      mkActual({ id: 100, category_id: 1, kind: 'expense', amount_cents: 1500_00 }),
      mkActual({ id: 101, category_id: 1, kind: 'expense', amount_cents: 500_00 }),
      // roundup must NOT count toward category fact (mirror prototype semantics)
      mkActual({ id: 102, category_id: 1, kind: 'roundup', amount_cents: 50 }),
      // deposit must NOT count
      mkActual({ id: 103, category_id: 1, kind: 'deposit', amount_cents: 200_00 }),
      // wrong category — must be ignored
      mkActual({ id: 104, category_id: 2, kind: 'expense', amount_cents: 999_00 }),
    ];
    const rows = computeCategoryAggregates({ categories, actuals });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      fact_cents: 1500_00 + 500_00,
      plan_cents: 10_000_00,
    });
  });

  it('sets isOver=true and ratio=fact/plan when fact > plan', () => {
    const categories = [mkCategory({ id: 1, plan_cents: 1000 })];
    const actuals = [
      mkActual({ category_id: 1, kind: 'expense', amount_cents: 1500 }),
    ];
    const rows = computeCategoryAggregates({ categories, actuals });
    expect(rows[0].isOver).toBe(true);
    expect(rows[0].ratio).toBeCloseTo(1.5);
  });

  it('plan=0 fact=0 → ratio=0 (no plan, no spend = neutral)', () => {
    const categories = [mkCategory({ id: 1, plan_cents: 0 })];
    const rows = computeCategoryAggregates({ categories, actuals: [] });
    expect(rows[0].ratio).toBe(0);
    expect(rows[0].isOver).toBe(false);
  });

  it('plan=0 fact>0 → ratio=Infinity, isOver=true (any spend without plan = OVER)', () => {
    const categories = [mkCategory({ id: 1, plan_cents: 0 })];
    const actuals = [
      mkActual({ category_id: 1, kind: 'expense', amount_cents: 100 }),
    ];
    const rows = computeCategoryAggregates({ categories, actuals });
    expect(rows[0].ratio).toBe(Infinity);
    expect(rows[0].isOver).toBe(true);
  });

  it('handles missing optional fields by defaulting (plan_cents=undefined → 0)', () => {
    const categories: CategoryV10[] = [
      {
        id: 1,
        name: 'Кафе',
        kind: 'expense',
        is_archived: false,
        sort_order: 10,
        created_at: '2026-04-01T00:00:00+00:00',
        code: 'cafe',
        ord: '01',
        // defaulted-optional v1.0 fields (plan_cents/rollover/paused/parent_id/tag)
        // omitted on purpose — exercises the consumer's defensive defaulting.
      },
    ];
    const rows = computeCategoryAggregates({ categories, actuals: [] });
    // No filter knockout: code missing ≠ 'savings'; paused missing → false (defaults).
    expect(rows).toHaveLength(1);
    expect(rows[0].plan_cents).toBe(0);
  });
});

// ─────────────────── sortCategoriesForHome ───────────────────

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

  it('sorts by ratio DESC (over-budget first)', () => {
    const rows: CategoryAggregateRow[] = [
      row({ id: 1, ratio: 0.5 }),
      row({ id: 2, ratio: 1.5 }),
      row({ id: 3, ratio: 1.0 }),
    ];
    expect(sortCategoriesForHome(rows).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('tie-break: same ratio → higher plan_cents first', () => {
    const rows: CategoryAggregateRow[] = [
      row({ id: 1, ratio: 0.5, plan_cents: 1000 }),
      row({ id: 2, ratio: 0.5, plan_cents: 5000 }),
      row({ id: 3, ratio: 0.5, plan_cents: 3000 }),
    ];
    expect(sortCategoriesForHome(rows).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('Infinity ratio (plan=0, fact>0) sorts before any finite ratio', () => {
    const rows: CategoryAggregateRow[] = [
      row({ id: 1, ratio: 5.0 }),
      row({ id: 2, ratio: Infinity }),
      row({ id: 3, ratio: 0.0 }),
    ];
    expect(sortCategoriesForHome(rows).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('does not mutate the input array', () => {
    const rows: CategoryAggregateRow[] = [
      row({ id: 1, ratio: 0.5 }),
      row({ id: 2, ratio: 1.5 }),
    ];
    const snapshot = [...rows];
    sortCategoriesForHome(rows);
    expect(rows).toEqual(snapshot);
  });
});
