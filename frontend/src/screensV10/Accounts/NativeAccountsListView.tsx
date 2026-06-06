// Liquid Glass v2 — native iOS Accounts list view («Счета»).
//
// Pushed detail screen (from Home wallet tap and Management «Счета»): a back
// nav-bar + a «Суммарно» total card + an inset-grouped list of account rows.
//
// Pure presentational: AccountsListMount wires the data (SAME props as the
// poster AccountsListView) + the router handlers. No data logic is duplicated.
//
// Control fidelity (brief §Conventions «NO invented functionality»): the poster
// AccountsListView exposes exactly these actions — tap a row → detail, «+
// ДОБАВИТЬ СЧЁТ» → NewAccountSheet, «ПЕРЕВОД» (disabled). We port the same set:
// the «+» becomes the nav-bar trailing CircleButton, «Перевод» stays a disabled
// row so we neither add nor drop a control.

import { memo } from 'react';
import {
  Plus,
  Wallet,
  CreditCard,
  Vault,
  ArrowsLeftRight,
} from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
  CircleButton,
} from '../native/NativePrimitives';
import { formatMoneyNative, formatMoneyRubNative } from '../native/money';
import { formatBankSubtitle, sumAccountsBalances } from './computeAccounts';
import type { AccountResponse } from '../../api/v10';
import styles from './NativeAccountsListView.module.css';

// ─────────────────── Props (mirror poster AccountsListView) ───────────────────

export interface NativeAccountsListViewProps {
  accounts: AccountResponse[];
  loading: boolean;
  error: string | null;
  onAccountTap: (id: number) => void;
  onAddAccount: () => void;
  onTransfer: () => void;
  canPop: boolean;
  onBack: () => void;
}

// Account-kind → SF-Symbol-style tile glyph (parity with the iOS Accounts row).
function kindIcon(kind: AccountResponse['kind']) {
  if (kind === 'cash') return Wallet;
  if (kind === 'savings') return Vault;
  return CreditCard; // card
}

function AccountTile({ kind }: { kind: AccountResponse['kind'] }) {
  const Icon = kindIcon(kind);
  return (
    <span aria-hidden="true" className={styles.tile}>
      <Icon size={18} weight="fill" color="#fff" />
    </span>
  );
}

function NativeAccountsListViewInner(props: NativeAccountsListViewProps) {
  const { accounts, loading, error, onAccountTap, onAddAccount, onBack } =
    props;
  // onTransfer is intentionally unused: the poster «ПЕРЕВОД SOON» CTA is a
  // disabled no-op, so the native «Перевод» row is likewise non-interactive.
  void props.onTransfer;

  const sumCents = sumAccountsBalances(accounts);
  const count = accounts.length;
  const hasRows = !loading && error === null && count > 0;

  const addButton = (
    <CircleButton
      onClick={onAddAccount}
      ariaLabel="Добавить счёт"
      testId="native-accounts-add"
    >
      <Plus size={20} weight="bold" />
    </CircleButton>
  );

  return (
    <div className={styles.root}>
      <NativeNavBar title="Счета" onBack={onBack} trailing={addButton} />

      {/* Total card */}
      <div className={styles.totalCard} data-testid="native-accounts-total">
        <div className={styles.totalLabel}>Суммарно</div>
        <div className={styles.totalAmount}>
          {formatMoneyNative(sumCents)}
          <span className={styles.totalCur}>₽</span>
        </div>
        <div className={styles.totalCount}>{`${count} счетов`}</div>
      </div>

      {loading && (
        <div className={styles.status} data-testid="native-accounts-loading">
          Загрузка…
        </div>
      )}
      {error !== null && !loading && (
        <div className={styles.status} data-testid="native-accounts-error">
          {error}
        </div>
      )}

      {!loading && error === null && count === 0 && (
        <div className={styles.empty}>Нет счетов — добавьте первый</div>
      )}

      {hasRows && (
        <>
          <SectionHeader>Счета</SectionHeader>
          <InsetGroup>
            {accounts.map((a) => {
              const bank = a.bank.toUpperCase();
              const mask = a.mask ? ` · ${a.mask}` : '';
              return (
                <InsetRow
                  key={a.id}
                  testId={`native-account-row-${a.id}`}
                  leading={<AccountTile kind={a.kind} />}
                  title={`${bank}${mask}`}
                  subtitle={
                    <span className={styles.subtitleWrap}>
                      {formatBankSubtitle(a)}
                      {a.primary && (
                        <span className={styles.primaryBadge}>ОСНОВНОЙ</span>
                      )}
                    </span>
                  }
                  trailing={
                    <span className={styles.balance}>
                      {formatMoneyRubNative(a.balance_cents)}
                    </span>
                  }
                  chevron
                  onClick={() => onAccountTap(a.id)}
                />
              );
            })}
          </InsetGroup>
        </>
      )}

      {/* Transfer — disabled, mirrors the poster ghost-disabled «ПЕРЕВОД SOON». */}
      <SectionHeader>Действия</SectionHeader>
      <InsetGroup>
        <InsetRow
          testId="native-accounts-transfer"
          leading={
            <span aria-hidden="true" className={styles.tileMuted}>
              <ArrowsLeftRight size={18} weight="fill" color="#fff" />
            </span>
          }
          title={<span className={styles.disabledTitle}>Перевод</span>}
          trailing={<span className={styles.soon}>SOON</span>}
          trailingMuted
          onClick={undefined}
        />
      </InsetGroup>
    </div>
  );
}

export const NativeAccountsListView = memo(NativeAccountsListViewInner);
