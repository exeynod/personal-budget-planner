// Phase 27-04 Task 2: NewAccountSheet — bottom-sheet form for «+ ДОБАВИТЬ СЧЁТ».
//
// Form fields:
//   - Bank: TextInput, placeholder «Т-Банк / Сбер / …»
//   - Kind: 3 chip-row [card / cash / savings] with RU labels
//     («карта» / «наличные» / «накопит.»)
//   - Mask: 4-digit input, only when kind === 'card', maxLength=4 + digits-only
//     (T-27-04-02 mitigation against mask spoofing)
//   - Balance: amount input (digits-only rubles, ×100 on save)
//   - Primary: checkbox «Сделать основным»
//   - СОХРАНИТЬ — disabled when !isValidNewAccountDraft.
//
// Returns null when not invoked from a sheet (handled by parent PosterSheet wrap).

import { useState } from 'react';
import { Chip, PosterButton, Eyebrow } from '../../componentsV10';
import { isValidNewAccountDraft } from './computeAccounts';
import type { AccountCreatePayload, AccountKindStr } from '../../api/v10';
import styles from './NewAccountSheet.module.css';

// ─────────────────── Props ───────────────────

export interface NewAccountSheetProps {
  /** POST /accounts handler — receives validated AccountCreatePayload. */
  onSave: (payload: AccountCreatePayload) => void | Promise<void>;
  /** Sheet close (cancel / completed). */
  onClose: () => void;
  /** Whether a save request is in flight (disables save button). */
  submitting: boolean;
}

const KIND_CHIPS: ReadonlyArray<{ id: AccountKindStr; label: string }> = [
  { id: 'card', label: 'карта' },
  { id: 'cash', label: 'наличные' },
  { id: 'savings', label: 'накопит.' },
];

// ─────────────────── Component ───────────────────

export function NewAccountSheet(props: NewAccountSheetProps) {
  const { onSave, onClose, submitting } = props;
  const [bank, setBank] = useState('');
  const [kind, setKind] = useState<AccountKindStr>('card');
  const [mask, setMask] = useState('');
  const [balanceRubles, setBalanceRubles] = useState('');
  const [primary, setPrimary] = useState(false);

  const balanceCents = (() => {
    const digits = balanceRubles.replace(/\D/g, '');
    if (digits === '') return 0;
    const num = Number(digits);
    if (!Number.isFinite(num)) return 0;
    return num * 100;
  })();

  const draft = { bank, kind, balance_cents: balanceCents };
  const valid = isValidNewAccountDraft(draft);

  const handleMaskChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setMask(digits);
  };

  const handleBalanceChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setBalanceRubles(digits);
  };

  const handleSave = async () => {
    if (!valid || submitting) return;
    const payload: AccountCreatePayload = {
      bank: bank.trim(),
      kind,
      mask: kind === 'card' && mask.length > 0 ? mask : null,
      balance_cents: balanceCents,
      primary,
    };
    await onSave(payload);
  };

  return (
    <div className={styles.root} data-testid="new-account-sheet">
      <Eyebrow color="var(--poster-ink)">НОВЫЙ СЧЁТ</Eyebrow>

      <label className={styles.fieldLabel}>
        <span className={styles.fieldEyebrow}>БАНК</span>
        <input
          type="text"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          placeholder="Т-Банк / Сбер / …"
          maxLength={40}
          className={styles.textInput}
          data-testid="new-account-bank-input"
        />
      </label>

      <div className={styles.field}>
        <span className={styles.fieldEyebrow}>ТИП</span>
        <div className={styles.chipRow} role="tablist">
          {KIND_CHIPS.map((c) => (
            <Chip
              key={c.id}
              active={kind === c.id}
              onClick={() => setKind(c.id)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {kind === 'card' && (
        <label className={styles.fieldLabel}>
          <span className={styles.fieldEyebrow}>ПОСЛЕДНИЕ 4 ЦИФРЫ</span>
          <input
            type="text"
            inputMode="numeric"
            value={mask}
            onChange={(e) => handleMaskChange(e.target.value)}
            maxLength={4}
            placeholder="4408"
            className={styles.textInput}
            data-testid="new-account-mask-input"
          />
        </label>
      )}

      <label className={styles.fieldLabel}>
        <span className={styles.fieldEyebrow}>БАЛАНС, ₽</span>
        <input
          type="text"
          inputMode="numeric"
          value={balanceRubles}
          onChange={(e) => handleBalanceChange(e.target.value)}
          placeholder="0"
          className={styles.textInput}
          data-testid="new-account-balance-input"
        />
      </label>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={primary}
          onChange={(e) => setPrimary(e.target.checked)}
          data-testid="new-account-primary-checkbox"
        />
        <span>Сделать основным</span>
      </label>

      <div className={styles.btnRow}>
        <PosterButton
          variant="primary"
          onClick={handleSave}
          disabled={!valid || submitting}
        >
          {submitting ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ'}
        </PosterButton>
        <PosterButton variant="ghost" onClick={onClose} disabled={submitting}>
          ОТМЕНА
        </PosterButton>
      </div>
    </div>
  );
}
