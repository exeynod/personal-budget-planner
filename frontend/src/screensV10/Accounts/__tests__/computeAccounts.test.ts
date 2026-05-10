// Phase 27-04 Task 1: pure compute helpers for AccountsListView / AccountDetailView.
//
// Surface (6 helpers, all pure / deterministic / side-effect-free):
//   - sumAccountsBalances(list) → Σ balance_cents
//   - countAccounts(list) → list.length
//   - formatBankSubtitle(account) → «карта ·· 4408» / «наличные» / «накопит. счёт»
//   - filterByAccount(actuals, accountId) → tx[] where tx.account_id === accountId
//   - sumPeriodOps(actuals, periodStart, periodEnd) → { count, sumCents }
//   - isValidNewAccountDraft({ bank, kind, balance_cents }) → boolean
//
// All deterministic, side-effect-free, side-input-free.

import { describe, it, expect } from 'vitest';
import {
  sumAccountsBalances,
  countAccounts,
  formatBankSubtitle,
  filterByAccount,
  sumPeriodOps,
  isValidNewAccountDraft,
} from '../computeAccounts';
import type { AccountResponse, ActualV10Read } from '../../../api/v10';

// ─────────────────── builders ───────────────────

function mkAccount(over: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 1,
    bank: 'Т-Банк',
    kind: 'card',
    mask: '4408',
    balance_cents: 50000_00,
    primary: false,
    created_at: '2026-04-01T00:00:00+00:00',
    ...over,
  };
}

function mkActual(over: Partial<ActualV10Read> = {}): ActualV10Read {
  return {
    id: 1,
    period_id: 1,
    kind: 'expense',
    amount_cents: 1000_00,
    description: 'кофе',
    category_id: 1,
    tx_date: '2026-05-10',
    source: 'mini_app',
    created_at: '2026-05-10T10:00:00+00:00',
    account_id: 1,
    parent_txn_id: null,
    ...over,
  };
}

// ─────────────────── sumAccountsBalances ───────────────────

describe('sumAccountsBalances', () => {
  it('returns 0 for empty list', () => {
    expect(sumAccountsBalances([])).toBe(0);
  });

  it('sums balance_cents across all accounts', () => {
    const list = [
      mkAccount({ id: 1, balance_cents: 10000_00 }),
      mkAccount({ id: 2, balance_cents: 25000_00 }),
      mkAccount({ id: 3, balance_cents: 5000_00 }),
    ];
    expect(sumAccountsBalances(list)).toBe(40000_00);
  });

  it('handles negative balances (overdraft / loan)', () => {
    const list = [
      mkAccount({ id: 1, balance_cents: 10000_00 }),
      mkAccount({ id: 2, balance_cents: -2000_00 }),
    ];
    expect(sumAccountsBalances(list)).toBe(8000_00);
  });
});

// ─────────────────── countAccounts ───────────────────

describe('countAccounts', () => {
  it('returns 0 for empty', () => {
    expect(countAccounts([])).toBe(0);
  });

  it('returns list.length', () => {
    const list = [mkAccount({ id: 1 }), mkAccount({ id: 2 }), mkAccount({ id: 3 })];
    expect(countAccounts(list)).toBe(3);
  });
});

// ─────────────────── formatBankSubtitle ───────────────────

describe('formatBankSubtitle', () => {
  it('formats card with mask → «карта ·· {mask}»', () => {
    const a = mkAccount({ kind: 'card', mask: '4408' });
    expect(formatBankSubtitle(a)).toBe('карта ·· 4408');
  });

  it('formats card without mask → «карта»', () => {
    const a = mkAccount({ kind: 'card', mask: null });
    expect(formatBankSubtitle(a)).toBe('карта');
  });

  it('formats cash → «наличные»', () => {
    const a = mkAccount({ kind: 'cash', mask: null });
    expect(formatBankSubtitle(a)).toBe('наличные');
  });

  it('formats savings → «накопит. счёт»', () => {
    const a = mkAccount({ kind: 'savings', mask: null });
    expect(formatBankSubtitle(a)).toBe('накопит. счёт');
  });
});

