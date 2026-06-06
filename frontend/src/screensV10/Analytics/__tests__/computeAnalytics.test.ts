// Phase 27-05 Task 1: pure compute helpers for AnalyticsView (ANAL-V10-01..04).
//
// Surface coverage:
//   - lastNMonths(now, n)                        — RU month chip labels
//   - groupActualsByDay(actuals, ps, pe)         — bar chart data, day mode
//   - groupActualsByWeek(actuals, ps)            — bar chart data, week mode
//   - groupActualsByCategory(actuals, cats)      — bar chart + top-5 fallback
//   - computeKPISpent(curr, prev)                — «ПОТРАЧЕНО» plate
//   - computeKPISaved(actuals, cats)             — «СЭКОНОМЛЕНО» plate
//   - shouldHighlightRed(sum, plan, threshold)   — red bar gate ≥75%
//   - computePct(sum, plan)                      — clamped 0..100
//
// All deterministic, side-effect-free, byte-identical to iOS sister helpers.

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

// ─────────────────── lastNMonths ───────────────────

describe('lastNMonths', () => {
  it('returns 3 months ending with current month', () => {
    const now = new Date(2026, 4, 10); // May 10, 2026
    const out = lastNMonths(now, 3);
    expect(out).toHaveLength(3);
    expect(out[0].label).toBe('МАР 26');
    expect(out[1].label).toBe('АПР 26');
    expect(out[2].label).toBe('МАЙ 26');
  });

  it('emits period_start = YYYY-MM-01', () => {
    const now = new Date(2026, 4, 10);
    const out = lastNMonths(now, 3);
    expect(out[2].period_start).toBe('2026-05-01');
    expect(out[1].period_start).toBe('2026-04-01');
  });

  it('emits period_end = last day of month (handles 28/29/30/31)', () => {
    const now = new Date(2026, 4, 10);
    const out = lastNMonths(now, 3);
    expect(out[2].period_end).toBe('2026-05-31');
    expect(out[1].period_end).toBe('2026-04-30');
    expect(out[0].period_end).toBe('2026-03-31');
  });

  it('handles February in non-leap year (28 days)', () => {
    const now = new Date(2026, 1, 15); // Feb 15, 2026
    const out = lastNMonths(now, 1);
    expect(out[0].period_end).toBe('2026-02-28');
  });

  it('crosses year boundary correctly (Jan → prev Dec/Nov)', () => {
    const now = new Date(2026, 0, 5); // Jan 5, 2026
    const out = lastNMonths(now, 3);
    expect(out[0].label).toBe('НОЯ 25');
    expect(out[1].label).toBe('ДЕК 25');
    expect(out[2].label).toBe('ЯНВ 26');
    expect(out[0].period_start).toBe('2025-11-01');
  });
});

// ─────────────────── groupActualsByDay ───────────────────

describe('groupActualsByDay', () => {
  it('returns empty for no actuals', () => {
    expect(groupActualsByDay([], '2026-05-01', '2026-05-31')).toEqual([]);
  });

  it('sums by tx_date ascending', () => {
    const acts = [
      mkActual({ id: 1, tx_date: '2026-05-03', amount_cents: 1000 }),
      mkActual({ id: 2, tx_date: '2026-05-01', amount_cents: 500 }),
      mkActual({ id: 3, tx_date: '2026-05-03', amount_cents: 700 }),
    ];
    const out = groupActualsByDay(acts, '2026-05-01', '2026-05-31');
    expect(out).toEqual([
      { key: '2026-05-01', sumCents: 500 },
      { key: '2026-05-03', sumCents: 1700 },
    ]);
  });

  it('filters by period bounds (inclusive)', () => {
    const acts = [
      mkActual({ id: 1, tx_date: '2026-04-30', amount_cents: 999 }), // out
      mkActual({ id: 2, tx_date: '2026-05-01', amount_cents: 100 }), // in
      mkActual({ id: 3, tx_date: '2026-05-31', amount_cents: 200 }), // in
      mkActual({ id: 4, tx_date: '2026-06-01', amount_cents: 999 }), // out
    ];
    const out = groupActualsByDay(acts, '2026-05-01', '2026-05-31');
    expect(out).toHaveLength(2);
    expect(out.reduce((s, b) => s + b.sumCents, 0)).toBe(300);
  });

  it('skips non-expense kinds', () => {
    const acts = [
      mkActual({ id: 1, kind: 'expense', amount_cents: 100 }),
      mkActual({ id: 2, kind: 'income', amount_cents: 9999 }),
      mkActual({ id: 3, kind: 'roundup', amount_cents: 50 }),
      mkActual({ id: 4, kind: 'deposit', amount_cents: 8888 }),
    ];
    const out = groupActualsByDay(acts, '2026-05-01', '2026-05-31');
    expect(out).toHaveLength(1);
    expect(out[0].sumCents).toBe(100);
  });
});

// ─────────────────── groupActualsByWeek ───────────────────

