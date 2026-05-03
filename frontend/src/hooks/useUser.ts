import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import type { MeResponse } from '../api/types';

export interface UseUserResult {
  user: MeResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUser(): UseUserResult {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MeResponse>('/me');
      setUser(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { user, loading, error, refetch };
}
