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

export async function getForecast(range: AnalyticsRange = '1M'): Promise<ForecastResponse> {
  return apiFetch<ForecastResponse>(`/analytics/forecast?range=${range}`);
}

// ---------------------------------------------------------------------------
// Phase 38-02 (REQ-38-02) — fire-and-forget event tracking helper.
//
// Wraps POST /api/v1/analytics/event. Errors silently swallowed —
// analytics никогда не должна ломать UI.
// ---------------------------------------------------------------------------

export async function trackEvent(
  eventName: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await apiFetch('/analytics/event', {
      method: 'POST',
      body: JSON.stringify({ event: eventName, props }),
    });
  } catch {
    // never propagate — analytics shouldn't break UI
  }
}

// Stable event constants — mirror app/services/analytics.py EVENT_* names.
export const EVENT = {
  LANDING_HIT: 'landing.hit',
  ONBOARDING_STARTED: 'onboarding.started',
  ONBOARDING_COMPLETED: 'onboarding.completed',
  FIRST_TXN: 'txn.first_created',
  AI_CHAT_USED: 'ai.chat.used',
  PAYWALL_SHOWN: 'paywall.shown',
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
} as const;
