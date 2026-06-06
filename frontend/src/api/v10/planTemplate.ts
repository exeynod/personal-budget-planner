// v1.1 planning rework — typed wrappers for the reusable budget TEMPLATE.
//
// The template is the «set-once, edit-rarely» source: per-category limits
// (TemplateItem) + recurring detail lines (TemplateLine: title, amount,
// day_of_period, kind). It is auto-applied to a new period server-side; the
// web template screen only edits it (no apply button needed here).
//
// Endpoints (BACKEND-PLAN §4):
//   GET    /template/items                  → TemplateItemV11Read[]
//   PUT    /template/items/{categoryId}      → TemplateItemV11Read   (upsert limit)
//   GET    /template/lines?category_id=      → TemplateLineV11Read[]
//   POST   /template/lines                   → TemplateLineV11Read
//   PATCH  /template/lines/{lineId}          → TemplateLineV11Read
//   DELETE /template/lines/{lineId}          → 204
//
// The template never affects the current period's actuals/balance directly,
// so no balance-cache invalidation here.

import { apiFetch } from '../client';
import type {
  TemplateItemV11Read,
  TemplateItemV11Upsert,
  TemplateLineV11Read,
  TemplateLineV11Create,
  TemplateLineV11Update,
} from '../types';

export type {
  TemplateItemV11Read,
  TemplateItemV11Upsert,
  TemplateLineV11Read,
  TemplateLineV11Create,
  TemplateLineV11Update,
} from '../types';

// ─────────── Template items (per-category limits) ───────────

/** GET /api/v1/template/items — list of {category_id, limit_cents}. */
export async function listTemplateItems(): Promise<TemplateItemV11Read[]> {
  return apiFetch<TemplateItemV11Read[]>('/template/items');
}

/**
 * PUT /api/v1/template/items/{categoryId} — upsert the template limit for a
 * category. `limit_cents` must be ≥ 0 (422 otherwise).
 */
export async function upsertTemplateItem(
  categoryId: number,
  payload: TemplateItemV11Upsert,
): Promise<TemplateItemV11Read> {
  return apiFetch<TemplateItemV11Read>(`/template/items/${categoryId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ─────────── Template lines (recurring detail) ───────────

/**
 * GET /api/v1/template/lines — recurring template lines. Optional
 * `categoryId` narrows server-side via the `category_id` query param.
 */
export async function listTemplateLines(
  categoryId?: number,
): Promise<TemplateLineV11Read[]> {
  const qs = categoryId == null ? '' : `?category_id=${categoryId}`;
  return apiFetch<TemplateLineV11Read[]>(`/template/lines${qs}`);
}

/** POST /api/v1/template/lines — create a recurring template line. */
export async function createTemplateLine(
  payload: TemplateLineV11Create,
): Promise<TemplateLineV11Read> {
  return apiFetch<TemplateLineV11Read>('/template/lines', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /api/v1/template/lines/{lineId} — partial update. */
export async function patchTemplateLine(
  lineId: number,
  payload: TemplateLineV11Update,
): Promise<TemplateLineV11Read> {
  return apiFetch<TemplateLineV11Read>(`/template/lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/v1/template/lines/{lineId} — hard delete. 204 → success. */
export async function deleteTemplateLine(lineId: number): Promise<void> {
  await apiFetch<void>(`/template/lines/${lineId}`, { method: 'DELETE' });
}
