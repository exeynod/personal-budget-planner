/**
 * Phase 25-03 — typed wrapper for `GET /api/v1/accounts`.
 *
 * Backed by Phase 22 BE-02 (`app/api/schemas/accounts.py`). Returns the
 * authenticated user's accounts; primary first per backend ordering
 * (`ORDER BY is_primary DESC, id ASC`, see Phase 22 accounts service).
 *
 * v1.1 planning rework: accounts management (create/edit/delete/transfer) was
 * removed from the UI. This read survives as the single implicit balance
 * source — Home reads `Σ balance_cents`, AddSheet auto-uses the primary
 * account for new actuals (no picker).
 */
import { apiFetch } from '../client';
import { getCached, CACHE_KEYS } from '../cache';
import type { AccountResponse } from '../types';

export type { AccountResponse, AccountKindStr } from '../types';

/**
 * GET /api/v1/accounts
 *
 * No query params today. Returns AccountResponse[] sorted with the
 * user's `primary` account first (mirrors iOS contract).
 *
 * Cached + deduped (perceived-speed): read by Home and AddSheet — without the
 * cache every navigation re-fetched it cold. Short TTL keeps it near-live; any
 * mutation that changes balances (tx submit/delete) invalidates the key so we
 * never serve stale balances.
 */
export async function listAccounts(): Promise<AccountResponse[]> {
  return getCached(CACHE_KEYS.accounts, () =>
    apiFetch<AccountResponse[]>('/accounts'),
  );
}
