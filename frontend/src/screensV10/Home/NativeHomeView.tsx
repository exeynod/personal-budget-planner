// Liquid Glass v2 — native iOS Home view.
//
// Faithful port of the iOS MainShell Home (.planning/ios-native-screens/01-home.jpg):
//   - large title «Главная» + top-right circular «+»
//   - «Остаток на счёте» balance card with ПЛАН / ФАКТ / В ЗАПАСЕ stats
//   - Расходы / Доходы segmented control
//   - «Категории» inset-grouped list with SF-Symbol-style icons
//
// Pure presentational: HomeMount wires the data (same vm as the poster
// HomeView) + router handlers. The «+» uses the AddSheetHost context.

import { memo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { PeriodRead } from '../../api/types';
import type { CategoryAggregateRow } from './computeHomeData';
import {
  NativeLargeTitle,
  SectionHeader,
  InsetGroup,
  InsetRow,
  Segmented,
  CircleButton,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { PeriodSwitcher } from '../common';
import { useAddSheetHost } from '../native/AddSheetHost';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import styles from './NativeHomeView.module.css';

export interface NativeHomeViewProps {
  walletCents: number;
  expenseRows: CategoryAggregateRow[];
  incomeRows: CategoryAggregateRow[];
  onWalletTap: () => void;
  onCategoryTap: (id: number) => void;
  periods?: PeriodRead[];
  selectedPeriodId?: number | null;
  onSelectPeriod?: (id: number) => void;
}

function sumPlan(rows: CategoryAggregateRow[]): number {
  return rows.reduce((s, r) => s + r.plan_cents, 0);
}
function sumFact(rows: CategoryAggregateRow[]): number {
  return rows.reduce((s, r) => s + r.fact_cents, 0);
}

type Seg = 'expenses' | 'income';

function NativeHomeViewInner(props: NativeHomeViewProps) {
  const {
    walletCents,
    expenseRows,
    incomeRows,
    onWalletTap,
    onCategoryTap,
    periods,
    selectedPeriodId,
    onSelectPeriod,
  } = props;

  const { openAddSheet } = useAddSheetHost();
  const [seg, setSeg] = useState<Seg>('expenses');

  const rows = seg === 'expenses' ? expenseRows : incomeRows;

  // ПЛАН / ФАКТ / В ЗАПАСЕ are expense-scoped (mirrors the iOS Home header):
  // surplus = expense plan − expense fact (sign convention «+ = good»).
  const planTotalCents = sumPlan(expenseRows);
  const factTotalExpenseCents = sumFact(expenseRows);
  const surplusCents = planTotalCents - factTotalExpenseCents;
  const surplusPositive = surplusCents >= 0;

  const showSwitcher =
    !!periods &&
    periods.length >= 2 &&
    selectedPeriodId != null &&
    !!onSelectPeriod;

  return (
    <div className={styles.root}>
      <NativeLargeTitle
        title="Главная"
        trailing={
          <CircleButton
            onClick={openAddSheet}
            ariaLabel="Добавить транзакцию"
            testId="native-home-add"
          >
            <Plus size={20} weight="bold" />
          </CircleButton>
        }
      />

      {showSwitcher && (
        <div style={{ padding: '0 16px 4px' }}>
          <PeriodSwitcher
            periods={periods!}
            selectedId={selectedPeriodId!}
            onSelect={onSelectPeriod!}
          />
        </div>
      )}

      {/* Balance card */}
      <button
        type="button"
        className={styles.balanceCard}
        onClick={onWalletTap}
        data-testid="native-home-balance"
      >
        <div className={styles.balanceLabel}>Остаток на счёте</div>
        <div className={styles.balanceAmount}>
          {formatMoneyNative(walletCents)}
          <span className={styles.balanceCur}>₽</span>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.statCol}>
            <span className={styles.statLabel}>План</span>
            <span className={styles.statValue}>
              {formatMoneyNative(planTotalCents)}
            </span>
          </div>
          <div className={styles.statCol}>
            <span className={styles.statLabel}>Факт</span>
            <span className={styles.statValue}>
              {formatMoneyNative(factTotalExpenseCents)}
            </span>
          </div>
          <div className={`${styles.statCol} ${styles.statColEnd}`}>
            <span className={styles.statLabel}>В запасе</span>
            <span
              className={`${styles.statValue} ${
                surplusPositive ? styles.statPositive : styles.statNegative
              }`}
            >
              {formatSignedMoneyNative(surplusCents)}
            </span>
          </div>
        </div>
      </button>

      {/* Расходы / Доходы */}
      <div className={styles.segmentRow}>
        <Segmented<Seg>
          ariaLabel="Расходы или доходы"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'expenses', label: 'Расходы' },
            { value: 'income', label: 'Доходы' },
          ]}
        />
      </div>

      <SectionHeader>Категории</SectionHeader>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          {seg === 'expenses'
            ? 'Нет категорий расходов'
            : 'Нет категорий доходов'}
        </div>
      ) : (
        <InsetGroup>
          {rows.map((cat) => {
            const hasPlan = cat.plan_cents > 0;
            return (
              <InsetRow
                key={cat.id}
                testId={`native-home-category-${cat.id}`}
                leading={<CategoryIcon name={cat.name} id={cat.id} />}
                title={cat.name}
                subtitle={
                  hasPlan
                    ? `${formatMoneyNative(cat.fact_cents)} / ${formatMoneyNative(
                        cat.plan_cents,
                      )}`
                    : 'Без плана'
                }
                trailing={formatMoneyNative(cat.fact_cents)}
                chevron
                onClick={() => onCategoryTap(cat.id)}
              />
            );
          })}
        </InsetGroup>
      )}
    </div>
  );
}

export const NativeHomeView = memo(NativeHomeViewInner);
