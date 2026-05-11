// Phase 34-06 (REQ-34-04): minimal frontend billing API surface.
//
// Wraps three Phase 34 endpoints (see app/api/routes/billing.py + me.py):
//   POST /api/v1/billing/create-payment   — initiate ЮKassa payment
//   GET  /api/v1/me/subscription          — current Pro state
//   POST /api/v1/me/subscription/cancel   — cancel auto-renew
//
// `apiFetch` lives in `./client` and already prefixes `/api/v1` to relative
// paths, so the strings passed below intentionally drop that prefix.

import { apiFetch } from './client';

export interface PaymentCreateRequest {
  amount_cents: number;
  description?: string;
  return_url: string;
}

export interface PaymentCreateResponse {
  payment_id: number;
  confirmation_url: string;
}

export interface SubscriptionRead {
  tier: 'free' | 'pro';
  period_start: string;
  period_end: string;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
}

export async function createPayment(req: PaymentCreateRequest): Promise<PaymentCreateResponse> {
  return apiFetch<PaymentCreateResponse>('/billing/create-payment', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function getMySubscription(): Promise<SubscriptionRead | null> {
  return apiFetch<SubscriptionRead | null>('/me/subscription');
}

export async function cancelMySubscription(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/me/subscription/cancel', {
    method: 'POST',
  });
}
