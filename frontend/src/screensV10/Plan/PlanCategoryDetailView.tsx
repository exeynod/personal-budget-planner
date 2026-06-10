// Liquid Glass v2 — native iOS per-category PLANNED detail (pushed from Plan).
//
// The plan-side mirror of NativeCategoryDetailView (the fact-side drill-down):
//   - NativeNavBar with the category name + back chevron.
//   - Summary card: CategoryIcon + plan ladder.
//       expense → Лимит / Расписано / Свободно (computeLadder) + inline limit edit
//       income  → Запланировано (computeIncomeLadder) — NO limit/target, and
//                 NO «Получено» (received-fact lives on the fact/home side)
//   - CTA: «Добавить в план» (shared AddSheet, plan mode, this category).
//   - SectionHeader + InsetGroup of this category's PLANNED rows, day-grouped
//     by planned_date, each row: CategoryIcon + title + date/«Без даты» +
//     amount + «✓ Проведено» (posted) badge.
//   - Empty state when there are no planned rows.
//
// The EXPENSE «Лимит» edit lives here (moved off the overview): an inline ₽
// input that autosaves on blur / Enter → PATCH /plan-month (onLimitCommit). A
// successful save reloads the detail via the mount's refetch-token. Income has
// NO limit/plan-target — never shown, never sent.
//
// Pure presentational: PlanCategoryDetailMount wires the props. All math lives
// in computePlanDetail.ts (computeLadder / computeIncomeLadder / day grouping).

import { memo, useState } from 'react';
import { Plus, CheckCircle, ArrowsClockwise } from '@phosphor-icons/react';
import { PosterSheet } from '../common';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
  useScrollIntoViewOnFocus,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import {
  formatMoneyNative,
  formatSignedMoneyNative,
  centsToRublesInput,
} from '../native/money';
import { parseRublesToKopecksOr0 } from '../../utils/parseMoney';
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
  /**
   * Commit this EXPENSE category's limit (blur / Enter) → PATCH /plan-month.
   * Income categories have no limit and never receive this prop.
   */
  onLimitCommit?: (catId: number, cents: number) => void;
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
  const {
    category,
    planned,
    today = new Date(),
    onAddPlanned,
    onLimitCommit,
    onBack,
  } = props;

  // Tapping a recurring (subscription_auto) row opens a non-editable note
  // instead of an edit sheet — recurring rows are managed in the template.
  const [recurringNoteOpen, setRecurringNoteOpen] = useState(false);
  // Bug fix B: keep the focused «Лимит» field above the iPhone keyboard.
  const limitFocusScroll = useScrollIntoViewOnFocus();

  const isIncome = category.kind === 'income';
  // Expense «лимит» (income has NO limit/plan target — never read plan_cents).
  const planCents = category.plan_cents ?? 0;

  // Per-category detail rows (manual + subscription), already filtered to this
  // category by the mount; groupPlannedByCategory normalises the shape.
  const rows = groupPlannedByCategory(planned).get(category.id) ?? [];

  // Ladder differs by kind: expense is capped («Свободно»), income is purely
  // descriptive («Запланировано» — no target, no «Получено» on the plan). Both
  // reuse the shared compute helpers.
  const expenseLadder = isIncome ? null : computeLadder(planCents, rows);
  const incomeLadder = isIncome ? computeIncomeLadder(rows) : null;

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
            {/* Hero number: expense → лимит; income → Σ запланировано (income has
                no limit/plan-target, so we surface the detailed amount instead). */}
            <div className={styles.summaryFact}>
              {formatMoneyNative(
                isIncome ? (incomeLadder?.scheduledCents ?? 0) : planCents,
              )}
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
            // Income: NO «План»/limit/target column, and this is the PLAN
            // surface — «Получено» (the fact of received income) lives on the
            // fact/home side, not here. We show only «Запланировано» (Σ planned
            // income for the category).
            <div className={styles.statCol}>
              <span className={styles.statLabel}>Запланировано</span>
              <span className={`${styles.statValue} ${styles.statPositive}`}>
                {formatMoneyNative(incomeLadder.scheduledCents)}
              </span>
            </div>
          )}
        </div>

        {/* Inline «Лимит» edit (EXPENSE only) — autosaves on blur / Enter →
            PATCH /plan-month. Income has no limit, so this never renders. */}
        {!isIncome && onLimitCommit && (
          <div className={styles.limitEditRow}>
            <span className={styles.limitEditLabel}>Лимит</span>
            <span className={styles.limitInputWrap}>
              <input
                type="text"
                inputMode="decimal"
                className={styles.limitInput}
                defaultValue={centsToRublesInput(planCents, {
                  emptyOnZero: false,
                })}
                key={planCents}
                onFocus={limitFocusScroll.onFocus}
                onBlur={(e) => {
                  limitFocusScroll.onBlur();
                  onLimitCommit(
                    category.id,
                    parseRublesToKopecksOr0(e.target.value),
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onLimitCommit(
                      category.id,
                      parseRublesToKopecksOr0(e.currentTarget.value),
                    );
                    e.currentTarget.blur();
                  }
                }}
                aria-label={`Лимит для «${category.name}» в рублях`}
                data-testid={`native-plan-cat-limit-input-${category.id}`}
              />
              <span className={styles.limitCur}>₽</span>
            </span>
          </div>
        )}
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
                    title={
                      <span className={styles.catName}>
                        {r.isRecurring && (
                          <ArrowsClockwise
                            size={13}
                            weight="bold"
                            className={styles.recurringBadge}
                            data-testid={`native-plan-cat-recurring-${r.id}`}
                          />
                        )}
                        {r.title}
                      </span>
                    }
                    subtitle={
                      r.posted ? (
                        <span className={styles.postedTag}>
                          <CheckCircle size={13} weight="fill" />
                          {isIncome ? 'Получено' : 'Проведено'}
                        </span>
                      ) : r.isRecurring ? (
                        'Регулярный платёж'
                      ) : (
                        category.name
                      )
                    }
                    trailing={
                      <span className={`${styles.amount} ${amountClass}`}>
                        {amountStr}
                      </span>
                    }
                    // Recurring rows are read-only here: tapping shows a note,
                    // not an edit sheet. Manual rows stay static (no onClick).
                    onClick={
                      r.isRecurring
                        ? () => setRecurringNoteOpen(true)
                        : undefined
                    }
                  />
                );
              })}
            </InsetGroup>
          </div>
        ))
      )}

      {/* Non-editable note for a recurring (↻) row — managed in the template. */}
      <PosterSheet
        isOpen={recurringNoteOpen}
        onClose={() => setRecurringNoteOpen(false)}
        testId="native-plan-recurring-note"
      >
        <div className={styles.recurringNote}>
          <span className={styles.recurringNoteIcon} aria-hidden="true">
            <ArrowsClockwise size={26} weight="bold" />
          </span>
          <div className={styles.recurringNoteTitle}>Регулярный платёж</div>
          <div className={styles.recurringNoteText}>
            Это регулярный платёж — измените его в шаблоне или настройках.
          </div>
          <button
            type="button"
            className={styles.recurringNoteBtn}
            onClick={() => setRecurringNoteOpen(false)}
          >
            Понятно
          </button>
        </div>
      </PosterSheet>
    </div>
  );
}

export const PlanCategoryDetailView = memo(PlanCategoryDetailViewInner);
