// Phase 26-04 (PLAN-V10-01..06): PlanView — pure presentational component.
//
// Surface (cobalt poster):
//   - ← НАЗАД + Eyebrow «MGMT / LIMITS»
//   - Mass «PLAN МЕСЯЦА.»
//   - Surplus plate «ОСТАЛОСЬ РАСПРЕДЕЛИТЬ» (yellow OK / red OVER)
//   - 2 rollover plates «→ ПРОЧЕЕ X ₽» / «→ НАКОПЛЕНИЯ Y ₽»
//   - Block «РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ» — list of monthly subs with
//     post/unpost CTAs
//   - Block «КАТЕГОРИИ · N» — N PosterSliders + chip-pair (rollover)
//   - Inline error «Σplan превышает доход» when isOverflow + saveError
//   - CTA «СОХРАНИТЬ ↵» — disabled when isOverflow / submitting
//
// Router-agnostic: all interactions surface as props. PlanMount binds
// router.pop() to onBack and patchPlanMonth() to onSubmit; tests pass
// vi.fn() spies and assert call shapes.

import { useEffect, useRef } from 'react';
import {
  Chip,
  Eyebrow,
  Mass,
  PosterButton,
  PosterSlider,
} from '../../componentsV10';
import type { CategoryV10 } from '../../api/v10';
import type { PlanMonthItem } from '../../api/types';
import type { RegularRow, RolloverAggregates } from './computePlan';
import styles from './PlanView.module.css';

// ─────────── Props ───────────

export interface PlanViewProps {
  /** User.income_cents from /me. Used for slider max + plate value. */
  incomeCents: number;
  /** Categories (ord-sorted, savings/paused-filtered) — slider list source. */
  categories: CategoryV10[];
  /** Current draft plan_cents — mount-controlled. */
  plans: PlanMonthItem[];
  /** Monthly subscriptions with day_of_month set, sorted ASC. */
  regulars: RegularRow[];
  /** Aggregated remainders by rollover policy. */
  aggregates: RolloverAggregates;
  /** Signed cents (income − Σplan). */
  surplusCents: number;
  /** Convenience: surplusCents < 0. Disables submit + flips plate tone. */
  isOverflow: boolean;
  /** True while patchPlanMonth in flight; CTA shows «СОХРАНЯЕМ…». */
  submitting: boolean;
  /** Server-side validation message (overflow / generic) or null. */
  saveError: string | null;
  /**
   * Optional category to scroll into view on mount (CategoryDetail
   * «+ ПОДНЯТЬ ЛИМИТ» deep-link). Marked focused via .focused class.
   */
  focusCategoryId?: number | null;

  /** Slider drag handler — local state only, no PATCH. */
  onSliderChange: (catId: number, cents: number) => void;
  /** Optional debounced (300ms) commit handler — currently no-op (mount aggregates on submit). */
  onSliderCommit?: (catId: number, cents: number) => void;
  /** Chip-pair → PATCH /categories/:id with new rollover. */
  onRolloverChip: (catId: number, next: 'misc' | 'savings') => void;
  /** «ПРОВЕСТИ →» tap — POST /subscriptions/:id/post. */
  onPostRegular: (subId: number) => void;
  /** «ОТМЕНА» tap — POST /subscriptions/:id/unpost. */
  onUnpostRegular: (subId: number) => void;
  /** «СОХРАНИТЬ ↵» tap — PATCH /plan-month with current draft. */
  onSubmit: () => void;
  /** ← НАЗАД tap — router.pop(). */
  onBack: () => void;
}

// ─────────── Component ───────────

