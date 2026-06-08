// ADR-0007 — typed wrappers for the «регулярные платежи» surface.
//
// Recurring payments are a generalisation of subscriptions: «раз в N месяцев на
// заданное число». They share the `subscription` table + the public
// `/api/v1/subscriptions` routes, so the CRUD here lives next to subscriptions.ts.
// The recurring-specific routes (due / pay / skip / postpone / cashflow) hang off
// `/subscriptions/recurring/*` and are wrapped here.
//
// Endpoints (ADR-0007 «Exact API endpoints»):
//   GET    /subscriptions                              → SubscriptionV10Read[] (filter by category client-side)
//   POST   /subscriptions                              → SubscriptionV10Read   (interval_months = N)
//   PATCH  /subscriptions/{id}                          → SubscriptionV10Read
//   DELETE /subscriptions/{id}                          → 204                  (hard delete)
//   GET    /subscriptions/recurring/due                → RecurringDueRow[]     (today + overdue, active period)
//   POST   /subscriptions/recurring/{plannedId}/pay    → RecurringPayResponse  ({txn_id, planned_id})
//   POST   /subscriptions/recurring/{plannedId}/skip   → 204
//   POST   /subscriptions/recurring/{plannedId}/postpone → RecurringDueRow     (400 if out of period)
//   GET    /subscriptions/recurring/cashflow           → CashflowProjectionResponse
//
// All money is cents. Wire shapes come straight from the generated contract.

import { apiFetch } from '../client';
import { getCached, invalidate, CACHE_KEYS } from '../cache';
import type { components } from '../generated/schema';
import type { SubscriptionV10Read } from '../types';

export type { SubscriptionV10Read } from '../types';

// ─────────── Wire types (from the generated contract) ───────────

/** POST /subscriptions request body (recurring uses `interval_months`). */
export type RecurringCreatePayload = components['schemas']['SubscriptionCreate'];
/** PATCH /subscriptions/{id} request body (all optional, incl. interval_months). */
export type RecurringUpdatePayload = components['schemas']['SubscriptionUpdate'];
/** One due-today / overdue occurrence (the planned-row id is `id`). */
export type RecurringDueRow = components['schemas']['RecurringDueRow'];
export type RecurringPayRequest = components['schemas']['RecurringPayRequest'];
export type RecurringPayResponse = components['schemas']['RecurringPayResponse'];
export type RecurringPostponeRequest =
  components['schemas']['RecurringPostponeRequest'];
export type CashflowEvent = components['schemas']['CashflowEvent'];
export type CashflowProjectionResponse =
  components['schemas']['CashflowProjectionResponse'];

// ─────────── CRUD (recurring == subscription) ───────────

/**
 * GET /api/v1/subscriptions — list every recurring payment for the user.
 * Each item includes `interval_months`. Reuses the subscriptions cache key so a
 * mutation through either client refreshes both surfaces.
 */
export async function listRecurring(): Promise<SubscriptionV10Read[]> {
  return getCached(CACHE_KEYS.subscriptions, () =>
    apiFetch<SubscriptionV10Read[]>('/subscriptions'),
  );
}

/** Convenience: only this category's recurring payments (client-side filter). */
export async function listRecurringForCategory(
  categoryId: number,
): Promise<SubscriptionV10Read[]> {
  const all = await listRecurring();
  return all.filter((s) => s.category_id === categoryId);
}

/**
 * POST /api/v1/subscriptions — create a recurring payment.
 * `interval_months` (1..120) is the «раз в N мес» cadence; `next_charge_date`
 * (YYYY-MM-DD) anchors the running cursor; `day_of_month` (1..28) is optional.
 */
export async function createRecurring(
  payload: RecurringCreatePayload,
): Promise<SubscriptionV10Read> {
  const res = await apiFetch<SubscriptionV10Read>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // A new recurring may materialise a planned row into the active period.
  invalidate(CACHE_KEYS.subscriptions);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}

/** PATCH /api/v1/subscriptions/{id} — update a recurring payment. */
export async function updateRecurring(
  id: number,
  payload: RecurringUpdatePayload,
): Promise<SubscriptionV10Read> {
  const res = await apiFetch<SubscriptionV10Read>(`/subscriptions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  invalidate(CACHE_KEYS.subscriptions);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}

/** DELETE /api/v1/subscriptions/{id} — hard delete. 204 → success. */
export async function deleteRecurring(id: number): Promise<void> {
  await apiFetch<void>(`/subscriptions/${id}`, { method: 'DELETE' });
  invalidate(CACHE_KEYS.subscriptions);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
}

// ─────────── Due-today / overdue prompt (home card) ───────────

/**
 * GET /api/v1/subscriptions/recurring/due — occurrences due today or overdue
 * for the active period. Each row's `id` is the PLANNED-row id (the target of
 * pay / skip / postpone). Not cached — the home card wants a live read.
 */
export async function listRecurringDue(): Promise<RecurringDueRow[]> {
  return apiFetch<RecurringDueRow[]>('/subscriptions/recurring/due');
}

/** Invalidate the tx-affected caches after a recurring occurrence is posted. */
function invalidateAfterPay(): void {
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.subscriptions);
  invalidate(CACHE_KEYS.periods);
  invalidate(CACHE_KEYS.currentPeriod);
  invalidate(CACHE_KEYS.home);
}

/**
 * POST /api/v1/subscriptions/recurring/{plannedId}/pay — «Оплачено».
 * Posts the occurrence into a real actual_transaction. `tx_date` defaults to the
 * planned date server-side; `amount_cents` (>0) overrides the planned amount.
 *
 * 200 → {txn_id, planned_id} · 409 → already paid · 404 → not found.
 */
export async function payRecurring(
  plannedId: number,
  body: RecurringPayRequest = {},
): Promise<RecurringPayResponse> {
  const res = await apiFetch<RecurringPayResponse>(
    `/subscriptions/recurring/${plannedId}/pay`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  invalidateAfterPay();
  return res;
}

/**
 * POST /api/v1/subscriptions/recurring/{plannedId}/skip — «Пропустить».
 * Removes the occurrence (no fact recorded). 204 → success.
 */
export async function skipRecurring(plannedId: number): Promise<void> {
  await apiFetch<void>(`/subscriptions/recurring/${plannedId}/skip`, {
    method: 'POST',
  });
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
}

/**
 * POST /api/v1/subscriptions/recurring/{plannedId}/postpone — «Перенести».
 * Shifts `planned_date` to `newDate` (YYYY-MM-DD) within the CURRENT period.
 *
 * 200 → updated row · 400 → new_date out of period · 404 → not found.
 */
export async function postponeRecurring(
  plannedId: number,
  newDate: string,
): Promise<RecurringDueRow> {
  const res = await apiFetch<RecurringDueRow>(
    `/subscriptions/recurring/${plannedId}/postpone`,
    { method: 'POST', body: JSON.stringify({ new_date: newDate }) },
  );
  invalidate(CACHE_KEYS.plannedPrefix);
  invalidate(CACHE_KEYS.home);
  return res;
}

// ─────────── Cashflow projection (dedicated screen) ───────────

/**
 * GET /api/v1/subscriptions/recurring/cashflow — projection over `horizonDays`
 * (default 90). Returns the timeline of upcoming charges with running balance
 * and the monthly burden. Not cached — the screen wants a live read.
 */
export async function getRecurringCashflow(
  horizonDays = 90,
): Promise<CashflowProjectionResponse> {
  return apiFetch<CashflowProjectionResponse>(
    `/subscriptions/recurring/cashflow?horizon_days=${horizonDays}`,
  );
}
