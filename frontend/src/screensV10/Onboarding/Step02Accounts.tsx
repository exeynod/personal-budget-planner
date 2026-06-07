// v1.1 (AGREED §G2): Step 02 — «Стартовый баланс».
//
// The «счета» concept is hidden — onboarding collects a single implicit
// primary balance instead of a multi-account list (mirrors the native flow,
// NativeOnboardingFlow.tsx, which seeds one primary card account named «Счёт»).
//
// Owns the visual (Maximal Poster):
//   - Italic mass headline + sub-eyebrow
//   - One large numeric «Стартовый баланс» field + ₽ suffix
//   - Caption explaining 0 / negative (долг) is allowed
//
// Fully controlled: the displayed value derives from `balanceCents` and every
// keystroke dispatches SET_STARTING_BALANCE, so the reducer is the single
// source of truth (one primary card account «Счёт»). On mount the field seeds
// a 0-balance account once so the step is passable by default (balance is
// optional, like income is NOT — see OnboardingFlow gate).

import { useEffect } from 'react';
import type { Dispatch } from 'react';
import { Eyebrow, Mass } from '../../componentsV10';
import type { OnboardingAction } from './onboardingReducer';
import { formatBalanceRubles, parseBalanceInputToCents } from './format';
import styles from './Step02Accounts.module.css';

export interface Step02AccountsProps {
  /** Current starting balance in cents — drives the input display. */
  balanceCents: number;
  /** Whether the reducer already holds the single account (seeded). */
  hasAccount: boolean;
  /** Reducer dispatch from OnboardingFlow. */
  dispatch: Dispatch<OnboardingAction>;
}

export function Step02Accounts({
  balanceCents,
  hasAccount,
  dispatch,
}: Step02AccountsProps) {
  // Seed the single implicit account on first mount so the step is passable by
  // default (balance may legitimately stay 0). No-op once an account exists.
  useEffect(() => {
    if (!hasAccount) {
      dispatch({
        type: 'SET_STARTING_BALANCE',
        payload: { balance_cents: 0 },
      });
    }
  }, [hasAccount, dispatch]);

  const displayValue = formatBalanceRubles(balanceCents);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cents = parseBalanceInputToCents(e.target.value);
    dispatch({
      type: 'SET_STARTING_BALANCE',
      payload: { balance_cents: cents },
    });
  };

  return (
    <div className={styles.step}>
      <div className={styles.headline}>
        <Mass italic size={36}>
          Сколько денег
          <br />
          сейчас?
        </Mass>
      </div>

      <div className={styles.subEyebrow}>
        <Eyebrow opacity={0.55}>СТАРТОВЫЙ БАЛАНС</Eyebrow>
      </div>

      <div className={styles.inputRow}>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          className={styles.input}
          value={displayValue}
          onChange={handleChange}
          placeholder="0"
          aria-label="Стартовый баланс, рубли"
        />
        <span className={styles.suffix} aria-hidden="true">
          ₽
        </span>
      </div>

      <div className={styles.caption}>
        <Eyebrow opacity={0.5}>МОЖНО 0 ИЛИ МИНУС (ДОЛГ)</Eyebrow>
      </div>
    </div>
  );
}
