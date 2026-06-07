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
//
// §A (design-fix): the per-category limit auto-saves on blur / Enter (mirrors
// the Шаблон screen's upsertTemplateItem commit). There is no «Сохранить» nav
// button — every edit (limit, planned rows, «+») persists immediately, so a
// dead trailing CTA was removed.

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
  Segmented,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { useAddSheetHost } from '../native/AddSheetHost';
import { formatMoneyNative, formatSignedMoneyNative } from '../native/money';
import type { CategoryV10 } from '../../api/v10';
import type { PlanMonthItem } from '../../api/types';
import type { RegularRow } from './computePlan';
import type {
  PlanDetailRow,
  PlanLadder,
  IncomeLadder,
} from './computePlanDetail';
import styles from './NativePlanView.module.css';

// ─────────── Props (mirror poster PlanView + v1.1 detail surface) ───────────

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
  regulars: RegularRow[];
  surplusCents: number;
  isOverflow: boolean;
  saveError: string | null;
  focusCategoryId?: number | null;

  /** Live draft edit (controlled input) — updates local surplus/ladder only. */
  onSliderChange: (catId: number, cents: number) => void;
  /** Commit one category's limit (blur / Enter) → PATCH /plan-month, autosave. */
  onLimitCommit: (catId: number, cents: number) => void;
  onPostRegular: (subId: number) => void;
  onUnpostRegular: (subId: number) => void;
  onBack: () => void;

  // ── v1.1 month-plan detail surface (native only) ──
  /** Planned rows grouped by category_id (manual + subscription, one surface). */
  detailByCat?: Map<number, PlanDetailRow[]>;
  /** Per-category ladder Лимит/Расписано/Свободно keyed by category_id. */
  ladderByCat?: Map<number, PlanLadder>;
  /** Per-category income ladder План/Запланировано/Получено keyed by category_id. */
  incomeLadderByCat?: Map<number, IncomeLadder>;
  /** Post a single detail row (manual or subscription — Mount routes it). */
  onPostDetail?: (row: PlanDetailRow) => void;
  /** Unpost a single detail row. */
  onUnpostDetail?: (row: PlanDetailRow) => void;
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
    saveError,
    focusCategoryId,
    onSliderChange,
    onLimitCommit,
    onPostRegular,
    onUnpostRegular,
    onBack,
    detailByCat,
    ladderByCat,
    incomeLadderByCat,
    onPostDetail,
    onUnpostDetail,
  } = props;

  // Расходы / Доходы segment (mirrors the Home segmented control).
  const [seg, setSeg] = useState<Seg>('expenses');

  // Which category's «Детализация» disclosure is open (single-open accordion).
  const [openCatId, setOpenCatId] = useState<number | null>(null);

  // Single global «+»: opens the SAME AddSheet as Home, in plan mode (category
  // chosen inside the sheet). Replaces the old per-category inline add.
  const { openAddSheet } = useAddSheetHost();

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

  const surplusPositive = surplusCents >= 0;

  // ── Detail disclosure renderer (per category) ──
  function renderDetail(catId: number, limitCents: number) {
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
          </div>
        )}
      </div>
    );
  }

  // ── Income detail disclosure renderer (per income category) ──
  // No «лимит»/«свободно»/«превышено» — income is planned, not capped. Ladder:
  // План / Запланировано (unposted) / Получено (факт дохода). Delta «Осталось
  // получить» = План − Получено (positive = still to come); when Получено > План
  // we surface «Сверх плана» — both are good (sign convention «больше = хорошо»).
  function renderIncomeDetail(catId: number, planCents: number) {
    const rows = detailByCat?.get(catId) ?? [];
    const ladder = incomeLadderByCat?.get(catId);
    const open = openCatId === catId;
    const remaining = ladder?.remainingCents ?? planCents;
    const overReceived = ladder?.overReceived ?? false;
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
            {/* Income ladder: План / Запланировано / Получено */}
            <div className={styles.ladder}>
              <span className={styles.ladderCell}>
                <span className={styles.ladderLabel}>План</span>
                <span className={styles.ladderValue}>
                  {formatMoneyNative(planCents)}
                </span>
              </span>
              <span className={styles.ladderCell}>
                <span className={styles.ladderLabel}>Запланировано</span>
                <span className={styles.ladderValue}>
                  {formatMoneyNative(ladder?.scheduledCents ?? 0)}
                </span>
              </span>
              <span className={styles.ladderCell}>
                <span className={styles.ladderLabel}>Получено</span>
                <span className={styles.ladderValue}>
                  {formatMoneyNative(ladder?.receivedCents ?? 0)}
                </span>
              </span>
            </div>
            {/* Calm delta (no red «over») — both directions are good income. */}
            <div
              className={styles.detailNote}
              data-testid={`native-plan-income-delta-${catId}`}
            >
              {overReceived
                ? `Сверх плана: ${formatMoneyNative(-remaining)} ₽`
                : `Осталось получить: ${formatMoneyNative(remaining)} ₽`}
            </div>

            {/* Planned income rows (manual + subscription, one surface) */}
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
          </div>
        )}
      </div>
    );
  }

  // ── Shared category row (plan-amount input). `label` distinguishes the
  // expense «Лимит» from the income «План»; `renderRowDetail` injects the
  // matching disclosure. ──
  function renderCategoryRow(
    c: CategoryV10,
    label: string,
    renderRowDetail: (catId: number, planCents: number) => ReactNode,
  ) {
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

        {detailEnabled && renderRowDetail(c.id, planCents)}
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
          onChange={(v) => {
            setSeg(v);
            setOpenCatId(null);
          }}
          options={[
            { value: 'expenses', label: 'Расходы' },
            { value: 'income', label: 'Доходы' },
          ]}
        />
      </div>

      {seg === 'expenses' ? (
        // ───────── Расходы segment ─────────
        <>
          {/* surplus card «Осталось распределить» (expense-only) */}
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

          {/* regulars block */}
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

          {/* expense categories — inline «Лимит» edit + detail ladder */}
          <SectionHeader>Категории · {categories.length}</SectionHeader>
          <InsetGroup>
            {categories.map((c) => renderCategoryRow(c, 'Лимит', renderDetail))}
          </InsetGroup>

          {saveError && (
            <div
              className={styles.errorMsg}
              data-testid="native-plan-save-error"
            >
              {saveError}
            </div>
          )}

          <div className={styles.footnote}>
            {surplusPositive
              ? 'Свободный остаток можно распределить по категориям.'
              : 'Сумма планов превышает доход — уменьшите лимиты.'}
          </div>
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

          {/* income categories — inline «План» edit + income detail ladder */}
          <SectionHeader>Категории · {incomeCategories.length}</SectionHeader>
          {incomeCategories.length === 0 ? (
            <div className={styles.empty}>Нет категорий доходов.</div>
          ) : (
            <InsetGroup>
              {incomeCategories.map((c) =>
                renderCategoryRow(c, 'План', renderIncomeDetail),
              )}
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
            План дохода — ожидаемая сумма по категории. Когда поступление
            приходит, проведите его в факт.
          </div>
        </>
      )}
    </div>
  );
}

export const NativePlanView = memo(NativePlanViewInner);
