// Liquid Glass v2 — native iOS per-category PLANNED detail (pushed from Plan).
//
// The plan-side mirror of NativeCategoryDetailView (the fact-side drill-down):
//   - NativeNavBar with the category name + back chevron.
//   - Summary card: CategoryIcon + plan ladder.
//       expense → Лимит / Расписано / Свободно (computeLadder)
//       income  → План / Запланировано / Получено (computeIncomeLadder)
//   - CTA: «Добавить в план» (shared AddSheet, plan mode, this category).
//   - SectionHeader + InsetGroup of this category's PLANNED rows, day-grouped
//     by planned_date, each row: CategoryIcon + title + date/«Без даты» +
//     amount + «✓ Проведено» (posted) badge.
//   - Empty state when there are no planned rows.
//
// Pure presentational: PlanCategoryDetailMount wires the props. All math lives
// in computePlanDetail.ts (computeLadder / computeIncomeLadder / day grouping).

import { memo } from 'react';
import { Plus, CheckCircle } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import { formatDay } from '../common/format';
import {
  computeLadder,
  computeIncomeLadder,
  groupPlannedByCategory,
  groupPlannedRowsByDay,
} from './computePlanDetail';
import type { CategoryV10, PlannedV11Read } from '../../api/v10';
import styles from './PlanCategoryDetailView.module.css';

// ─────────────────── Props ───────────────────

export interface PlanCategoryDetailViewProps {
  category: CategoryV10;
  /** This category's planned rows for the period (manual + subscription). */
  planned: PlannedV11Read[];
  /** Reference date for day labels (defaults to `new Date()`). */
  today?: Date;

  /** Add a planned row to THIS category (shared AddSheet, plan mode). */
  onAddPlanned: (categoryId: number) => void;
  /** Pop the router stack (back chevron). */
  onBack: () => void;
}

/** ISO `YYYY-MM-DD` → LOCAL-midnight Date (mirrors Transactions/groupByDay). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─────────────────── Component ───────────────────

function PlanCategoryDetailViewInner(props: PlanCategoryDetailViewProps) {
  const { category, planned, today = new Date(), onAddPlanned, onBack } = props;

  const isIncome = category.kind === 'income';
  const planCents = category.plan_cents ?? 0;

  // Per-category detail rows (manual + subscription), already filtered to this
  // category by the mount; groupPlannedByCategory normalises the shape.
  const rows = groupPlannedByCategory(planned).get(category.id) ?? [];

  // Ladder differs by kind: expense is capped («Свободно»), income is expected
  // («Получено»). Both reuse the shared compute helpers.
  const expenseLadder = isIncome ? null : computeLadder(planCents, rows);
  const incomeLadder = isIncome ? computeIncomeLadder(planCents, rows) : null;

  const dayGroups = groupPlannedRowsByDay(rows, (iso) =>
    formatDay(parseLocalDate(iso), today),
  );

  return (
    <div className={styles.root}>
      <NativeNavBar title={category.name} onBack={onBack} />

      {/* ─────────── Summary card ─────────── */}
      <div className={styles.summaryCard} data-testid="native-plan-cat-summary">
        <div className={styles.summaryHead}>
          <CategoryIcon name={category.name} id={category.id} size={36} />
          <div className={styles.summaryHeadText}>
            <div className={styles.summaryName}>{category.name}</div>
            <div className={styles.summaryFact}>
              {formatMoneyNative(planCents)}
              <span className={styles.summaryCur}>₽</span>
            </div>
          </div>
        </div>

        {/* Plan ladder. */}
        <div className={styles.statsRow} data-testid="native-plan-cat-ladder">
          {expenseLadder && (
            <>
              <div className={styles.statCol}>
                <span className={styles.statLabel}>Лимит</span>
                <span className={styles.statValue}>
                  {formatMoneyNative(expenseLadder.limitCents)}
                </span>
              </div>
              <div className={styles.statCol}>
                <span className={styles.statLabel}>Расписано</span>
                <span className={styles.statValue}>
                  {formatMoneyNative(expenseLadder.scheduledCents)}
                </span>
              </div>
              <div className={`${styles.statCol} ${styles.statColEnd}`}>
                <span className={styles.statLabel}>Свободно</span>
                <span
                  className={`${styles.statValue} ${
                    expenseLadder.overflow
                      ? styles.statNegative
                      : styles.statPositive
                  }`}
                >
                  {formatSignedMoneyNative(expenseLadder.freeCents)}
                </span>
              </div>
            </>
          )}
          {incomeLadder && (
            <>
              <div className={styles.statCol}>
                <span className={styles.statLabel}>План</span>
                <span className={styles.statValue}>
                  {formatMoneyNative(incomeLadder.planCents)}
                </span>
              </div>
              <div className={styles.statCol}>
                <span className={styles.statLabel}>Запланировано</span>
                <span className={styles.statValue}>
                  {formatMoneyNative(incomeLadder.scheduledCents)}
                </span>
              </div>
              <div className={`${styles.statCol} ${styles.statColEnd}`}>
                <span className={styles.statLabel}>Получено</span>
                <span
                  className={`${styles.statValue} ${
                    incomeLadder.overReceived ? styles.statPositive : ''
                  }`}
                >
                  {formatMoneyNative(incomeLadder.receivedCents)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─────────── CTA row ─────────── */}
      <div className={styles.ctaRow}>
        <button
          type="button"
          className={styles.ctaPrimary}
          data-testid="native-plan-cat-add"
          onClick={() => onAddPlanned(category.id)}
        >
          <Plus size={17} weight="bold" />
          Добавить в план
        </button>
      </div>

      {/* ─────────── Planned rows list ─────────── */}
      <SectionHeader>Запланированные операции</SectionHeader>

      {dayGroups.length === 0 ? (
        <div className={styles.empty} data-testid="native-plan-cat-empty">
          Запланированных операций пока нет
        </div>
      ) : (
        dayGroups.map((group) => (
          <div key={group.dateKey || 'no-date'} className={styles.dayGroup}>
            <div className={styles.dayHeaderRow}>
              <SectionHeader>{group.dateLabel}</SectionHeader>
              <span className={styles.daySum}>
                {`${formatMoneyNative(group.sumCents)} ₽`}
              </span>
            </div>

            <InsetGroup>
              {group.rows.map((r) => {
                const sign = isIncome ? '+' : '−';
                const amountStr = `${sign}${formatMoneyNative(r.amountCents)} ₽`;
                const amountClass = isIncome
                  ? styles.amountPositive
                  : styles.amountNegative;
                return (
                  <InsetRow
                    key={r.id}
                    testId={`native-plan-cat-row-${r.id}`}
                    leading={
                      <CategoryIcon name={category.name} id={category.id} />
                    }
                    title={<span className={styles.catName}>{r.title}</span>}
                    subtitle={
                      r.posted ? (
                        <span className={styles.postedTag}>
                          <CheckCircle size={13} weight="fill" />
                          {isIncome ? 'Получено' : 'Проведено'}
                        </span>
                      ) : (
                        category.name
                      )
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

export const PlanCategoryDetailView = memo(PlanCategoryDetailViewInner);
