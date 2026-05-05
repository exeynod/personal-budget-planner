import { useCallback, useEffect, useState } from 'react';
import {
  getAnalyticsTrend,
  getTopOverspend,
  getTopCategories,
  getForecast,
} from '../api/analytics';
import type { AnalyticsRange } from '../api/analytics';
import type {
  TrendResponse,
  TopOverspendResponse,
  TopCategoriesResponse,
  ForecastResponse,
} from '../api/types';

export interface UseAnalyticsResult {
  trend: TrendResponse | null;
  topOverspend: TopOverspendResponse | null;
  topCategories: TopCategoriesResponse | null;
  forecast: ForecastResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnalytics(range: AnalyticsRange): UseAnalyticsResult {
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [topOverspend, setTopOverspend] = useState<TopOverspendResponse | null>(null);
  const [topCategories, setTopCategories] = useState<TopCategoriesResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, o, c, f] = await Promise.all([
        getAnalyticsTrend(range),
        getTopOverspend(range),
        getTopCategories(range),
        getForecast(),
      ]);
      setTrend(t);
      setTopOverspend(o);
      setTopCategories(c);
      setForecast(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getAnalyticsTrend(range),
      getTopOverspend(range),
      getTopCategories(range),
      getForecast(),
    ])
      .then(([t, o, c, f]) => {
        if (!cancelled) {
          setTrend(t);
          setTopOverspend(o);
          setTopCategories(c);
          setForecast(f);
        }
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
  }, [range]);

  return { trend, topOverspend, topCategories, forecast, loading, error, refetch };
}
