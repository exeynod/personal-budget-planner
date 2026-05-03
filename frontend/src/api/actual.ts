import { apiFetch } from './client';
import type { ActualCreatePayload, ActualRead, ActualUpdatePayload, BalanceResponse } from './types';

export async function listActual(periodId: number, filters?: { kind?: 'expense' | 'income'; category_id?: number }): Promise<ActualRead[]> {
  const qs = new URLSearchParams();
  if (filters?.kind) qs.set('kind', filters.kind);
  if (filters?.category_id !== undefined) qs.set('category_id', String(filters.category_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ActualRead[]>(`/periods/${periodId}/actual${suffix}`);
}

export async function createActual(payload: ActualCreatePayload): Promise<ActualRead> {
  return apiFetch<ActualRead>('/actual', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateActual(id: number, patch: ActualUpdatePayload): Promise<ActualRead> {
  return apiFetch<ActualRead>(`/actual/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteActual(id: number): Promise<ActualRead> {
  return apiFetch<ActualRead>(`/actual/${id}`, { method: 'DELETE' });
}

export async function getBalance(): Promise<BalanceResponse> {
  return apiFetch<BalanceResponse>('/actual/balance');
}
