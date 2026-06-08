// v1.1 planning rework — balance reconcile («Привести остаток»).
//
// The real-world balance sometimes drifts from the computed one. Reconcile lets
// the owner enter their real balance; the backend writes a balancing adjustment
// actual_transaction so balance_now becomes exactly the entered value (reversible
// via DELETE /actual/{id}). delta==0 → no-op (adjustment_txn_id == null).
//
// Endpoint (BACKEND-PLAN §4):
//   POST /balance/reconcile  {target_balance_cents}  → {adjustment_txn_id?, balance_now_cents}

import { apiFetch } from '../client';
import { invalidate, CACHE_KEYS } from '../cache';
import type { ReconcileBalanceResponse } from '../types';

export type {
  ReconcileBalanceRequest,
  ReconcileBalanceResponse,
} from '../types';

/**
 * POST /api/v1/balance/reconcile — set the displayed balance to
 * `targetBalanceCents` by writing a balancing adjustment.
 *
 * Writes an actual_transaction (when delta != 0) → invalidate tx-affected
 * caches so Home/balance reflect the new balance immediately.
 */
export async function reconcileBalance(
  targetBalanceCents: number,
): Promise<ReconcileBalanceResponse> {
  const res = await apiFetch<ReconcileBalanceResponse>('/balance/reconcile', {
    method: 'POST',
    body: JSON.stringify({ target_balance_cents: targetBalanceCents }),
  });
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  invalidate(CACHE_KEYS.home);
  return res;
}
