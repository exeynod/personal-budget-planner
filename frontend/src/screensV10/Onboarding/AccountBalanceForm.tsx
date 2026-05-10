// Phase 24-04: Inline balance-input form, reusable for all entry paths.
//
// Used by Step02Accounts:
//   - Predefined chip taps (Т-Банк / Сбер / Наличные) → form opens with
//     `bankEditable=false`, `initialBank` pre-filled (read-only display).
//   - "+ Добавить" → opens with `bankEditable=true`, empty bank input.
//
// Form contract (props):
//   - initialBank: string         — pre-filled or '' for free-text
//   - initialKind: AccountKind    — 'card' | 'cash' | 'savings'
//   - bankEditable: boolean       — toggles read-only vs editable bank input
//   - onSave({bank, mask?, kind, balance_cents}) — caller dispatches
//     ADD_ACCOUNT and closes the form.
//   - onCancel() — caller closes the form, no state mutation.
//
// Save semantics (matches prototype line 1389):
//   - bank trimmed + uppercased before save (server caps at 40 chars too).
//   - balance_cents = (parsedRubles * 100). Defaults to 0 if input empty.
//   - ДОБАВИТЬ disabled when trimmed bank is empty (prevents whitespace-only).

import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Eyebrow } from '../../componentsV10';
import type { AccountKind } from './types';
import { formatRubles } from './format';
import styles from './AccountBalanceForm.module.css';

/** Server limit on bank name (Pydantic Field(max_length=40)). */
const BANK_NAME_MAX = 40;

/** Cap on parsed balance digits — 9 digits = 999_999_999 ₽ << 100M ₽ cap. */
const BALANCE_DIGIT_CAP = 9;

export interface AccountBalanceFormSavePayload {
  bank: string;
  mask?: string | null;
  kind: AccountKind;
  balance_cents: number;
}

export interface AccountBalanceFormProps {
  /** Pre-fill for bank field — '' when bankEditable=true. */
  initialBank: string;
  /** Account kind — passed straight through onSave. */
  initialKind: AccountKind;
  /** When false the bank input is rendered read-only. */
  bankEditable: boolean;
  /** Save handler — receives normalised payload (bank trimmed+uppercased). */
  onSave: (payload: AccountBalanceFormSavePayload) => void;
  /** Cancel handler — caller closes the form. */
  onCancel: () => void;
}

/** Strip non-digits, cap to BALANCE_DIGIT_CAP, return digits-only string. */
function sanitiseBalanceDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > BALANCE_DIGIT_CAP
    ? digits.slice(0, BALANCE_DIGIT_CAP)
    : digits;
}

export function AccountBalanceForm({
  initialBank,
  initialKind,
  bankEditable,
  onSave,
  onCancel,
}: AccountBalanceFormProps) {
  const [bank, setBank] = useState<string>(initialBank);
  const [balanceDigits, setBalanceDigits] = useState<string>('');

  const trimmedBank = bank.trim();
  const canSave = trimmedBank.length > 0;

  const handleBankChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.slice(0, BANK_NAME_MAX);
    setBank(next);
  };

  const handleBalanceChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBalanceDigits(sanitiseBalanceDigits(e.target.value));
  };

  const handleSave = () => {
    if (!canSave) return;
    const rubles = balanceDigits === '' ? 0 : Number.parseInt(balanceDigits, 10);
    const balance_cents = Number.isFinite(rubles) ? rubles * 100 : 0;
    onSave({
      bank: trimmedBank.toUpperCase(),
      kind: initialKind,
      balance_cents,
    });
  };

  // Display: format digit-string into thin-space grouped rubles via cents.
  const balanceDisplay =
    balanceDigits === '' ? '' : formatRubles(Number.parseInt(balanceDigits, 10) * 100);

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <Eyebrow opacity={0.6}>НОВЫЙ СЧЁТ</Eyebrow>
      </div>

      {bankEditable ? (
        <input
          type="text"
          className={styles.bankInput}
          value={bank}
          onChange={handleBankChange}
          placeholder="Название (Т-Банк, наличные…)"
          autoComplete="off"
          spellCheck={false}
          maxLength={BANK_NAME_MAX}
          aria-label="Название счёта"
        />
      ) : (
        <div
          className={styles.bankReadonly}
          aria-label="Название счёта (предустановлено)"
        >
          {initialBank}
        </div>
      )}

      <div className={styles.balanceRow}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.balanceInput}
          value={balanceDisplay}
          onChange={handleBalanceChange}
          placeholder="0"
          autoComplete="off"
          spellCheck={false}
          aria-label="Баланс счёта, рубли"
        />
        <span className={styles.suffix} aria-hidden="true">
          ₽
        </span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
        >
          ОТМЕНА
        </button>
        <button
          type="button"
          className={`${styles.saveBtn}${canSave ? '' : ' ' + styles.saveBtnDisabled}`}
          onClick={handleSave}
          disabled={!canSave}
          aria-disabled={!canSave}
        >
          ДОБАВИТЬ
        </button>
      </div>
    </div>
  );
}