describe('groupActualsByWeek', () => {
  it('returns empty for no actuals', () => {
    expect(groupActualsByWeek([], '2026-05-01')).toEqual([]);
  });

  it('buckets by ceil(day/7) — week 1..5', () => {
    const acts = [
      mkActual({ id: 1, tx_date: '2026-05-01', amount_cents: 100 }), // week 1
      mkActual({ id: 2, tx_date: '2026-05-07', amount_cents: 200 }), // week 1
      mkActual({ id: 3, tx_date: '2026-05-08', amount_cents: 300 }), // week 2
      mkActual({ id: 4, tx_date: '2026-05-29', amount_cents: 400 }), // week 5
    ];
    const out = groupActualsByWeek(acts, '2026-05-01');
    expect(out).toEqual([
      { weekIdx: 1, sumCents: 300 },
      { weekIdx: 2, sumCents: 300 },
      { weekIdx: 5, sumCents: 400 },
    ]);
  });

  it('skips non-expense kinds', () => {
    const acts = [
      mkActual({
        id: 1,
        tx_date: '2026-05-01',
        amount_cents: 100,
        kind: 'income',
      }),
      mkActual({
        id: 2,
        tx_date: '2026-05-01',
        amount_cents: 50,
        kind: 'expense',
      }),
    ];
    const out = groupActualsByWeek(acts, '2026-05-01');
    expect(out).toHaveLength(1);
    expect(out[0].sumCents).toBe(50);
  });
});

// ─────────────────── groupActualsByCategory ───────────────────

