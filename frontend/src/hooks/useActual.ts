import { useCallback, useEffect, useState } from 'react';
import { listActual } from '../api/actual';
import type { ActualRead } from '../api/types';

export interface UseActualResult {
  rows: ActualRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches actual-transactions for the given period.
 *
 * Pass `periodId === null` to skip fetching (e.g., when onboarding hasn't
 * completed yet and there is no active period). The hook re-fetches whenever
 * `periodId` changes; `refetch()` forces a reload after mutations.
 *
 * Mirrors the `usePlanned` cancellation pattern — a local `cancelled` flag
 * prevents stale renders on unmount or rapid period switches.
 */
export function useActual(periodId: number | null): UseActualResult {
  const [rows, setRows] = useState<ActualRead[]>([]);
  const [loading, setLoading] = useState(periodId !== null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (periodId === null) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listActual(periodId);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    if (periodId === null) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listActual(periodId)
      .then((data) => {
        if (!cancelled) setRows(data);
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
  }, [periodId]);

  return { rows, loading, error, refetch };
}
