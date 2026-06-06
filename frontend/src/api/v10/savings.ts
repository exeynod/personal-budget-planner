// Phase 27-03 (SAV-V10-01..04): typed wrappers for /api/v1/savings.
//
// Surface (used by Plan 27-03 SavingsMount):
//   fetchSavingsSummary()             → SavingsSnapshot     (BE-09)
//   patchSavingsConfig(payload)       → SavingsConfig       (BE-08)
//   postDeposit(payload)              → DepositResponse     (BE-10)
//
// Wire shapes mirror app/api/schemas/savings.py + the inline DepositResponse
// in app/api/routes/savings.py. apiFetch already prefixes /api/v1; we pass
// path slugs only.

import { apiFetch } from '../client';
import { getCached, invalidate, CACHE_KEYS } from '../cache';
import type {
  SavingsSnapshot,
  SavingsConfig,
  SavingsConfigPatchPayload,
  DepositCreatePayload,
  DepositResponse,
} from '../types';

export type {
  SavingsSnapshot,
  SavingsConfig,
  SavingsConfigPatchPayload,
  DepositCreatePayload,
  DepositResponse,
} from '../types';

/**
 * GET /api/v1/savings — full savings dashboard snapshot.
 *
 * Returns total_cents (Σ savings-class balances + deposits),
 * month_in_cents (current MSK-month inflows), config (roundup
 * toggle + base), and the user's goals list.
 */
export async function fetchSavingsSummary(): Promise<SavingsSnapshot> {
  // Cached + deduped (perceived-speed). Invalidated by config PATCH and
  // deposit POST below so the snapshot never lags a mutation.
  return getCached(CACHE_KEYS.savingsSummary, () =>
    apiFetch<SavingsSnapshot>('/savings'),
  );
}

/**
 * PATCH /api/v1/savings/config — partial roundup config update.
 *
 * Both fields optional; empty body is a no-op server-side. SavingsMount
 * uses this for the toggle (roundup_enabled) and the base chip selection
 * (roundup_base ∈ {10, 50, 100}).
 *
 * 200 → updated SavingsConfig
 * 422 → roundup_base outside the allowed set (UI gates this via
 *       TS literal type — server is the second layer).
 */
export async function patchSavingsConfig(
  payload: SavingsConfigPatchPayload,
): Promise<SavingsConfig> {
  const cfg = await apiFetch<SavingsConfig>('/savings/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  invalidate(CACHE_KEYS.savingsSummary);
  return cfg;
}

/**
 * POST /api/v1/savings/deposit — manual deposit.
 *
 * Inserts an actual_transaction(kind='deposit') with negated amount,
 * debits the source account, optionally bumps a goal's current_cents.
 * UI sends positive amount_cents; backend negates internally.
 *
 * 201 → DepositResponse (signed amount_cents — display Math.abs())
 * 404 → unknown account_id / goal_id / cross-tenant
 * 422 → amount_cents == 0 / extra fields
 * 500 → system 'savings' Category missing (onboarding incomplete)
 */
export async function postDeposit(
  payload: DepositCreatePayload,
): Promise<DepositResponse> {
  const res = await apiFetch<DepositResponse>('/savings/deposit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // Deposit inserts an actual_transaction + debits the source account →
  // invalidate savings snapshot, actuals, balances and accounts.
  invalidate(CACHE_KEYS.savingsSummary);
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  return res;
}
