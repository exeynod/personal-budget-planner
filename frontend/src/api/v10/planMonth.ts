// Phase 26-04 (PLAN-V10-06): typed wrapper for PATCH /api/v1/plan-month.
//
// Backend (Plan 26-01) — atomic batch plan-cents update with server-side
// Σplan ≤ User.income_cents validation in a single DB transaction.
//
// Error contract (Plan 26-01 SUMMARY):
//   400 plan_overflow → detail = {error, income_cents, sum_plan_cents}
//   404               → unknown / cross-tenant category_id
//   422               → negative cents / empty plans / duplicate category_id
//
// Caller MUST catch ApiError(status=400) for inline overflow display
// (PlanMount renders «Σplan превышает доход» under the surplus plate).

import { apiFetch } from '../client';
import type { PlanMonthItem, PlanMonthResponse } from '../types';

export type { PlanMonthItem, PlanMonthPatchPayload, PlanMonthResponse } from '../types';

/**
 * PATCH /api/v1/plan-month — atomic batch plan update.
 *
 * Body shape: `{plans: [{category_id, plan_cents}, ...]}` — must be non-empty,
 * no duplicate category_id (backend `model_validator` rejects with 422).
 *
 * On 400 plan_overflow, the thrown `ApiError.body` is the JSON detail string
 * carrying `{error: "plan_overflow", income_cents, sum_plan_cents}` so callers
 * can display the constraint to the user.
 *
 * Symmetric to iOS `PlanMonthAPI.patch(plans:)` (Plan 26-05).
 */
export async function patchPlanMonth(
  plans: PlanMonthItem[],
): Promise<PlanMonthResponse> {
  return apiFetch<PlanMonthResponse>('/plan-month', {
    method: 'PATCH',
    body: JSON.stringify({ plans }),
  });
}
