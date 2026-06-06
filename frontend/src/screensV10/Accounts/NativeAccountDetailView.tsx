// Liquid Glass v2 — native iOS Account detail view.
//
// Pushed detail (from an Accounts-list row tap): a back nav-bar titled with the
// bank name + native cards for the account balance, the «В <месяце>» operations
// KPI, and the account-filtered operations list.
//
// Pure presentational: AccountDetailMount wires the data (SAME props as the
// poster AccountDetailView) + router handlers. No data logic is duplicated —
// actuals arrive already filtered to this account; the period-ops KPI is
// computed from the same `sumPeriodOps` helper the poster uses.
//
// Control fidelity (brief §Conventions «NO invented functionality»): the poster
// AccountDetailView's only interaction is the tx-row tap (onTxRowTap, an MVP
// no-op) plus back. We port exactly those — no edit/delete control is invented,
// because the poster detail screen exposes none.

import { memo } from 'react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatMoneyRubNative } from '../native/money';
import { formatTimeHM } from '../common';
import { formatBankSubtitle, sumPeriodOps } from './computeAccounts';
import type {
  AccountResponse,
  ActualV10Read,
  CategoryV10,
} from '../../api/v10';
import styles from './NativeAccountDetailView.module.css';

// ─────────────────── Props (mirror poster AccountDetailView) ───────────────────

export interface NativeAccountDetailViewProps {
  account: AccountResponse | null;
  actuals: ActualV10Read[];
  categories: CategoryV10[];
  period: { period_start: string; period_end: string } | null;
  loading: boolean;
  error: string | null;
  canPop: boolean;
  onBack: () => void;
  onTxRowTap: (txId: number) => void;
}

// Russian month prepositional («В МАЕ») — same set as the poster detail eyebrow.
const MONTHS_RU_PREP: ReadonlyArray<string> = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

function NativeAccountDetailViewInner(props: NativeAccountDetailViewProps) {
  const {
    account,
    actuals,
    categories,
    period,
    loading,
    error,
    onBack,
    onTxRowTap,
  } = props;

  const catById = new Map<number, CategoryV10>();
  for (const c of categories) catById.set(c.id, c);

  // «В <месяце> · N операций» KPI — same compute as the poster.
  const opsKpi = period
    ? sumPeriodOps(actuals, period.period_start, period.period_end)
    : { count: 0, sumCents: 0 };

  let monthLabel = 'В месяце';
  if (period) {
    const monthIdx = Number(period.period_start.split('-')[1]) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      monthLabel = `В ${MONTHS_RU_PREP[monthIdx]}`;
    }
  }

  const balanceCents = account?.balance_cents ?? 0;
  const subtitle = account ? formatBankSubtitle(account) : '';
  const title = account?.bank ?? 'Счёт';

  return (
    <div className={styles.root}>
      <NativeNavBar title={title} onBack={onBack} />

      {loading && (
        <div
          className={styles.status}
          data-testid="native-account-detail-loading"
        >
          Загрузка…
        </div>
      )}
      {error !== null && !loading && (
        <div
          className={styles.status}
          data-testid="native-account-detail-error"
        >
          {error}
        </div>
      )}

      {account && !loading && (
        <>
          {/* Balance card */}
          <div
            className={styles.balanceCard}
            data-testid="native-account-balance"
          >
            <div className={styles.balanceLabel}>Баланс</div>
            <div className={styles.balanceAmount}>
              {formatMoneyNative(balanceCents)}
              <span className={styles.balanceCur}>₽</span>
            </div>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            <div className={styles.kpiRow}>
              <span className={styles.kpiLabel}>
                {`${monthLabel} · ${opsKpi.count} операций`}
              </span>
              <span className={styles.kpiValue}>
                {formatMoneyRubNative(opsKpi.sumCents)}
              </span>
            </div>
          </div>

          {/* Operations list */}
          <SectionHeader>Операции по счёту</SectionHeader>

          {actuals.length === 0 ? (
            <div className={styles.empty}>Нет операций по этому счёту</div>
          ) : (
            <InsetGroup>
              {actuals.map((tx) => {
                const cat = catById.get(tx.category_id);
                const catName = cat?.name ?? '—';
                const time = formatTimeHM(new Date(tx.created_at));

                // Sign is amount-driven (poster uses amount_cents sign): money
                // out → «−», income → «+» green. Mirrors the poster detail row.
                const isPositive = tx.amount_cents > 0;
                const sign = isPositive ? '+' : '−';
                const amountStr = `${sign}${formatMoneyNative(
                  Math.abs(tx.amount_cents),
                )} ₽`;
                const amountClass = isPositive
                  ? styles.amountPositive
                  : styles.amountNegative;

                return (
                  <InsetRow
                    key={tx.id}
                    testId={`native-account-detail-tx-${tx.id}`}
                    leading={<CategoryIcon name={catName} id={cat?.id} />}
                    title={
                      <span className={styles.rowTitle}>
                        {tx.description ?? catName}
                      </span>
                    }
                    subtitle={`${catName} · ${time}`}
                    trailing={
                      <span className={`${styles.amount} ${amountClass}`}>
                        {amountStr}
                      </span>
                    }
                    onClick={() => onTxRowTap(tx.id)}
                  />
                );
              })}
            </InsetGroup>
          )}
        </>
      )}
    </div>
  );
}

export const NativeAccountDetailView = memo(NativeAccountDetailViewInner);
