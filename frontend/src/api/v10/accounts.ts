/**
 * Phase 25-03 — typed wrapper for `GET /api/v1/accounts`.
 *
 * Backed by Phase 22 BE-02 (`app/api/schemas/accounts.py`). Returns the
 * authenticated user's accounts; primary first per backend ordering
 * (`ORDER BY is_primary DESC, id ASC`, see Phase 22 accounts service).
 *
 * Used by Home (HOME-V10-04 wallet link sums `Σ balance_cents`),
 * AddSheet (account picker), Accounts list view (Phase 26).
 */
import { apiFetch } from '../client';
import type { AccountResponse } from '../types';

export type { AccountResponse, AccountKindStr } from '../types';

/**
 * GET /api/v1/accounts
 *
 * No query params today. Returns AccountResponse[] sorted with the
 * user's `primary` account first (mirrors iOS contract).
 */
export async function listAccounts(): Promise<AccountResponse[]> {
  return apiFetch<AccountResponse[]>('/accounts');
}
