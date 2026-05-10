// Phase 24-02: Root component for V10 4-step onboarding.
//
// Owns the `useReducer(onboardingReducer)` state machine and persistence
// glue (`useOnboardingDraft.save` on every state change). Rehydrates from
// localStorage on initial mount via the `useReducer` lazy initialiser, so
// returning users land on the step they left off — without a flash of the
// initial state.
//
// Each step number renders its own dedicated component inside a single
// `<OnboardingChrome>`. For Phase 24-02 only Step 01 has a real impl;
// steps 02..05 use `<PlaceholderStep>` and will be filled in by plans
// 24-04 / 24-06 / 24-08.

import { useEffect, useReducer, useRef } from 'react';
import { onboardingReducer, INITIAL_STATE } from './onboardingReducer';
import type { OnboardingAction } from './onboardingReducer';
import { useOnboardingDraft } from './useOnboardingDraft';
import type { UseOnboardingDraftHook } from './useOnboardingDraft';
import { OnboardingChrome } from './OnboardingChrome';
import type { OnboardingDraft, OnboardingStep } from './types';
import styles from './OnboardingFlow.module.css';

/** Eyebrow text for steps 1..4. Step 5 (Final) draws its own headline. */
const STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'ШАГ 01 / 04 · ДОХОД',
  2: 'ШАГ 02 / 04 · СЧЕТА',
  3: 'ШАГ 03 / 04 · ПЛАН',
  4: 'ШАГ 04 / 04 · ЦЕЛЬ',
};

/**
 * Server response shape for `POST /onboarding/complete` 200 OK. Mirrors
 * `OnboardingV10Result` from the BE schema. Plan 24-08 wires the actual
 * call; here we just type the prop.
 */
export interface OnboardingV10Response {
  user_id: number;
  income_cents: number;
  account_count: number;
  category_count: number;
  goal_id?: number | null;
  onboarded_at: string;
}

export interface OnboardingFlowProps {
  /** Called when reducer reaches step=5 AND submit returns 200 (plan 24-08). */
  onComplete: (response: OnboardingV10Response) => void;
}

interface PlaceholderStepProps {
  step: OnboardingStep;
}

function PlaceholderStep({ step }: PlaceholderStepProps) {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderText}>
        Step {step} — coming next plan
      </span>
    </div>
  );
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

  // Wire the onComplete callback so the prop is "used" in this plan; the
  // real submit lives in plan 24-08, which will fire it from the Final
  // step button. For now: no-op reference.
  void onComplete;

  const isFinal = state.step === 5;
  const label = isFinal ? '' : STEP_LABELS[state.step];

  const onBack =
    state.step > 1
      ? () => dispatch({ type: 'BACK' } satisfies OnboardingAction)
      : undefined;

  // For now, NEXT advances the reducer; plan 24-08 swaps Step 04→Final
  // for the actual submit handler.
  const onNext = !isFinal
    ? () => dispatch({ type: 'NEXT' } satisfies OnboardingAction)
    : undefined;

  // NEXT-disabled rules for this plan: only step 1 has a real gate.
  // Other steps stay disabled until their plan ships, to avoid skipping
  // through placeholder screens with empty state.
  const nextDisabled = (() => {
    if (isFinal) return true;
    if (state.step === 1) return state.income_cents <= 0;
    // Steps 2..4 have placeholder bodies in this plan — keep CTA muted
    // so we cannot accidentally advance into a half-built screen.
    return true;
  })();

  return (
    <div className={styles.flow}>
      <OnboardingChrome
        step={state.step}
        label={label}
        onBack={onBack}
        onNext={onNext}
        nextDisabled={nextDisabled}
      >
        <PlaceholderStep step={state.step} />
      </OnboardingChrome>
    </div>
  );
}
