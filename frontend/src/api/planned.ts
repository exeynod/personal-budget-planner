import { apiFetch } from './client';
import type {
  ApplyTemplateResponse,
  PlannedCreatePayload,
  PlannedRead,
  PlannedUpdatePayload,
} from './types';

/**
 * GET /api/v1/periods/{period_id}/planned?kind=&category_id=
 *
 * Returns all planned-transactions for the given period (single-tenant — no
 * pagination needed). Optional filters narrow by kind and/or category. The
 * frontend groups locally by `category_id` for the PlannedScreen layout.
 */
export async function listPlanned(
  periodId: number,
  filters?: { kind?: 'expense' | 'income'; category_id?: number },
): Promise<PlannedRead[]> {
  const qs = new URLSearchParams();
  if (filters?.kind) qs.set('kind', filters.kind);
  if (filters?.category_id !== undefined)
    qs.set('category_id', String(filters.category_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<PlannedRead[]>(`/periods/${periodId}/planned${suffix}`);
}

/**
 * POST /api/v1/periods/{period_id}/planned (source=manual).
 *
 * Backend validates that category exists and is not archived (D-36) and that
 * `kind` matches the category's kind; raises 400 otherwise. Subscription_auto
 * rows cannot be created via this endpoint — they originate from the Phase 6
 * subscription cron-job.
 */
export async function createPlanned(
  periodId: number,
  payload: PlannedCreatePayload,
): Promise<PlannedRead> {
  return apiFetch<PlannedRead>(`/periods/${periodId}/planned`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /api/v1/planned/{id} — partial update.
 *
 * Used by inline-edit (amount only) and by the BottomSheet full editor (any
 * subset of fields). Backend rejects PATCH on subscription_auto rows with 400
 * `SubscriptionPlannedReadOnlyError` (D-37) — UI already prevents this by
 * disabling edit/delete on `source === 'subscription_auto'` (PlanRow), so
 * server-side check is defence-in-depth.
 */
export async function updatePlanned(
  id: number,
  patch: PlannedUpdatePayload,
): Promise<PlannedRead> {
  return apiFetch<PlannedRead>(`/planned/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * DELETE /api/v1/planned/{id} — hard delete.
 *
 * Per CLAUDE.md convention: hard delete for planned rows (soft delete only for
 * categories). Backend returns the deleted row for confirmation. Subscription_auto
 * rows return 400 (managed by subscription job, not by user — D-37).
 */
export async function deletePlanned(id: number): Promise<PlannedRead> {
  return apiFetch<PlannedRead>(`/planned/${id}`, { method: 'DELETE' });
}

/**
 * POST /api/v1/periods/{period_id}/apply-template (TPL-04, idempotent — D-31).
 *
 * If the period already has any source='template' rows, the endpoint returns
 * `{ created: 0, planned: [...existing rows...] }` without inserting duplicates.
 * Otherwise it inserts one planned-row per template-item with source='template'.
 * Phase 5 worker `close_period` will call this same service when creating new
 * periods — idempotency is critical.
 */
export async function applyTemplate(
  periodId: number,
): Promise<ApplyTemplateResponse> {
  return apiFetch<ApplyTemplateResponse>(
    `/periods/${periodId}/apply-template`,
    { method: 'POST' },
  );
}
