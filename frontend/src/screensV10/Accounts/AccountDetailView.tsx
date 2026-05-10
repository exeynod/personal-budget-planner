// Phase 27-04 Task 2: AccountDetailView (BLACK bg) — pure presentational
// component covering ACCT-V10-04.
//
// Renders mirror of prototype/poster-screens.jsx PosterAccountDetail:
//   - Black absolute-fill background; ← НАЗАД top-left link (mono).
//   - Eyebrow «ACCOUNT».
//   - Mass italic bank-name (size 70, paper colour).
//   - Subtitle (mono, opacity 0.7): formatBankSubtitle(account).
//   - 2 KPI plates row:
//       Left  → yellow plate «БАЛАНС» + BigFig balance/100 ₽ (size 64, ink).
//       Right → dark plate «В МАЕ · {N} ОПЕРАЦИЙ» + BigFig sumPeriodOps/100 ₽
//               (paper).
//   - Operations list (account-filtered): time mono · description ·
//     «cat · BANK MASK» sub-line · signed amount.
//   - Empty state «Нет операций по этому счёту» italic 22px.
//
// View is router-agnostic — handlers passed in as props.

import { BigFig, Eyebrow, Mass } from '../../componentsV10';
import { formatRubles } from '../Onboarding/format';
import { formatTimeHM, MONTHS_RU_GENITIVE } from '../common';
import { formatTxAmount } from '../Transactions/computeTransactions';
import { formatBankSubtitle, sumPeriodOps } from './computeAccounts';
import type {
  AccountResponse,
  ActualV10Read,
  CategoryV10,
} from '../../api/v10';
import styles from './AccountDetailView.module.css';

// ─────────────────── Props ───────────────────

export interface AccountDetailViewProps {
  /** Account being viewed (null while loading / not found). */
  account: AccountResponse | null;
  /** Actuals already filtered to this account_id (caller filters). */
  actuals: ActualV10Read[];
  /** All categories (for per-row sub-line «cat · …»). */
  categories: CategoryV10[];
  /** Period for the «В МАЕ · N ОПЕРАЦИЙ» KPI. Null → KPI hidden. */
  period: { period_start: string; period_end: string } | null;
  loading: boolean;
  error: string | null;
  /** Whether ← НАЗАД is rendered (Detail is always pushed → true). */
  canPop: boolean;
  /** ← НАЗАД tap → router.pop(). */
  onBack: () => void;
  /** Tx row tap (MVP: no-op — defer to Transactions registry deep-link in polish). */
  onTxRowTap: (txId: number) => void;
  /** Test escape hatch — disables BigFig count-up rAF. Default true. */
  bigFigAnimate?: boolean;
}

// ─────────────────── Component ───────────────────

/** Russian month nominative for «В МАЕ» eyebrow. */
const MONTHS_RU_PREP: ReadonlyArray<string> = [
  'ЯНВАРЕ', 'ФЕВРАЛЕ', 'МАРТЕ', 'АПРЕЛЕ', 'МАЕ', 'ИЮНЕ',
  'ИЮЛЕ', 'АВГУСТЕ', 'СЕНТЯБРЕ', 'ОКТЯБРЕ', 'НОЯБРЕ', 'ДЕКАБРЕ',
];