describe('groupActualsByCategory', () => {
  it('returns empty for no actuals', () => {
    expect(groupActualsByCategory([], [])).toEqual([]);
  });

  it('joins category name + plan_cents and sorts desc by sumCents', () => {
    const cats = [
      mkCategory({ id: 1, name: 'Еда', plan_cents: 30000 }),
      mkCategory({ id: 2, name: 'Транспорт', plan_cents: 10000 }),
    ];
    const acts = [
      mkActual({ id: 1, category_id: 1, amount_cents: 5000 }),
      mkActual({ id: 2, category_id: 2, amount_cents: 8000 }),
      mkActual({ id: 3, category_id: 1, amount_cents: 7000 }),
    ];
    const out = groupActualsByCategory(acts, cats);
    expect(out[0]).toMatchObject({
      category_id: 1,
      category_name: 'Еда',
      plan_cents: 30000,
      sumCents: 12000,
    });
    expect(out[1]).toMatchObject({
      category_id: 2,
      category_name: 'Транспорт',
      sumCents: 8000,
    });
  });

  it('skips actuals without category_id', () => {
    const acts = [
      mkActual({
        id: 1,
        category_id: null as unknown as number,
        amount_cents: 100,
      }),
      mkActual({ id: 2, category_id: 1, amount_cents: 200 }),
    ];
    const out = groupActualsByCategory(acts, [
      mkCategory({ id: 1, name: 'X' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sumCents).toBe(200);
  });

  it('falls back to "?" for unknown category_id', () => {
    const acts = [mkActual({ id: 1, category_id: 999, amount_cents: 100 })];
    const out = groupActualsByCategory(acts, []);
    expect(out[0].category_name).toBe('?');
  });
});

// ─────────────────── computeKPISpent ───────────────────

describe('computeKPISpent', () => {
  it('returns 0/0/0 for empty curr+prev', () => {
    const out = computeKPISpent([], []);
    expect(out).toEqual({ sumCents: 0, deltaCents: 0, deltaPct: 0 });
  });

  it('sums absolute expense amounts (skips income/roundup/deposit)', () => {
    const curr = [
      mkActual({ id: 1, kind: 'expense', amount_cents: 1000 }),
      mkActual({ id: 2, kind: 'income', amount_cents: 9999 }),
      mkActual({ id: 3, kind: 'expense', amount_cents: 500 }),
    ];
    const out = computeKPISpent(curr, []);
    expect(out.sumCents).toBe(1500);
  });

  it('computes deltaPct vs prev period', () => {
    const curr = [mkActual({ kind: 'expense', amount_cents: 12000 })];
    const prev = [mkActual({ kind: 'expense', amount_cents: 10000 })];
    const out = computeKPISpent(curr, prev);
    expect(out.deltaCents).toBe(2000);
    expect(out.deltaPct).toBe(20);
  });

  it('returns deltaPct=0 when prev sum is 0 (avoid div-by-zero)', () => {
    const curr = [mkActual({ kind: 'expense', amount_cents: 5000 })];
    const out = computeKPISpent(curr, []);
    expect(out.deltaPct).toBe(0);
  });
});

// ─────────────────── computeKPISaved ───────────────────

describe('computeKPISaved', () => {
  it('returns 0 for empty input', () => {
    expect(computeKPISaved([], [])).toEqual({ sumCents: 0 });
  });

  it('sums positive remainders only (plan − fact, max 0)', () => {
    const cats = [
      mkCategory({ id: 1, plan_cents: 10000 }),
      mkCategory({ id: 2, plan_cents: 5000 }),
    ];
    const acts = [
      mkActual({ id: 1, category_id: 1, amount_cents: 7000 }), // remainder 3000
      mkActual({ id: 2, category_id: 2, amount_cents: 8000 }), // overflow → 0
    ];
    expect(computeKPISaved(acts, cats)).toEqual({ sumCents: 3000 });
  });

  it('skips system "savings" code category', () => {
    const cats = [
      mkCategory({ id: 1, code: 'savings', plan_cents: 99999 }),
      mkCategory({ id: 3, plan_cents: 1000 }),
    ];
    const acts = [mkActual({ id: 1, category_id: 3, amount_cents: 100 })];
    expect(computeKPISaved(acts, cats)).toEqual({ sumCents: 900 });
  });
});

// ─────────────────── shouldHighlightRed ───────────────────

describe('shouldHighlightRed', () => {
  it('returns false when plan <= 0 (avoid div-by-zero)', () => {
    expect(shouldHighlightRed(100, 0)).toBe(false);
    expect(shouldHighlightRed(100, -1)).toBe(false);
  });

  it('returns true when ratio >= default threshold 0.75', () => {
    expect(shouldHighlightRed(75, 100)).toBe(true);
    expect(shouldHighlightRed(80, 100)).toBe(true);
    expect(shouldHighlightRed(120, 100)).toBe(true);
  });

  it('returns false when ratio < 0.75', () => {
    expect(shouldHighlightRed(74, 100)).toBe(false);
    expect(shouldHighlightRed(0, 100)).toBe(false);
  });

  it('respects custom threshold', () => {
    expect(shouldHighlightRed(50, 100, 0.5)).toBe(true);
    expect(shouldHighlightRed(49, 100, 0.5)).toBe(false);
  });
});

// ─────────────────── computePct ───────────────────

describe('computePct', () => {
  it('returns 0 when plan <= 0 (avoid div-by-zero)', () => {
    expect(computePct(100, 0)).toBe(0);
    expect(computePct(100, -5)).toBe(0);
  });

  it('returns rounded percent', () => {
    expect(computePct(50, 100)).toBe(50);
    expect(computePct(33, 100)).toBe(33);
    expect(computePct(1, 3)).toBe(33);
  });

  it('clamps to [0, 100]', () => {
    expect(computePct(200, 100)).toBe(100);
    expect(computePct(-50, 100)).toBe(0);
  });
});

// ─────────────────── computeTopCategories (P3-W2) ───────────────────

describe('computeTopCategories', () => {
  it('returns [] for no actuals', () => {
    expect(computeTopCategories([], [mkCategory()], 5)).toEqual([]);
  });

  it('derives top rows from actuals, sorted desc by sum, sliced to limit', () => {
    const cats = [
      mkCategory({ id: 1, name: 'Еда', plan_cents: 100000 }),
      mkCategory({ id: 2, name: 'Транспорт', plan_cents: 0 }),
      mkCategory({ id: 3, name: 'Развлечения', plan_cents: 20000 }),
    ];
    const actuals = [
      mkActual({ id: 1, category_id: 1, amount_cents: -30000 }),
      mkActual({ id: 2, category_id: 2, amount_cents: -90000 }),
      mkActual({ id: 3, category_id: 3, amount_cents: -10000 }),
    ];
    const out = computeTopCategories(actuals, cats, 2);
    expect(out).toHaveLength(2);
    // Транспорт (90000) first, then Еда (30000)
    expect(out[0]).toMatchObject({
      category_id: 2,
      category_name: 'Транспорт',
      sum_cents: 90000,
      plan_cents: 0,
      pct_of_plan: null, // plan <= 0 → null
    });
    expect(out[1]).toMatchObject({
      category_id: 1,
      category_name: 'Еда',
      sum_cents: 30000,
      plan_cents: 100000,
      pct_of_plan: 30, // 30000/100000
    });
  });

  it('aggregates multiple actuals in the same category (abs value)', () => {
    const cats = [mkCategory({ id: 1, name: 'Еда', plan_cents: 100000 })];
    const actuals = [
      mkActual({ id: 1, category_id: 1, amount_cents: -20000 }),
      mkActual({ id: 2, category_id: 1, amount_cents: -25000 }),
    ];
    const out = computeTopCategories(actuals, cats, 5);
    expect(out).toHaveLength(1);
    expect(out[0].sum_cents).toBe(45000);
    expect(out[0].pct_of_plan).toBe(45);
  });

  it('ignores non-expense kinds', () => {
    const cats = [mkCategory({ id: 1, name: 'Еда', plan_cents: 100000 })];
    const actuals = [
      mkActual({ id: 1, category_id: 1, kind: 'income', amount_cents: 99999 }),
    ];
    expect(computeTopCategories(actuals, cats, 5)).toEqual([]);
  });
});
