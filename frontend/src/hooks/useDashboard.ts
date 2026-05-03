import { useCallback, useEffect, useState } from 'react';
import { getBalance } from '../api/actual';
import { getPeriodBalance } from '../api/periods';
import type { BalanceResponse } from '../api/types';

export interface UseDashboardResult {
  balance: BalanceResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches BalanceResponse for the dashboard.
 *
 * @param periodId  Specific period id (or null to skip fetching when isActiveCurrent=false).
 * @param isActiveCurrent  When true, uses GET /actual/balance — current active period.
 *                  When false, uses GET /periods/{id}/balance — archived period (DSH-05/06).
 *
 * Mirrors `usePlanned`/`useActual` cancellation pattern. Re-fetches when
 * `periodId` or `isActiveCurrent` changes.
 */
export function useDashboard(
  periodId: number | null,
  isActiveCurrent: boolean,
): UseDashboardResult {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(periodId !== null || isActiveCurrent);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (): Promise<BalanceResponse> => {
    if (isActiveCurrent) {
      return await getBalance();
    }
    if (periodId === null) {
      throw new Error('useDashboard: periodId is null and isActiveCurrent is false');
    }
    return await getPeriodBalance(periodId);
  }, [periodId, isActiveCurrent]);

  const refetch = useCallback(async () => {
    if (periodId === null && !isActiveCurrent) {
      setBalance(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBalance();
      setBalance(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchBalance, periodId, isActiveCurrent]);

  useEffect(() => {
    if (periodId === null && !isActiveCurrent) {
      setBalance(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBalance()
      .then((data) => {
        if (!cancelled) setBalance(data);
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
  }, [periodId, isActiveCurrent, fetchBalance]);

  return { balance, loading, error, refetch };
}
