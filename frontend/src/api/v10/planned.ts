// v1.1 planning rework — typed wrappers for the planned-transaction surface.
//
// One surface for month-plan detail: list/create/patch/delete planned rows for
// a period, plus the plan↔fact bridge (post / unpost / bulk-post). Manual rows
// AND subscription-derived rows (source='subscription_auto') both surface here;
// subscription rows are posted via their own /subscriptions/{id}/post route, so
// the per-row «Провести» for subscription rows goes through subscriptions.ts.
//
// Endpoints (BACKEND-PLAN §4):
//   GET    /periods/{id}/planned                  → PlannedV11Read[]
//   POST   /periods/{id}/planned                  → PlannedV11Read   (source=manual)
//   PATCH  /planned/{id}                           → PlannedV11Read
//   DELETE /planned/{id}                           → 204
//   POST   /periods/{id}/planned/{pid}/post        → PostPlannedResponse
//   POST   /periods/{id}/planned/{pid}/unpost      → 204
//   POST   /periods/{id}/planned/post-batch        → PostPlannedBatchResponse
//
// Cache: posting/unposting inserts/deletes an actual_transaction → invalidate
// the tx-affected caches (actuals/balance/accounts) so Home/balance ladders
// never serve stale numbers (mirror of subscriptions.ts post/unpost).

import { apiFetch } from '../client';
import { getCached, invalidate, CACHE_KEYS } from '../cache';
import type {
  PlannedV11Read,
  PlannedV11Create,
  PlannedV11Update,
  PostPlannedResponse,
  PostPlannedBatchResponse,
} from '../types';

export type {
  PlannedV11Read,
  PlannedV11Create,
  PlannedV11Update,
  PostPlannedResponse,
  PostPlannedBatchResponse,
} from '../types';

/**
 * GET /api/v1/periods/{periodId}/planned
 *
 * Lists every planned row for the period (manual + subscription-derived).
 * Optional `categoryId` filters client-side (the route has no category query
 * param in the contract) so a category-detail disclosure can show only its own
 * rows without a second round-trip shape.
 */
export async function listPlanned(
  periodId: number,
  categoryId?: number,
): Promise<PlannedV11Read[]> {
  // Cache the full per-period list (stable read; the native plan↔fact ladders
  // on Home + CategoryDetail both consume it). `categoryId` filters client-side
  // off the SAME cached payload so a category drill-down adds no round-trip and
  // never serves a divergent shape. Post/unpost/batch invalidate `plannedPrefix`.
  const rows = await getCached(CACHE_KEYS.planned(periodId), () =>
    apiFetch<PlannedV11Read[]>(`/periods/${periodId}/planned`),
  );
  return categoryId == null
    ? rows
    : rows.filter((r) => r.category_id === categoryId);
}

/**
 * POST /api/v1/periods/{periodId}/planned — create a manual planned row.
 *
 * Service forces source='manual'. `kind` MUST match the category kind
 * (mismatch → 400). Does not touch actuals, so no balance invalidation needed.
 */
export async function createPlanned(
  periodId: number,
  payload: PlannedV11Create,
): Promise<PlannedV11Read> {
  const res = await apiFetch<PlannedV11Read>(`/periods/${periodId}/planned`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // A new planned row → the cached per-period list is now stale.
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}

/**
 * PATCH /api/v1/planned/{plannedId} — partial update (title/description,
 * amount, planned_date, kind, category_id).
 */
export async function patchPlanned(
  plannedId: number,
  payload: PlannedV11Update,
): Promise<PlannedV11Read> {
  const res = await apiFetch<PlannedV11Read>(`/planned/${plannedId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  // Amount / category / kind may have changed → drop the cached list.
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}

/**
 * DELETE /api/v1/planned/{plannedId} — hard delete a planned row.
 * 204 → success · 404 → unknown / cross-tenant.
 */
export async function deletePlanned(plannedId: number): Promise<void> {
  await apiFetch<void>(`/planned/${plannedId}`, { method: 'DELETE' });
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
}

/**
 * POST /api/v1/periods/{periodId}/planned/{plannedId}/post — post a planned
 * row into a real actual_transaction on `txDate` (defaults to the row's
 * planned_date server-side when omitted; we always pass an explicit date).
 *
 * 200 → PostPlannedResponse (txn_id + planned_id)
 * 409 → already posted (posted_txn_id != null)
 * 400 → subscription_auto row (post via /subscriptions/{id}/post instead)
 * 404 → not found / cross-tenant
 */
export async function postPlanned(
  periodId: number,
  plannedId: number,
  txDate: string,
): Promise<PostPlannedResponse> {
  const res = await apiFetch<PostPlannedResponse>(
    `/periods/${periodId}/planned/${plannedId}/post`,
    { method: 'POST', body: JSON.stringify({ tx_date: txDate }) },
  );
  // An actual_transaction was inserted → drop tx-affected caches. The row's
  // posted_txn_id flipped too → the planned list (4-level ladder) is stale.
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}

/**
 * POST /api/v1/periods/{periodId}/planned/{plannedId}/unpost — reverse a post:
 * deletes the actual_transaction and clears posted_txn_id.
 *
 * 204 → success · 404 → not posted / unknown / cross-tenant.
 */
export async function unpostPlanned(
  periodId: number,
  plannedId: number,
): Promise<void> {
  await apiFetch<void>(`/periods/${periodId}/planned/${plannedId}/unpost`, {
    method: 'POST',
  });
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
}

/**
 * POST /api/v1/periods/{periodId}/planned/post-batch — bulk-post the given
 * rows; one actual per row. `txDate` omitted → each row posts on its own
 * planned_date (fallback today); provided → all rows post on that one date.
 *
 * Returns the ids actually posted + those skipped (already posted).
 */
export async function postPlannedBatch(
  periodId: number,
  plannedIds: number[],
  txDate?: string,
): Promise<PostPlannedBatchResponse> {
  const body: { planned_ids: number[]; tx_date?: string } = {
    planned_ids: plannedIds,
  };
  if (txDate != null) body.tx_date = txDate;
  const res = await apiFetch<PostPlannedBatchResponse>(
    `/periods/${periodId}/planned/post-batch`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}
