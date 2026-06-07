// Phase 24-01: useReducer state machine for V10 onboarding flow.
// Pure / referentially-transparent — every reachable state is testable
// without mounting React. The hook layer (useOnboardingDraft) handles
// persistence; this module owns transitions only.

import {
  defaultPlanFromIncome,
  PLAN_STEP_CENTS,
  VALID_CATEGORY_CODES,
  type DefaultCategoryCode,
} from './defaultCategories';
import type {
  OnboardingAccount,
  OnboardingDraft,
  OnboardingSavingsConfig,
  OnboardingStep,
} from './types';

export type OnboardingAction =
  | { type: 'SET_INCOME'; payload: { income_cents: number } }
  // v1.1 (AGREED §G2): «счета» concept hidden — onboarding collects a single
  // implicit primary balance. The poster Step 02 dispatches this on every
  // keystroke; the reducer keeps the `accounts` array shape (exactly one
  // primary card account) so Final/serialiseDraft/sanitiser stay unchanged.
  | { type: 'SET_STARTING_BALANCE'; payload: { balance_cents: number } }
  | { type: 'SET_PLAN'; payload: { code: string; cents: number } }
  | { type: 'SET_SAVINGS_CONFIG'; payload: OnboardingSavingsConfig }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'RESET' };

/**
 * Default bank label for the single implicit account (§G2). Mirrors
 * NativeOnboardingFlow verbatim so the poster + native flows seed an
 * identical primary account on the wire.
 */
const PRIMARY_ACCOUNT_BANK = 'Счёт';

export const INITIAL_STATE: OnboardingDraft = Object.freeze({
  step: 1,
  income_cents: 0,
  accounts: [],
  category_plans: {},
  savings_config: null,
}) as OnboardingDraft;

const MIN_STEP: OnboardingStep = 1;
const MAX_STEP: OnboardingStep = 4;

function clampStep(step: number): OnboardingStep {
  if (step < MIN_STEP) return MIN_STEP;
  if (step > MAX_STEP) return MAX_STEP;
  return step as OnboardingStep;
}

function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

export function onboardingReducer(
  state: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'SET_INCOME': {
      const incomeCents = clampNonNegative(action.payload.income_cents);
      const planEmpty = Object.keys(state.category_plans).length === 0;
      // D-06: auto-allocate default shares on first income entry, but
      // do NOT clobber subsequent user edits — even on income re-edit.
      const nextPlan = planEmpty
        ? defaultPlanFromIncome(incomeCents)
        : state.category_plans;
      return {
        ...state,
        income_cents: incomeCents,
        category_plans: nextPlan,
      };
    }

    case 'SET_STARTING_BALANCE': {
      // §G2: single implicit primary account. Always materialise exactly one
      // primary card account named «Счёт» with the entered balance (0 /
      // negative «долг» allowed — server caps at ±100M ₽). Replaces any prior
      // accounts so the array is always length-1.
      const balanceCents = Number.isFinite(action.payload.balance_cents)
        ? action.payload.balance_cents
        : 0;
      const account: OnboardingAccount = {
        bank: PRIMARY_ACCOUNT_BANK,
        mask: null,
        kind: 'card',
        balance_cents: balanceCents,
        primary: true,
      };
      return { ...state, accounts: [account] };
    }

    case 'SET_PLAN': {
      const { code, cents } = action.payload;
      // Whitelist guard — Set#has typed for our 8 codes.
      if (!VALID_CATEGORY_CODES.has(code as DefaultCategoryCode)) {
        return state;
      }
      const cleaned = clampNonNegative(Math.floor(cents / 1)); // explicit int
      // Snap to PLAN_STEP_CENTS only when caller already on tick;
      // tests assert exact-cents semantics, so do not silently round here
      // (UI emits ticks already). Just clamp ≥0.
      void PLAN_STEP_CENTS;
      return {
        ...state,
        category_plans: { ...state.category_plans, [code]: cleaned },
      };
    }

    case 'SET_SAVINGS_CONFIG':
      return { ...state, savings_config: { ...action.payload } };

    case 'NEXT':
      return { ...state, step: clampStep(state.step + 1) };

    case 'BACK':
      return { ...state, step: clampStep(state.step - 1) };

    case 'RESET':
      // Return a fresh non-frozen copy — tests assert deep-equality on
      // INITIAL_STATE which is frozen. Spreading creates a writable clone.
      return {
        step: 1,
        income_cents: 0,
        accounts: [],
        category_plans: {},
        savings_config: null,
      };

    default:
      return state;
  }
}
