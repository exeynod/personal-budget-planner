import { apiFetch } from './client';
import type {
  SubscriptionRead,
  SubscriptionCreatePayload,
  SubscriptionUpdatePayload,
  ChargeNowResponse,
} from './types';

export async function listSubscriptions(): Promise<SubscriptionRead[]> {
  return apiFetch('/subscriptions');
}

export async function createSubscription(
  payload: SubscriptionCreatePayload,
): Promise<SubscriptionRead> {
  return apiFetch('/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSubscription(
  id: number,
  payload: SubscriptionUpdatePayload,
): Promise<SubscriptionRead> {
  return apiFetch(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteSubscription(id: number): Promise<void> {
  await apiFetch(`/subscriptions/${id}`, { method: 'DELETE' });
}

export async function chargeNow(id: number): Promise<ChargeNowResponse> {
  return apiFetch(`/subscriptions/${id}/charge-now`, { method: 'POST' });
}
