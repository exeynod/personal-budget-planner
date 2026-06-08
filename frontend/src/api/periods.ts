import { apiFetch, ApiError } from './client';
import { getCached, CACHE_KEYS } from './cache';
import type { BalanceResponse, PeriodRead } from './types';

/**
 * GET /api/v1/periods — list all budget periods, newest first.
 * Returns empty array if no periods exist (not 404). Used by PeriodSwitcher (DSH-06).
 *
 * Cached + deduped (perceived-speed): SelectedPeriodProvider reads this on
 * every shell mount. Invalidated by subscription post/unpost (which may create
 * a period) — see api/v10/subscriptions.ts.
 */
export async function listPeriods(): Promise<PeriodRead[]> {
  return getCached(CACHE_KEYS.periods, () =>
    apiFetch<PeriodRead[]>('/periods'),
  );
}

/**
 * GET /api/v1/periods/{period_id}/balance — balance for any period (active or closed).
 * Throws ApiError(404) if period does not exist. Used for archived period view (DSH-05/06).
 *
 * Cached per period id (perceived-speed): a closed past period's balance is
 * immutable; the active period's is invalidated by tx / subscription / category
 * mutations so it never serves a stale plan/fact delta.
 */
export async function getPeriodBalance(
  periodId: number,
): Promise<BalanceResponse> {
  return getCached(CACHE_KEYS.balance(periodId), () =>
    apiFetch<BalanceResponse>(`/periods/${periodId}/balance`),
  );
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
  // Cached + deduped (perceived-speed): read on every CategoryDetail /
  // PlanCategoryDetail mount. The active period is stable within the TTL; the
  // 404 → null result is cached too (so an onboarding-race empty isn't
  // re-probed every navigation). Invalidated alongside `periods` by
  // subscription post/unpost (which may create a period) — see
  // api/v10/subscriptions.ts.
  return getCached(CACHE_KEYS.currentPeriod, async () => {
    try {
      return await apiFetch<PeriodRead>('/periods/current');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  });
}
