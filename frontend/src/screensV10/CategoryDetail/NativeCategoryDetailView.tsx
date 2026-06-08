// Liquid Glass v2 — native iOS CategoryDetail view (pushed detail).
//
// Faithful port of the iOS MainShell category drill-down. Mirrors EVERY data
// point and handler of the poster CategoryDetailView (no invented controls):
//   - NativeNavBar with the category name + back chevron (pushed detail).
//   - Summary card: CategoryIcon + plan / fact / «в запасе» stat row (same
//     План−Факт surplus the poster computes) + a CSS progress bar reusing the
//     exact computeBarSegments ratio (capped 100%, over-budget tick).
//   - CTA: «Добавить транзакцию» (opens the Add sheet pre-selected to this
//     category — fact/expense add).
//   - SectionHeader + InsetGroup of this category's operations, day-grouped,
//     each row: CategoryIcon + UPPERCASE name + time/desc + signed amount
//     (income «+» green, expense «−» ink — kind-driven, like NativeTransactions).
//   - Empty state when there are no operations.
//
// Pure presentational: CategoryDetailMount wires the same props the poster view
// receives. No data logic duplicated — fact/percent/bar use the shared
// compute* helpers; day-grouping reuses Transactions/groupByDay.

import { memo } from 'react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import { formatTimeHM } from '../common/format';
import { groupByDay } from '../Transactions/computeTransactions';
import {
  computeBarSegments,
  computeFactForCategory,
  filterActualsForCategory,
} from './computeCategoryDetail';
import type { ActualV10Read, CategoryV10 } from '../../api/v10';
import styles from './NativeCategoryDetailView.module.css';

// ─────────────────── Props (mirror poster CategoryDetailView) ───────────────────

export interface NativeCategoryDetailViewProps {
  category: CategoryV10;
  actuals: ActualV10Read[];
  /**
   * v1.1 plan↔fact ladder — Σ of UNPOSTED planned amount for this category
   * (manual + template, excludes posted + subscription_auto; anti-double-count
   * applied upstream). Rendered as the «Расписано» level between Лимит and
   * Факт. Defaults to 0.
   */
  plannedUnpostedCents?: number;
  /** Reference date for day labels (defaults to `new Date()`). */
  today?: Date;

  /**
   * Open the Add sheet pre-selected to this category («Добавить транзакцию» —
   * fact/expense add for this category).
   */
  onAddTransaction: (categoryId: number) => void;
  /** Pop the router stack (back chevron). */
  onBack: () => void;
}

// ─────────────────── Component ───────────────────

