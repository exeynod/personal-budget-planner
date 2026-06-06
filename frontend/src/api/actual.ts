import { apiFetch } from './client';
import { invalidate, CACHE_KEYS } from './cache';
import type {
  ActualCreatePayload,
  ActualRead,
  ActualUpdatePayload,
  BalanceResponse,
} from './types';

/**
 * Drop every cache family a transaction mutation can affect: the per-period
 * actuals lists, the per-period balances (plan/fact deltas) and the accounts
 * list (account balances move on delta-balance mutations). Guards against
 * serving a stale balance after a create / update / delete.
 */
function invalidateTxCaches(): void {
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
}

export async function listActual(
  periodId: number,
  filters?: { kind?: 'expense' | 'income'; category_id?: number },
): Promise<ActualRead[]> {
  const qs = new URLSearchParams();
  if (filters?.kind) qs.set('kind', filters.kind);
  if (filters?.category_id !== undefined)
    qs.set('category_id', String(filters.category_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ActualRead[]>(`/periods/${periodId}/actual${suffix}`);
}

export async function createActual(
  payload: ActualCreatePayload,
): Promise<ActualRead> {
  const created = await apiFetch<ActualRead>('/actual', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidateTxCaches();
  return created;
}

export async function updateActual(
  id: number,
  patch: ActualUpdatePayload,
): Promise<ActualRead> {
  const updated = await apiFetch<ActualRead>(`/actual/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  invalidateTxCaches();
  return updated;
}

export async function deleteActual(id: number): Promise<ActualRead> {
  const deleted = await apiFetch<ActualRead>(`/actual/${id}`, {
    method: 'DELETE',
  });
  invalidateTxCaches();
  return deleted;
}

export async function getBalance(): Promise<BalanceResponse> {
  return apiFetch<BalanceResponse>('/actual/balance');
}
