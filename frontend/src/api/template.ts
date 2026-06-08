// Typed wrappers for the reusable budget TEMPLATE (plan template UI).
//
// The template is the «set-once, auto-applied to every NEW month» source:
//   - per-category limits   (TemplateItemRead {category_id, limit_cents})
//   - recurring detail lines (TemplateLineRead {id, category_id, kind,
//     amount_cents, day_of_period, title})
//
// It is applied to a new period server-side; the current period's plan is NOT
// touched when the template changes. The template is edited only DIRECTLY
// (ADR-0007 removed the «перезаписать шаблон текущим планом» save-current route).
//
// Endpoints (BACKEND contract /api/v1/template/*):
//   GET    /template/items                 → TemplateItemRead[]
//   PUT    /template/items/{categoryId}     → TemplateItemRead   (upsert limit)
//   GET    /template/lines                  → TemplateLineRead[]
//   POST   /template/lines                  → TemplateLineRead
//   PATCH  /template/lines/{lineId}         → TemplateLineRead
//   DELETE /template/lines/{lineId}         → 204
//
// Wire shapes come straight from the generated contract types (TemplateItem* /
// TemplateLine*), re-exported here under their canonical names.

import { apiFetch } from './client';
import type { components } from './generated/schema';

// ─────────── Wire types (from the generated contract) ───────────

export type TemplateItemRead = components['schemas']['TemplateItemRead'];
export type TemplateItemUpsert = components['schemas']['TemplateItemUpsert'];
export type TemplateLineRead = components['schemas']['TemplateLineRead'];
export type TemplateLineCreate = components['schemas']['TemplateLineCreate'];
export type TemplateLineUpdate = components['schemas']['TemplateLineUpdate'];

// ─────────── In-memory cache (light; invalidated on every mutation) ───────────
//
// The template screen reloads on mount, so a light per-tab cache is enough. Any
// mutation (item upsert / line create-update-delete) clears it so the next read
// re-fetches the authoritative server state.

let itemsCache: TemplateItemRead[] | null = null;
let linesCache: TemplateLineRead[] | null = null;

function invalidateTemplateCache(): void {
  itemsCache = null;
  linesCache = null;
}

// ─────────── Template items (per-category limits) ───────────

/** GET /api/v1/template/items — list of {category_id, limit_cents}. */
export async function getTemplateItems(): Promise<TemplateItemRead[]> {
  if (itemsCache != null) return itemsCache;
  const rows = await apiFetch<TemplateItemRead[]>('/template/items');
  itemsCache = rows;
  return rows;
}

/**
 * PUT /api/v1/template/items/{categoryId} — upsert the template limit for a
 * category. `limitCents` must be ≥ 0 (422 otherwise).
 */
export async function putTemplateItem(
  categoryId: number,
  limitCents: number,
): Promise<TemplateItemRead> {
  const body: TemplateItemUpsert = { limit_cents: limitCents };
  const res = await apiFetch<TemplateItemRead>(
    `/template/items/${categoryId}`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  invalidateTemplateCache();
  return res;
}

// ─────────── Template lines (recurring detail) ───────────

/** GET /api/v1/template/lines — recurring template lines. */
export async function getTemplateLines(): Promise<TemplateLineRead[]> {
  if (linesCache != null) return linesCache;
  const rows = await apiFetch<TemplateLineRead[]>('/template/lines');
  linesCache = rows;
  return rows;
}

/** POST /api/v1/template/lines — create a recurring template line. */
export async function createTemplateLine(
  payload: TemplateLineCreate,
): Promise<TemplateLineRead> {
  const res = await apiFetch<TemplateLineRead>('/template/lines', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidateTemplateCache();
  return res;
}

/** PATCH /api/v1/template/lines/{lineId} — partial update. */
export async function patchTemplateLine(
  lineId: number,
  payload: TemplateLineUpdate,
): Promise<TemplateLineRead> {
  const res = await apiFetch<TemplateLineRead>(`/template/lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  invalidateTemplateCache();
  return res;
}

/** DELETE /api/v1/template/lines/{lineId} — hard delete. 204 → success. */
export async function deleteTemplateLine(lineId: number): Promise<void> {
  await apiFetch<void>(`/template/lines/${lineId}`, { method: 'DELETE' });
  invalidateTemplateCache();
}
