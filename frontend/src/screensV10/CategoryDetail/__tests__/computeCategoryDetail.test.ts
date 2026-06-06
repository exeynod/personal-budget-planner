// Phase 26-02 Task 1: pure compute helpers for CategoryDetailView (CAT-V10-01..06).
//
// One behaviour test per helper; div-by-zero guards and kopek/abs sums protected.

import { describe, it, expect } from 'vitest';
import {
  computeOverPercent,
  computeUnderPercent,
  computeBarSegments,
  filterActualsForCategory,
  computeFactForCategory,
} from '../computeCategoryDetail';
import type { ActualV10Read } from '../../../api/v10';

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

describe('computeOverPercent', () => {
  it('rounded percent over plan; 0 when ≤plan or plan=0', () => {
    expect(computeOverPercent(15_000, 10_000)).toBe(50);
    expect(computeOverPercent(11_500, 10_000)).toBe(15);
    expect(computeOverPercent(5_000, 10_000)).toBe(0);
    expect(computeOverPercent(5_000, 0)).toBe(0);
  });
});

describe('computeUnderPercent', () => {
  it('rounded percent of plan used; 0 when fact=0 or plan=0', () => {
    expect(computeUnderPercent(7_500, 10_000)).toBe(75);
    expect(computeUnderPercent(3_333, 10_000)).toBe(33);
    expect(computeUnderPercent(0, 10_000)).toBe(0);
    expect(computeUnderPercent(5_000, 0)).toBe(0);
  });
});

describe('computeBarSegments', () => {
  it('fillRatio + tick: under, over (capped+tick), plan=0, fact=0', () => {
    const under = computeBarSegments(7_500, 10_000);
    expect(under.fillRatio).toBeCloseTo(0.75, 5);
    expect(under.tickAt).toBeUndefined();
    const over = computeBarSegments(15_000, 10_000);
    expect(over.fillRatio).toBe(1);
    expect(over.tickAt).toBeCloseTo(10_000 / 15_000, 5);
    expect(computeBarSegments(10_000, 0)).toMatchObject({
      fillRatio: 1,
      tickAt: 0,
    });
    expect(computeBarSegments(0, 10_000).fillRatio).toBe(0);
  });
});

describe('filterActualsForCategory', () => {
  it('matches category_id preserving order; empty/no-match → []', () => {
    const actuals: ActualV10Read[] = [
      mkActual({ id: 1, category_id: 5 }),
      mkActual({ id: 2, category_id: 7 }),
      mkActual({ id: 3, category_id: 5 }),
    ];
    expect(filterActualsForCategory(actuals, 5).map((a) => a.id)).toEqual([
      1, 3,
    ]);
    expect(filterActualsForCategory(actuals, 999)).toEqual([]);
    expect(filterActualsForCategory([], 5)).toEqual([]);
  });
});

describe('computeFactForCategory', () => {
  it('sums |amount| of expense rows only; empty → 0', () => {
    const actuals: ActualV10Read[] = [
      mkActual({
        id: 1,
        category_id: 5,
        kind: 'expense',
        amount_cents: -100_00,
      }),
      mkActual({
        id: 2,
        category_id: 5,
        kind: 'expense',
        amount_cents: 200_00,
      }),
      mkActual({
        id: 3,
        category_id: 5,
        kind: 'income',
        amount_cents: 9999_00,
      }),
      mkActual({ id: 4, category_id: 5, kind: 'roundup', amount_cents: 50 }),
      mkActual({
        id: 5,
        category_id: 7,
        kind: 'expense',
        amount_cents: 999_00,
      }),
    ];
    expect(computeFactForCategory(actuals, 5)).toBe(300_00);
    expect(computeFactForCategory([], 5)).toBe(0);
  });
});
