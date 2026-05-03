import { apiFetch } from './client';
import type { BalanceResponse, PeriodRead } from './types';

/**
 * GET /api/v1/periods — list all budget periods, newest first.
 * Returns empty array if no periods exist (not 404). Used by PeriodSwitcher (DSH-06).
 */
export async function listPeriods(): Promise<PeriodRead[]> {
  return apiFetch<PeriodRead[]>('/periods');
}

/**
 * GET /api/v1/periods/{period_id}/balance — balance for any period (active or closed).
 * Throws ApiError(404) if period does not exist. Used for archived period view (DSH-05/06).
 */
export async function getPeriodBalance(periodId: number): Promise<BalanceResponse> {
  return apiFetch<BalanceResponse>(`/periods/${periodId}/balance`);
}
