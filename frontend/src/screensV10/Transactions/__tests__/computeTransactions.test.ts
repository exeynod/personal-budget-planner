// Phase 25-08 Task 1: pure compute helpers for TransactionsView.
//
// Money sign (U+2212, not ASCII '-') and U+202F grouping per DATA-MODEL §5.1
// are protected. One behaviour test per helper otherwise.

import { describe, it, expect } from 'vitest';
import {
  applyFilterChip,
  groupByDay,
  computeHeaderSummary,
  formatTxAmount,
  tagFor,
} from '../computeTransactions';
import type { ActualV10Read, CategoryV10 } from '../../../api/v10';

// Code points used in formatTxAmount asserts.
const MINUS = '−'; // U+2212 MINUS SIGN (NOT ASCII '-')
const NBSP_NARROW = ' '; // U+202F NARROW NO-BREAK SPACE

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

describe('applyFilterChip', () => {
  const categories: CategoryV10[] = [
    mkCategory({ id: 1, code: 'cafe', name: 'Кафе' }),
    mkCategory({ id: 4, code: 'subs', name: 'Подписки' }),
    mkCategory({ id: 5, code: 'misc', name: 'Прочее' }),
  ];
  const actuals: ActualV10Read[] = [
    mkActual({
      id: 100,
      category_id: 1,
      kind: 'expense',
      amount_cents: 500_00,
    }), // cafe
    mkActual({
      id: 103,
      category_id: 4,
      kind: 'expense',
      amount_cents: 800_00,
    }), // subs
    mkActual({ id: 104, category_id: 5, kind: 'roundup', amount_cents: 50 }), // savings
    mkActual({
      id: 105,
      category_id: 5,
      kind: 'deposit',
      amount_cents: 1000_00,
    }), // savings
    mkActual({
      id: 106,
      category_id: 5,
      kind: 'expense',
      amount_cents: 100_00,
    }), // misc, no chip
  ];

  it('filters by category code, "savings" by kind, "all" identity, unknown → []', () => {
    expect(applyFilterChip(actuals, categories, 'all')).toEqual(actuals);
    expect(
      applyFilterChip(actuals, categories, 'cafe').map((r) => r.id),
    ).toEqual([100]);
    expect(
      applyFilterChip(actuals, categories, 'subs').map((r) => r.id),
    ).toEqual([103]);
    expect(
      applyFilterChip(actuals, categories, 'savings')
        .map((r) => r.id)
        .sort(),
    ).toEqual([104, 105]);
    expect(
      applyFilterChip(
        [mkActual({ id: 9, category_id: 99 })],
        categories,
        'cafe',
      ),
    ).toEqual([]);
  });
});

describe('groupByDay', () => {
  const today = new Date(2026, 4, 10); // 10 May 2026 local

  it('groups by date DESC, rows by created_at DESC, abs sum; empty → []', () => {
    expect(groupByDay([], today)).toEqual([]);
    const actuals = [
      mkActual({
        id: 1,
        tx_date: '2026-05-10',
        amount_cents: 100_00,
        created_at: '2026-05-10T08:00:00+00:00',
      }),
      mkActual({
        id: 2,
        tx_date: '2026-05-10',
        amount_cents: 200_00,
        created_at: '2026-05-10T15:00:00+00:00',
        kind: 'roundup',
      }),
      mkActual({
        id: 3,
        tx_date: '2026-05-09',
        amount_cents: 500_00,
        created_at: '2026-05-09T18:00:00+00:00',
      }),
      mkActual({
        id: 4,
        tx_date: '2026-05-07',
        amount_cents: 1000_00,
        created_at: '2026-05-07T10:00:00+00:00',
      }),
    ];
    const groups = groupByDay(actuals, today);
    expect(groups.map((g) => g.dateLabel)).toEqual([
      'Сегодня',
      'Вчера',
      '7 мая',
    ]);
    expect(groups[0].rows.map((r) => r.id)).toEqual([2, 1]); // created_at DESC
    expect(groups[0].sumCents).toBe(100_00 + 200_00); // abs magnitude
  });
});

describe('computeHeaderSummary', () => {
  it('counts rows + sums absolute amounts; empty → 0/0', () => {
    expect(computeHeaderSummary([])).toEqual({ count: 0, sumCents: 0 });
    expect(
      computeHeaderSummary([
        mkActual({ amount_cents: 1000_00 }),
        mkActual({ amount_cents: -250_00 }),
      ]),
    ).toEqual({ count: 2, sumCents: 1250_00 });
  });
});

describe('formatTxAmount', () => {
  it('sign + U+202F grouping; zero plain; negative uses U+2212 not ASCII dash', () => {
    expect(formatTxAmount(0)).toBe('0 ₽');
    expect(formatTxAmount(1_500_000_00)).toBe(
      `+1${NBSP_NARROW}500${NBSP_NARROW}000 ₽`,
    );
    expect(formatTxAmount(-12500_00)).toBe(`${MINUS}12${NBSP_NARROW}500 ₽`);
    const neg = formatTxAmount(-100_00);
    expect(neg.charCodeAt(0)).toBe(0x2212);
    expect(neg.includes('-')).toBe(false);
  });
});

describe('tagFor', () => {
  it('roundup/deposit tagged, expense/income → null', () => {
    expect(tagFor(mkActual({ kind: 'roundup' }))).toBe('roundup');
    expect(tagFor(mkActual({ kind: 'deposit' }))).toBe('deposit');
    expect(tagFor(mkActual({ kind: 'expense' }))).toBeNull();
    expect(tagFor(mkActual({ kind: 'income' }))).toBeNull();
  });
});
