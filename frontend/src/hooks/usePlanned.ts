import { useCallback, useEffect, useState } from 'react';
import { listPlanned } from '../api/planned';
import type { PlannedRead } from '../api/types';

export interface UsePlannedResult {
  rows: PlannedRead[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches planned-transactions for the given period.
 *
 * Pass `periodId === null` to skip fetching (e.g., when onboarding hasn't
 * completed yet and there is no active period). The hook re-fetches whenever
 * `periodId` changes; `refetch()` forces a reload after mutations.
 *
 * Mirrors the `useTemplate` / `useCategories` cancellation pattern — a local
 * `cancelled` flag prevents stale renders on unmount or rapid period switches.
 */
export function usePlanned(periodId: number | null): UsePlannedResult {
  const [rows, setRows] = useState<PlannedRead[]>([]);
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
      const data = await listPlanned(periodId);
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
    listPlanned(periodId)
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
