// Liquid Glass v2 — native iOS Plan (План месяца) view.
//
// ONE surface (owner mockup refs #21-23): «План месяца» merges per-category
// limits + recurring obligations + month plan into a single screen. The old
// dualism («Шаблон бюджета» + «План месяца» + per-category «Детализация»
// disclosures) is gone — recurring obligations in «Регулярные платежи».
//
// The overview rows are COMPACT READ-ONLY summaries (no inline edit, no «+»):
// tap a row to drill into its per-category planned detail, where the EXPENSE
// limit is edited and planned rows are added.
//
// Structure (expense segment, top → bottom):
//   - NativeNavBar «План месяца» + back
//   - Расходы / Доходы segment
//   - «Осталось распределить» card: big signed value + status badge
//     («ок» green / «Превышено» red) + progress-bar «X из Y» (Σ limits из дохода)
//   - «Регулярные платежи»: subscriptions + recurring planned, each row =
//     icon · name · «N июня» · amount · «✓ Оплачено» (posted) / «Отметить» (post)
//   - «Категории»: each row = icon · name · summary
//       expense → «Лимит X / Запланировано Y»
//       income  → «Запланировано Y» (no limit/plan-target)
//     · chevron — whole row taps into the per-category planned detail.
//
// Editing reuses the SAME handlers PlanMount feeds (onPostRegular/onUnpostRegular
// post/unpost). Limit edit + plan add live in the per-category detail now.

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle, CaretRight } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  Segmented,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import type { CategoryV10 } from '../../api/v10';
import type { PlanMonthItem } from '../../api/types';
import type { RegularRow, DistributeProgress } from './computePlan';
import { formatRegularDate } from './computePlan';
import styles from './NativePlanView.module.css';

// ─────────── Props ───────────

export interface NativePlanViewProps {
  incomeCents: number;
  /** EXPENSE categories (income split out into `incomeCategories`). */
  categories: CategoryV10[];
  /** INCOME categories — planned (expected) amount, never a «лимит». */
  incomeCategories?: CategoryV10[];
  /** Σ income category plans («Запланировано дохода» summary). */
  incomePlannedCents?: number;
  /** Σ posted income planned rows («Получено» summary). */
  incomeReceivedCents?: number;
  plans: PlanMonthItem[];
  /**
   * Σ of UNPOSTED planned rows per category id («Запланировано» / what the
   * detail calls «Расписано»). Drives the read-only overview summary line.
   */
  scheduledByCat: Map<number, number>;
  /** Combined recurring obligations (subscriptions + recurring planned). */
  regulars: RegularRow[];
  surplusCents: number;
  isOverflow: boolean;
  /** «Осталось распределить» progress (Σ expense limits / income). */
  progress: DistributeProgress;
  /** Period ISO start `YYYY-MM-DD` — drives the «N июня» regular date label. */
  periodStart?: string | null;
  saveError: string | null;
  focusCategoryId?: number | null;

  /** Mark a regular obligation as paid (post to fact). */
  onPostRegular: (row: RegularRow) => void;
  /** Undo a regular obligation's posting. */
  onUnpostRegular: (row: RegularRow) => void;
  /** Drill into a category's planned-transaction detail (push). */
  onCategoryTap: (categoryId: number) => void;
  onBack: () => void;
}

// ─────────── Component ───────────

type Seg = 'expenses' | 'income';

