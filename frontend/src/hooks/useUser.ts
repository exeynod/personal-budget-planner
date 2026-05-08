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
      // DEV-only role override через `?dev_role=member|owner` для UAT.
      // Гейтится import.meta.env.DEV — в production билд override недоступен.
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const devRole = params.get('dev_role');
        if (devRole === 'member' || devRole === 'owner' || devRole === 'revoked') {
          setUser({ ...data, role: devRole });
          return;
        }
      }
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
