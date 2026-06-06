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

import { memo, useEffect, useRef, useState } from 'react';
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
import type { PlanDetailRow, PlanLadder } from './computePlanDetail';
import styles from './NativePlanView.module.css';

// ─────────── Props (mirror poster PlanView + v1.1 detail surface) ───────────

/** Payload emitted by «+ добавить запланированную трату». */
export interface AddPlannedDraft {
  categoryId: number;
  kind: 'expense' | 'income';
  title: string;
  amountCents: number;
  plannedDate: string | null;
}

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

  // ── v1.1 month-plan detail surface (native only) ──
  /** Planned rows grouped by category_id (manual + subscription, one surface). */
  detailByCat?: Map<number, PlanDetailRow[]>;
  /** Per-category ladder Лимит/Расписано/Свободно keyed by category_id. */
  ladderByCat?: Map<number, PlanLadder>;
  /** Count of unposted planned rows due → enables the bulk «Провести» button. */
  bulkDueCount?: number;
  /** Post a single detail row (manual or subscription — Mount routes it). */
  onPostDetail?: (row: PlanDetailRow) => void;
  /** Unpost a single detail row. */
  onUnpostDetail?: (row: PlanDetailRow) => void;
  /** Create a new manual planned row. */
  onAddPlanned?: (draft: AddPlannedDraft) => void;
  /** Bulk-post every due (unposted) planned row. */
  onPostAllPlanned?: () => void;
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

/** ISO `YYYY-MM-DD` → «5 числа» style short label, or «—» when null. */
function formatPlannedDay(iso: string | null): string {
  if (!iso) return 'без даты';
  const day = Number(iso.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? `${day} числа` : iso;
}

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
    detailByCat,
    ladderByCat,
    bulkDueCount = 0,
    onPostDetail,
    onUnpostDetail,
    onAddPlanned,
    onPostAllPlanned,
  } = props;

  // Which category's «Детализация» disclosure is open (single-open accordion).
  const [openCatId, setOpenCatId] = useState<number | null>(null);
  // Inline add-planned draft state, scoped to the open category.
  const [addTitle, setAddTitle] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDate, setAddDate] = useState('');

  const detailEnabled = detailByCat != null && onPostDetail != null;

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

  // ── Detail disclosure renderer (per category) ──
  function renderDetail(
    catId: number,
    kind: CategoryV10['kind'],
    limitCents: number,
  ) {
    const rows = detailByCat?.get(catId) ?? [];
    const ladder = ladderByCat?.get(catId);
    const open = openCatId === catId;
    return (
      <div className={styles.detailWrap}>
        <button
          type="button"
          className={styles.detailToggle}
          onClick={() => setOpenCatId(open ? null : catId)}
          data-testid={`native-plan-detail-toggle-${catId}`}
        >
          {open ? '▾' : '▸'} Детализация
          {rows.length > 0 ? ` · ${rows.length}` : ''}
        </button>

        {open && (
          <div
            className={styles.detailBody}
            data-testid={`native-plan-detail-${catId}`}
          >
            {/* Ladder: Лимит / Расписано / Свободно */}
            <div className={styles.ladder}>
              <span className={styles.ladderCell}>
                <span className={styles.ladderLabel}>Лимит</span>
                <span className={styles.ladderValue}>
                  {formatMoneyNative(limitCents)}
                </span>
              </span>
              <span className={styles.ladderCell}>
                <span className={styles.ladderLabel}>Расписано</span>
                <span className={styles.ladderValue}>
                  {formatMoneyNative(ladder?.scheduledCents ?? 0)}
                </span>
              </span>
              <span className={styles.ladderCell}>
                <span className={styles.ladderLabel}>Свободно</span>
                <span
                  className={`${styles.ladderValue} ${
                    ladder?.overflow ? styles.ladderOver : ''
                  }`}
                >
                  {formatSignedMoneyNative(ladder?.freeCents ?? limitCents)}
                </span>
              </span>
            </div>
            {ladder?.overflow && (
              <div
                className={styles.detailWarn}
                data-testid={`native-plan-detail-warn-${catId}`}
              >
                Детализация превышает лимит
              </div>
            )}

            {/* Planned rows (manual + subscription, one surface) */}
            {rows.map((r) => (
              <div
                key={r.id}
                className={styles.detailRow}
                data-testid={`native-plan-detail-row-${r.id}`}
              >
                <span className={styles.detailRowMain}>
                  <span className={styles.detailRowTitle}>{r.title}</span>
                  <span className={styles.detailRowSub}>
                    {formatMoneyNative(r.amountCents)} ₽ ·{' '}
                    {formatPlannedDay(r.plannedDate)}
                    {r.subscriptionId != null ? ' · подписка' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className={`${styles.regularCta} ${
                    r.posted ? styles.regularCtaUndo : ''
                  }`}
                  onClick={() =>
                    r.posted ? onUnpostDetail?.(r) : onPostDetail?.(r)
                  }
                  data-testid={`native-plan-detail-cta-${r.id}`}
                >
                  {r.posted ? 'Отмена' : 'Провести'}
                </button>
              </div>
            ))}

            {/* + добавить запланированную трату */}
            {onAddPlanned && (
              <div className={styles.addPlanned}>
                <input
                  type="text"
                  className={styles.addInput}
                  placeholder="Название"
                  value={open ? addTitle : ''}
                  onChange={(e) => setAddTitle(e.target.value)}
                  data-testid={`native-plan-add-title-${catId}`}
                />
                <div className={styles.addRow}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.addInputSm}
                    placeholder="₽"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    data-testid={`native-plan-add-amount-${catId}`}
                  />
                  <input
                    type="date"
                    className={styles.addInputSm}
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    data-testid={`native-plan-add-date-${catId}`}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    disabled={
                      addTitle.trim() === '' ||
                      rublesInputToCents(addAmount) <= 0
                    }
                    onClick={() => {
                      onAddPlanned({
                        categoryId: catId,
                        kind,
                        title: addTitle.trim(),
                        amountCents: rublesInputToCents(addAmount),
                        plannedDate: addDate || null,
                      });
                      setAddTitle('');
                      setAddAmount('');
                      setAddDate('');
                    }}
                    data-testid={`native-plan-add-submit-${catId}`}
                  >
                    Добавить
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

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

      {/* ───── bulk «Провести запланированное» ───── */}
      {detailEnabled && onPostAllPlanned && (
        <button
          type="button"
          className={styles.bulkBtn}
          onClick={onPostAllPlanned}
          disabled={bulkDueCount === 0}
          data-testid="native-plan-post-all"
        >
          {bulkDueCount === 0
            ? 'Нет запланированного к проведению'
            : `Провести запланированное · ${bulkDueCount}`}
        </button>
      )}

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

              {/* ── v1.1 «Детализация лимита» disclosure ── */}
              {detailEnabled && renderDetail(c.id, c.kind, planCents)}
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
