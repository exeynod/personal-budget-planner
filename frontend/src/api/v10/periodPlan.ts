// v1.1 planning rework — per-period category limits («План месяца» snapshot).
//
// The month-plan is an instance of the template for one period. Limits live in
// `period_category_plan` and are edited locally for the month (they do NOT flow
// back to the template). GET falls back to Category.plan_cents server-side for
// periods created before apply-template.
//
// Endpoints (BACKEND-PLAN §4):
//   GET   /periods/{id}/plan   → PeriodPlanResponse {plans:[{category_id,limit_cents}]}
//   PATCH /periods/{id}/plan   → PeriodPlanResponse  (UPSERT)
//
// A PATCH changes the per-period limits that compute_balance reads → invalidate
// the period balance cache so the Home/CategoryDetail ladders refresh.

import { apiFetch } from '../client';
import { invalidate, CACHE_KEYS } from '../cache';
import type { PeriodPlanRow, PeriodPlanResponse } from '../types';

export type { PeriodPlanRow, PeriodPlanResponse } from '../types';

/** GET /api/v1/periods/{periodId}/plan — per-category limits for the period. */
export async function getPeriodPlan(
  periodId: number,
): Promise<PeriodPlanResponse> {
  return apiFetch<PeriodPlanResponse>(`/periods/${periodId}/plan`);
}

/**
 * PATCH /api/v1/periods/{periodId}/plan — UPSERT per-category limits.
 *
 * Body `{plans:[{category_id, limit_cents}]}`. Returns the refreshed plan rows.
 */
export async function patchPeriodPlan(
  periodId: number,
  plans: PeriodPlanRow[],
): Promise<PeriodPlanResponse> {
  const res = await apiFetch<PeriodPlanResponse>(`/periods/${periodId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plans }),
  });
  // Per-period limits feed compute_balance → drop the cached balances.
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}
