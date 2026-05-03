import { apiFetch } from './client';
import type {
  SnapshotFromPeriodResponse,
  TemplateItemCreatePayload,
  TemplateItemRead,
  TemplateItemUpdatePayload,
} from './types';

/**
 * GET /api/v1/template/items
 *
 * Returns all template items (single-tenant — no pagination needed).
 * Frontend groups by category_id locally for the TemplateScreen layout.
 */
export async function listTemplateItems(): Promise<TemplateItemRead[]> {
  return apiFetch<TemplateItemRead[]>('/template/items');
}

/**
 * POST /api/v1/template/items
 *
 * Creates a new template-item. Backend validates that category exists and is
 * not archived (D-36); raises 400 otherwise.
 */
export async function createTemplateItem(
  payload: TemplateItemCreatePayload,
): Promise<TemplateItemRead> {
  return apiFetch<TemplateItemRead>('/template/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /api/v1/template/items/{id} — partial update.
 *
 * Pass only the fields to change. Used by inline-edit (amount only) and by
 * the BottomSheet full editor (any subset).
 */
export async function updateTemplateItem(
  id: number,
  patch: TemplateItemUpdatePayload,
): Promise<TemplateItemRead> {
  return apiFetch<TemplateItemRead>(`/template/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * DELETE /api/v1/template/items/{id} — hard delete.
 *
 * Per CLAUDE.md convention: "Soft delete только для category". Template items
 * are removed permanently; backend returns the deleted row for confirmation.
 */
export async function deleteTemplateItem(id: number): Promise<TemplateItemRead> {
  return apiFetch<TemplateItemRead>(`/template/items/${id}`, { method: 'DELETE' });
}

/**
 * POST /api/v1/template/snapshot-from-period/{period_id} (TPL-03).
 *
 * Destructive overwrite: replaces the entire template with rows derived from
 * the given period's planned-transactions (excluding subscription_auto rows
 * per D-32). Returns the new template items + count of previously-existing
 * rows that were replaced.
 */
export async function snapshotFromPeriod(
  periodId: number,
): Promise<SnapshotFromPeriodResponse> {
  return apiFetch<SnapshotFromPeriodResponse>(
    `/template/snapshot-from-period/${periodId}`,
    { method: 'POST' },
  );
}
