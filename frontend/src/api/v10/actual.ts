/**
 * Phase 25-03 — typed wrapper for the v1.0 actual surface.
 *
 * Backed by Phase 25-01's extended `POST /api/v1/actual` (account_id-presence
 * dispatch) and `ActualRead` (4-valued kind + account_id + parent_txn_id).
 *
 * Legacy v0.x callers should keep using `frontend/src/api/actual.ts`
 * (CategoryKind 2-valued); v1.0 UI plans (Home, Transactions, AddSheet)
 * import from this module.
 *
 * Threat mitigation (T-25-03-01): `createActualV10` runtime-guards
 * `amount_cents > 0` before the fetch — defends against typed `number`
 * accepting negative / zero literals through caller bugs.
 */
import { apiFetch } from '../client';
import { getCached, invalidate, CACHE_KEYS } from '../cache';
import type { ActualV10Read, ActualV10CreatePayload } from '../types';

export type {
  ActualV10Read,
  ActualV10CreatePayload,
  ActualV10Kind,
} from '../types';

/**
 * GET /api/v1/periods/{periodId}/actual
 *
 * Returns ALL actual transactions for the period — including roundup /
 * deposit kinds (Phase 25-01 schema extension). Use the `kind` filter
 * to narrow at the server level when only one kind is needed.
 */
export async function listActualV10(
  periodId: number,
  filters?: {
    kind?: 'expense' | 'income' | 'roundup' | 'deposit';
    category_id?: number;
  },
): Promise<ActualV10Read[]> {
  const qs = new URLSearchParams();
  if (filters?.kind) qs.set('kind', filters.kind);
  if (filters?.category_id !== undefined) {
    qs.set('category_id', String(filters.category_id));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  // Only the unfiltered per-period read (the hot cross-screen path: Home,
  // Transactions, CategoryDetail, AccountDetail, Plan, Analytics) is cached.
  // Filtered reads bypass the cache to avoid key explosion — they are rare.
  if (!filters) {
    return getCached(CACHE_KEYS.actuals(periodId), () =>
      apiFetch<ActualV10Read[]>(`/periods/${periodId}/actual${suffix}`),
    );
  }
  return apiFetch<ActualV10Read[]>(`/periods/${periodId}/actual${suffix}`);
}

/**
 * POST /api/v1/actual
 *
 * Pass `account_id` in the payload to trigger the v1.0 path
 * (`create_actual_v10` — delta-balance + roundup hook). Omit it for
 * the legacy `create_actual` path. Both produce an `ActualV10Read` in
 * the response since Phase 25-01 unified the schema.
 *
 * Runtime guard: rejects non-positive `amount_cents` before the fetch
 * (T-25-03-01). The server independently enforces `gt=0` (Pydantic
 * `ActualCreate.amount_cents`) — this is defence-in-depth against
 * caller bugs (e.g. passing a UI-side signed delta by mistake).
 */
export async function createActualV10(
  payload: ActualV10CreatePayload,
): Promise<ActualV10Read> {
  if (payload.amount_cents <= 0) {
    throw new Error('createActualV10: amount_cents must be positive');
  }
  const created = await apiFetch<ActualV10Read>('/actual', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // A new fact changes period actuals + balances; an account_id-bound fact
  // also moves the account balance (delta-balance hook). Invalidate all three
  // families so the next read never serves a stale list / balance.
  invalidate(CACHE_KEYS.actualsPrefix);
  invalidate(CACHE_KEYS.balancePrefix);
  invalidate(CACHE_KEYS.accounts);
  return created;
}
