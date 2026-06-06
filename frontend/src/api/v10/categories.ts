/**
 * Phase 25-03 — typed wrapper for `GET /api/v1/categories` (v1.0 surface).
 *
 * Phase 69 B4: `CategoryV10` is now generated-backed (see
 * `generated/adapters.ts`) — `code`/`ord` required, `plan_cents`/`rollover`/
 * `paused`/`tag` server-defaulted, `parent_id` optional+nullable.
 */
import { apiFetch } from '../client';
import { getCached, invalidate, CACHE_KEYS } from '../cache';
import type { CategoryV10, CategoryRollover } from '../types';

export type { CategoryV10, CategoryRollover } from '../types';

/**
 * GET /api/v1/categories?include_archived=<bool>
 *
 * Returns active categories by default; pass `includeArchived=true`
 * for the management screen. The response carries the full v1.0
 * `CategoryRead` field set (code / ord / plan_cents / rollover / paused /
 * parent_id / tag) since the Phase 25 gap-fix.
 */
export async function listCategoriesV10(
  includeArchived = false,
): Promise<CategoryV10[]> {
  const qs = includeArchived ? '?include_archived=true' : '';
  // Cached + deduped per `includeArchived` flag (perceived-speed). A category
  // PATCH invalidates the family so toggles are never served stale.
  return getCached(CACHE_KEYS.categories(includeArchived), () =>
    apiFetch<CategoryV10[]>(`/categories${qs}`),
  );
}

/**
 * Phase 26-02 — PATCH /api/v1/categories/{id} request payload.
 *
 * All fields optional; non-undefined fields are applied server-side.
 * Backend Phase 26-01 extended `CategoryUpdate` (Pydantic) to accept
 * `plan_cents` / `rollover` / `paused` / `parent_id` in addition to
 * the v0.x set (`name` / `sort_order` / `is_archived`).
 */
export interface CategoryV10UpdatePayload {
  name?: string;
  sort_order?: number;
  is_archived?: boolean;
  /** Phase 26 — v1.0 fields (CAT-V10-04 / PLAN-V10-05). */
  plan_cents?: number;
  rollover?: CategoryRollover;
  paused?: boolean;
  parent_id?: number | null;
}

/**
 * PATCH /api/v1/categories/{id} (Phase 26-02).
 *
 * Returns the updated CategoryV10 row (response widened by Phase 26-01).
 * Used by CategoryDetailMount for rollover/paused/plan_cents toggles —
 * see `screensV10/CategoryDetail/CategoryDetailMount.tsx` for callsites.
 *
 * Symmetric to iOS `CategoriesV10API.update(id:body:)` (Phase 26-03).
 *
 * Example:
 *   await updateCategoryV10(42, { rollover: 'savings' });
 */
export async function updateCategoryV10(
  id: number,
  payload: CategoryV10UpdatePayload,
): Promise<CategoryV10> {
  const updated = await apiFetch<CategoryV10>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  // plan_cents / rollover / paused / archive changed — drop the category
  // family AND any cached period balances (they aggregate plan by category).
  invalidate(CACHE_KEYS.categoriesPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  return updated;
}
