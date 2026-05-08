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

  // Cross-screen invalidation: any mutation that changes categories (create,
  // rename, archive, unarchive) dispatches `categories:invalidate` on window.
  // Every mounted useCategories listener refetches — fixes "archive doesn't
  // show on Home/Plan/Transactions until full reload" since each screen had
  // its own isolated instance with no shared state.
  useEffect(() => {
    const onInvalidate = () => { void refetch(); };
    window.addEventListener('categories:invalidate', onInvalidate);
    return () => window.removeEventListener('categories:invalidate', onInvalidate);
  }, [refetch]);

  return { categories, loading, error, refetch };
}

/** Broadcast invalidation — call after any category mutation. */
export function invalidateCategories(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('categories:invalidate'));
  }
}
