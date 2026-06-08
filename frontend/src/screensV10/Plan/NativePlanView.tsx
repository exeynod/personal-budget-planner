// Liquid Glass v2 — native iOS Plan (План месяца) view.
//
// ONE surface (owner mockup refs #21-23): «План месяца» merges per-category
// limits + recurring obligations + month plan into a single screen. The old
// dualism («Шаблон бюджета» + «План месяца» + per-category «Детализация»
// disclosures) is gone — limits live inline in «Категории», recurring
// obligations in «Регулярные платежи».
//
// Structure (expense segment, top → bottom):
//   - NativeNavBar «План месяца» + back
//   - Расходы / Доходы segment
//   - «Осталось распределить» card: big signed value + status badge
//     («ок» green / «Превышено» red) + progress-bar «X из Y» (Σ limits из дохода)
//   - «Регулярные платежи»: subscriptions + recurring planned, each row =
//     icon · name · «N июня» · amount · «✓ Оплачено» (posted) / «Отметить» (post)
//   - «Категории» (header carries «+ Добавить» accent action): icon · name ·
//     inline ₽ limit (auto-saves on blur / Enter)
//   - global «+ Добавить в план» (shared AddSheet, plan mode)
//
// All editing reuses the SAME handlers PlanMount feeds (onSliderChange live
// draft, onLimitCommit autosave PATCH, onPostRegular/onUnpostRegular post/unpost).

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, CheckCircle } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  SectionHeaderAction,
  InsetGroup,
  Segmented,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { useAddSheetHost } from '../native/AddSheetHost';
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

  /** Live draft edit (controlled input) — updates local surplus/progress only. */
  onSliderChange: (catId: number, cents: number) => void;
  /** Commit one category's limit (blur / Enter) → PATCH /plan-month, autosave. */
  onLimitCommit: (catId: number, cents: number) => void;
  /** Mark a regular obligation as paid (post to fact). */
  onPostRegular: (row: RegularRow) => void;
  /** Undo a regular obligation's posting. */
  onUnpostRegular: (row: RegularRow) => void;
  onBack: () => void;
}

// ─────────── Inline rubles → cents parsing (IDENTICAL semantics to slider) ───────────
function rublesInputToCents(raw: string): number {
  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return 0;
  const rub = Number.parseFloat(cleaned);
  if (!Number.isFinite(rub) || rub < 0) return 0;
  return Math.round(rub * 100);
}

/** Cents → editable rubles string for the input value (no ₽, no grouping). */
function centsToRublesInput(cents: number): string {
  const abs = Math.max(0, Math.trunc(cents));
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return kop === 0 ? `${rub}` : `${rub},${kop.toString().padStart(2, '0')}`;
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
    regulars,
    surplusCents,
    isOverflow,
    progress,
    periodStart = null,
    saveError,
    focusCategoryId,
    onSliderChange,
    onLimitCommit,
    onPostRegular,
    onUnpostRegular,
    onBack,
  } = props;

  // Расходы / Доходы segment (mirrors the Home segmented control).
  const [seg, setSeg] = useState<Seg>('expenses');

  // Single global «+»: opens the SAME AddSheet as Home, in plan mode (category
  // chosen inside the sheet).
  const { openAddSheet } = useAddSheetHost();

  const focusRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focusCategoryId != null && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [focusCategoryId]);

  const planByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));

  // ── Shared category row (icon + name + inline plan/limit input). ──
  function renderCategoryRow(c: CategoryV10, label: string) {
    const planCents = planByCat.get(c.id) ?? c.plan_cents ?? 0;
    const focused = focusCategoryId === c.id;
    return (
      <div
        key={c.id}
        ref={focused ? focusRowRef : undefined}
        className={`${styles.catRow} ${focused ? styles.catRowFocused : ''}`}
        data-testid={`native-plan-cat-${c.id}`}
      >
        <div className={styles.catTop}>
          <CategoryIcon name={c.name} id={c.id} />
          <span className={styles.catName}>{c.name}</span>
          <span className={styles.catInputWrap}>
            <input
              type="text"
              inputMode="decimal"
              className={styles.catInput}
              value={centsToRublesInput(planCents)}
              onChange={(e) =>
                onSliderChange(c.id, rublesInputToCents(e.target.value))
              }
              onBlur={(e) =>
                onLimitCommit(c.id, rublesInputToCents(e.target.value))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onLimitCommit(
                    c.id,
                    rublesInputToCents(e.currentTarget.value),
                  );
                  e.currentTarget.blur();
                }
              }}
              aria-label={`${label} для «${c.name}» в рублях`}
              data-testid={`native-plan-input-${c.id}`}
            />
            <span className={styles.catCur}>₽</span>
          </span>
        </div>
      </div>
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

          {/* expense categories — header «+ Добавить» + inline «Лимит» edit */}
          <SectionHeader
            trailing={
              <SectionHeaderAction
                onClick={() => openAddSheet('plan')}
                testId="native-plan-cat-add"
              >
                <Plus size={15} weight="bold" />
                Добавить
              </SectionHeaderAction>
            }
          >
            Категории
          </SectionHeader>
          <InsetGroup>
            {categories.map((c) => renderCategoryRow(c, 'Лимит'))}
          </InsetGroup>

          {saveError && (
            <div
              className={styles.errorMsg}
              data-testid="native-plan-save-error"
            >
              {saveError}
            </div>
          )}

          {/* single global «+ Добавить в план» (expense plan mode) */}
          <button
            type="button"
            className={styles.addPlannedBtn}
            onClick={() => openAddSheet('plan')}
            data-testid="native-plan-add-open"
          >
            <Plus size={17} weight="bold" />
            Добавить в план
          </button>
        </>
      ) : (
        // ───────── Доходы segment ─────────
        // No «лимит»/«осталось распределить»/«превышено». Income is planned as
        // an expected amount; delta = Факт − План (больше = хорошо).
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

          {/* income categories — header «+ Добавить» + inline «План» edit */}
          <SectionHeader
            trailing={
              <SectionHeaderAction
                onClick={() => openAddSheet('plan')}
                testId="native-plan-cat-add"
              >
                <Plus size={15} weight="bold" />
                Добавить
              </SectionHeaderAction>
            }
          >
            Категории
          </SectionHeader>
          {incomeCategories.length === 0 ? (
            <div className={styles.empty}>Нет категорий доходов.</div>
          ) : (
            <InsetGroup>
              {incomeCategories.map((c) => renderCategoryRow(c, 'План'))}
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

          {/* single global «+ Добавить в план» (income plan mode) */}
          <button
            type="button"
            className={styles.addPlannedBtn}
            onClick={() => openAddSheet('plan')}
            data-testid="native-plan-add-open"
          >
            <Plus size={17} weight="bold" />
            Добавить в план
          </button>

          <div className={styles.footnote}>
            План дохода — ожидаемая сумма по категории. Когда поступление
            приходит, проведите его в факт.
          </div>
        </>
      )}
    </div>
  );
}

export const NativePlanView = memo(NativePlanViewInner);
