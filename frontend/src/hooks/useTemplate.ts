import { useCallback, useEffect, useState } from 'react';
import { listTemplateItems } from '../api/templates';
import type { TemplateItemRead } from '../api/types';

export interface UseTemplateResult {
  items: TemplateItemRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches all template items on mount; exposes refetch for after-mutation
 * reload.
 *
 * Mirrors the `useCategories` pattern: cancellation flag in the mount-effect
 * prevents stale renders if the component unmounts mid-request. Single-tenant
 * → no optimistic updates; refetch after mutation keeps state consistent
 * (T-fe-stale mitigation, carry-over from Phase 2).
 */
export function useTemplate(): UseTemplateResult {
  const [items, setItems] = useState<TemplateItemRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTemplateItems();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTemplateItems()
      .then((data) => {
        if (!cancelled) setItems(data);
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
  }, []);

  return { items, loading, error, refetch };
}
