// Liquid Glass v2 — native iOS Plan (План месяца) view.
//
// ONE surface (owner mockup refs #21-23): «План месяца» merges per-category
// limits + month plan into a single screen. The old dualism («Шаблон бюджета»
// + «План месяца» + per-category «Детализация» disclosures) is gone.
//
// The overview rows are COMPACT READ-ONLY summaries (no inline edit, no «+»):
// tap a row to drill into its per-category planned detail, where the EXPENSE
// limit is edited and planned rows are added.
//
// Structure (expense segment, top → bottom):
//   - NativeNavBar «План месяца» + back
//   - Расходы / Доходы segment
//   - «Осталось распределить» card: big signed value + status badge
//     («ок» green / «Превышено» red) + progress-bar «X из Y» (Σ limits из дохода).
//     Income here is the Σ of the period's PLANNED income (план зачислений), not
//     AppUser.income_cents. When there is no planned income this card shows a
//     NEUTRAL «добавьте плановые доходы» prompt instead of a negative «Превышено».
//   - «Категории»: each row = icon · name · summary
//       expense → «Лимит X / Запланировано Y»
//       income  → «Запланировано Y» (no limit/plan-target)
//     · chevron — whole row taps into the per-category planned detail.
//
// Limit edit + plan add live in the per-category detail now.

import { memo, useEffect, useRef, useState } from 'react';
import { CheckCircle, CaretRight, DotsThree } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  Segmented,
  CircleButton,
} from '../native/NativePrimitives';
import { PosterSheet } from '../common';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import type { CategoryV10 } from '../../api/v10';
import type { PlanMonthItem } from '../../api/types';
import type { DistributeProgress } from './computePlan';
import styles from './NativePlanView.module.css';

// ─────────── Props ───────────

export interface NativePlanViewProps {
  /**
   * True when there is NO planned income for the period (Σ план зачислений ==
   * 0) — drives the neutral «добавьте плановые доходы» prompt instead of a
   * scary negative «Превышено».
   */
  incomeUnset?: boolean;
  /** EXPENSE categories (income split out into `incomeCategories`). */
  categories: CategoryV10[];
  /** INCOME categories — planned (expected) amount, never a «лимит». */
  incomeCategories?: CategoryV10[];
  /** Σ income category plans («Запланировано дохода» summary). */
  incomePlannedCents?: number;
  plans: PlanMonthItem[];
  /**
   * Σ of UNPOSTED planned rows per category id («Запланировано» / what the
   * detail calls «Расписано»). Drives the read-only overview summary line.
   */
  scheduledByCat: Map<number, number>;
  surplusCents: number;
  isOverflow: boolean;
  /** «Осталось распределить» progress (Σ expense limits / income). */
  progress: DistributeProgress;
  saveError: string | null;
  focusCategoryId?: number | null;

  /** Drill into a category's planned-transaction detail (push). */
  onCategoryTap: (categoryId: number) => void;
  onBack: () => void;
  /**
   * Snapshot the CURRENT plan into the reusable template (OVERWRITE). The view
   * owns the confirm dialog; this fires only AFTER the user confirms. Optional
   * — omitted callers hide the «…» action.
   */
  onSaveAsTemplate?: () => void;
  /** Open the «Шаблон» management screen (optional quick link). */
  onOpenTemplate?: () => void;
}

// ─────────── Component ───────────

type Seg = 'expenses' | 'income';

function NativePlanViewInner(props: NativePlanViewProps) {
  const {
    incomeUnset = false,
    categories,
    incomeCategories = [],
    incomePlannedCents = 0,
    plans,
    scheduledByCat,
    surplusCents,
    isOverflow,
    progress,
    saveError,
    focusCategoryId,
    onCategoryTap,
    onBack,
    onSaveAsTemplate,
    onOpenTemplate,
  } = props;

  // Расходы / Доходы segment (mirrors the Home segmented control).
  const [seg, setSeg] = useState<Seg>('expenses');

  // «…» overflow → action menu (sheet); «Сохранить как шаблон» opens the
  // OVERWRITE confirm before firing onSaveAsTemplate.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const showOverflow = onSaveAsTemplate != null || onOpenTemplate != null;

  return (
    <div className={styles.root}>
      <NativeNavBar
        title="План месяца"
        onBack={onBack}
        trailing={
          showOverflow ? (
            <CircleButton
              ariaLabel="Действия с планом"
              testId="native-plan-menu-btn"
              onClick={() => setMenuOpen(true)}
            >
              <DotsThree size={22} weight="bold" />
            </CircleButton>
          ) : undefined
        }
      />

      {/* «…» action menu */}
      <PosterSheet
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        testId="native-plan-menu-sheet"
      >
        <div className={styles.menuSheet}>
          {onSaveAsTemplate != null && (
            <button
              type="button"
              className={styles.menuItem}
              data-testid="native-plan-save-as-template"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              Сохранить план как шаблон
            </button>
          )}
          {onOpenTemplate != null && (
            <button
              type="button"
              className={styles.menuItem}
              data-testid="native-plan-open-template"
              onClick={() => {
                setMenuOpen(false);
                onOpenTemplate();
              }}
            >
              Открыть шаблон
            </button>
          )}
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuCancel}`}
            onClick={() => setMenuOpen(false)}
          >
            Отмена
          </button>
        </div>
      </PosterSheet>

      {/* OVERWRITE confirm */}
      <PosterSheet
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        testId="native-plan-confirm-sheet"
      >
        <div className={styles.menuSheet} data-testid="native-plan-confirm">
          <div className={styles.confirmTitle}>Перезаписать шаблон?</div>
          <div className={styles.confirmText}>
            Текущий план месяца станет новым шаблоном и перезапишет прежний.
            Лимиты и регулярные операции шаблона будут заменены.
          </div>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuDanger}`}
            data-testid="native-plan-confirm-yes"
            onClick={() => {
              setConfirmOpen(false);
              onSaveAsTemplate?.();
            }}
          >
            Перезаписать шаблон текущим планом
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuCancel}`}
            data-testid="native-plan-confirm-no"
            onClick={() => setConfirmOpen(false)}
          >
            Отмена
          </button>
        </div>
      </PosterSheet>

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
          {/* «Осталось распределить» card. When there is NO planned income
              (Σ план зачислений == 0), surplus = −Σплан is a meaningless scary
              negative, so we render a NEUTRAL prompt instead of the
              value/badge/«Превышено» + progress — pointing the owner to add
              planned income operations. */}
          {incomeUnset ? (
            <div
              className={`${styles.surplusCard} ${styles.surplusOk}`}
              data-testid="native-plan-surplus"
            >
              <div className={styles.surplusHead}>
                <span className={styles.surplusLabel}>
                  Осталось распределить
                </span>
              </div>
              <div
                className={styles.surplusPrompt}
                data-testid="native-plan-surplus-unset"
              >
                Добавьте плановые доходы, чтобы видеть, сколько осталось
                распределить.
              </div>
            </div>
          ) : (
            <div
              className={`${styles.surplusCard} ${
                isOverflow ? styles.surplusOver : styles.surplusOk
              }`}
              data-testid="native-plan-surplus"
            >
              <div className={styles.surplusHead}>
                <span className={styles.surplusLabel}>
                  Осталось распределить
                </span>
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
          {/* calm income summary — only «Запланировано дохода» (no surplus
              chrome). This is the PLAN surface, so the fact of RECEIVED income
              («Получено») is intentionally not shown — it lives on fact/home. */}
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
