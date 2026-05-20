// Phase 27-03 (SAV-V10-04): DepositSheet — bottom-sheet form body for
// manual deposit. Wrapped by SavingsMount inside <PosterSheet>.
//
// Form:
//   - amount (digits-only rubles → cents on save, required > 0)
//   - account picker (chip-row over user accounts; required)
//   - goal picker (optional; «без цели» chip + N goal chips)
//
// СОХРАНИТЬ disabled until isValidDepositDraft passes.

import { useEffect, useState } from 'react';
import { PosterButton, Chip } from '../../componentsV10';
import type { AccountResponse, GoalRead } from '../../api/v10';
import { isValidDepositDraft } from './computeSavings';
import { parseRublesToKopecksOr0, sanitizeMoneyInput } from '../../utils/parseMoney';
import styles from './SavingsSheets.module.css';

export interface DepositSheetProps {
  /** User accounts (from listAccounts). */
  accounts: AccountResponse[];
  /** Available goals (from snapshot.goals). */
  goals: GoalRead[];
  /** Optional pre-selected goal_id (when entering from a goal card tap). */
  initialGoalId?: number | null;
  /** Save handler — payload uses cents. */
  onSave: (payload: {
    amount_cents: number;
    account_id: number;
    goal_id: number | null;
  }) => void;
  /** ОТМЕНА click. */
  onClose: () => void;
  /** True while POST /savings/deposit in flight. */
  submitting: boolean;
}

export function DepositSheet(props: DepositSheetProps) {
  const [amountRubles, setAmountRubles] = useState('');
  // Default-pick the primary account (first in the list per backend ordering).
  const [accountId, setAccountId] = useState<number | null>(
    props.accounts[0]?.id ?? null,
  );
  const [goalId, setGoalId] = useState<number | null>(
    props.initialGoalId ?? null,
  );

  // Re-seed defaults if accounts arrive after first render.
  useEffect(() => {
    if (accountId == null && props.accounts.length > 0) {
      setAccountId(props.accounts[0].id);
    }
  }, [props.accounts, accountId]);

  // P2-10: single money parser — keeps kopecks (e.g. «500,50» → 50050).
  const amountCents = parseRublesToKopecksOr0(amountRubles);

  const valid = isValidDepositDraft({
    amount_cents: amountCents,
    account_id: accountId,
    goal_id: goalId,
  });

  const handleSave = () => {
    if (!valid || accountId == null) return;
    props.onSave({
      amount_cents: amountCents,
      account_id: accountId,
      goal_id: goalId,
    });
  };

  return (
    <div className={styles.editorRoot}>
      <div className={styles.editorTitle}>ПОПОЛНИТЬ КОПИЛКУ</div>

      <label className={styles.fieldLabel}>СУММА (₽)</label>
      <input
        type="text"
        inputMode="decimal"
        value={amountRubles}
        onChange={(e) => setAmountRubles(sanitizeMoneyInput(e.target.value))}
        className={styles.textInput}
        placeholder="500"
        data-testid="deposit-amount-input"
      />

      <label className={styles.fieldLabel}>СО СЧЁТА</label>
      {props.accounts.length === 0 ? (
        <div className={styles.editorHint}>Нет доступных счетов</div>
      ) : (
        <div className={styles.chipsRow}>
          {props.accounts.map((a) => (
            <Chip
              key={a.id}
              active={accountId === a.id}
              onClick={() => setAccountId(a.id)}
            >
              {a.bank.toUpperCase()}
              {a.mask ? ` · ${a.mask}` : ''}
            </Chip>
          ))}
        </div>
      )}

      <label className={styles.fieldLabel}>ЦЕЛЬ (необязательно)</label>
      <div className={styles.chipsRow}>
        <Chip
          active={goalId === null}
          onClick={() => setGoalId(null)}
        >
          БЕЗ ЦЕЛИ
        </Chip>
        {props.goals.map((g) => (
          <Chip
            key={g.id}
            active={goalId === g.id}
            onClick={() => setGoalId(g.id)}
          >
            {g.name.toUpperCase()}
          </Chip>
        ))}
      </div>

      <div className={styles.editorActions}>
        <PosterButton variant="ghost" onClick={props.onClose}>
          ОТМЕНА
        </PosterButton>
        <PosterButton
          variant="primary"
          onClick={handleSave}
          disabled={!valid || props.submitting}
        >
          {props.submitting ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ'}
        </PosterButton>
      </div>
    </div>
  );
}