function NativePlanViewInner(props: NativePlanViewProps) {
  const {
    categories,
    incomeCategories = [],
    incomePlannedCents = 0,
    incomeReceivedCents = 0,
    plans,
    scheduledByCat,
    regulars,
    surplusCents,
    isOverflow,
    progress,
    periodStart = null,
    saveError,
    focusCategoryId,
    onPostRegular,
    onUnpostRegular,
    onCategoryTap,
    onBack,
  } = props;

  // Расходы / Доходы segment (mirrors the Home segmented control).
  const [seg, setSeg] = useState<Seg>('expenses');

  const focusRowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusCategoryId != null && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [focusCategoryId]);

  const planByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));

  // ── Compact READ-ONLY category row: icon + name + summary line + chevron.
  //    The WHOLE row taps into the per-category planned detail (where the limit
  //    is edited and planned rows are added). No inline input, no «+».
  //      expense → «Лимит X · Запланировано Y»
  //      income  → «Запланировано Y» (income has NO limit/plan-target). ──
  function renderCategoryRow(c: CategoryV10) {
    const isIncome = c.kind === 'income';
    const planCents = planByCat.get(c.id) ?? c.plan_cents ?? 0;
    const scheduledCents = scheduledByCat.get(c.id) ?? 0;
    const focused = focusCategoryId === c.id;
    return (
      <button
        key={c.id}
        type="button"
        ref={focused ? focusRowRef : undefined}
        className={`${styles.catRow} ${focused ? styles.catRowFocused : ''}`}
        onClick={() => onCategoryTap(c.id)}
        data-testid={`native-plan-cat-${c.id}`}
      >
        <CategoryIcon name={c.name} id={c.id} />
        <span className={styles.catMain}>
          <span className={styles.catName}>{c.name}</span>
          <span
            className={styles.catSummary}
            data-testid={`native-plan-cat-summary-${c.id}`}
          >
            {isIncome
              ? `Запланировано ${formatMoneyNative(scheduledCents)} ₽`
              : `Лимит ${formatMoneyNative(planCents)} ₽ · Запланировано ${formatMoneyNative(scheduledCents)} ₽`}
          </span>
        </span>
        <span className={styles.catChevron} aria-hidden="true">
          <CaretRight size={16} weight="bold" />
        </span>
      </button>
    );
  }

  // ── Regular obligation row (icon · name · date · amount · status). ──
  function renderRegularRow(r: RegularRow): ReactNode {
    return (
      <div
        key={r.key}
        className={styles.regularRow}
        data-testid={`native-plan-regular-${r.key}`}
      >
        <CategoryIcon name={r.categoryName} id={r.categoryId} />
        <span className={styles.regularMain}>
          <span className={styles.regularName}>{r.name}</span>
          <span className={styles.regularDate}>
            {formatRegularDate(r.dayOfMonth, periodStart)}
          </span>
        </span>
        <span className={styles.regularTrailing}>
          <span className={styles.regularAmount}>
            {formatMoneyNative(r.amountCents)} ₽
          </span>
          {r.posted ? (
            <button
              type="button"
              className={styles.regularPaid}
              onClick={() => onUnpostRegular(r)}
              data-testid={`native-plan-regular-cta-${r.key}`}
            >
              <CheckCircle size={14} weight="fill" />
              Оплачено
            </button>
          ) : (
            <button
              type="button"
              className={styles.regularMark}
              onClick={() => onPostRegular(r)}
              data-testid={`native-plan-regular-cta-${r.key}`}
            >
              Отметить
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <NativeNavBar title="План месяца" onBack={onBack} />

      {/* ───── Расходы / Доходы segment ───── */}
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

      {seg === 'expenses' ? (
        // ───────── Расходы segment ─────────
        <>
          {/* «Осталось распределить» card: value + badge + progress bar */}
          <div
            className={`${styles.surplusCard} ${
              isOverflow ? styles.surplusOver : styles.surplusOk
            }`}
            data-testid="native-plan-surplus"
          >
            <div className={styles.surplusHead}>
              <span className={styles.surplusLabel}>Осталось распределить</span>
              <span
                className={`${styles.surplusBadge} ${
                  isOverflow ? styles.badgeOver : styles.badgeOk
                }`}
              >
                {isOverflow ? (
                  'Превышено'
                ) : (
                  <>
                    <CheckCircle size={13} weight="fill" />
                    ок
                  </>
                )}
              </span>
            </div>
            <div className={styles.surplusValue}>
              {formatSignedMoneyNative(surplusCents)} ₽
            </div>
            <div className={styles.progressRow}>
              <span
                className={styles.progressTrack}
                data-testid="native-plan-progress"
              >
                <span
                  className={`${styles.progressFill} ${
                    isOverflow ? styles.progressFillOver : ''
                  }`}
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </span>
              <span className={styles.progressCaption}>
                {formatMoneyNative(progress.distributedCents)} из{' '}
                {formatMoneyNative(progress.totalCents)}
              </span>
            </div>
          </div>

          {/* regulars block */}
          <SectionHeader>Регулярные платежи</SectionHeader>
          {regulars.length === 0 ? (
            <div className={styles.empty}>
              Нет регулярных платежей в этом месяце.
            </div>
          ) : (
            <InsetGroup>{regulars.map(renderRegularRow)}</InsetGroup>
          )}

          {/* expense categories — read-only summary; tap a row to drill into its
              planned detail (limit edit + plan add live there). */}
          <SectionHeader>Категории</SectionHeader>
          <InsetGroup>{categories.map((c) => renderCategoryRow(c))}</InsetGroup>

          {saveError && (
            <div
              className={styles.errorMsg}
              data-testid="native-plan-save-error"
            >
              {saveError}
            </div>
          )}
        </>
      ) : (
        // ───────── Доходы segment ─────────
        // No «лимит»/«план»/«осталось распределить»/«превышено». Income has no
        // limit/plan-target — only plan detailing (Σ запланировано / получено);
        // delta = Факт − План (больше = хорошо).
        <>
          {/* calm income summary — Запланировано / Получено (no surplus chrome) */}
          <div
            className={`${styles.surplusCard} ${styles.incomeSummary}`}
            data-testid="native-plan-income-summary"
          >
            <div className={styles.incomeSummaryRow}>
              <span className={styles.incomeSummaryCol}>
                <span className={styles.surplusLabel}>
                  Запланировано дохода
                </span>
                <span className={styles.surplusValue}>
                  {formatMoneyNative(incomePlannedCents)} ₽
                </span>
              </span>
              <span className={styles.incomeSummaryCol}>
                <span className={styles.surplusLabel}>Получено</span>
                <span className={styles.surplusValue}>
                  {formatMoneyNative(incomeReceivedCents)} ₽
                </span>
              </span>
            </div>
          </div>

          {/* income categories — read-only «Запланировано» summary (NO limit /
              plan-target); tap a row to drill into its planned detail. */}
          <SectionHeader>Категории</SectionHeader>
          {incomeCategories.length === 0 ? (
            <div className={styles.empty}>Нет категорий доходов.</div>
          ) : (
            <InsetGroup>
              {incomeCategories.map((c) => renderCategoryRow(c))}
            </InsetGroup>
          )}

          {saveError && (
            <div
              className={styles.errorMsg}
              data-testid="native-plan-save-error"
            >
              {saveError}
            </div>
          )}

          <div className={styles.footnote}>
            Доход планируется операциями: добавьте ожидаемые поступления в
            категорию. Когда поступление приходит, проведите его в факт.
          </div>
        </>
      )}
    </div>
  );
}

export const NativePlanView = memo(NativePlanViewInner);