export function PlanView(props: PlanViewProps) {
  const {
    incomeCents,
    categories,
    plans,
    regulars,
    aggregates,
    surplusCents,
    isOverflow,
    submitting,
    saveError,
    focusCategoryId,
    onSliderChange,
    onSliderCommit,
    onRolloverChip,
    onPostRegular,
    onUnpostRegular,
    onSubmit,
    onBack,
  } = props;

  const focusRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focusCategoryId != null && focusRowRef.current) {
      focusRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusCategoryId]);

  const planByCat = new Map(plans.map((p) => [p.category_id, p.plan_cents]));

  const surplusRubles = Math.abs(Math.floor(surplusCents / 100)).toLocaleString(
    'ru-RU',
  );
  const surplusSign = surplusCents < 0 ? '−' : '+';
  const miscRubles = Math.floor(aggregates.miscCents / 100).toLocaleString(
    'ru-RU',
  );
  const savingsRubles = Math.floor(aggregates.savingsCents / 100).toLocaleString(
    'ru-RU',
  );

  return (
    <div className={styles.root}>
      {/* ───── header row ───── */}
      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Назад"
        >
          ← НАЗАД
        </button>
        <Eyebrow color="var(--poster-paper)">MGMT / LIMITS</Eyebrow>
      </div>

      {/* ───── headline ───── */}
      <Mass size={70} className={styles.title}>
        PLAN МЕСЯЦА.
      </Mass>

      {/* ───── surplus plate ───── */}
      <div
        className={`${styles.surplusPlate} ${
          isOverflow ? styles.overflow : styles.ok
        }`}
        data-testid="plan-surplus-plate"
      >
        <div className={styles.surplusLabel}>ОСТАЛОСЬ РАСПРЕДЕЛИТЬ</div>
        <div className={styles.surplusValue}>
          {surplusSign} {surplusRubles} ₽
        </div>
      </div>

      {/* ───── rollover aggregates ───── */}
      <div className={styles.rolloverRow}>
        <div className={styles.aggPlate} data-testid="agg-misc">
          → ПРОЧЕЕ {miscRubles} ₽
        </div>
        <div className={styles.aggPlate} data-testid="agg-savings">
          → НАКОПЛЕНИЯ {savingsRubles} ₽
        </div>
      </div>

      {/* ───── regulars block ───── */}
      <div className={styles.sectionEyebrow}>
        <Eyebrow color="var(--poster-paper)">
          РЕГУЛЯРНЫЕ · ПРОВЕСТИ В ФАКТ
        </Eyebrow>
      </div>
      {regulars.length === 0 ? (
        <div className={styles.emptyHint}>
          Нет регулярных платежей в этом месяце.
        </div>
      ) : (
        regulars.map((r, i) => (
          <div
            key={r.id}
            className={`${styles.regularRow} poster-row-in`}
            style={{ animationDelay: `${(0.32 + i * 0.09).toFixed(3)}s` }}
            data-testid={`regular-row-${r.id}`}
          >
            <div className={styles.regularName}>{r.name.toUpperCase()}</div>
            <div className={styles.regularSub}>
              {r.dayOfMonth} числа · {r.categoryName}
            </div>
            <div className={styles.regularAmount}>
              {Math.floor(r.amountCents / 100).toLocaleString('ru-RU')} ₽
            </div>
            {r.postedTxnId == null ? (
              <PosterButton
                variant="ghost"
                onClick={() => onPostRegular(r.id)}
              >
                ПРОВЕСТИ →
              </PosterButton>
            ) : (
              <PosterButton
                variant="ghost"
                onClick={() => onUnpostRegular(r.id)}
              >
                ОТМЕНА
              </PosterButton>
            )}
          </div>
        ))
      )}

      {/* ───── categories sliders ───── */}
      <div className={styles.sectionEyebrow}>
        <Eyebrow color="var(--poster-paper)">
          КАТЕГОРИИ · {categories.length}
        </Eyebrow>
      </div>
      {categories.map((c, i) => {
        const planCents = planByCat.get(c.id) ?? c.plan_cents ?? 0;
        const focused = focusCategoryId === c.id;
        const rollover = c.rollover ?? 'misc';
        // Allow up-to-income; if planCents already exceeds income, use it as
        // upper bound so the slider doesn't snap back.
        const sliderMax = Math.max(incomeCents, planCents, 60_000_00);
        return (
          <div
            key={c.id}
            ref={focused ? focusRowRef : undefined}
            className={`${styles.catRow} ${focused ? styles.focused : ''} poster-row-in`}
            style={{ animationDelay: `${(0.4 + i * 0.06).toFixed(3)}s` }}
            data-testid={`cat-row-${c.id}`}
          >
            <div className={styles.catName}>{c.name.toUpperCase()}</div>
            <PosterSlider
              value={planCents}
              min={0}
              max={sliderMax}
              step={50_000}
              onChange={(v) => onSliderChange(c.id, v)}
              onCommit={
                onSliderCommit ? (v) => onSliderCommit(c.id, v) : undefined
              }
            />
            <div className={styles.chipPair}>
              <Chip
                active={rollover === 'misc'}
                onClick={() => onRolloverChip(c.id, 'misc')}
              >
                ПРОЧЕЕ
              </Chip>
              <Chip
                active={rollover === 'savings'}
                onClick={() => onRolloverChip(c.id, 'savings')}
              >
                НАКОПЛЕНИЯ
              </Chip>
            </div>
          </div>
        );
      })}

      {/* ───── inline error + submit CTA ───── */}
      {saveError && (
        <div className={styles.errorMsg} data-testid="plan-save-error">
          {saveError}
        </div>
      )}
      <div className={styles.submitWrap}>
        <PosterButton
          variant={isOverflow ? 'ghost' : 'primary'}
          onClick={onSubmit}
          disabled={isOverflow || submitting}
        >
          {submitting ? 'СОХРАНЯЕМ…' : 'СОХРАНИТЬ ↵'}
        </PosterButton>
      </div>
    </div>
  );
}
