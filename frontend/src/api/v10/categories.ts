/**
 * Phase 25-03 — typed wrapper for `GET /api/v1/categories` (v1.0 surface).
 *
 * **Schema gap (documented in 25-03 SUMMARY)**: as of Phase 22 the
 * backend Pydantic `CategoryRead` (`app/api/schemas/categories.py`)
 * still emits only the v0.x field set (id / name / kind / is_archived /
 * sort_order / created_at). The ORM `Category` model already has the
 * v1.0 columns (`code, plan_cents, ord, rollover, paused, parent_id`)
 * via Phase 22 alembic 0013 — but they are not yet on the wire.
 *
 * The `CategoryV10` TypeScript type below makes the v1.0 fields
 * `Optional` + nullable so consumers stay compile-clean both before
 * and after the schema is widened. UI code MUST defensively default
 * (`plan_cents ?? 0`, `paused ?? false`, etc.) until the schema lands.
 */
import { apiFetch } from '../client';
import type { CategoryV10, CategoryRollover } from '../types';

export type { CategoryV10, CategoryRollover } from '../types';

/**
 * GET /api/v1/categories?include_archived=<bool>
 *
 * Returns active categories by default; pass `includeArchived=true`
 * for the management screen. The response shape is identical to the
 * v0.x `listCategories` for now — once Phase 22 widens `CategoryRead`,
 * the additional v1.0 fields will start appearing in-place.
 */
export async function listCategoriesV10(
  includeArchived = false,
): Promise<CategoryV10[]> {
  const qs = includeArchived ? '?include_archived=true' : '';
  return apiFetch<CategoryV10[]>(`/categories${qs}`);
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
  return apiFetch<CategoryV10>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
