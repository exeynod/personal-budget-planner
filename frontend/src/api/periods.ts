import { apiFetch, ApiError } from './client';
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

/**
 * GET /api/v1/periods/current — returns the active budget period.
 *
 * Returns `null` (instead of throwing) when the backend responds 404
 * («No active budget period — complete onboarding first»). All other
 * errors propagate. Phase 25 HomeMount uses this to gracefully render
 * an empty period state if the post-onboarding job hasn't yet seeded a
 * period (rare race window).
 */
export async function getCurrentPeriod(): Promise<PeriodRead | null> {
  try {
    return await apiFetch<PeriodRead>('/periods/current');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
