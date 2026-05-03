import { useCallback, useEffect, useState } from 'react';
import { listPeriods } from '../api/periods';
import type { PeriodRead } from '../api/types';

export interface UsePeriodsResult {
  periods: PeriodRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches all budget periods (`GET /api/v1/periods`).
 *
 * Used by PeriodSwitcher (Phase 5, DSH-06) to populate navigation.
 * Returns empty array (not error) when no periods exist.
 *
 * Mirrors `useCurrentPeriod` mount-effect cancellation pattern: a local
 * `cancelled` flag prevents stale state writes on unmount.
 * `refetch()` is exposed for after-mutation reload (e.g. after the
 * close_period worker job creates a new period).
 */
export function usePeriods(): UsePeriodsResult {
  const [periods, setPeriods] = useState<PeriodRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPeriods();
      setPeriods(data);
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
    listPeriods()
      .then((data) => {
        if (!cancelled) setPeriods(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { periods, loading, error, refetch };
}
