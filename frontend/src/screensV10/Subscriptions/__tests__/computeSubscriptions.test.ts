// Phase 26-06 Task 1: pure compute helpers for SubscriptionsView (SUBS-V10-01..04).
//
// One behaviour test per helper; money (kopeks) and active/cycle filters protected.

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

describe('computeActiveCount', () => {
  it('counts only is_active=true; empty → 0', () => {
    expect(computeActiveCount([])).toBe(0);
    expect(
      computeActiveCount([
        mkSub({ id: 1, is_active: true }),
        mkSub({ id: 2, is_active: false }),
        mkSub({ id: 3, is_active: true }),
      ]),
    ).toBe(2);
  });
});

describe('computeMonthlyTotal', () => {
  it('sums active monthly only (excludes inactive + yearly); empty → 0', () => {
    expect(computeMonthlyTotal([])).toBe(0);
    expect(
      computeMonthlyTotal([
        mkSub({
          id: 1,
          cycle: 'monthly',
          amount_cents: 79900,
          is_active: true,
        }),
        mkSub({
          id: 2,
          cycle: 'monthly',
          amount_cents: 50000,
          is_active: false,
        }),
        mkSub({
          id: 3,
          cycle: 'yearly',
          amount_cents: 599900,
          is_active: true,
        }),
      ]),
    ).toBe(79900);
  });
});

describe('computeYearlyTotalAnnualized', () => {
  it('monthly*12 + yearly, active-only; empty → 0', () => {
    expect(computeYearlyTotalAnnualized([])).toBe(0);
    expect(
      computeYearlyTotalAnnualized([
        mkSub({
          id: 1,
          cycle: 'monthly',
          amount_cents: 10000,
          is_active: true,
        }),
        mkSub({
          id: 2,
          cycle: 'yearly',
          amount_cents: 500000,
          is_active: true,
        }),
        mkSub({
          id: 3,
          cycle: 'yearly',
          amount_cents: 99999,
          is_active: false,
        }),
      ]),
    ).toBe(620000); // 10000*12 + 500000
  });
});

describe('formatCadenceRu', () => {
  it('monthly (day / no day), yearly (date / fallback)', () => {
    expect(formatCadenceRu(mkSub({ cycle: 'monthly', day_of_month: 15 }))).toBe(
      'каждое 15 число',
    );
    expect(
      formatCadenceRu(mkSub({ cycle: 'monthly', day_of_month: null })),
    ).toBe('ежемесячно');
    expect(
      formatCadenceRu(
        mkSub({ cycle: 'yearly', next_charge_date: '2026-12-31' }),
      ),
    ).toBe('31 декабря');
    expect(
      formatCadenceRu(
        mkSub({ cycle: 'yearly', next_charge_date: 'not-a-date' }),
      ),
    ).toBe('ежегодно');
  });
});

describe('formatAccountLabel', () => {
  it('«BANK · MASK», «BANK» w/o mask, null when missing/unmatched', () => {
    expect(
      formatAccountLabel(mkSub({ account_id: null }), [mkAccount()]),
    ).toBeNull();
    expect(
      formatAccountLabel(mkSub({ account_id: 99 }), [mkAccount({ id: 1 })]),
    ).toBeNull();
    expect(
      formatAccountLabel(mkSub({ account_id: 1 }), [
        mkAccount({ id: 1, bank: 'Tinkoff', mask: '4242' }),
      ]),
    ).toBe('TINKOFF · 4242');
    expect(
      formatAccountLabel(mkSub({ account_id: 1 }), [
        mkAccount({ id: 1, bank: 'Наличные', mask: null }),
      ]),
    ).toBe('НАЛИЧНЫЕ');
  });
});

describe('sortForDisplay', () => {
  it('active-first, amount DESC, name ASC tie-break, no mutation; empty → []', () => {
    expect(sortForDisplay([])).toEqual([]);
    const subs = [
      mkSub({ id: 1, name: 'Brave', amount_cents: 50000, is_active: true }),
      mkSub({ id: 2, name: 'Apple', amount_cents: 50000, is_active: true }),
      mkSub({ id: 3, name: 'Costly', amount_cents: 99999, is_active: true }),
      mkSub({ id: 4, name: 'Off', amount_cents: 99999, is_active: false }),
    ];
    const before = subs.map((s) => s.id);
    expect(sortForDisplay(subs).map((s) => s.id)).toEqual([3, 2, 1, 4]);
    expect(subs.map((s) => s.id)).toEqual(before); // not mutated
  });
});
