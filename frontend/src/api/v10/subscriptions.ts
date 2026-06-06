// Phase 26-06 (SUBS-V10-01..04): V1.0 typed wrappers for /api/v1/subscriptions.
//
// Surface (used by Plan 26-06 SubscriptionsMount):
//   listSubscriptionsV10()                  → SubscriptionV10Read[]
//   patchSubscriptionV10(id, payload)       → SubscriptionV10Read       (Phase 22 BE-12)
//   deleteSubscription(id)                  → void                     (hard delete per CLAUDE.md)
//
// Schema-gap pattern: SubscriptionV10Read = SubscriptionRead & SubscriptionV10Ext
// (day_of_month / account_id / posted_txn_id all optional + nullable until
// Phase 22 BE-12 ships fully). Consumers MUST defensively default
// (`s.day_of_month ?? null`, `s.posted_txn_id ?? null`).

import { apiFetch } from '../client';
import { invalidate, CACHE_KEYS } from '../cache';
import type {
  SubscriptionV10Read,
  SubscriptionV10UpdatePayload,
  SubscriptionPostResponse,
} from '../types';

export type {
  SubscriptionV10Read,
  SubscriptionV10Ext,
  SubscriptionV10UpdatePayload,
  SubscriptionPostResponse,
} from '../types';

/**
 * GET /api/v1/subscriptions — list all subscriptions for current user.
 * V10 wrapper exposes day_of_month/account_id/posted_txn_id when backend
 * emits them (Phase 22 BE-12); fields stay optional in the type.
 */
export async function listSubscriptionsV10(): Promise<SubscriptionV10Read[]> {
  return apiFetch<SubscriptionV10Read[]>('/subscriptions');
}

/**
 * PATCH /api/v1/subscriptions/{id} — update subscription (legacy + V10 fields).
 *
 * Body super-set: legacy (name/amount_cents/cycle/...) + day_of_month / account_id
 * (Phase 22 SubscriptionV10Update). Used by Plan 26-06 SubscriptionMenuSheet
 * («ПАУЗА» → is_active toggle, «СМЕНИТЬ ДЕНЬ» → day_of_month, «ИЗМЕНИТЬ ЦЕНУ»
 * → amount_cents).
 */
export async function patchSubscriptionV10(
  id: number,
  payload: SubscriptionV10UpdatePayload,
): Promise<SubscriptionV10Read> {
  return apiFetch<SubscriptionV10Read>(`/subscriptions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * DELETE /api/v1/subscriptions/{id} — hard delete (CLAUDE.md convention:
 * subscriptions are hard-delete only, no soft-delete).
 *
 * 204 → success
 * 404 → already deleted / unknown / cross-tenant
 */
export async function deleteSubscription(id: number): Promise<void> {
  await apiFetch<void>(`/subscriptions/${id}`, { method: 'DELETE' });
}

/**
 * POST /api/v1/subscriptions/{id}/post — записать подписку в actual_transaction
 * (kind=expense) и проставить subscription.posted_txn_id (PLAN-V10-04 «ПРОВЕСТИ»).
 *
 * 200 → SubscriptionPostResponse (txn_id + posted_at)
 * 409 → already posted (posted_txn_id != null)
 * 404 → subscription not found / cross-tenant
 */
export async function postSubscription(
  id: number,
): Promise<SubscriptionPostResponse> {
  const res = await apiFetch<SubscriptionPostResponse>(
    `/subscriptions/${id}/post`,
    { method: 'POST' },
  );
  // Posting inserts an actual_transaction → invalidate the tx-affected caches.
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  return res;
}

/**
 * POST /api/v1/subscriptions/{id}/unpost — откатить последнее post:
 * удаляет actual_transaction и обнуляет subscription.posted_txn_id
 * (PLAN-V10-04 «ОТМЕНА»).
 *
 * 204 → success
 * 404 → not posted / unknown / cross-tenant
 */
export async function unpostSubscription(id: number): Promise<void> {
  await apiFetch<void>(`/subscriptions/${id}/unpost`, { method: 'POST' });
  // Unposting deletes the actual_transaction → invalidate the same caches.
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
}