function NativeCategoryDetailViewInner(props: NativeCategoryDetailViewProps) {
  const {
    category,
    actuals,
    plannedUnpostedCents = 0,
    today = new Date(),
    onAddTransaction,
    onBack,
  } = props;

  // 4-level plan↔fact ladder: Лимит (per-period limit) / Расписано (Σ unposted
  // planned for this category) / Факт (realised) / В запасе (Лимит − Факт).
  const planCents = category.plan_cents ?? 0;
  const factCents = computeFactForCategory(actuals, category.id);
  const isOver = factCents > planCents;

  // «В запасе» = Лимит − Факт (sign convention «+ = good»; same value the poster
  // surfaces beneath the bar as «осталось» / «over»).
  const surplusCents = planCents - factCents;
  const surplusPositive = surplusCents >= 0;

  const segments = computeBarSegments(factCents, planCents);
  const fillPct = Math.round(segments.fillRatio * 100);

  const ownActuals = filterActualsForCategory(actuals, category.id);
  const dayGroups = groupByDay(ownActuals, today);

  return (
    <div className={styles.root}>
      <NativeNavBar title={category.name} onBack={onBack} />

      {/* ─────────── Summary card ─────────── */}
      <div className={styles.summaryCard} data-testid="native-cat-summary">
        <div className={styles.summaryHead}>
          <CategoryIcon name={category.name} id={category.id} size={36} />
          <div className={styles.summaryHeadText}>
            <div className={styles.summaryName}>{category.name}</div>
            <div className={styles.summaryFact}>
              {formatMoneyNative(factCents)}
              <span className={styles.summaryCur}>₽</span>
            </div>
          </div>
        </div>

        {/* 4-level ladder: Лимит / Расписано / Факт / В запасе (mirrors NativeHomeView). */}
        <div className={styles.statsRow} data-testid="native-cat-ladder">
          <div className={styles.statCol}>
            <span className={styles.statLabel}>Лимит</span>
            <span className={styles.statValue}>
              {formatMoneyNative(planCents)}
            </span>
          </div>
          <div className={styles.statCol}>
            <span className={styles.statLabel}>Расписано</span>
            <span className={styles.statValue} data-testid="native-cat-planned">
              {formatMoneyNative(plannedUnpostedCents)}
            </span>
          </div>
          <div className={styles.statCol}>
            <span className={styles.statLabel}>Факт</span>
            <span className={styles.statValue}>
              {formatMoneyNative(factCents)}
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

        {/* Limit progress bar — fill width = ФАКТ/Лимит ratio (computeBarSegments,
            capped 100%); red-tinted when over Лимит. Empty (Факт 0) → no sliver. */}
        <div className={styles.barTrack}>
          <div
            data-testid="native-cat-bar-fill"
            className={`${styles.barFill} ${isOver ? styles.barFillOver : ''} ${
              fillPct === 0 ? styles.barFillEmpty : ''
            }`}
            style={{ width: `${fillPct}%` }}
          />
          {segments.tickAt !== undefined && (
            <div
              data-testid="native-cat-bar-tick"
              className={styles.barTick}
              style={{ left: `${(segments.tickAt * 100).toFixed(2)}%` }}
            />
          )}
        </div>
      </div>

      {/* ─────────── CTA row ─────────── */}
      <div className={styles.ctaRow}>
        <button
          type="button"
          className={styles.ctaPrimary}
          data-testid="native-cat-raise-limit"
          onClick={() => onAddTransaction(category.id)}
        >
          Добавить транзакцию
        </button>
      </div>

      {/* ─────────── Operations list ─────────── */}
      <SectionHeader>Операции по категории</SectionHeader>

      {dayGroups.length === 0 ? (
        <div className={styles.empty} data-testid="native-cat-empty">
          Операций пока нет
        </div>
      ) : (
        dayGroups.map((group) => (
          <div key={group.dateKey} className={styles.dayGroup}>
            <div className={styles.dayHeaderRow}>
              <SectionHeader>{group.dateLabel}</SectionHeader>
              <span className={styles.daySum}>
                {`${formatMoneyNative(group.sumCents)} ₽`}
              </span>
            </div>

            <InsetGroup>
              {group.rows.map((tx) => {
                // Sign is kind-driven (wire amount_cents is a positive
                // magnitude): income → «+ …» green, money-out → «− …» ink.
                // Mirrors NativeTransactionsView exactly.
                const isIncome = tx.kind === 'income';
                const sign = isIncome ? '+' : '−';
                const amountStr = `${sign}${formatMoneyNative(
                  Math.abs(tx.amount_cents),
                )} ₽`;
                const amountClass = isIncome
                  ? styles.amountPositive
                  : styles.amountNegative;

                return (
                  <InsetRow
                    key={tx.id}
                    testId={`native-cat-tx-row-${tx.id}`}
                    leading={
                      <CategoryIcon name={category.name} id={category.id} />
                    }
                    title={
                      <span className={styles.catName}>{category.name}</span>
                    }
                    subtitle={
                      tx.description ?? formatTimeHM(new Date(tx.created_at))
                    }
                    trailing={
                      <span className={`${styles.amount} ${amountClass}`}>
                        {amountStr}
                      </span>
                    }
                  />
                );
              })}
            </InsetGroup>
          </div>
        ))
      )}
    </div>
  );
}

export const NativeCategoryDetailView = memo(NativeCategoryDetailViewInner);
