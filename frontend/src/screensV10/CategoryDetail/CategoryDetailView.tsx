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

import { BigFig, Eyebrow, Mass, PosterButton } from '../../componentsV10';
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
        <Eyebrow color="var(--poster-paper)">
          {`CATEGORY · ${category.ord ?? '00'}`}
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
      <div className={styles.bigFigWrap}>
        <BigFig
          value={factRubles}
          sup="₽"
          size={88}
          color="var(--poster-paper)"
          animate={bigFigAnimate}
        />
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
      <div className={styles.barLabel}>
        {`из ${formatRubles(planCents)} ₽`}
      </div>

      {/* ─────────── rollover toggle plate ─────────── */}
      <button
        type="button"
        onClick={onToggleRollover}
        className={styles.rolloverPlate}
        data-testid="rollover-plate"
      >
        {rollover === 'savings' ? 'ОСТАТОК → НАКОПЛЕНИЯ' : 'ОСТАТОК → ПРОЧЕЕ'}
      </button>

      {/* ─────────── CTA row ─────────── */}
      <div className={styles.ctaRow}>
        <PosterButton
          variant="ghost"
          onClick={() => onPushPlan(category.id)}
        >
          + ПОДНЯТЬ ЛИМИТ
        </PosterButton>
        <PosterButton variant="ghost" onClick={onTogglePause}>
          {paused ? 'ВКЛЮЧИТЬ' : 'ПАУЗА'}
        </PosterButton>
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
