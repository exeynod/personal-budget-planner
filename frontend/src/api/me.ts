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

import { apiFetch } from './client';
import type { MeV10Response } from './types';

export type { MeV10Response };

/**
 * GET /api/v1/me → MeV10Response.
 *
 * Throws `ApiError` on non-2xx. Throws `OnboardingRequiredError` only if
 * the server returns the 409 onboarding_required envelope (it doesn't on
 * /me — listed for completeness).
 */
export function getMeV10(): Promise<MeV10Response> {
  return apiFetch<MeV10Response>('/me');
}
