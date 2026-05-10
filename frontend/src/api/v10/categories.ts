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
import type { CategoryV10 } from '../types';

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
