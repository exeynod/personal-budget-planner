import { apiFetch } from './client';
import type {
  TrendResponse,
  TopOverspendResponse,
  TopCategoriesResponse,
  ForecastResponse,
} from './types';

export type AnalyticsRange = '1M' | '3M' | '6M' | '12M';

export async function getAnalyticsTrend(range: AnalyticsRange): Promise<TrendResponse> {
  return apiFetch<TrendResponse>(`/analytics/trend?range=${range}`);
}

export async function getTopOverspend(range: AnalyticsRange): Promise<TopOverspendResponse> {
  return apiFetch<TopOverspendResponse>(`/analytics/top-overspend?range=${range}`);
}

export async function getTopCategories(range: AnalyticsRange): Promise<TopCategoriesResponse> {
  return apiFetch<TopCategoriesResponse>(`/analytics/top-categories?range=${range}`);
}

export async function getForecast(): Promise<ForecastResponse> {
  return apiFetch<ForecastResponse>('/analytics/forecast');
}
