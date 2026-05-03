import { useCallback, useEffect, useState } from 'react';
import { listSubscriptions } from '../api/subscriptions';
import type { SubscriptionRead } from '../api/types';

/**
 * Fetches subscription list on mount.
 *
 * Returns subscriptions, loading, error, refetch and mutate.
 * mutate(fn) executes any async operation then calls refetch — convenient
 * for create/update/delete without manual state invalidation.
 *
 * Mirrors useActual/usePlanned cancellation pattern with `cancelled` flag
 * to prevent stale state updates after unmount.
 */
export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubscriptions(await listSubscriptions());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const mutate = useCallback(
    async <T,>(op: () => Promise<T>): Promise<T> => {
      const result = await op();
      await refetch();
      return result;
    },
    [refetch],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listSubscriptions()
      .then((data) => {
        if (!cancelled) setSubscriptions(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { subscriptions, loading, error, refetch, mutate };
}
