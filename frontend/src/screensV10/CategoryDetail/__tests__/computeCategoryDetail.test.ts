// Phase 26-02 Task 1: pure compute helpers for CategoryDetailView (CAT-V10-01..06).
//
// Surface:
//   - computeOverPercent(fact, plan) → integer percent over plan (0 when fact ≤ plan)
//   - computeUnderPercent(fact, plan) → integer percent of plan used (0 when plan=0)
//   - computeBarSegments(fact, plan) → { fillRatio: number, tickAt?: number }
//   - filterActualsForCategory(actuals, categoryId) → ActualV10Read[]
//   - computeFactForCategory(actuals, categoryId) → integer cents (sum of |amount| of expense rows)
//
// All functions are deterministic, side-effect-free, side-input-free.

import { describe, it, expect } from 'vitest';
import {
  computeOverPercent,
  computeUnderPercent,
  computeBarSegments,
  filterActualsForCategory,
  computeFactForCategory,
} from '../computeCategoryDetail';
import type { ActualV10Read } from '../../../api/v10';

// ─────────────────── helpers ───────────────────

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

// ─────────────────── computeOverPercent ───────────────────

describe('computeOverPercent', () => {
  it('returns 50 when fact is 1.5x plan (15000 / 10000)', () => {
    expect(computeOverPercent(15_000, 10_000)).toBe(50);
  });

  it('returns 0 when fact equals plan (no over)', () => {
    expect(computeOverPercent(10_000, 10_000)).toBe(0);
  });

  it('returns 15 when fact is 11500 vs plan 10000 (rounded)', () => {
    expect(computeOverPercent(11_500, 10_000)).toBe(15);
  });

  it('returns 0 when plan is 0 (no plan = no over-percent computable)', () => {
    expect(computeOverPercent(5_000, 0)).toBe(0);
  });

  it('returns 0 when fact is below plan', () => {
    expect(computeOverPercent(5_000, 10_000)).toBe(0);
  });
});

// ─────────────────── computeUnderPercent ───────────────────

describe('computeUnderPercent', () => {
  it('returns 75 when fact is 7500 vs plan 10000', () => {
    expect(computeUnderPercent(7_500, 10_000)).toBe(75);
  });

  it('returns 0 when fact is 0', () => {
    expect(computeUnderPercent(0, 10_000)).toBe(0);
  });

  it('returns 100 when fact equals plan', () => {
    expect(computeUnderPercent(10_000, 10_000)).toBe(100);
  });

  it('returns 0 when plan is 0 (avoid div-by-zero)', () => {
    expect(computeUnderPercent(5_000, 0)).toBe(0);
  });

  it('rounds to nearest integer (3333 / 10000 → 33)', () => {
    expect(computeUnderPercent(3_333, 10_000)).toBe(33);
  });
});

// ─────────────────── computeBarSegments ───────────────────

describe('computeBarSegments', () => {
  it('returns fillRatio=0.75 with no tick when under-budget (7500/10000)', () => {
    const seg = computeBarSegments(7_500, 10_000);
    expect(seg.fillRatio).toBeCloseTo(0.75, 5);
    expect(seg.tickAt).toBeUndefined();
  });

  it('returns capped fillRatio=1.0 with tick when over-budget (15000/10000)', () => {
    const seg = computeBarSegments(15_000, 10_000);
    expect(seg.fillRatio).toBe(1);
    expect(seg.tickAt).toBeCloseTo(10_000 / 15_000, 5); // 0.6667
  });

  it('returns fillRatio=1.0 + tickAt=0 when plan=0 and any spend', () => {
    const seg = computeBarSegments(10_000, 0);
    expect(seg.fillRatio).toBe(1);
    expect(seg.tickAt).toBe(0);
  });

  it('returns fillRatio=0 when fact=0 (regardless of plan)', () => {
    const seg = computeBarSegments(0, 10_000);
    expect(seg.fillRatio).toBe(0);
    expect(seg.tickAt).toBeUndefined();
  });

  it('returns fillRatio=0 when fact=0 and plan=0', () => {
    const seg = computeBarSegments(0, 0);
    expect(seg.fillRatio).toBe(0);
    expect(seg.tickAt).toBeUndefined();
  });
});

// ─────────────────── filterActualsForCategory ───────────────────

describe('filterActualsForCategory', () => {
  const actuals: ActualV10Read[] = [
    mkActual({ id: 1, category_id: 5 }),
    mkActual({ id: 2, category_id: 7 }),
    mkActual({ id: 3, category_id: 5 }),
    mkActual({ id: 4, category_id: 9 }),
    mkActual({ id: 5, category_id: 5 }),
  ];

  it('returns only rows where category_id matches', () => {
    const result = filterActualsForCategory(actuals, 5);
    expect(result.map((a) => a.id)).toEqual([1, 3, 5]);
  });

  it('preserves input order', () => {
    const result = filterActualsForCategory(actuals, 5);
    expect(result.map((a) => a.id)).toEqual([1, 3, 5]);
  });

  it('returns empty array when no rows match', () => {
    const result = filterActualsForCategory(actuals, 999);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    const result = filterActualsForCategory([], 5);
    expect(result).toEqual([]);
  });
});

// ─────────────────── computeFactForCategory ───────────────────

describe('computeFactForCategory', () => {
  it('sums expense amounts by category (uses |amount|)', () => {
    const actuals: ActualV10Read[] = [
      mkActual({ id: 1, category_id: 5, kind: 'expense', amount_cents: 100_00 }),
      mkActual({ id: 2, category_id: 5, kind: 'expense', amount_cents: 200_00 }),
      mkActual({ id: 3, category_id: 7, kind: 'expense', amount_cents: 999_00 }),
    ];
    expect(computeFactForCategory(actuals, 5)).toBe(300_00);
  });

  it('handles negative-stored expense amounts (Math.abs)', () => {
    const actuals: ActualV10Read[] = [
      mkActual({ id: 1, category_id: 5, kind: 'expense', amount_cents: -100_00 }),
      mkActual({ id: 2, category_id: 5, kind: 'expense', amount_cents: -50_00 }),
    ];
    expect(computeFactForCategory(actuals, 5)).toBe(150_00);
  });

  it('ignores non-expense kinds (income/roundup/deposit)', () => {
    const actuals: ActualV10Read[] = [
      mkActual({ id: 1, category_id: 5, kind: 'expense', amount_cents: 100_00 }),
      mkActual({ id: 2, category_id: 5, kind: 'income', amount_cents: 9999_00 }),
      mkActual({ id: 3, category_id: 5, kind: 'roundup', amount_cents: 50 }),
      mkActual({ id: 4, category_id: 5, kind: 'deposit', amount_cents: 5000_00 }),
    ];
    expect(computeFactForCategory(actuals, 5)).toBe(100_00);
  });

  it('returns 0 when no matching rows', () => {
    expect(computeFactForCategory([], 5)).toBe(0);
  });
});
