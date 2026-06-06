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
  | {
      type: 'ADD_ACCOUNT';
      payload: {
        bank: string;
        kind: OnboardingAccount['kind'];
        balance_cents: number;
        mask?: string | null;
      };
    }
  | { type: 'REMOVE_ACCOUNT'; payload: { index: number } }
  | { type: 'SET_PRIMARY'; payload: { index: number } }
  | { type: 'SET_PLAN'; payload: { code: string; cents: number } }
  | { type: 'SET_SAVINGS_CONFIG'; payload: OnboardingSavingsConfig }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'RESET' };

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

    case 'ADD_ACCOUNT': {
      const { bank, kind, balance_cents, mask } = action.payload;
      const isFirst = state.accounts.length === 0;
      const newAcct: OnboardingAccount = {
        bank,
        mask: mask ?? null,
        kind,
        balance_cents,
        primary: isFirst, // first account auto-promoted (D-04 / context.md Step 02)
      };
      return { ...state, accounts: [...state.accounts, newAcct] };
    }

    case 'REMOVE_ACCOUNT': {
      const { index } = action.payload;
      if (index < 0 || index >= state.accounts.length) return state;
      const wasPrimary = state.accounts[index].primary;
      const remaining = state.accounts.filter((_, i) => i !== index);
      if (
        wasPrimary &&
        remaining.length > 0 &&
        !remaining.some((a) => a.primary)
      ) {
        // Promote new accounts[0] when primary removed.
        remaining[0] = { ...remaining[0], primary: true };
      }
      return { ...state, accounts: remaining };
    }

    case 'SET_PRIMARY': {
      const { index } = action.payload;
      if (index < 0 || index >= state.accounts.length) return state;
      return {
        ...state,
        accounts: state.accounts.map((a, i) => ({
          ...a,
          primary: i === index,
        })),
      };
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
