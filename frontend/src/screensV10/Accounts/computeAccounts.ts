// Phase 27-04 Task 1: pure compute helpers for AccountsListView / AccountDetailView.
//
// Surface (6 helpers, all pure / deterministic / side-effect-free):
//   - sumAccountsBalances(list) → Σ balance_cents
//   - countAccounts(list) → list.length
//   - formatBankSubtitle(account) → «карта ·· {mask}» / «карта» / «наличные» / «накопит. счёт»
//   - filterByAccount(actuals, accountId) → tx[] where tx.account_id === accountId
//   - sumPeriodOps(actuals, periodStart, periodEnd) → { count, sumCents }   (sumCents = Σ |amount|)
//   - isValidNewAccountDraft({ bank, kind, balance_cents }) → boolean
//
// Mirrors iOS AccountsData.swift (paired plan 27-05) — must produce identical
// numbers/strings (web ║ iOS symmetry, Phase 25/26 convention).

import type { AccountResponse, ActualV10Read } from '../../api/v10';

/** Σ balance_cents across all accounts. */
export function sumAccountsBalances(list: ReadonlyArray<AccountResponse>): number {
  let sum = 0;
  for (const a of list) sum += a.balance_cents;
  return sum;
}

/** Number of accounts in the list. */
export function countAccounts(list: ReadonlyArray<AccountResponse>): number {
  return list.length;
}

/**
 * Sub-line text for an account row:
 *
 *   - kind 'cash'    → 'наличные'
 *   - kind 'savings' → 'накопит. счёт'
 *   - kind 'card' + mask → 'карта ·· {mask}'
 *   - kind 'card' without mask → 'карта'
 *
 * Used in AccountsListView (each row sub-line) AND AccountDetailView
 * (subtitle under the bank name Mass headline).
 */
export function formatBankSubtitle(a: AccountResponse): string {
  if (a.kind === 'cash') return 'наличные';
  if (a.kind === 'savings') return 'накопит. счёт';
  // card
  return a.mask ? `карта ·· ${a.mask}` : 'карта';
}

/**
 * Filter actuals to a single account_id. Drops rows where account_id is null
 * (legacy v0.x rows have account_id = NULL — they belong to no account, not
 * to "the first one").
 */
export function filterByAccount(
  actuals: ReadonlyArray<ActualV10Read>,
  accountId: number,
): ActualV10Read[] {
  return actuals.filter((t) => t.account_id === accountId);
}

/**
 * KPI «В МАЕ · N ОПЕРАЦИЙ» plate input — count + Σ |amount_cents| over rows
 * whose tx_date falls inside [periodStart, periodEnd] (inclusive on both ends).
 *
 * Uses lexicographic comparison on ISO date strings (YYYY-MM-DD) — works
 * without Date construction because format is always padded.
 */
export function sumPeriodOps(
  actuals: ReadonlyArray<ActualV10Read>,
  periodStart: string,
  periodEnd: string,
): { count: number; sumCents: number } {
  let count = 0;
  let sumCents = 0;
  for (const t of actuals) {
    if (t.tx_date >= periodStart && t.tx_date <= periodEnd) {
      count += 1;
      sumCents += Math.abs(t.amount_cents);
    }
  }
  return { count, sumCents };
}

/**
 * Form-level validity gate for the «+ ДОБАВИТЬ СЧЁТ» bottom-sheet:
 *
 *   - bank.trim() must be non-empty
 *   - kind must be one of 'card' / 'cash' / 'savings'
 *   - balance_cents must be ≥ 0 (T-27-04-01: UI gate — backend Pydantic
 *     also enforces ge=-1e10 but we keep the «savings»-positive convention here)
 *
 * Returns false on any violation — caller disables «СОХРАНИТЬ» button.
 */
export function isValidNewAccountDraft(d: {
  bank: string;
  kind: string;
  balance_cents: number;
}): boolean {
  if (d.bank.trim().length === 0) return false;
  if (d.kind !== 'card' && d.kind !== 'cash' && d.kind !== 'savings') return false;
  if (d.balance_cents < 0) return false;
  return true;
}