export function AccountDetailView(props: AccountDetailViewProps) {
  const {
    account,
    actuals,
    categories,
    period,
    loading,
    error,
    canPop,
    onBack,
    onTxRowTap,
    bigFigAnimate = true,
  } = props;

  // Build O(1) category lookup for sub-lines.
  const catById = new Map<number, CategoryV10>();
  for (const c of categories) catById.set(c.id, c);

  // KPI: month-period operations.
  const opsKpi = period
    ? sumPeriodOps(actuals, period.period_start, period.period_end)
    : { count: 0, sumCents: 0 };
  const opsKpiRubles = Math.floor(opsKpi.sumCents / 100);

  // Eyebrow «В {MONTH_PREP}» — derive from period_start for month name.
  let monthEyebrow = 'В МЕСЯЦЕ';
  if (period) {
    const parts = period.period_start.split('-');
    const monthIdx = Number(parts[1]) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      monthEyebrow = `В ${MONTHS_RU_PREP[monthIdx]}`;
    }
  }

  const balanceCents = account?.balance_cents ?? 0;
  const balanceRubles = Math.floor(balanceCents / 100);
  const subtitle = account ? formatBankSubtitle(account) : '';
  const bankNameRaw = account?.bank ?? '';

  return (
    <div className={styles.root}>
      {/* ─────────── header ─────────── */}
      <div className={styles.headerRow}>
        {canPop && (
          <button
            type="button"
            className={styles.backLink}
            onClick={onBack}
          >
            ← НАЗАД
          </button>
        )}
        <Eyebrow color="var(--poster-paper)">ACCOUNT</Eyebrow>
      </div>

      {/* ─────────── loading / error ─────────── */}
      {loading && (
        <div className={styles.statusLine} data-testid="account-detail-loading">
          Загрузка…
        </div>
      )}
      {error !== null && !loading && (
        <div className={styles.statusLine} data-testid="account-detail-error">
          {error}
        </div>
      )}

      {/* ─────────── headline + subtitle ─────────── */}
      {account && !loading && (
        <>
          <Mass italic size={70} className={styles.headlineMass}>
            {bankNameRaw}
          </Mass>
          <div className={styles.subtitle}>{subtitle}</div>

          {/* ─────────── KPI plates row ─────────── */}
          <div className={styles.kpiRow}>
            <div className={`${styles.kpiPlate} ${styles.kpiYellow}`} data-testid="account-detail-balance-plate">
              <Eyebrow color="var(--poster-ink)">БАЛАНС</Eyebrow>
              <BigFig
                value={balanceRubles}
                sup="₽"
                size={56}
                color="var(--poster-ink)"
                animate={bigFigAnimate}
              />
            </div>
            <div className={`${styles.kpiPlate} ${styles.kpiDark}`} data-testid="account-detail-ops-plate">
              <Eyebrow color="var(--poster-paper)">
                {`${monthEyebrow} · ${opsKpi.count} ОПЕРАЦИЙ`}
              </Eyebrow>
              <BigFig
                value={opsKpiRubles}
                sup="₽"
                size={56}
                color="var(--poster-paper)"
                animate={bigFigAnimate}
              />
            </div>
          </div>

          {/* ─────────── operations list ─────────── */}
          <div className={styles.opsEyebrow}>
            <Eyebrow color="var(--poster-paper)">ОПЕРАЦИИ ПО СЧЁТУ</Eyebrow>
          </div>

          {actuals.length === 0 ? (
            <div className={styles.emptyState}>Нет операций по этому счёту</div>
          ) : (
            <div className={styles.opsList}>
              {actuals.map((tx) => {
                const cat = catById.get(tx.category_id);
                const catName = cat?.name ?? '—';
                const dateParts = tx.tx_date.split('-');
                const day = dateParts[2] ? Number(dateParts[2]) : 0;
                const monthIdx = dateParts[1] ? Number(dateParts[1]) - 1 : 0;
                const dayLabel =
                  monthIdx >= 0 && monthIdx < 12
                    ? `${day} ${MONTHS_RU_GENITIVE[monthIdx]}`
                    : tx.tx_date;
                const time = formatTimeHM(new Date(tx.created_at));
                const amountStr = formatTxAmount(tx.amount_cents);
                const amountClass =
                  tx.amount_cents > 0
                    ? styles.amountPositive
                    : styles.amountNegative;
                return (
                  <div
                    key={tx.id}
                    className={styles.row}
                    onClick={() => onTxRowTap(tx.id)}
                    data-testid={`account-detail-tx-row-${tx.id}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onTxRowTap(tx.id);
                    }}
                  >
                    <div className={styles.rowTime}>{time}</div>
                    <div className={styles.rowMid}>
                      <div className={styles.rowDescription}>
                        {tx.description ?? catName}
                      </div>
                      <div className={styles.rowSubLine}>
                        {`${catName} · ${dayLabel}`}
                      </div>
                    </div>
                    <div className={`${styles.rowAmount} ${amountClass}`}>
                      {amountStr}
                      <span className={styles.amountAlt}>
                        {`${formatRubles(Math.abs(tx.amount_cents))}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
