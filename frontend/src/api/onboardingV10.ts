// Phase 24-01: typed wrapper for POST /api/v1/onboarding/complete (BE-15).
//
// Wire shape mirrors `app/api/schemas/onboarding_v10.py:OnboardingV10Body`
// verbatim. The server enforces `extra="forbid"` + strict on every nested
// model, so we MUST emit exactly the field set listed there — no `step`
// (UI-only), no camelCase keys.
//
// The `serialiseDraft` helper is the single chokepoint converting the
// localStorage draft into the wire body. Tests assert it strips `step`.
//
// v1.1 (AGREED §G1): накопления/цели выпилены — the backend
// `OnboardingV10Body` no longer accepts `goal` (extra="forbid"), so the
// wire body carries exactly {income_cents, accounts, category_plans}
// (+ optional savings_config, which the poster flow never sets).

import { apiFetch } from './client';
import { clearCache } from './cache';
import type {
  OnboardingDraft,
  OnboardingAccount,
} from '../screensV10/Onboarding/types';

export interface OnboardingV10AccountWire {
  bank: string;
  mask?: string | null;
  kind: 'card' | 'cash' | 'savings';
  balance_cents: number;
  primary: boolean;
}

export interface OnboardingV10SavingsConfigWire {
  roundup_enabled: boolean;
  base: 10 | 50 | 100;
}

/**
 * Request body for POST /api/v1/onboarding/complete.
 *
 * The optional `savings_config` key MUST be omitted entirely when not set
 * — server uses Optional with default None, but extra="forbid" does not
 * punish missing keys. We omit when null to keep payloads small +
 * diagnostic. The poster flow never sets it, so the body is effectively
 * {income_cents, accounts, category_plans}.
 */
export interface OnboardingV10Body {
  income_cents: number;
  accounts: OnboardingV10AccountWire[];
  category_plans: Record<string, number>;
  savings_config?: OnboardingV10SavingsConfigWire | null;
}

/** Mirrors backend `OnboardingV10Response` (v1.1 — savings/goal removed). */
export interface OnboardingV10Response {
  user_id: number;
  income_cents: number;
  account_ids: number[];
  category_ids_by_code: Record<string, number>;
  // v1.1: adjustment system category id (replaces savings_category_id).
  adjustment_category_id: number;
  onboarded_at: string; // ISO-8601
}

/**
 * Convert local draft → wire body. Strips UI-only `step`; omits the
 * `savings_config` key when null so server logs don't show meaningless
 * `null`-only fields.
 */
export function serialiseDraft(draft: OnboardingDraft): OnboardingV10Body {
  const accounts: OnboardingV10AccountWire[] = draft.accounts.map(
    (a: OnboardingAccount) => {
      const wire: OnboardingV10AccountWire = {
        bank: a.bank,
        kind: a.kind,
        balance_cents: a.balance_cents,
        primary: a.primary,
      };
      if (a.mask !== undefined && a.mask !== null) {
        wire.mask = a.mask;
      }
      return wire;
    },
  );

  const body: OnboardingV10Body = {
    income_cents: draft.income_cents,
    accounts,
    category_plans: { ...draft.category_plans },
  };

  if (draft.savings_config !== null) {
    body.savings_config = {
      roundup_enabled: draft.savings_config.roundup_enabled,
      base: draft.savings_config.base,
    };
  }

  return body;
}

/**
 * POST /api/v1/onboarding/complete — atomic onboarding submit (BE-15).
 *
 * Throws `ApiError` (status 409 → already onboarded; 422 → validation).
 * Caller is responsible for clearing the draft on success.
 */
export async function postOnboardingComplete(
  body: OnboardingV10Body,
): Promise<OnboardingV10Response> {
  const res = await apiFetch<OnboardingV10Response>('/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // Onboarding seeds the user's entire dataset server-side (accounts /
  // categories / period / savings) and flips `onboarded_at`. Clear the whole
  // client cache so the first post-onboarding reads (and the /me gate) fetch
  // the freshly-seeded state rather than any pre-onboarding empties.
  clearCache();
  return res;
}
