// Phase 26-02: CategoryDetailView (cobalt / red) — pure presentational component
// covering CAT-V10-01..06.
//
//  - Cobalt absolute-fill background; red when fact > plan (isOver).
//  - ← НАЗАД top-left link + Eyebrow «CATEGORY · {ord}».
//  - Mass UPPERCASE category name (Archivo Black) + italic «— на N% плана» /
//    «— превышено на N%» subtitle.
//  - BigFig fact (cents/100, suffix ₽) with cubicOut count-up (default true; tests
//    pass `bigFigAnimate=false` for synchronous read).
//  - 6px progress bar with width capped at 100%; visible 1px tick at plan/fact
//    position when over-budget.
//  - Toggle plate «ОСТАТОК → НАКОПЛЕНИЯ / ПРОЧЕЕ» — click → onToggleRollover.
//  - CTA row: «+ ПОДНЯТЬ ЛИМИТ» (push Plan with focus) / «ПАУЗА» / «ВКЛЮЧИТЬ».
//  - Day-grouped operations list (filtered to this category); empty-state when none.
//
// View is router-agnostic — all click handlers are passed in as props.

import { BigFig, Eyebrow, Mass } from '../../componentsV10';
import { formatRubles } from '../Onboarding/format';
import { formatTimeHM } from '../common/format';
import { groupByDay, formatTxAmount } from '../Transactions/computeTransactions';
import {
  computeBarSegments,
  computeFactForCategory,
  computeOverPercent,
  computeUnderPercent,
  filterActualsForCategory,
} from './computeCategoryDetail';
import type { ActualV10Read, CategoryV10 } from '../../api/v10';
import styles from './CategoryDetailView.module.css';

// ─────────────────── Props ───────────────────

export interface CategoryDetailViewProps {
  category: CategoryV10;
  actuals: ActualV10Read[];
  /** Reference date for day labels (defaults to `new Date()`). */
  today?: Date;
  /** Test-only escape hatch — disables BigFig count-up rAF for synchronous reads. */
  bigFigAnimate?: boolean;

  /** Push Plan view focused on this category (CAT-V10-05 «+ ПОДНЯТЬ ЛИМИТ»). */
  onPushPlan: (categoryId: number) => void;
  /** Toggle category.paused via PATCH (CAT-V10-05 «ПАУЗА» / «ВКЛЮЧИТЬ»). */
  onTogglePause: () => void;
  /** Toggle category.rollover via PATCH (CAT-V10-04 plate). */
  onToggleRollover: () => void;
  /** Pop the router stack (CAT-V10-01 ← НАЗАД). */
  onBack: () => void;
}

// ─────────────────── Component ───────────────────

