// Phase 24-02: Root component for V10 3-step onboarding.
//
// Owns the `useReducer(onboardingReducer)` state machine and persistence
// glue (`useOnboardingDraft.save` on every state change). Rehydrates from
// localStorage on initial mount via the `useReducer` lazy initialiser, so
// returning users land on the step they left off — without a flash of the
// initial state.
//
// Each step number renders its own dedicated component inside a single
// `<OnboardingChrome>`: 1 = Income, 2 = Accounts, 3 = Plan. Step 4 is the
// <Final> summary which renders without chrome.
//
// v1.1 (AGREED §G1): the «ЦЕЛЬ»/goal step (накопления) was removed — the
// poster flow is now 3 collect-steps + Final.

import { useEffect, useReducer, useRef } from 'react';
import { onboardingReducer, INITIAL_STATE } from './onboardingReducer';
import type { OnboardingAction } from './onboardingReducer';
import { useOnboardingDraft } from './useOnboardingDraft';
import type { UseOnboardingDraftHook } from './useOnboardingDraft';
import { OnboardingChrome } from './OnboardingChrome';
import { Step01Income } from './Step01Income';
import { Step02Accounts } from './Step02Accounts';
import { Step03Plan, computePlanFooter } from './Step03Plan';
import { Final } from './Final';
import type { OnboardingDraft } from './types';
import type { OnboardingV10Response } from '../../api/onboardingV10';
import styles from './OnboardingFlow.module.css';

/** Eyebrow text for steps 1..3. Step 4 (Final) draws its own headline. */
const STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: 'ШАГ 01 / 03 · ДОХОД',
  2: 'ШАГ 02 / 03 · СЧЕТА',
  3: 'ШАГ 03 / 03 · ПЛАН',
};

// Re-export so existing callers `import { OnboardingV10Response } from
// '.../OnboardingFlow'` keep compiling — canonical source of truth lives
// next to the API wrapper now (`api/onboardingV10.ts`).
export type { OnboardingV10Response };

export interface OnboardingFlowProps {
  /**
   * Called when:
   *   - 200 OK from POST /onboarding/complete (response forwarded), OR
   *   - 409 conflict (response = null; draft cleared, toast shown first).
   * 422 / network errors do NOT call onComplete — Final keeps the user
   * on screen so they can retry.
   */
  onComplete: (response: OnboardingV10Response | null) => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  // `useOnboardingDraft` returns a fresh object every call. Pin it in a
  // ref so `useEffect` below can persist without re-subscribing every
  // render (the closure identity isn't load-bearing — only `.save` calls
  // matter).
  const draft = useOnboardingDraft();
  const draftRef = useRef<UseOnboardingDraftHook>(draft);
  draftRef.current = draft;

  const [state, dispatch] = useReducer(
    onboardingReducer,
    INITIAL_STATE,
    (initial): OnboardingDraft => draftRef.current.load() ?? initial,
  );

  // Persist on every state change.
  useEffect(() => {
    draftRef.current.save(state);
  }, [state]);

  const isFinal = state.step === 4;
  const label = isFinal ? '' : STEP_LABELS[state.step as 1 | 2 | 3];

  const onBack =
    state.step > 1
      ? () => dispatch({ type: 'BACK' } satisfies OnboardingAction)
      : undefined;

  // NEXT advances the reducer; Step 03 → Final (step 4) is the last hop
  // before the submit handler in <Final>.
  const onNext = !isFinal
    ? () => dispatch({ type: 'NEXT' } satisfies OnboardingAction)
    : undefined;

  // Step 03 footer (hint + tone + nextDisabled) — pure helper.
  const step03Footer =
    state.step === 3
      ? computePlanFooter(state.income_cents, state.category_plans)
      : null;

  // NEXT-disabled rules: per-step gates.
  const nextDisabled = (() => {
    if (isFinal) return true;
    if (state.step === 1) return state.income_cents <= 0;
    if (state.step === 2) return state.accounts.length === 0;
    if (state.step === 3) return step03Footer?.nextDisabled ?? true;
    return true;
  })();

  // Step 01 explicitly hides the back arrow (no previous screen).
  // Other steps allow back-stepping.
  const step01Back = undefined;

  // Hint per step:
  //  - step 2 → static «можно изменить позже» (§G2: single implicit balance)
  //  - step 3 → live plan-vs-income counter (computePlanFooter)
  const hint =
    state.step === 2
      ? 'это можно изменить позже'
      : state.step === 3
        ? step03Footer?.hint
        : undefined;
  const hintTone: 'normal' | 'overflow' =
    state.step === 3 ? (step03Footer?.tone ?? 'normal') : 'normal';

  const renderStepBody = () => {
    if (state.step === 1) {
      return (
        <Step01Income incomeCents={state.income_cents} dispatch={dispatch} />
      );
    }
    if (state.step === 2) {
      return (
        <Step02Accounts
          balanceCents={state.accounts[0]?.balance_cents ?? 0}
          hasAccount={state.accounts.length > 0}
          dispatch={dispatch}
        />
      );
    }
    return (
      <Step03Plan
        incomeCents={state.income_cents}
        categoryPlans={state.category_plans}
        dispatch={dispatch}
      />
    );
  };

  // Step 4 (Final) renders without OnboardingChrome — it owns its own
  // hero/plate/CTA layout per plan 24-08 §case 5.
  if (isFinal) {
    return (
      <div className={styles.flow}>
        <Final state={state} onComplete={onComplete} />
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <OnboardingChrome
        step={state.step}
        total={3}
        label={label}
        onBack={state.step === 1 ? step01Back : onBack}
        onNext={onNext}
        nextDisabled={nextDisabled}
        hint={hint}
        hintTone={hintTone}
      >
        {renderStepBody()}
      </OnboardingChrome>
    </div>
  );
}
