import { useCallback, useEffect, useState } from 'react';
import { getSettings } from '../api/settings';
import type { SettingsRead } from '../api/types';

/**
 * Fetches app settings on mount.
 *
 * Returns settings, loading, error, refetch.
 * Mirrors the cancellation pattern from useActual/usePlanned.
 */
export function useSettings() {
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getSettings());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
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

  return { settings, loading, error, refetch };
}