export function CategoryDetailView(props: CategoryDetailViewProps) {
  const {
    category,
    actuals,
    today = new Date(),
    bigFigAnimate = true,
    onPushPlan,
    onTogglePause,
    onToggleRollover,
    onBack,
  } = props;

  const planCents = category.plan_cents ?? 0;
  const factCents = computeFactForCategory(actuals, category.id);
  const isOver = factCents > planCents;
  const subtitle = isOver
    ? `— превышено на ${computeOverPercent(factCents, planCents)}%`
    : `— на ${computeUnderPercent(factCents, planCents)}% плана`;
  const segments = computeBarSegments(factCents, planCents);
  const rollover = category.rollover ?? 'misc';
  const paused = category.paused ?? false;

  const ownActuals = filterActualsForCategory(actuals, category.id);
  const dayGroups = groupByDay(ownActuals, today);

  const factRubles = Math.floor(factCents / 100);

  // Phase 29-04 §4 CategoryDetail BLOCKER #3 — two-segment caption:
  // `из {plan} ₽ · {N over | N осталось}` matches prototype line 536.
  const leftCents = planCents - factCents;
  const captionRight = isOver
    ? `−${formatRubles(Math.abs(leftCents))} over`
    : `${formatRubles(leftCents)} осталось`;

  // Phase 29-04 §4 BLOCKER #4 — rollover plate body lines.
  // Mono caption + mono money line (yellow when not over, paper when over).
  const rolloverDestLabel = rollover === 'savings' ? 'НАКОПЛЕНИЯ' : 'ПРОЧЕЕ';
  const rolloverMoneyLine = isOver
    ? `− ${formatRubles(Math.abs(leftCents))} ₽`
    : `+ ${formatRubles(Math.max(0, leftCents))} ₽`;

  return (
    <div className={`${styles.root} ${isOver ? styles.bgRed : styles.bgCobalt}`}>
      {/* ─────────── header row ─────────── */}
      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
        >
          ← НАЗАД
        </button>
        {/* Phase 29-04 §4 BLOCKER #1 — eyebrow shows state, not ordinal.
         * Prototype line 526: `{over ? 'OVERDRAFT' : 'IN PLAN'} · CAT`. */}
        <Eyebrow color="var(--poster-paper)">
          {`${isOver ? 'OVERDRAFT' : 'IN PLAN'} · CAT`}
        </Eyebrow>
      </div>

      {/* ─────────── name + italic subtitle ─────────── */}
      <Mass size={70} className={styles.nameMass}>
        {category.name.toUpperCase()}
      </Mass>
      <Mass italic size={28} className={styles.subtitle}>
        {subtitle}
      </Mass>

      {/* ─────────── BigFig fact ─────────── */}
      {/* Phase 29-04 §4 BLOCKER #2 — BigFig size 88 → 64 per prototype line 534. */}
      <div className={styles.bigFigWrap}>
        <BigFig
          value={factRubles}
          sup="₽"
          size={64}
          color="var(--poster-paper)"
          animate={bigFigAnimate}
        />
        {/* Phase 29-04 §4 BLOCKER #3 — two-segment caption beneath BigFig. */}
        <div className={styles.barCaption}>
          {`из ${formatRubles(planCents)} ₽ · `}
          <span
            className={isOver ? styles.barCaptionOver : styles.barCaptionLeft}
          >
            {captionRight}
          </span>
        </div>
      </div>

      {/* ─────────── progress bar (6px) ─────────── */}
      <div className={styles.barTrack}>
        <div
          data-testid="cat-bar-fill"
          className={styles.barFill}
          style={{ width: `${Math.round(segments.fillRatio * 100)}%` }}
        />
        {segments.tickAt !== undefined && (
          <div
            data-testid="cat-bar-tick"
            className={styles.barTick}
            style={{ left: `${(segments.tickAt * 100).toFixed(2)}%` }}
          />
        )}
      </div>

      {/* ─────────── rollover plate (dark, two-line) ─────────── */}
      {/* Phase 29-04 §4 BLOCKER #4 — prototype dark plate (rgba(0,0,0,0.22)),
       * mono eyebrow «ОСТАТОК ПО КАТЕГОРИИ → {DEST}», mono money line.
       * Click toggles rollover destination. */}
      <button
        type="button"
        onClick={onToggleRollover}
        className={styles.rolloverPlate}
        data-testid="rollover-plate"
      >
        <span className={styles.rolloverEyebrow}>
          ОСТАТОК ПО КАТЕГОРИИ → {rolloverDestLabel}
        </span>
        <span
          className={
            isOver
              ? styles.rolloverMoneyOver
              : styles.rolloverMoneyOk
          }
        >
          {rolloverMoneyLine}
        </span>
      </button>

      {/* ─────────── CTA row ─────────── */}
      {/* Phase 29-04 §4 BLOCKER #5 — asymmetric pills: yellow «+ ПОДНЯТЬ
       * ЛИМИТ» (cobalt text; red text on over bg) + bordered ghost «ПАУЗА»
       * per prototype lines 557-560. NOT two full-width ghost buttons. */}
      <div className={styles.ctaRow}>
        <button
          type="button"
          onClick={() => onPushPlan(category.id)}
          className={`${styles.ctaPrimary} ${
            isOver ? styles.ctaPrimaryOver : ''
          }`}
        >
          + ПОДНЯТЬ ЛИМИТ
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          className={styles.ctaGhost}
        >
          {paused ? 'ВКЛЮЧИТЬ' : 'ПАУЗА'}
        </button>
      </div>

      {/* ─────────── operations list ─────────── */}
      <div className={styles.opsEyebrow}>
        <Eyebrow color="var(--poster-paper)">ОПЕРАЦИИ ПО КАТЕГОРИИ</Eyebrow>
      </div>
      {dayGroups.length === 0 ? (
        <div className={styles.emptyState}>Операций пока нет</div>
      ) : (
        dayGroups.map((g) => (
          <section key={g.dateKey} className={styles.daySection}>
            <header className={styles.dayHeader}>
              <span className={styles.dayLabel}>{g.dateLabel}</span>
              <span className={styles.daySum}>
                {`${formatRubles(g.sumCents)} ₽`}
              </span>
            </header>
            {g.rows.map((tx) => (
              <div
                key={tx.id}
                data-testid={`cat-detail-tx-row-${tx.id}`}
                className={styles.row}
              >
                <span className={styles.time}>
                  {formatTimeHM(new Date(tx.created_at))}
                </span>
                <span className={styles.desc}>{tx.description ?? '—'}</span>
                <span className={styles.amount}>
                  {formatTxAmount(tx.amount_cents)}
                </span>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
