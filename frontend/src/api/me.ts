// Phase 24-10 (ONB-V10-01): typed wrapper for GET /api/v1/me — v1.0 surface.
//
// Returns the v1.0 `MeV10Response` schema (see app/api/schemas/me_v10.py).
// The canonical TS interface lives in `api/types.ts` since Phase 22 (BE-01)
// — this module re-exports it so V10 consumers can `import { MeV10Response,
// getMeV10 } from '../api/me'` without crossing into the legacy types
// barrel.
//
// Trigger logic for OnboardingMount:
//   - me.onboarded_at == null → user has not yet completed v1.0 onboarding
//     (see DATA-MODEL §1.1; the atomic POST /onboarding/complete sets it).
//   - me.onboarded_at != null → onboarded; render Home placeholder.
//
// Why not check `income_cents == null && accounts == []` per CONTEXT D-10?
//   `MeV10Response` does NOT include `accounts`, and `/api/v1/accounts`
//   requires `require_onboarded` (Phase 22 BE-04) — fetching it before
//   onboarding completes returns 409. `onboarded_at` is the canonical
//   server-side signal and the only one available pre-completion.
//
// Phase 33 (CMP-33-04/06): compliance endpoints for consent / export /
// account deletion (see app/api/routes/me.py § ---- Phase 33 ----).

import { apiFetch } from './client';
import { getCached, invalidate, CACHE_KEYS } from './cache';
import type { MeV10Response } from './types';

export type { MeV10Response };

/**
 * GET /api/v1/me → MeV10Response.
 *
 * Throws `ApiError` on non-2xx. Throws `OnboardingRequiredError` only if
 * the server returns the 409 onboarding_required envelope (it doesn't on
 * /me — listed for completeness).
 *
 * Cached + deduped (perceived-speed): /me is read by the auth/onboarding
 * gate plus Plan / Management. The onboarding-complete POST invalidates the
 * `me` key (see api/onboardingV10.ts) so the gate never serves a stale
 * `onboarded_at: null` after the user just onboarded.
 */
export function getMeV10(): Promise<MeV10Response> {
  return getCached(CACHE_KEYS.me, () => apiFetch<MeV10Response>('/me'));
}

/**
 * PATCH /api/v1/me — set the owner's monthly income (`income_cents`).
 *
 * The only PATCHable field today (see app/api/routes/me.py / MePatchV10):
 * `income_cents` is bounded (0, 100M ₽] server-side (`gt=0`, `≤100_000_000_00`).
 * Pass cents; the caller converts rubles → cents.
 *
 * On success the returned `MeV10Response` carries the new `income_cents`. We
 * drop the `me` + `home` caches (mirrors api/settings.updateSettings) so the
 * auth/onboarding gate, Plan and Home re-read the fresh value instead of the
 * ≤30s-stale one — otherwise «Осталось распределить» would keep using the old
 * denominator after the user just set their income.
 */
export async function updateIncome(
  incomeCents: number,
): Promise<MeV10Response> {
  const res = await apiFetch<MeV10Response>('/me', {
    method: 'PATCH',
    body: JSON.stringify({ income_cents: incomeCents }),
  });
  invalidate(CACHE_KEYS.me);
  invalidate(CACHE_KEYS.home);
  return res;
}

// ---------- Phase 33: ПДн compliance helpers ----------

export interface ConsentResponse {
  pdn_consent_at: string | null;
  policy_version?: string;
  revoked?: boolean;
}

export interface DeleteAccountResponse {
  deleted_at: string;
  purge_after_days: number;
  message: string;
}

/**
 * POST /api/v1/me/consent — idempotent ПДн consent grant.
 *
 * On 200, the user's `app_user.pdn_consent_at` is set (timestamp returned).
 * Subsequent calls preserve the original timestamp (idempotency contract).
 */
export function grantConsent(): Promise<ConsentResponse> {
  return apiFetch<ConsentResponse>('/me/consent', { method: 'POST' });
}

/**
 * DELETE /api/v1/me/consent — revoke ПДн consent.
 *
 * Nulls `pdn_consent_at`. After revoke, attempts to call
 * /onboarding/complete return 403 `pdn_consent_required` until the user
 * grants again.
 */
export function revokeConsent(): Promise<ConsentResponse> {
  return apiFetch<ConsentResponse>('/me/consent', { method: 'DELETE' });
}

/**
 * GET /api/v1/me/export — JSON dump of all ПДн (CMP-33-06).
 *
 * Returns the full export payload — the client can offer "save as JSON"
 * via blob download. Audit-event `data_export` is written server-side.
 */
export function exportData(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/me/export');
}

/**
 * DELETE /api/v1/me/account — soft-delete with 30-day cooling (CMP-33-02).
 *
 * After 200, the worker job `purge_deleted_users` hard-deletes the user's
 * data after 30 days. Repeating the call returns 410 Gone.
 */
export function deleteAccount(): Promise<DeleteAccountResponse> {
  return apiFetch<DeleteAccountResponse>('/me/account', { method: 'DELETE' });
}
