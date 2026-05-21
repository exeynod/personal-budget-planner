// Phase 26-06 Task 1: pure compute helpers for SubscriptionsView (SUBS-V10-01..04).
//
// Surface:
//   - computeActiveCount(subs) → number of is_active=true subscriptions
//   - computeMonthlyTotal(subs) → Σ amount_cents WHERE is_active=true AND cycle='monthly'
//   - computeYearlyTotalAnnualized(subs) → monthly*12 + Σ yearly amounts (cents)
//   - formatCadenceRu(sub) → human-readable Russian cadence string
//   - sortForDisplay(subs) → active-first, amount-desc, name-asc
//
// All deterministic, side-effect-free.

import { describe, it, expect } from 'vitest';
import {
  computeActiveCount,
  computeMonthlyTotal,
  computeYearlyTotalAnnualized,
  formatAccountLabel,
  formatCadenceRu,
  sortForDisplay,
} from '../computeSubscriptions';
import type { SubscriptionV10Read, AccountResponse } from '../../../api/v10';

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Tinkoff',
    mask: '4242',
    kind: 'card',
    balance_cents: 100000,
    primary: true,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

// ─────────────────── builders ───────────────────

function mkSub(over: Partial<SubscriptionV10Read> = {}): SubscriptionV10Read {
  return {
    id: 1,
    name: 'Netflix',
    amount_cents: 79900,
    cycle: 'monthly',
    next_charge_date: '2026-05-15',
    category_id: 1,
    notify_days_before: 1,
    is_active: true,
    category: {
      id: 1,
      name: 'Подписки',
      kind: 'expense',
      is_archived: false,
      sort_order: 10,
      created_at: '2026-04-01T00:00:00+00:00',
      code: 'subs',
      ord: '01',
      plan_cents: 0,
      rollover: 'misc',
      paused: false,
      tag: 'personal',
    },
    day_of_month: 15,
    account_id: 1,
    posted_txn_id: null,
    ...over,
  };
}

// ─────────────────── computeActiveCount ───────────────────

describe('computeActiveCount', () => {
  it('returns 0 for empty list', () => {
    expect(computeActiveCount([])).toBe(0);
  });

  it('counts only is_active=true', () => {
    const subs = [
      mkSub({ id: 1, is_active: true }),
      mkSub({ id: 2, is_active: false }),
      mkSub({ id: 3, is_active: true }),
    ];
    expect(computeActiveCount(subs)).toBe(2);
  });

  it('returns 0 when all inactive', () => {
    const subs = [
      mkSub({ id: 1, is_active: false }),
      mkSub({ id: 2, is_active: false }),
    ];
    expect(computeActiveCount(subs)).toBe(0);
  });
});

// ─────────────────── computeMonthlyTotal ───────────────────

describe('computeMonthlyTotal', () => {
  it('returns 0 for empty list', () => {
    expect(computeMonthlyTotal([])).toBe(0);
  });

  it('sums monthly active amounts', () => {
    const subs = [
      mkSub({ id: 1, cycle: 'monthly', amount_cents: 79900, is_active: true }),
      mkSub({ id: 2, cycle: 'monthly', amount_cents: 19900, is_active: true }),
    ];
    expect(computeMonthlyTotal(subs)).toBe(99800);
  });

  it('excludes inactive monthly subs', () => {
    const subs = [
      mkSub({ id: 1, cycle: 'monthly', amount_cents: 79900, is_active: true }),
      mkSub({ id: 2, cycle: 'monthly', amount_cents: 50000, is_active: false }),
    ];
    expect(computeMonthlyTotal(subs)).toBe(79900);
  });

  it('excludes yearly cycle subs', () => {
    const subs = [
      mkSub({ id: 1, cycle: 'monthly', amount_cents: 79900, is_active: true }),
      mkSub({ id: 2, cycle: 'yearly', amount_cents: 599900, is_active: true }),
    ];
    expect(computeMonthlyTotal(subs)).toBe(79900);
  });
});

// ─────────────────── computeYearlyTotalAnnualized ───────────────────

