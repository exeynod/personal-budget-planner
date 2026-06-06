// Phase 27-05 Task 1: pure compute helpers for AnalyticsView (ANAL-V10-01..04).
//
// One behaviour test per formula; money/sign and div-by-zero guards protected.

import { describe, it, expect } from 'vitest';
import {
  lastNMonths,
  groupActualsByDay,
  groupActualsByWeek,
  groupActualsByCategory,
  computeKPISpent,
  computeKPISaved,
  computeTopCategories,
  shouldHighlightRed,
  computePct,
} from '../computeAnalytics';
import type { ActualV10Read, CategoryV10 } from '../../../api/v10';

// ─────────────────── builders ───────────────────

function mkActual(over: Partial<ActualV10Read> = {}): ActualV10Read {
  return {
    id: 1,
    period_id: 1,
    kind: 'expense',
    amount_cents: 10000,
    description: null,
    category_id: 1,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T10:00:00Z',
    account_id: null,
    parent_txn_id: null,
    ...over,
  };
}

function mkCategory(over: Partial<CategoryV10> = {}): CategoryV10 {
  return {
    id: 1,
    name: 'Еда',
    kind: 'expense',
    is_archived: false,
    sort_order: 10,
    created_at: '2026-04-01T00:00:00Z',
    code: 'food',
    ord: '01',
    plan_cents: 50000,
    ...over,
  };
}

describe('lastNMonths', () => {
  it('emits RU labels + period bounds, crossing year/month + leap-Feb', () => {
    const out = lastNMonths(new Date(2026, 4, 10), 3); // May 2026
    expect(out.map((m) => m.label)).toEqual(['МАР 26', 'АПР 26', 'МАЙ 26']);
    expect(out[2].period_start).toBe('2026-05-01');
    expect(out[2].period_end).toBe('2026-05-31');
    expect(out[1].period_end).toBe('2026-04-30');
    // year boundary
    const jan = lastNMonths(new Date(2026, 0, 5), 3);
    expect(jan[0].label).toBe('НОЯ 25');
    expect(jan[0].period_start).toBe('2025-11-01');
    // non-leap Feb
    expect(lastNMonths(new Date(2026, 1, 15), 1)[0].period_end).toBe(
      '2026-02-28',
    );
  });
});

describe('groupActualsByDay', () => {
  it('sums expense by date, period-bounded, skips non-expense; empty → []', () => {
    expect(groupActualsByDay([], '2026-05-01', '2026-05-31')).toEqual([]);
    const acts = [
      mkActual({ id: 1, tx_date: '2026-05-03', amount_cents: 1000 }),
      mkActual({ id: 2, tx_date: '2026-05-01', amount_cents: 500 }),
      mkActual({ id: 3, tx_date: '2026-05-03', amount_cents: 700 }),
      mkActual({ id: 4, tx_date: '2026-04-30', amount_cents: 999 }), // out of bounds
      mkActual({
        id: 5,
        tx_date: '2026-05-02',
        kind: 'income',
        amount_cents: 999,
      }),
    ];
    expect(groupActualsByDay(acts, '2026-05-01', '2026-05-31')).toEqual([
      { key: '2026-05-01', sumCents: 500 },
      { key: '2026-05-03', sumCents: 1700 },
    ]);
  });
});

describe('groupActualsByWeek', () => {
  it('buckets by ceil(day/7), skips non-expense; empty → []', () => {
    expect(groupActualsByWeek([], '2026-05-01')).toEqual([]);
    const acts = [
      mkActual({ id: 1, tx_date: '2026-05-01', amount_cents: 100 }), // wk1
      mkActual({ id: 2, tx_date: '2026-05-08', amount_cents: 300 }), // wk2
      mkActual({ id: 3, tx_date: '2026-05-29', amount_cents: 400 }), // wk5
      mkActual({
        id: 4,
        tx_date: '2026-05-02',
        kind: 'income',
        amount_cents: 999,
      }),
    ];
    expect(groupActualsByWeek(acts, '2026-05-01')).toEqual([
      { weekIdx: 1, sumCents: 100 },
      { weekIdx: 2, sumCents: 300 },
      { weekIdx: 5, sumCents: 400 },
    ]);
  });
});

