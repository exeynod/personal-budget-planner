// Phase 27-04 Task 2: AccountsListView (cream) — pure presentational component
// covering ACCT-V10-01..03.
//
// Renders mirror of prototype/poster-screens.jsx PosterAccounts (cream variant):
//   - Cream absolute-fill background; ← НАЗАД top-left link (mono).
//   - Eyebrow row: «ACCOUNTS / СЧЕТА».
//   - Mass italic «Счета.» size 70, ink colour.
//   - Dark plate (ink bg, paper text): «СУММАРНО» eyebrow + BigFig sumBalances/100 ₽
//     + «{N} счетов» eyebrow.
//   - List rows: bank UPPER + subtitle (formatBankSubtitle) + «история →» mono caption,
//     balance mono semibold on right, «ОСНОВНОЙ» yellow badge for primary accounts.
//   - CTA row: «+ ДОБАВИТЬ СЧЁТ» primary, «ПЕРЕВОД SOON» ghost-disabled.
//
// View is router-agnostic — all interactions are passed in as callbacks.
// Mirrors HomeView / TransactionsView / SubscriptionsView pattern from
// Phase 25-04 / 25-08 / 26-06.

import { Eyebrow, Mass, BigFig, PosterButton } from '../../componentsV10';
import { formatRubles } from '../Onboarding/format';
import {
  countAccounts,
  formatBankSubtitle,
  sumAccountsBalances,
} from './computeAccounts';
import type { AccountResponse } from '../../api/v10';
import styles from './AccountsListView.module.css';

// ─────────────────── Props ───────────────────

export interface AccountsListViewProps {
  accounts: AccountResponse[];
  loading: boolean;
  error: string | null;
  /** Row tap → push <AccountDetailMount accountId={id} />. */
  onAccountTap: (id: number) => void;
  /** «+ ДОБАВИТЬ СЧЁТ» tap → opens NewAccountSheet. */
  onAddAccount: () => void;
  /** «ПЕРЕВОД» tap (currently no-op — disabled CTA, kept for future). */
  onTransfer: () => void;
  /** Whether ← НАЗАД is rendered (false on root tab landing). */
  canPop: boolean;
  /** ← НАЗАД tap → router.pop(). */
  onBack: () => void;
  /** Test escape hatch — disables BigFig count-up rAF. Default true. */
  bigFigAnimate?: boolean;
}

// ─────────────────── Component ───────────────────

export function AccountsListView(props: AccountsListViewProps) {
  const {
    accounts,
    loading,
    error,
    onAccountTap,
    onAddAccount,
    onTransfer,
    canPop,
    onBack,
    bigFigAnimate = true,
  } = props;

  const sumCents = sumAccountsBalances(accounts);
  const sumRubles = Math.floor(sumCents / 100);
  const count = countAccounts(accounts);

  return (
    <div className={styles.root}>
      {/* ─────────── back link ─────────── */}
      {canPop && (
        <div className={styles.headerRow}>
          <button
            type="button"
            className={styles.backLink}
            onClick={onBack}
          >
            ← НАЗАД
          </button>
        </div>
      )}

      {/* ─────────── eyebrow ─────────── */}
      <div className={styles.eyebrowRow}>
        <Eyebrow color="var(--poster-ink)">ACCOUNTS / СЧЕТА</Eyebrow>
      </div>

      {/* ─────────── headline ─────────── */}
      <Mass italic size={70} className={styles.headlineMass}>
        Счета.
      </Mass>

      {/* ─────────── СУММАРНО plate (dark) ─────────── */}
      <div className={styles.summaryPlate} data-testid="accounts-summary-plate">
        <Eyebrow color="var(--poster-paper)">СУММАРНО</Eyebrow>
        <BigFig
          value={sumRubles}
          sup="₽"
          size={64}
          color="var(--poster-paper)"
          animate={bigFigAnimate}
          className={styles.summaryFig}
        />
        <Eyebrow color="var(--poster-paper)">
          {`${count} счетов`}
        </Eyebrow>
      </div>

      {/* ─────────── loading / error ─────────── */}
      {loading && (
        <div className={styles.statusLine} data-testid="accounts-loading">
          Загрузка…
        </div>
      )}
      {error !== null && !loading && (
        <div className={styles.statusLine} data-testid="accounts-error">
          {error}
        </div>
      )}

      {/* ─────────── list ─────────── */}
      {!loading && error === null && accounts.length === 0 && (
        <div className={styles.emptyState}>Нет счетов — добавьте первый</div>
      )}

      {!loading && error === null && accounts.length > 0 && (
        <div className={styles.list}>
          {accounts.map((a) => {
            const balanceRubles = Math.floor(a.balance_cents / 100);
            return (
              <button
                key={a.id}
                type="button"
                className={styles.row}
                onClick={() => onAccountTap(a.id)}
                data-testid={`account-row-${a.id}`}
              >
                <div className={styles.rowLeft}>
                  <div className={styles.bankName}>{a.bank.toUpperCase()}</div>
                  <div className={styles.bankSubtitle}>
                    {formatBankSubtitle(a)}
                  </div>
                  <div className={styles.historyHint}>история →</div>
                </div>
                {a.primary && (
                  <div className={styles.primaryBadge}>ОСНОВНОЙ</div>
                )}
                <div className={styles.balance}>
                  {`${formatRubles(a.balance_cents)} ₽`}
                  <span className={styles.balanceHint}>
                    {`${balanceRubles}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─────────── CTA row ─────────── */}
      <div className={styles.ctaRow}>
        <PosterButton variant="primary" onClick={onAddAccount}>
          + ДОБАВИТЬ СЧЁТ
        </PosterButton>
        <PosterButton variant="ghost" onClick={onTransfer} disabled>
          <span>ПЕРЕВОД</span>
          <span className={styles.soon}>SOON</span>
        </PosterButton>
      </div>
    </div>
  );
}