describe('computeYearlyTotalAnnualized', () => {
  it('returns 0 for empty list', () => {
    expect(computeYearlyTotalAnnualized([])).toBe(0);
  });

  it('annualizes monthly + adds yearly amounts', () => {
    const subs = [
      mkSub({ id: 1, cycle: 'monthly', amount_cents: 10000, is_active: true }),
      mkSub({ id: 2, cycle: 'yearly', amount_cents: 500000, is_active: true }),
    ];
    // monthly: 10000*12=120000; yearly: 500000 → total = 620000
    expect(computeYearlyTotalAnnualized(subs)).toBe(620000);
  });

  it('excludes inactive subs from annualization', () => {
    const subs = [
      mkSub({ id: 1, cycle: 'monthly', amount_cents: 10000, is_active: true }),
      mkSub({ id: 2, cycle: 'monthly', amount_cents: 99999, is_active: false }),
      mkSub({ id: 3, cycle: 'yearly', amount_cents: 500000, is_active: false }),
    ];
    // only first counts: 10000*12 = 120000
    expect(computeYearlyTotalAnnualized(subs)).toBe(120000);
  });

  it('handles only-yearly mix', () => {
    const subs = [
      mkSub({ id: 1, cycle: 'yearly', amount_cents: 100000, is_active: true }),
      mkSub({ id: 2, cycle: 'yearly', amount_cents: 250000, is_active: true }),
    ];
    expect(computeYearlyTotalAnnualized(subs)).toBe(350000);
  });
});

// ─────────────────── formatCadenceRu ───────────────────

describe('formatCadenceRu', () => {
  it('formats monthly with day_of_month → «каждое N число»', () => {
    expect(formatCadenceRu(mkSub({ cycle: 'monthly', day_of_month: 15 }))).toBe(
      'каждое 15 число',
    );
  });

  it('formats monthly without day_of_month → «ежемесячно»', () => {
    expect(formatCadenceRu(mkSub({ cycle: 'monthly', day_of_month: null }))).toBe(
      'ежемесячно',
    );
  });

  it('formats yearly → «N {month_genitive}»', () => {
    const sub = mkSub({ cycle: 'yearly', next_charge_date: '2026-05-15' });
    expect(formatCadenceRu(sub)).toBe('15 мая');
  });

  it('formats yearly for December correctly', () => {
    const sub = mkSub({ cycle: 'yearly', next_charge_date: '2026-12-31' });
    expect(formatCadenceRu(sub)).toBe('31 декабря');
  });

  it('falls back to «ежегодно» when yearly date is invalid', () => {
    const sub = mkSub({ cycle: 'yearly', next_charge_date: 'not-a-date' });
    expect(formatCadenceRu(sub)).toBe('ежегодно');
  });
});

// ─────────────────── formatAccountLabel (P3-W1) ───────────────────

describe('formatAccountLabel', () => {
  it('returns null when sub.account_id is null', () => {
    expect(
      formatAccountLabel(mkSub({ account_id: null }), [mkAccount()]),
    ).toBeNull();
  });

  it('returns null when account_id has no matching account', () => {
    expect(
      formatAccountLabel(mkSub({ account_id: 99 }), [mkAccount({ id: 1 })]),
    ).toBeNull();
  });

  it('formats «BANK · MASK» when account has a mask', () => {
    expect(
      formatAccountLabel(mkSub({ account_id: 1 }), [
        mkAccount({ id: 1, bank: 'Tinkoff', mask: '4242' }),
      ]),
    ).toBe('TINKOFF · 4242');
  });

  it('formats «BANK» (no separator) when account has no mask', () => {
    expect(
      formatAccountLabel(mkSub({ account_id: 1 }), [
        mkAccount({ id: 1, bank: 'Наличные', mask: null }),
      ]),
    ).toBe('НАЛИЧНЫЕ');
  });
});

// ─────────────────── sortForDisplay ───────────────────

describe('sortForDisplay', () => {
  it('returns empty for empty input', () => {
    expect(sortForDisplay([])).toEqual([]);
  });

  it('sorts active first', () => {
    const subs = [
      mkSub({ id: 1, name: 'A', is_active: false }),
      mkSub({ id: 2, name: 'B', is_active: true }),
    ];
    const out = sortForDisplay(subs);
    expect(out[0].id).toBe(2);
    expect(out[1].id).toBe(1);
  });

  it('within active bucket: amount DESC, then name ASC', () => {
    const subs = [
      mkSub({ id: 1, name: 'Brave', amount_cents: 50000, is_active: true }),
      mkSub({ id: 2, name: 'Apple', amount_cents: 50000, is_active: true }),
      mkSub({ id: 3, name: 'Costly', amount_cents: 99999, is_active: true }),
    ];
    const out = sortForDisplay(subs);
    expect(out.map((s) => s.id)).toEqual([3, 2, 1]); // 99999 first; tie → Apple before Brave
  });

  it('does not mutate input', () => {
    const subs = [
      mkSub({ id: 1, is_active: false }),
      mkSub({ id: 2, is_active: true }),
    ];
    const before = subs.map((s) => s.id);
    sortForDisplay(subs);
    expect(subs.map((s) => s.id)).toEqual(before);
  });
});
