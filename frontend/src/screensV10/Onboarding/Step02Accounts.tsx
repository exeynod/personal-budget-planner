// Phase 24-04: Step 02 view — «Где лежат деньги?» account chip-list.
//
// Owns the visual:
//   - Italic mass headline + sub-eyebrow
//   - Existing accounts list (grid 1fr | auto | auto rows with star + ×)
//   - Predefined chip row (Т-Банк / Сбер / Наличные / + Добавить)
//   - Inline AccountBalanceForm when a chip is tapped
//
// State machine:
//   - `formMode === null` → no form rendered
//   - `formMode = { initialBank, initialKind, editable }` → form open
//   - On AccountBalanceForm.onSave → dispatch ADD_ACCOUNT, close form
//   - On AccountBalanceForm.onCancel → close form (no dispatch)
//
// Star button → SET_PRIMARY {index}.
// × button   → REMOVE_ACCOUNT {index}.
//
// Auto-primary: first added account auto-marked primary by reducer
// (see onboardingReducer ADD_ACCOUNT — D-04 / threat T-24-04-04).

import { useState } from 'react';
import type { Dispatch } from 'react';
import { Eyebrow, Mass } from '../../componentsV10';
import type { OnboardingAction } from './onboardingReducer';
import type { AccountKind, OnboardingAccount } from './types';
import { formatRubles } from './format';
import {
  AccountBalanceForm,
  type AccountBalanceFormSavePayload,
} from './AccountBalanceForm';
import styles from './Step02Accounts.module.css';

interface PresetBank {
  bank: string;
  kind: AccountKind;
}

/** D-05: predefined bank chips offered on Step 02. */
const PRESET_BANKS: ReadonlyArray<PresetBank> = [
  { bank: 'Т-Банк', kind: 'card' },
  { bank: 'Сбер', kind: 'card' },
  { bank: 'Наличные', kind: 'cash' },
];

interface FormMode {
  initialBank: string;
  initialKind: AccountKind;
  editable: boolean;
}

export interface Step02AccountsProps {
  /** Current accounts list (from reducer state.accounts). */
  accounts: ReadonlyArray<OnboardingAccount>;
  /** Reducer dispatch from OnboardingFlow. */
  dispatch: Dispatch<OnboardingAction>;
}

export function Step02Accounts({ accounts, dispatch }: Step02AccountsProps) {
  const [formMode, setFormMode] = useState<FormMode | null>(null);

  const handleSave = (payload: AccountBalanceFormSavePayload) => {
    dispatch({ type: 'ADD_ACCOUNT', payload });
    setFormMode(null);
  };

  const handleCancel = () => {
    setFormMode(null);
  };

  const handleSetPrimary = (index: number) => {
    dispatch({ type: 'SET_PRIMARY', payload: { index } });
  };

  const handleRemove = (index: number) => {
    dispatch({ type: 'REMOVE_ACCOUNT', payload: { index } });
  };

  return (
    <div className={styles.step}>
      <div className={styles.headline}>
        <Mass italic size={32}>
          Где лежат
          <br />
          деньги?
        </Mass>
      </div>

      <div className={styles.subEyebrow}>
        <Eyebrow opacity={0.55}>ВСЕ КАРТЫ И НАЛИЧНЫЕ</Eyebrow>
      </div>

      {accounts.length > 0 ? (
        <div className={styles.list} aria-label="Список счетов">
          {accounts.map((acc, idx) => (
            <div key={`${acc.bank}-${idx}`} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.bankName}>{acc.bank}</div>
                <div className={styles.bankBalance}>
                  {`${formatRubles(acc.balance_cents)} ₽`}
                  {acc.primary ? ' · основной' : ''}
                </div>
              </div>
              <button
                type="button"
                className={`${styles.starBtn}${
                  acc.primary ? ' ' + styles.starBtnActive : ''
                }`}
                onClick={() => handleSetPrimary(idx)}
                aria-label={`Сделать основным: ${acc.bank}`}
                aria-pressed={acc.primary}
              >
                {'★'}
              </button>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemove(idx)}
                aria-label={`Удалить счёт: ${acc.bank}`}
              >
                {'×'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.chips} role="group" aria-label="Быстрый выбор банка">
        {PRESET_BANKS.map((b) => (
          <button
            key={b.bank}
            type="button"
            className={styles.chip}
            onClick={() =>
              setFormMode({
                initialBank: b.bank,
                initialKind: b.kind,
                editable: false,
              })
            }
          >
            {b.bank}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.chip} ${styles.chipDashed}`}
          onClick={() =>
            setFormMode({
              initialBank: '',
              initialKind: 'card',
              editable: true,
            })
          }
        >
          + Добавить
        </button>
      </div>

      {formMode !== null ? (
        <AccountBalanceForm
          initialBank={formMode.initialBank}
          initialKind={formMode.initialKind}
          bankEditable={formMode.editable}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : null}
    </div>
  );
}
