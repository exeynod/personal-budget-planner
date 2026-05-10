// Phase 30-02 (DEBT-03): AccountPickerSheet — bottom-sheet picker
// replacing the AddSheet row-cycler.
//
// Mounts inside a PosterSheet (paper background) so it layers visibly above
// the dark AddSheet body. Tapping a row calls `onSelect(accountId)` then the
// parent closes the picker via `onClose` (idiomatic — parent owns sheet
// open-state).
//
// Row layout matches the prototype's «pick-one» pattern:
//   [bank/mask] [balance]                    [ОСНОВНОЙ badge?] [✓ if selected]
//
// Accessibility:
//   - Rows are `<button>` elements with aria-pressed reflecting selection.
//   - Empty state surfaces a mono caption so the picker never renders empty.

import { PosterSheet } from '../common';
import { formatRubles } from '../Onboarding/format';
import type { AccountResponse } from '../../api/v10';
import styles from './AccountPickerSheet.module.css';

export interface AccountPickerSheetProps {
  /** Open state — symmetric to PosterSheet.isOpen. */
  isOpen: boolean;
  /** Accounts to render — typically the same `listAccounts()` payload AddSheet uses. */
  accounts: AccountResponse[];
  /** Currently-selected account id; used to highlight the row + render the ✓ marker. */
  selectedAccountId: number | null;
  /** Tap on a row. Parent closes the sheet after wiring its own state. */
  onSelect: (accountId: number) => void;
  /** Dismiss without selection (backdrop tap, Escape, drag-to-close). */
  onClose: () => void;
}

function formatAccountName(a: AccountResponse): string {
  const bank = (a.bank ?? '').toUpperCase();
  return a.mask ? `${bank} · ${a.mask}` : bank;
}

export function AccountPickerSheet({
  isOpen,
  accounts,
  selectedAccountId,
  onSelect,
  onClose,
}: AccountPickerSheetProps) {
  return (
    <PosterSheet
      isOpen={isOpen}
      onClose={onClose}
      backgroundColor="var(--poster-paper)"
      testId="account-picker-sheet"
    >
      <div className={styles.body} data-testid="account-picker-body">
        <div className={styles.header}>
          <div className={styles.title}>СЧЁТ</div>
          <div className={styles.subtitle}>
            Выберите счёт для операции
          </div>
        </div>
        {accounts.length === 0 ? (
          <div className={styles.empty} data-testid="account-picker-empty">
            Нет доступных счетов
          </div>
        ) : (
          <div className={styles.list} role="listbox" aria-label="Счёт">
            {accounts.map((a) => {
              const isSelected = a.id === selectedAccountId;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`${styles.row} ${
                    isSelected ? styles.rowSelected : ''
                  }`}
                  onClick={() => onSelect(a.id)}
                  aria-pressed={isSelected}
                  data-testid={`account-picker-row-${a.id}`}
                >
                  <span className={styles.rowLeft}>
                    <span className={styles.rowName}>
                      {formatAccountName(a)}
                    </span>
                    <span className={styles.rowBalance}>
                      {formatRubles(a.balance_cents)} ₽
                    </span>
                  </span>
                  <span className={styles.rowRight}>
                    {a.primary ? (
                      <span
                        className={styles.badge}
                        data-testid={`account-picker-badge-${a.id}`}
                      >
                        ОСНОВНОЙ
                      </span>
                    ) : null}
                    {isSelected ? (
                      <span
                        className={styles.check}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PosterSheet>
  );
}
