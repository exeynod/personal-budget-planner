// Phase 24-08: Step 04 view — «Зачем копишь?» goal capture (optional).
//
// Owns the visual: DM Serif italic name input + Archivo Black amount field
// with ₽ suffix + optional HTML5 date picker. Skip-path is wired by the
// chrome (`onSkip` prop) — Step04Goal itself only emits SET_GOAL.
//
// Per CONTEXT D-07 the prototype's preset chips were dropped — manual
// input only. Server constraints (mirrored here):
//   - name 1..80
//   - target_cents > 0
//   - due strict > today (Europe/Moscow); ISO yyyy-MM-dd
// Client validation is advisory; server is authoritative.

import type { Dispatch } from 'react';
import { Eyebrow, Mass } from '../../componentsV10';
import type { OnboardingAction } from './onboardingReducer';
import type { OnboardingGoal } from './types';
import { formatRubles, parseIncomeInputToCents } from './format';
import styles from './Step04Goal.module.css';

export interface Step04GoalProps {
  /** Current goal — null when user hasn't entered anything yet. */
  goal: OnboardingGoal | null;
  /** Reducer dispatch from OnboardingFlow. */
  dispatch: Dispatch<OnboardingAction>;
}

/**
 * Predicate guarding NEXT button + Final summary correctness.
 *
 * Rules:
 *   - null goal → invalid (skip-path takes a different code-route)
 *   - empty / whitespace name → invalid (server enforces min_length=1)
 *   - target_cents ≤ 0 → invalid (server enforces > 0)
 *   - due is optional and not validated here (HTML5 + server checks)
 */
export function isGoalValid(goal: OnboardingGoal | null): boolean {
  if (goal === null) return false;
  if (typeof goal.name !== 'string' || goal.name.trim().length === 0) {
    return false;
  }
  if (
    typeof goal.target_cents !== 'number' ||
    !Number.isFinite(goal.target_cents) ||
    goal.target_cents <= 0
  ) {
    return false;
  }
  return true;
}

/**
 * Local-day +1 in ISO `yyyy-MM-dd` form. Used as the `min` attribute on
 * the optional due-date input — small TZ skew vs server (Europe/Moscow)
 * is benign because the server is the authoritative validator (T-24-08-02).
 */
export function todayPlusOneISO(): string {
  const tomorrow = new Date(Date.now() + 86400000);
  return tomorrow.toISOString().slice(0, 10);
}

/** Build a SET_GOAL payload, omitting `due` when undefined/empty. */
function buildPayload(
  name: string,
  targetCents: number,
  due: string | undefined,
): OnboardingGoal {
  const payload: OnboardingGoal = { name, target_cents: targetCents };
  if (due !== undefined && due !== '') {
    payload.due = due;
  }
  return payload;
}

export function Step04Goal({ goal, dispatch }: Step04GoalProps) {
  const name = goal?.name ?? '';
  const targetCents = goal?.target_cents ?? 0;
  const due = goal?.due ?? '';
  const amountDisplay = targetCents > 0 ? formatRubles(targetCents) : '';

  const handleName = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    dispatch({
      type: 'SET_GOAL',
      payload: buildPayload(next, targetCents, due || undefined),
    });
  };

  const handleAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cents = parseIncomeInputToCents(e.target.value);
    dispatch({
      type: 'SET_GOAL',
      payload: buildPayload(name, cents, due || undefined),
    });
  };

  const handleDue = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    dispatch({
      type: 'SET_GOAL',
      payload: buildPayload(name, targetCents, next || undefined),
    });
  };

  return (
    <div className={styles.step}>
      <div className={styles.headline}>
        <Mass italic size={32}>
          Зачем
          <br />
          копишь?
        </Mass>
      </div>

      <div className={styles.subEyebrow}>
        <Eyebrow opacity={0.55}>МОЖНО ПРОПУСТИТЬ И НАСТРОИТЬ ПОЗЖЕ</Eyebrow>
      </div>

      <div className={styles.nameRow}>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          className={styles.nameInput}
          value={name}
          onChange={handleName}
          placeholder="Цель (Грузия, подушка, ноутбук…)"
          aria-label="Название цели"
        />
      </div>

      <div className={styles.amountRow}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className={styles.amountInput}
          value={amountDisplay}
          onChange={handleAmount}
          placeholder="0"
          aria-label="Сумма цели, рубли"
        />
        <span className={styles.suffix} aria-hidden="true">
          ₽
        </span>
      </div>

      <div className={styles.dueRow}>
        <label className={styles.dueLabel} htmlFor="onb-goal-due">
          <Eyebrow opacity={0.55}>ДО КАКОЙ ДАТЫ (ОПЦ.)</Eyebrow>
        </label>
        <input
          id="onb-goal-due"
          type="date"
          className={styles.dueInput}
          value={due}
          min={todayPlusOneISO()}
          onChange={handleDue}
          aria-label="До какой даты, опционально"
        />
      </div>
    </div>
  );
}