// ─────────────────── filterByAccount ───────────────────

describe('filterByAccount', () => {
  it('returns empty for empty input', () => {
    expect(filterByAccount([], 1)).toEqual([]);
  });

  it('returns only rows matching account_id', () => {
    const txs = [
      mkActual({ id: 1, account_id: 1 }),
      mkActual({ id: 2, account_id: 2 }),
      mkActual({ id: 3, account_id: 1 }),
      mkActual({ id: 4, account_id: null }),
    ];
    const out = filterByAccount(txs, 1);
    expect(out.map((t) => t.id)).toEqual([1, 3]);
  });

  it('returns empty when no rows match', () => {
    const txs = [mkActual({ account_id: 2 }), mkActual({ account_id: 3 })];
    expect(filterByAccount(txs, 99)).toEqual([]);
  });
});

// ─────────────────── sumPeriodOps ───────────────────

describe('sumPeriodOps', () => {
  it('returns zero count + sum for empty input', () => {
    expect(sumPeriodOps([], '2026-05-01', '2026-05-31')).toEqual({
      count: 0,
      sumCents: 0,
    });
  });

  it('sums |amount_cents| within tx_date range (inclusive)', () => {
    const txs = [
      mkActual({ id: 1, tx_date: '2026-05-01', amount_cents: 1000_00 }),
      mkActual({ id: 2, tx_date: '2026-05-15', amount_cents: -500_00 }),
      mkActual({ id: 3, tx_date: '2026-05-31', amount_cents: 200_00 }),
    ];
    const out = sumPeriodOps(txs, '2026-05-01', '2026-05-31');
    expect(out.count).toBe(3);
    expect(out.sumCents).toBe(1700_00);
  });

  it('excludes rows outside the range', () => {
    const txs = [
      mkActual({ id: 1, tx_date: '2026-04-30', amount_cents: 1000_00 }),
      mkActual({ id: 2, tx_date: '2026-05-15', amount_cents: 500_00 }),
      mkActual({ id: 3, tx_date: '2026-06-01', amount_cents: 200_00 }),
    ];
    const out = sumPeriodOps(txs, '2026-05-01', '2026-05-31');
    expect(out.count).toBe(1);
    expect(out.sumCents).toBe(500_00);
  });
});

// ─────────────────── isValidNewAccountDraft ───────────────────

describe('isValidNewAccountDraft', () => {
  it('accepts a valid card draft', () => {
    expect(
      isValidNewAccountDraft({ bank: 'Т-Банк', kind: 'card', balance_cents: 0 }),
    ).toBe(true);
  });

  it('rejects empty bank', () => {
    expect(
      isValidNewAccountDraft({ bank: '', kind: 'card', balance_cents: 0 }),
    ).toBe(false);
  });

  it('rejects whitespace-only bank', () => {
    expect(
      isValidNewAccountDraft({ bank: '   ', kind: 'card', balance_cents: 0 }),
    ).toBe(false);
  });

  it('rejects invalid kind', () => {
    expect(
      isValidNewAccountDraft({ bank: 'Сбер', kind: 'crypto', balance_cents: 0 }),
    ).toBe(false);
  });

  it('rejects negative balance', () => {
    expect(
      isValidNewAccountDraft({ bank: 'Сбер', kind: 'cash', balance_cents: -1 }),
    ).toBe(false);
  });

  it('accepts savings kind', () => {
    expect(
      isValidNewAccountDraft({
        bank: 'Тинькофф',
        kind: 'savings',
        balance_cents: 100_00,
      }),
    ).toBe(true);
  });

  it('accepts cash kind', () => {
    expect(
      isValidNewAccountDraft({ bank: 'Кошелёк', kind: 'cash', balance_cents: 5000_00 }),
    ).toBe(true);
  });
});