describe('groupActualsByCategory', () => {
  it('joins name+plan, sorts desc, skips null cat, "?" for unknown', () => {
    expect(groupActualsByCategory([], [])).toEqual([]);
    const cats = [
      mkCategory({ id: 1, name: 'Еда', plan_cents: 30000 }),
      mkCategory({ id: 2, name: 'Транспорт', plan_cents: 10000 }),
    ];
    const acts = [
      mkActual({ id: 1, category_id: 1, amount_cents: 5000 }),
      mkActual({ id: 2, category_id: 2, amount_cents: 8000 }),
      mkActual({ id: 3, category_id: 1, amount_cents: 7000 }),
      mkActual({ id: 4, category_id: 999, amount_cents: 100 }), // unknown → '?'
    ];
    const out = groupActualsByCategory(acts, cats);
    expect(out[0]).toMatchObject({
      category_id: 1,
      category_name: 'Еда',
      sumCents: 12000,
    });
    expect(out[1]).toMatchObject({ category_id: 2, sumCents: 8000 });
    expect(out.find((r) => r.category_id === 999)?.category_name).toBe('?');
  });
});

describe('computeKPISpent', () => {
  it('sums expense only, computes delta vs prev, guards div-by-zero', () => {
    expect(computeKPISpent([], [])).toEqual({
      sumCents: 0,
      deltaCents: 0,
      deltaPct: 0,
    });
    const curr = [
      mkActual({ id: 1, kind: 'expense', amount_cents: 12000 }),
      mkActual({ id: 2, kind: 'income', amount_cents: 9999 }),
    ];
    const prev = [mkActual({ kind: 'expense', amount_cents: 10000 })];
    expect(computeKPISpent(curr, prev)).toMatchObject({
      sumCents: 12000,
      deltaCents: 2000,
      deltaPct: 20,
    });
    expect(computeKPISpent(curr, []).deltaPct).toBe(0); // prev=0 guard
  });
});

describe('computeKPISaved', () => {
  it('sums positive remainders (plan−fact, ≥0), skips savings code', () => {
    expect(computeKPISaved([], [])).toEqual({ sumCents: 0 });
    const cats = [
      mkCategory({ id: 1, plan_cents: 10000 }),
      mkCategory({ id: 2, plan_cents: 5000 }),
      mkCategory({ id: 3, code: 'savings', plan_cents: 99999 }),
    ];
    const acts = [
      mkActual({ id: 1, category_id: 1, amount_cents: 7000 }), // +3000
      mkActual({ id: 2, category_id: 2, amount_cents: 8000 }), // overflow → 0
    ];
    expect(computeKPISaved(acts, cats)).toEqual({ sumCents: 3000 });
  });
});

describe('shouldHighlightRed', () => {
  it('true at/over threshold, false below, plan<=0 guard, custom threshold', () => {
    expect(shouldHighlightRed(100, 0)).toBe(false);
    expect(shouldHighlightRed(75, 100)).toBe(true);
    expect(shouldHighlightRed(74, 100)).toBe(false);
    expect(shouldHighlightRed(50, 100, 0.5)).toBe(true);
  });
});

describe('computePct', () => {
  it('rounds, clamps [0,100], plan<=0 → 0', () => {
    expect(computePct(100, 0)).toBe(0);
    expect(computePct(1, 3)).toBe(33);
    expect(computePct(200, 100)).toBe(100);
    expect(computePct(-50, 100)).toBe(0);
  });
});

describe('computeTopCategories', () => {
  it('top rows sorted desc by abs sum, sliced, pct null when plan<=0', () => {
    expect(computeTopCategories([], [mkCategory()], 5)).toEqual([]);
    const cats = [
      mkCategory({ id: 1, name: 'Еда', plan_cents: 100000 }),
      mkCategory({ id: 2, name: 'Транспорт', plan_cents: 0 }),
    ];
    const actuals = [
      mkActual({ id: 1, category_id: 1, amount_cents: -30000 }),
      mkActual({ id: 2, category_id: 2, amount_cents: -90000 }),
      mkActual({ id: 3, category_id: 1, amount_cents: -15000 }),
      mkActual({ id: 4, category_id: 1, kind: 'income', amount_cents: 99999 }), // skipped
    ];
    const out = computeTopCategories(actuals, cats, 2);
    expect(out[0]).toMatchObject({
      category_id: 2,
      sum_cents: 90000,
      pct_of_plan: null,
    });
    expect(out[1]).toMatchObject({
      category_id: 1,
      sum_cents: 45000,
      pct_of_plan: 45,
    });
  });
});
