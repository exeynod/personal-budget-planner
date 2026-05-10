// Phase 24-01: TypeScript shape for V10 onboarding draft state.
// Mirrors `OnboardingV10Body` from `app/api/schemas/onboarding_v10.py`
// verbatim on field names + casing — JSON written to localStorage and
// posted to `/onboarding/complete` is byte-identical to what Pydantic
// expects (extra="forbid" + strict).
//
// Snake_case is intentional: Python schema is the source of truth, and
// the wire layer must not silently camelCase. The `step` field is UI-only
// (step counter 1..5) and is stripped by `serialiseDraft` before POST.

export type AccountKind = 'card' | 'cash' | 'savings';

/** Step counter — 1..4 collect, 5 = Final summary. */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export interface OnboardingAccount {
  bank: string;
  /** Optional last-4 mask shown on Step 02 chip; ≤16 chars. */
  mask?: string | null;
  kind: AccountKind;
  balance_cents: number;
  primary: boolean;
}

export interface OnboardingGoal {
  name: string;
  target_cents: number;
  /** ISO yyyy-MM-dd; optional, must be strictly future when set. */
  due?: string | null;
}

export interface OnboardingSavingsConfig {
  roundup_enabled: boolean;
  /** Round-up base — Pydantic Literal[10, 50, 100]. */
  base: 10 | 50 | 100;
}

/**
 * Draft persisted to `localStorage['onboarding.v10.draft']`.
 *
 * `step` is local-only — `serialiseDraft` strips it before submit so the
 * server never sees it (extra="forbid" would 422 us otherwise).
 */
export interface OnboardingDraft {
  step: OnboardingStep;
  income_cents: number;
  accounts: OnboardingAccount[];
  category_plans: Record<string, number>;
  goal: OnboardingGoal | null;
  savings_config: OnboardingSavingsConfig | null;
}
