// Phase 24-02: Step 01 view — «Какой доход в месяц?» income input.
//
// Owns the visual: large numeric field + ₽ suffix + 4 preset chips.
// Input is fully controlled — value derived from incomeCents prop, every
// keystroke dispatches SET_INCOME so the reducer is the single source of
// truth (no local input state to drift).

import type { Dispatch } from 'react';
import { Eyebrow, Mass } from '../../componentsV10';
import type { OnboardingAction } from './onboardingReducer';
import {
  formatRubles,
  parseIncomeInputToCents,
} from './format';
import styles from './Step01Income.module.css';

export interface Step01IncomeProps {
  /** Current income in cents — drives input display + active preset. */
  incomeCents: number;
  /** Reducer dispatch from OnboardingFlow. */
  dispatch: Dispatch<OnboardingAction>;
}

/** Preset rubles for quick-fill chips (DATA-MODEL §5.1 typical incomes). */
const PRESETS_RUBLES: ReadonlyArray<number> = [50_000, 80_000, 120_000, 200_000];

export function Step01Income({ incomeCents, dispatch }: Step01IncomeProps) {
  const displayValue = incomeCents > 0 ? formatRubles(incomeCents) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cents = parseIncomeInputToCents(e.target.value);
    dispatch({ type: 'SET_INCOME', payload: { income_cents: cents } });
  };

  return (
    <div className={styles.step}>
      <div className={styles.headline}>
        <Mass italic size={36}>
          Какой доход
          <br />в месяц?
        </Mass>
      </div>

      <div className={styles.subEyebrow}>
        <Eyebrow opacity={0.55}>ВВЕДИ СУММУ ПОСЛЕ НАЛОГОВ</Eyebrow>
      </div>

      <div className={styles.inputRow}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className={styles.input}
          value={displayValue}
          onChange={handleChange}
          placeholder="0"
          aria-label="Доход в месяц, рубли"
        />
        <span className={styles.suffix} aria-hidden="true">
          ₽
        </span>
      </div>

      <div className={styles.presets} role="group" aria-label="Быстрые суммы">
        {PRESETS_RUBLES.map((rubles) => {
          const cents = rubles * 100;
          const active = incomeCents === cents;
          return (
            <button
              key={rubles}
              type="button"
              className={`${styles.preset}${
                active ? ' ' + styles.presetActive : ''
              }`}
              data-active={active ? 'true' : 'false'}
              onClick={() =>
                dispatch({
                  type: 'SET_INCOME',
                  payload: { income_cents: cents },
                })
              }
            >
              {`${formatRubles(cents)} ₽`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
