// Phase 25-08 Task 1: pure compute helpers for TransactionsView.
//
// Coverage:
//  - applyFilterChip: 6 cases (all / cafe / food / transit / subs / savings).
//  - groupByDay: empty + mixed-day grouping; sorting DESC.
//  - computeHeaderSummary: empty + mixed totals.
//  - formatTxAmount: negative (U+2212), positive (+), zero, large (1M+).
//  - tagFor: each kind value.
//
// Assertions verify the exact U+2212 (NOT ASCII -) and U+202F (NOT ASCII space)
// code points per DATA-MODEL §5.1. tx_date / created_at strings are passed
// through `new Date(...)` exactly as `formatDay` / `formatTimeHM` consume them.

import { describe, it, expect } from 'vitest';
import {
  applyFilterChip,
  groupByDay,
  computeHeaderSummary,
  formatTxAmount,
  tagFor,
  type TxFilterChip,
} from '../computeTransactions';
import type {
  ActualV10Read,
  CategoryV10,
} from '../../../api/v10';

// Code points used in formatTxAmount asserts.
const MINUS = '−';
const NBSP_NARROW = ' ';

// ─────────────────── helpers ───────────────────

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

// ─────────────────── applyFilterChip ───────────────────

describe('applyFilterChip', () => {
  const categories: CategoryV10[] = [
    mkCategory({ id: 1, code: 'cafe', name: 'Кафе' }),
    mkCategory({ id: 2, code: 'food', name: 'Продукты' }),
    mkCategory({ id: 3, code: 'transit', name: 'Транспорт' }),
    mkCategory({ id: 4, code: 'subs', name: 'Подписки' }),
    mkCategory({ id: 5, code: 'misc', name: 'Прочее' }),
  ];

  const actuals: ActualV10Read[] = [
    mkActual({ id: 100, category_id: 1, kind: 'expense', amount_cents: 500_00 }),  // cafe
    mkActual({ id: 101, category_id: 2, kind: 'expense', amount_cents: 1500_00 }), // food
    mkActual({ id: 102, category_id: 3, kind: 'expense', amount_cents: 200_00 }),  // transit
    mkActual({ id: 103, category_id: 4, kind: 'expense', amount_cents: 800_00 }),  // subs
    mkActual({ id: 104, category_id: 5, kind: 'roundup', amount_cents: 50 }),       // savings via roundup
    mkActual({ id: 105, category_id: 5, kind: 'deposit', amount_cents: 1000_00 }),  // savings via deposit
    mkActual({ id: 106, category_id: 5, kind: 'expense', amount_cents: 100_00 }),  // misc — NOT in any chip filter
  ];

  it('chip "all" returns identity (all rows)', () => {
    expect(applyFilterChip(actuals, categories, 'all')).toEqual(actuals);
  });

  it('chip "cafe" returns rows where category.code === "cafe"', () => {
    const out = applyFilterChip(actuals, categories, 'cafe');
    expect(out.map((r) => r.id)).toEqual([100]);
  });

  it('chip "food" returns rows where category.code === "food"', () => {
    const out = applyFilterChip(actuals, categories, 'food');
    expect(out.map((r) => r.id)).toEqual([101]);
  });

  it('chip "transit" returns rows where category.code === "transit"', () => {
    const out = applyFilterChip(actuals, categories, 'transit');
    expect(out.map((r) => r.id)).toEqual([102]);
  });

  it('chip "subs" returns rows where category.code === "subs"', () => {
    const out = applyFilterChip(actuals, categories, 'subs');
    expect(out.map((r) => r.id)).toEqual([103]);
  });

  it('chip "savings" returns rows where kind in {roundup, deposit}', () => {
    const out = applyFilterChip(actuals, categories, 'savings');
    expect(out.map((r) => r.id).sort()).toEqual([104, 105]);
  });

  it('returns empty list when no category matches the chip code', () => {
    const onlyMisc = [mkActual({ id: 999, category_id: 5, kind: 'expense' })];
    expect(applyFilterChip(onlyMisc, categories, 'cafe')).toEqual([]);
  });

  it('returns empty when filtering by chip but actuals reference unknown category', () => {
    const orphan = [mkActual({ id: 999, category_id: 99, kind: 'expense' })];
    expect(applyFilterChip(orphan, categories, 'cafe')).toEqual([]);
  });
});

// ─────────────────── groupByDay ───────────────────

