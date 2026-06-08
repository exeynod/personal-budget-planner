/**
 * Phase 25-03 — typed wrapper for `GET /api/v1/categories` (v1.0 surface).
 *
 * Phase 69 B4: `CategoryV10` is now generated-backed (see
 * `generated/adapters.ts`) — `code`/`ord` required, `plan_cents`/`tag`
 * server-defaulted, `parent_id` optional+nullable. (`rollover`/`paused` were
 * removed from the category contract in the v1.1 planning rework.)
 */
import { apiFetch } from '../client';
import { getCached, invalidate, CACHE_KEYS } from '../cache';
import type { CategoryV10 } from '../types';

export type { CategoryV10 } from '../types';

/**
 * GET /api/v1/categories?include_archived=<bool>
 *
 * Returns active categories by default; pass `includeArchived=true`
 * for the management screen. The response carries the v1.0
 * `CategoryRead` field set (code / ord / plan_cents / parent_id / tag).
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
 * `rollover` / `paused` were removed from the contract in the v1.1 planning
 * rework.
 */
export interface CategoryV10UpdatePayload {
  name?: string;
  sort_order?: number;
  is_archived?: boolean;
  /** Phase 26 — v1.0 fields (CAT-V10-04 / PLAN-V10-05). */
  plan_cents?: number;
  parent_id?: number | null;
  /** 0034 — explicit icon key (e.g. `'food'`); picked via IconPicker. */
  icon?: string | null;
}

/**
 * 0034 — POST /api/v1/categories request payload.
 *
 * `name` + `kind` are required server-side; `sort_order` defaults to 0, `tag`
 * to `'personal'`, `icon` is optional (NULL → name-based icon fallback).
 */
export interface CategoryV10CreatePayload {
  name: string;
  kind: 'expense' | 'income';
  sort_order?: number;
  tag?: 'personal' | 'business' | 'mixed';
  icon?: string | null;
}

/**
 * POST /api/v1/categories (0034) — create a new user category.
 *
 * Returns the created CategoryV10 row. Invalidates the category family + the
 * cached period balances + the HOME bootstrap so the new category shows up
 * everywhere immediately (mirrors `updateCategoryV10`).
 */
export async function createCategoryV10(
  payload: CategoryV10CreatePayload,
): Promise<CategoryV10> {
  const created = await apiFetch<CategoryV10>('/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  invalidate(CACHE_KEYS.categoriesPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.home);
  return created;
}

/**
 * PATCH /api/v1/categories/{id} (Phase 26-02).
 *
 * Returns the updated CategoryV10 row (response widened by Phase 26-01).
 * Used by CategoryDetailMount + Plan for plan_cents / name / archive edits —
 * see `screensV10/CategoryDetail/CategoryDetailMount.tsx` for callsites.
 *
 * Symmetric to iOS `CategoriesV10API.update(id:body:)` (Phase 26-03).
 *
 * Example:
 *   await updateCategoryV10(42, { plan_cents: 50_000 });
 */
export async function updateCategoryV10(
  id: number,
  payload: CategoryV10UpdatePayload,
): Promise<CategoryV10> {
  const updated = await apiFetch<CategoryV10>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  // plan_cents / name / archive changed — drop the category family AND any
  // cached period balances (they aggregate plan by category).
  invalidate(CACHE_KEYS.categoriesPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.home);
  return updated;
}

/**
 * DELETE /api/v1/categories/{id} (0034) — soft-archive a category.
 *
 * Sets `is_archived=true` server-side (CAT-02); historical transactions stay
 * intact. Returns the archived CategoryV10 row. Invalidates the same caches as
 * `updateCategoryV10`. Use `updateCategoryV10(id, { is_archived: false })` to
 * unarchive.
 */
export async function archiveCategoryV10(id: number): Promise<CategoryV10> {
  const archived = await apiFetch<CategoryV10>(`/categories/${id}`, {
    method: 'DELETE',
  });
  invalidate(CACHE_KEYS.categoriesPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.home);
  return archived;
}
