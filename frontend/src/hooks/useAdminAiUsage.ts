import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminAiUsage } from '../api/admin';
import type { AdminAiUsageResponse } from '../api/types';

export interface UseAdminAiUsageResult {
  data: AdminAiUsageResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Phase 13 admin AI usage hook (AIUSE-01..03).
 *
 * Owner-only fetch of per-user current_month + last_30d AI usage.
 * Refetch is exposed for explicit refresh (e.g. after invite/revoke
 * which may add/remove user rows).
 */
export function useAdminAiUsage(): UseAdminAiUsageResult {
  const [data, setData] = useState<AdminAiUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await getAdminAiUsage();
      if (mountedRef.current) setData(fresh);
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'load failed');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAdminAiUsage()
      .then((fresh) => {
        if (!cancelled && mountedRef.current) setData(fresh);
      })
      .catch((e: unknown) => {
        if (!cancelled && mountedRef.current) {
          setError(e instanceof Error ? e.message : 'load failed');
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error, refetch };
}
