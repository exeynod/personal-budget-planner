// Liquid Glass v2 — native iOS Plan (План месяца) view.
//
// Pushed detail screen ported from the Maximal Poster PlanView. Consumes the
// SAME props PlanMount feeds the poster view; all editing + saving flows reuse
// the SAME handlers (onSliderChange for per-category plan edits, onSubmit for
// patchPlanMonth, onPostRegular / onUnpostRegular).
//
// Edit affordance translation (brief §«mirror the poster's edit affordance»):
//   The poster edits each plan amount via a PosterSlider (drag → onSliderChange,
//   step 500 ₽). A drag slider is not idiomatic in the grouped-list iOS design,
//   so we surface the SAME edit as a native-styled inline numeric input on the
//   right of each category row: the user types rubles, we parse → cents and call
//   the IDENTICAL onSliderChange(catId, cents) — same controlled state, same
//   submit payload. No new data path, no PATCH on keystroke (mount aggregates on
//   submit exactly like the slider).
//
// Structure (iOS inset-grouped):
//   - NativeNavBar «План месяца» + back + trailing «Сохранить» (→ onSubmit)
//   - surplus card «Осталось распределить» (OK green / OVER red)
//   - «Регулярные» inset rows with «Провести»/«Отмена» (→ onPostRegular/unpost)
//   - «Категории · N» inset rows: CategoryIcon + name + inline ₽ input
//   - inline save error + total «Σ план» row

import { memo, useEffect, useRef } from 'react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import type { CategoryV10 } from '../../api/v10';
import type { PlanMonthItem } from '../../api/types';
import type { RegularRow } from './computePlan';
import styles from './NativePlanView.module.css';

// ─────────── Props (mirror poster PlanView) ───────────

export interface NativePlanViewProps {
  incomeCents: number;
  categories: CategoryV10[];
  plans: PlanMonthItem[];
  regulars: RegularRow[];
  surplusCents: number;
  isOverflow: boolean;
  submitting: boolean;
  saveError: string | null;
  focusCategoryId?: number | null;

  onSliderChange: (catId: number, cents: number) => void;
  onSliderCommit?: (catId: number, cents: number) => void;
  onPostRegular: (subId: number) => void;
  onUnpostRegular: (subId: number) => void;
  onSubmit: () => void;
  onBack: () => void;
}

// ─────────── Inline rubles → cents parsing (IDENTICAL semantics to slider) ───────────
//
// Slider emits integer cents. The input collects rubles (+ optional kopecks);
// we accept «1234», «1 234», «1234,50», «1234.5» and clamp to ≥ 0. Empty → 0.
function rublesInputToCents(raw: string): number {
  const cleaned = raw
    .replace(/[\s  ]/g, '')
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

function NativePlanViewInner(props: NativePlanViewProps) {
  const {
    incomeCents,
    categories,
    plans,
    regulars,
    surplusCents,
    isOverflow,
    submitting,
    saveError,
    focusCategoryId,
    onSliderChange,
    onPostRegular,
    onUnpostRegular,
    onSubmit,
    onBack,
  } = props;

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

  const planTotalCents = plans.reduce((s, p) => s + p.plan_cents, 0);
  const surplusPositive = surplusCents >= 0;

  // Trailing nav action mirrors the poster СОХРАНИТЬ CTA: same onSubmit, same
  // disabled rule (overflow / submitting).
  const saveButton = (
    <button
      type="button"
      className={styles.saveBtn}
      onClick={onSubmit}
      disabled={isOverflow || submitting}
      data-testid="native-plan-save"
    >
      {submitting ? 'Сохраняем…' : 'Сохранить'}
    </button>
  );

  return (
    <div className={styles.root}>
      <NativeNavBar title="План месяца" onBack={onBack} trailing={saveButton} />

      {/* ───── surplus card «Осталось распределить» ───── */}
      <div
        className={`${styles.surplusCard} ${
          isOverflow ? styles.surplusOver : styles.surplusOk
        }`}
        data-testid="native-plan-surplus"
      >
        <div className={styles.surplusLabel}>Осталось распределить</div>
        <div className={styles.surplusValue}>
          {formatSignedMoneyNative(surplusCents)} ₽
        </div>
        <span
          className={`${styles.surplusBadge} ${
            isOverflow ? styles.badgeOver : styles.badgeOk
          }`}
        >
          {isOverflow ? 'Превышено' : 'OK'}
        </span>
      </div>

      {/* ───── regulars block ───── */}
      <SectionHeader>Регулярные · провести в факт</SectionHeader>
      {regulars.length === 0 ? (
        <div className={styles.empty}>
          Нет регулярных платежей в этом месяце.
        </div>
      ) : (
        <InsetGroup>
          {regulars.map((r) => {
            const posted = r.postedTxnId != null;
            return (
              <InsetRow
                key={r.id}
                testId={`native-plan-regular-${r.id}`}
                title={r.name}
                subtitle={`${r.dayOfMonth} числа · ${r.categoryName}`}
                trailing={
                  <span className={styles.regularTrailing}>
                    <span className={styles.regularAmount}>
                      {formatMoneyNative(r.amountCents)} ₽
                    </span>
                    <button
                      type="button"
                      className={`${styles.regularCta} ${
                        posted ? styles.regularCtaUndo : ''
                      }`}
                      onClick={() =>
                        posted ? onUnpostRegular(r.id) : onPostRegular(r.id)
                      }
                      data-testid={`native-plan-regular-cta-${r.id}`}
                    >
                      {posted ? 'Отмена' : 'Провести'}
                    </button>
                  </span>
                }
              />
            );
          })}
        </InsetGroup>
      )}

      {/* ───── categories: inline plan-amount edit ───── */}
      <SectionHeader>Категории · {categories.length}</SectionHeader>
      <InsetGroup>
        {categories.map((c) => {
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
                    aria-label={`План для «${c.name}» в рублях`}
                    data-testid={`native-plan-input-${c.id}`}
                  />
                  <span className={styles.catCur}>₽</span>
                </span>
              </div>
            </div>
          );
        })}
      </InsetGroup>

      {/* ───── total + inline error ───── */}
      <InsetGroup>
        <InsetRow
          testId="native-plan-total"
          title={<span className={styles.totalLabel}>Σ план</span>}
          trailing={
            <span className={styles.totalValue}>
              {formatMoneyNative(planTotalCents)} ₽
            </span>
          }
        />
        <InsetRow
          testId="native-plan-income"
          title="Доход"
          trailing={formatMoneyNative(incomeCents)}
          trailingMuted
        />
      </InsetGroup>

      {saveError && (
        <div className={styles.errorMsg} data-testid="native-plan-save-error">
          {saveError}
        </div>
      )}

      <div className={styles.footnote}>
        {surplusPositive
          ? 'Свободный остаток можно распределить по категориям.'
          : 'Сумма планов превышает доход — уменьшите лимиты.'}
      </div>
    </div>
  );
}

export const NativePlanView = memo(NativePlanViewInner);
