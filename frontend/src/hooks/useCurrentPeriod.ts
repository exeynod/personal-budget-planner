import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api/client';
import type { PeriodRead } from '../api/types';

export interface UseCurrentPeriodResult {
  period: PeriodRead | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches the active budget period (`GET /api/v1/periods/current`).
 *
 * Returns `period: null` (not error) on 404 — meaning onboarding hasn't
 * completed yet. Caller can render a "complete onboarding first" message.
 * Other errors propagate via the `error` field.
 *
 * Mirrors the `useCategories` mount-effect cancellation pattern: a local
 * `cancelled` flag prevents stale state writes if the component unmounts
 * mid-request. `refetch()` is exposed for after-mutation reload (e.g. after
 * apply-template).
 */
export function useCurrentPeriod(): UseCurrentPeriodResult {
  const [period, setPeriod] = useState<PeriodRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PeriodRead>('/periods/current');
      setPeriod(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setPeriod(null);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<PeriodRead>('/periods/current')
      .then((data) => {
        if (!cancelled) setPeriod(data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setPeriod(null);
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { period, loading, error, refetch };
}
