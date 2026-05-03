import { useCallback, useEffect, useState } from 'react';
import { listCategories } from '../api/categories';
import type { CategoryRead } from '../api/types';

export interface UseCategoriesResult {
  categories: CategoryRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches categories on mount and whenever `includeArchived` changes.
 *
 * Exposes `refetch()` so consumers can force a reload after mutations
 * (create/rename/archive/unarchive). State updates are guarded against
 * stale renders via a local `cancelled` flag — important because the
 * caller may unmount between request and response.
 */
export function useCategories(includeArchived: boolean): UseCategoriesResult {
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCategories(includeArchived);
      setCategories(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCategories(includeArchived)
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeArchived]);

  return { categories, loading, error, refetch };
}
