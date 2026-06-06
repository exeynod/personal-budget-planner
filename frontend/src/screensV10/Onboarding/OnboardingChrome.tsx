// Phase 24-02: Reusable poster-style scaffold for the 3 onboarding steps + Final.
// Locks the visual contract every step consumes:
//   - header row (back arrow, eyebrow, optional skip)
//   - body slot (children, flex:1)
//   - footer (optional hint, 3-dot progress, NEXT CTA)
//
// Hidden chrome on the Final step (step=4) — Final has its own CTA layout
// (plan 24-08). v1.1 (AGREED §G1): the «ЦЕЛЬ»/goal step was removed.
// Disabled back-arrow renders muted (opacity 0.25) when `onBack` undefined,
// matching prototype Step 01 where there is no previous step.

import type { ReactNode } from 'react';
import { Eyebrow } from '../../componentsV10';
import styles from './OnboardingChrome.module.css';
import type { OnboardingStep } from './types';

export interface OnboardingChromeProps {
  /** Current step 1..4 — controls dot fill and CTA visibility. */
  step: OnboardingStep;
  /** Total dots; default 3 (steps 01..03). */
  total?: number;
  /** Eyebrow label, e.g. «ШАГ 01 / 03 · ДОХОД». */
  label: string;
  /** Back handler — when undefined the arrow renders disabled/muted. */
  onBack?: () => void;
  /** Skip handler — when undefined the link is hidden. */
  onSkip?: () => void;
  /** Next handler — gated by `nextDisabled`. */
  onNext?: () => void;
  /** CTA label; default «ДАЛЕЕ →». */
  nextLabel?: string;
  /** Disables CTA visually + suppresses onNext + sets aria-disabled. */
  nextDisabled?: boolean;
  /** Optional small hint above the dots (e.g. «можно пропустить»). */
  hint?: string;
  /**
   * Tone for `hint` — 'normal' (default) renders muted paper text;
   * 'overflow' renders red (var(--poster-red)) for Step 03 sum-overflow
   * warning. Phase 24-06 introduces this; older callers default to 'normal'.
   */
  hintTone?: 'normal' | 'overflow';
  /** Body content — fills flex:1 between header and footer. */
  children: ReactNode;
}

const FALLBACK_NEXT_LABEL = 'ДАЛЕЕ →';

export function OnboardingChrome({
  step,
  total = 3,
  label,
  onBack,
  onSkip,
  onNext,
  nextLabel = FALLBACK_NEXT_LABEL,
  nextDisabled = false,
  hint,
  hintTone = 'normal',
  children,
}: OnboardingChromeProps) {
  const isFinal = step === 4;
  const showCta = !isFinal;
  const showDots = !isFinal;

  const handleNext = () => {
    if (nextDisabled) return;
    onNext?.();
  };

  return (
    <div className={styles.chrome}>
      <div className={styles.header}>
        <button
          type="button"
          className={`${styles.backArrow}${
            onBack ? '' : ' ' + styles.backArrowDisabled
          }`}
          onClick={onBack}
          disabled={!onBack}
          aria-label="Назад"
        >
          {'←'}
        </button>
        <Eyebrow className={styles.headerLabel}>{label}</Eyebrow>
        {onSkip ? (
          <button
            type="button"
            className={styles.skipBtn}
            onClick={onSkip}
            aria-label="Пропустить"
          >
            ПРОПУСТИТЬ
          </button>
        ) : (
          <span className={styles.skipPlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>{children}</div>

      <div className={styles.footer}>
        {hint ? (
          <div
            className={`${styles.hint}${
              hintTone === 'overflow' ? ' ' + styles.hintOverflow : ''
            }`}
          >
            {hint}
          </div>
        ) : null}

        {showDots ? (
          <div
            className={styles.dots}
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step}
            aria-label={`Шаг ${step} из ${total}`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`${styles.dot}${
                  i < step ? ' ' + styles.dotActive : ''
                }`}
              />
            ))}
          </div>
        ) : null}

        {showCta ? (
          <button
            type="button"
            className={`${styles.cta}${
              nextDisabled ? ' ' + styles.ctaDisabled : ''
            }`}
            onClick={handleNext}
            disabled={nextDisabled}
            aria-disabled={nextDisabled}
          >
            {nextLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
