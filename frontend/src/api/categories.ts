import { apiFetch } from './client';
import type { CategoryCreatePayload, CategoryRead, CategoryUpdatePayload } from './types';

/**
 * GET /api/v1/categories?include_archived=<bool>
 *
 * Returns active categories by default; pass `includeArchived=true` to also
 * include soft-archived rows (used by CategoriesScreen "Показать архивные" toggle).
 */
export async function listCategories(includeArchived = false): Promise<CategoryRead[]> {
  const qs = includeArchived ? '?include_archived=true' : '';
  return apiFetch<CategoryRead[]>(`/categories${qs}`);
}

/**
 * POST /api/v1/categories
 *
 * Creates a new category. Backend assigns id, sort_order (if not provided),
 * and created_at; returns the full row.
 */
export async function createCategory(payload: CategoryCreatePayload): Promise<CategoryRead> {
  return apiFetch<CategoryRead>('/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /api/v1/categories/{id}
 *
 * Partial update — pass only the fields to change (name, sort_order, is_archived).
 * Used both for renames and for un-archiving (`{ is_archived: false }`).
 */
export async function updateCategory(
  id: number,
  patch: CategoryUpdatePayload,
): Promise<CategoryRead> {
  return apiFetch<CategoryRead>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * DELETE /api/v1/categories/{id}
 *
 * Soft-archives the category (sets is_archived=true) per CAT-02 contract.
 * Returns the updated row so the caller can verify is_archived.
 */
export async function archiveCategory(id: number): Promise<CategoryRead> {
  return apiFetch<CategoryRead>(`/categories/${id}`, { method: 'DELETE' });
}
