// Phase 27-03 (SAV-V10-03): typed wrappers for /api/v1/goals.
//
// Surface:
//   listGoals()                        → GoalRead[]
//   createGoal(payload)                → GoalRead          (POST 201)
//   deleteGoal(id)                     → void              (DELETE 204)
//
// SavingsMount also reads goals via fetchSavingsSummary() (snapshot bundles
// the full list). The standalone listGoals wrapper exists for consumers
// that need only the goals slice without the rest of the snapshot.

import { apiFetch } from '../client';
import type { GoalRead, GoalCreatePayload } from '../types';

export type { GoalRead, GoalCreatePayload } from '../types';

/** GET /api/v1/goals — list user's goals. */
export async function listGoals(): Promise<GoalRead[]> {
  return apiFetch<GoalRead[]>('/goals');
}

/**
 * POST /api/v1/goals — create a new goal (NewGoalSheet save handler).
 *
 * Backend `GoalCreate.due` is validated to be strictly in the future
 * (Europe/Moscow timezone) — UI passes the date input value as-is and
 * surfaces the 422 message via a generic alert.
 */
export async function createGoal(
  payload: GoalCreatePayload,
): Promise<GoalRead> {
  return apiFetch<GoalRead>('/goals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/v1/goals/{id} — hard delete (per CLAUDE.md goals are not soft-deleted). */
export async function deleteGoal(id: number): Promise<void> {
  await apiFetch<void>(`/goals/${id}`, { method: 'DELETE' });
}
