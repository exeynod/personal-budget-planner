// Phase 24-06: Step 03 view — «Распредели {income} ₽» plan distribution.
//
// Renders 8 PosterSlider components (one per default category from
// `defaultCategories.ts`). Each slider:
//   - step = 50_000 cents (= 500 ₽)
//   - max  = max(60_000 ₽, 60% of income) — DATA-MODEL §1.3
//   - initial value = floor(income_cents * share / 50_000) * 50_000
//     (defensive — reducer's SET_INCOME default-allocation already populated
//     `category_plans`, but this guards against stale states post-back-edit
//     and keeps the row pinned to a tick when reducer never ran.)
//
// Every slider onChange dispatches SET_PLAN { code, cents } — the reducer
// is the single source of truth, no local input state to drift.
//
// Bottom counter is computed by `computePlanFooter` (pure helper, exported
// for unit tests) and rendered by OnboardingFlow as the chrome's `hint`.
//
// Trust: SET_PLAN ignores codes outside VALID_CATEGORY_CODES at the
// reducer layer (T-24-06-02); rendering iterates DEFAULT_CATEGORIES so
// only whitelisted codes ever reach dispatch.

import type { Dispatch } from 'react';
import { Eyebrow, Mass, PosterSlider } from '../../componentsV10';
import type { OnboardingAction } from './onboardingReducer';
import {
  DEFAULT_CATEGORIES,
  PLAN_STEP_CENTS,
} from './defaultCategories';
import { formatRubles } from './format';
import styles from './Step03Plan.module.css';

/** Min slider headroom in cents = 60_000 ₽. */
const SLIDER_MIN_MAX_CENTS = 60_000_00;

/** Slider max = max(60_000 ₽, round(income * 0.60)). */
function sliderMaxFor(incomeCents: number): number {
  return Math.max(SLIDER_MIN_MAX_CENTS, Math.round(incomeCents * 0.6));
}

/** Floor-to-step initial value for a category. */
function defaultValueFor(incomeCents: number, share: number): number {
  return Math.floor((incomeCents * share) / PLAN_STEP_CENTS) * PLAN_STEP_CENTS;
}

export interface ComputePlanFooterResult {
  /** Hint text rendered as OnboardingChrome `hint`. */
  hint: string;
  /** Tone for chrome — overflow turns the hint red. */
  tone: 'normal' | 'overflow';
  /** True when Σplan > income — NEXT button must be disabled. */
  nextDisabled: boolean;
}

/**
 * Pure helper for the Step 03 footer. Computes left = income − Σplan and
 * derives the user-facing hint + tone + nextDisabled gate.
 *
 * Rules (D-06):
 *   - left == 0 → 'всё распределено' / normal / enabled
 *   - left  > 0 → 'остаётся X ₽ → накопления' / normal / enabled
 *   - left  < 0 → 'превышение X ₽' / overflow / disabled
 */
export function computePlanFooter(
  incomeCents: number,
  categoryPlans: Record<string, number>,
): ComputePlanFooterResult {
  const sum = Object.values(categoryPlans).reduce((s, v) => s + v, 0);
  const left = incomeCents - sum;
  if (left === 0) {
    return { hint: 'всё распределено', tone: 'normal', nextDisabled: false };
  }
  if (left > 0) {
    return {
      hint: `остаётся ${formatRubles(left)} ₽ → накопления`,
      tone: 'normal',
      nextDisabled: false,
    };
  }
  return {
    hint: `превышение ${formatRubles(-left)} ₽`,
    tone: 'overflow',
    nextDisabled: true,
  };
}

export interface Step03PlanProps {
  /** Current income in cents — drives headline + slider max + default values. */
  incomeCents: number;
  /** Reducer-owned per-category plan map ({ code → cents }). */
  categoryPlans: Record<string, number>;
  /** Reducer dispatch from OnboardingFlow. */
  dispatch: Dispatch<OnboardingAction>;
}

export function Step03Plan({
  incomeCents,
  categoryPlans,
  dispatch,
}: Step03PlanProps) {
  const max = sliderMaxFor(incomeCents);

  return (
    <div className={styles.step}>
      <div className={styles.headline}>
        <Mass italic size={32}>
          Распредели
          <br />
          {`${formatRubles(incomeCents)} ₽`}
        </Mass>
      </div>

      <div className={styles.subEyebrow}>
        <Eyebrow opacity={0.55}>СДВИГАЙ ПОЛЗУНКИ ПО КАТЕГОРИЯМ</Eyebrow>
      </div>

      <div className={styles.list} aria-label="Категории плана">
        {DEFAULT_CATEGORIES.map((c) => {
          const fallback = defaultValueFor(incomeCents, c.share);
          const current = categoryPlans[c.code] ?? fallback;
          return (
            <div key={c.code} className={styles.row}>
              <div className={styles.rowHeader}>
                <span className={styles.ord}>{c.ord}</span>
                <span className={styles.name}>{c.name}</span>
                <span className={styles.value}>{`${formatRubles(current)} ₽`}</span>
              </div>
              <PosterSlider
                value={current}
                min={0}
                max={max}
                step={PLAN_STEP_CENTS}
                onChange={(v) =>
                  dispatch({
                    type: 'SET_PLAN',
                    payload: { code: c.code, cents: v },
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