describe('groupByDay', () => {
  const today = new Date(2026, 4, 10); // 10 May 2026 local

  it('returns [] for empty input', () => {
    expect(groupByDay([], today)).toEqual([]);
  });

  it('groups by tx_date and labels via formatDay', () => {
    const actuals = [
      mkActual({ id: 1, tx_date: '2026-05-10', amount_cents: 100_00, created_at: '2026-05-10T12:00:00+00:00' }),
      mkActual({ id: 2, tx_date: '2026-05-10', amount_cents: 200_00, created_at: '2026-05-10T11:00:00+00:00' }),
      mkActual({ id: 3, tx_date: '2026-05-09', amount_cents: 500_00, created_at: '2026-05-09T18:00:00+00:00' }),
      mkActual({ id: 4, tx_date: '2026-05-07', amount_cents: 1000_00, created_at: '2026-05-07T10:00:00+00:00' }),
    ];
    const groups = groupByDay(actuals, today);
    expect(groups).toHaveLength(3);
    // DESC by date — most recent first.
    expect(groups[0].dateLabel).toBe('Сегодня');
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual([1, 2]);
    expect(groups[0].sumCents).toBe(100_00 + 200_00);
    expect(groups[1].dateLabel).toBe('Вчера');
    expect(groups[1].rows.map((r) => r.id)).toEqual([3]);
    expect(groups[2].dateLabel).toBe('7 мая');
  });

  it('rows within a group are sorted by created_at DESC', () => {
    const actuals = [
      mkActual({ id: 1, tx_date: '2026-05-10', created_at: '2026-05-10T08:00:00+00:00' }),
      mkActual({ id: 2, tx_date: '2026-05-10', created_at: '2026-05-10T15:00:00+00:00' }),
      mkActual({ id: 3, tx_date: '2026-05-10', created_at: '2026-05-10T11:00:00+00:00' }),
    ];
    const groups = groupByDay(actuals, today);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('uses absolute amount for sumCents (negative-as-magnitude semantics)', () => {
    const actuals = [
      mkActual({ id: 1, tx_date: '2026-05-10', amount_cents: 1500_00, kind: 'expense' }),
      mkActual({ id: 2, tx_date: '2026-05-10', amount_cents: 500_00, kind: 'roundup' }),
    ];
    const groups = groupByDay(actuals, today);
    expect(groups[0].sumCents).toBe(1500_00 + 500_00);
  });
});

// ─────────────────── computeHeaderSummary ───────────────────

describe('computeHeaderSummary', () => {
  it('returns {count: 0, sumCents: 0} for empty input', () => {
    expect(computeHeaderSummary([])).toEqual({ count: 0, sumCents: 0 });
  });

  it('sums absolute amounts and counts rows', () => {
    const actuals = [
      mkActual({ amount_cents: 100_00 }),
      mkActual({ amount_cents: 250_00 }),
      mkActual({ amount_cents: 50_00 }),
    ];
    expect(computeHeaderSummary(actuals)).toEqual({ count: 3, sumCents: 400_00 });
  });

  it('treats negative amounts as magnitude (uses abs)', () => {
    const actuals = [
      mkActual({ amount_cents: 1000_00 }),
      mkActual({ amount_cents: -250_00 }),
    ];
    expect(computeHeaderSummary(actuals)).toEqual({ count: 2, sumCents: 1250_00 });
  });
});

// ─────────────────── formatTxAmount ───────────────────

describe('formatTxAmount', () => {
  it('formats zero as "0 ₽"', () => {
    expect(formatTxAmount(0)).toBe('0 ₽');
  });

  it('positive cents → "+X ₽" with U+202F grouping', () => {
    expect(formatTxAmount(1000_00)).toBe(`+1${NBSP_NARROW}000 ₽`);
  });

  it('negative cents → U+2212 (NOT ASCII "-") prefix with U+202F grouping', () => {
    expect(formatTxAmount(-12500_00)).toBe(`${MINUS}12${NBSP_NARROW}500 ₽`);
  });

  it('large positive (1M ₽) groups by 3 with U+202F', () => {
    expect(formatTxAmount(1_500_000_00)).toBe(`+1${NBSP_NARROW}500${NBSP_NARROW}000 ₽`);
  });

  it('large negative (-1M ₽) uses U+2212 prefix', () => {
    expect(formatTxAmount(-1_000_000_00)).toBe(`${MINUS}1${NBSP_NARROW}000${NBSP_NARROW}000 ₽`);
  });

  it('explicit U+2212 char point assertion (defends against ASCII-dash regression)', () => {
    const formatted = formatTxAmount(-100_00);
    expect(formatted.charCodeAt(0)).toBe(0x2212);
    expect(formatted.includes('-')).toBe(false); // no ASCII dash
  });
});

// ─────────────────── tagFor ───────────────────

describe('tagFor', () => {
  it('returns "roundup" for kind=roundup', () => {
    expect(tagFor(mkActual({ kind: 'roundup' }))).toBe('roundup');
  });

  it('returns "deposit" for kind=deposit', () => {
    expect(tagFor(mkActual({ kind: 'deposit' }))).toBe('deposit');
  });

  it('returns null for kind=expense', () => {
    expect(tagFor(mkActual({ kind: 'expense' }))).toBeNull();
  });

  it('returns null for kind=income', () => {
    expect(tagFor(mkActual({ kind: 'income' }))).toBeNull();
  });
});

// ─────────────────── type-level smoke ───────────────────

describe('TxFilterChip type', () => {
  it('accepts the 6 documented chip values', () => {
    const all: TxFilterChip[] = ['all', 'cafe', 'food', 'transit', 'subs', 'savings'];
    expect(all).toHaveLength(6);
  });
});
