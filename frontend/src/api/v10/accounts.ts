/**
 * Phase 25-03 — typed wrapper for `GET /api/v1/accounts`.
 * Phase 27-04 — extended with `createAccount` for the new-account bottom sheet.
 *
 * Backed by Phase 22 BE-02 (`app/api/schemas/accounts.py`). Returns the
 * authenticated user's accounts; primary first per backend ordering
 * (`ORDER BY is_primary DESC, id ASC`, see Phase 22 accounts service).
 *
 * Used by Home (HOME-V10-04 wallet link sums `Σ balance_cents`),
 * AddSheet (account picker), Accounts list view (Phase 27-04), and
 * NewAccountSheet (Phase 27-04 create form).
 */
import { apiFetch } from '../client';
import type { AccountResponse, AccountCreatePayload } from '../types';

export type { AccountResponse, AccountKindStr, AccountCreatePayload } from '../types';

/**
 * GET /api/v1/accounts
 *
 * No query params today. Returns AccountResponse[] sorted with the
 * user's `primary` account first (mirrors iOS contract).
 */
export async function listAccounts(): Promise<AccountResponse[]> {
  return apiFetch<AccountResponse[]>('/accounts');
}

/**
 * POST /api/v1/accounts
 *
 * Phase 27-04 ACCT-V10-02 — create-account form gate. Backend (Phase 22 BE-02)
 * validates bank.length ∈ 1..40, mask.length ≤16, kind ∈ {card,cash,savings},
 * balance_cents bounded ±100M ₽. UI also gates via `isValidNewAccountDraft`
 * (T-27-04-01 mitigation).
 */
export async function createAccount(
  payload: AccountCreatePayload,
): Promise<AccountResponse> {
  return apiFetch<AccountResponse>('/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
