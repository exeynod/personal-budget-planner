// Phase 25-04: HomeView (coral) — pure presentational component covering
// HOME-V10-01..06.
//
// Renders mirror of prototype/poster-screens.jsx PosterHome (lines 202-299):
//   - Coral background; eyebrow + МЕНЮ↗ placeholder header.
//   - Italic «Дневной темп —» + BigFig (count-up) + mono mini-line with
//     dashed-underlined wallet substring.
//   - PLAN МАЯ plate with signed surplus (yellow + / red − U+2212).
//   - КАТЕГОРИИ block: filter+sort done UPSTREAM by HomeMount (this view
//     just renders the rows in order), each row staggered via inline
//     `style={{ animationDelay: `${0.08 + i*0.045}s` }}` on
//     `.poster-row-in` + bar with `.poster-bar-fill` keyframe.
//
// All click handlers are passed in as props — HomeView is router-agnostic
// (HomeMount wires them to PosterRouter.push targets).

import type { CSSProperties } from 'react';
import { BigFig, Eyebrow, Mass } from '../../componentsV10';
import { formatRubles } from '../Onboarding/format';
import type { CategoryAggregateRow } from './computeHomeData';
import styles from './HomeView.module.css';

/** U+2212 minus sign (typographic). Used for the negative surplus amount. */
const MINUS_SIGN = '−';

export interface HomeViewProps {
  /** «VOL.17 / MAY 2026 · 22 ДНЯ» — pre-built by formatPeriodEyebrow. */
  eyebrow: string;
  /** Daily pace in cents (already clamped ≥0 by computeDailyPace). */
  dailyPaceCents: number;
  /** Days left in the period (for the «осталось N дней» mono-line). */
  daysLeft: number;
  /** Σ accounts.balance_cents — wallet display value. */
  walletCents: number;
  /** Signed surplus in cents (positive = under budget = yellow). */
  surplusCents: number;
  /**
   * Pre-sorted aggregate rows. HomeMount calls
   * sortCategoriesForHome(computeCategoryAggregates(...)) so this view does
   * not re-sort — keeps it pure and predictable for snapshot/integration tests.
   */
  categoryRows: CategoryAggregateRow[];

  // ── click handlers (router-agnostic) ───────────────────────────────────
  onWalletTap: () => void;
  onPlanTap: () => void;
  onCategoryTap: (id: number) => void;
  onAllOperationsTap: () => void;

  /**
   * Test-only escape hatch: when false, BigFig renders the final value
   * synchronously (skips count-up rAF). Default true so production
   * mounting keeps the cubicOut 900ms animation per HOME-V10-03.
   */
  bigFigAnimate?: boolean;
}

export function HomeView(props: HomeViewProps) {
  const {
    eyebrow,
    dailyPaceCents,
    daysLeft,
    walletCents,
    surplusCents,
    categoryRows,
    onWalletTap,
    onPlanTap,
    onCategoryTap,
    onAllOperationsTap,
    bigFigAnimate = true,
  } = props;

  const surplusPositive = surplusCents >= 0;
  const surplusAbs = Math.abs(surplusCents);
  const surplusSign = surplusPositive ? '+' : MINUS_SIGN;

  // BigFig consumes integer cents; useCountUp inside formats with U+202F
  // grouping. We render rubles (cents/100 floored) — matches prototype.
  // BigFig's `value` is the integer it animates / displays — we pass the
  // ruble integer directly so its built-in fmtThousands gives «4 000».
  const dailyPaceRubles = Math.floor(dailyPaceCents / 100);

  return (
    <div className={styles.root}>
      {/* ─────────── header row ─────────── */}
      <div className={styles.headerRow}>
        <Eyebrow color="var(--poster-paper)">{eyebrow}</Eyebrow>
        <span className={styles.menuLink}>МЕНЮ ↗</span>
      </div>

      {/* ─────────── hero block ─────────── */}
      <div className={`${styles.heroHeadline} poster-rise-in`}>
        <Mass italic size={28} className={styles.heroHeadlineMass}>
          Дневной темп —
        </Mass>
      </div>

      <div className={`${styles.heroBigFig} poster-rise-in`} style={{ animationDelay: '0.06s' }}>
        <BigFig
          sup="₽"
          color="var(--poster-paper)"
          size={88}
          value={dailyPaceRubles}
          animate={bigFigAnimate}
        />
        <div className={styles.heroSubline}>
          {'· осталось '}
          {daysLeft}
          {' дней · '}
          <span
            data-testid="home-wallet-link"
            className={styles.walletLink}
            onClick={onWalletTap}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onWalletTap();
            }}
          >
            {`в кошельке ${formatRubles(walletCents)} ₽ →`}
          </span>
        </div>
      </div>

      {/* ─────────── plan plate ─────────── */}
      {/* `data-testid="home-plan-plate"` retained for the unit test that
       * already targets it. Phase 29-04 W-05 hardening: also expose
       * `data-nav="plan"` so the E2E PlanMonth fixture can navigate via a
       * stable structural selector instead of a permissive text regex. */}
      <div
        data-testid="home-plan-plate"
        data-nav="plan"
        className={styles.planPlate}
        onClick={onPlanTap}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onPlanTap();
        }}
      >
        <span className={styles.planLabel}>PLAN МАЯ</span>
        <span className={styles.planRight}>
          <span
            className={`${styles.planAmount} ${
              surplusPositive
                ? styles.planAmountPositive
                : styles.planAmountNegative
            }`}
          >
            {`${surplusSign} ${formatRubles(surplusAbs)} ₽`}
          </span>
          <span className={styles.planChevron}>›</span>
        </span>
      </div>

      {/* ─────────── categories block ─────────── */}
      <div className={styles.categoriesBlock}>
        <div className={styles.categoriesHeader}>
          <Eyebrow color="var(--poster-paper)">КАТЕГОРИИ</Eyebrow>
          <span
            data-testid="home-all-operations"
            className={styles.allOpsLink}
            onClick={onAllOperationsTap}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onAllOperationsTap();
            }}
          >
            ВСЕ ОПЕРАЦИИ →
          </span>
        </div>

        {categoryRows.map((cat, i) => {
          const pct = Math.round(cat.ratio * 100);
          // Cap visual fill at 100% (over-budget shows the break tick instead).
          const barWidthPct = Math.min(100, pct);
          const rowDelay = `${(0.08 + i * 0.045).toFixed(3)}s`;
          const barDelay = `${(0.18 + i * 0.05).toFixed(3)}s`;
          const rowStyle: CSSProperties = { animationDelay: rowDelay };
          const barStyle: CSSProperties = {
            animationDelay: barDelay,
            width: `${barWidthPct}%`,
          };
          // Break tick at the plan position for over-budget rows.
          const breakTickLeftPct =
            cat.isOver && cat.fact_cents > 0
              ? Math.min(99.9, (cat.plan_cents / cat.fact_cents) * 100)
              : null;

          return (
            <div
              key={cat.id}
              data-testid={`home-category-row-${cat.id}`}
              className={`${styles.categoryRow} poster-row-in`}
              style={rowStyle}
              onClick={() => onCategoryTap(cat.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onCategoryTap(cat.id);
              }}
            >
              <div className={styles.categoryRowGrid}>
                <span className={styles.categoryRowName}>
                  <span className={styles.categoryOrd}>{cat.ord}</span>
                  <span className={styles.categoryName}>{cat.name}</span>
                </span>
                <span className={styles.categoryRowMeta}>
                  {cat.isOver && <span className={styles.overPlate}>OVER</span>}
                  <span className={styles.categoryPct}>
                    {Number.isFinite(pct) ? `${pct}%` : '∞'}
                  </span>
                </span>
                <span className={styles.categoryChevron}>›</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  data-testid={`home-category-bar-fill-${cat.id}`}
                  className={`${styles.barFill}${
                    cat.isOver ? ' ' + styles.barFillOver : ''
                  } poster-bar-fill`}
                  style={barStyle}
                />
                {breakTickLeftPct !== null && (
                  <div
                    className={styles.barBreakTick}
                    style={{ left: `${breakTickLeftPct}%` }}
                  />
                )}
              </div>
              <div className={styles.amountsRow}>
                <span>{`${formatRubles(cat.fact_cents)} ₽`}</span>
                <span>{`из ${formatRubles(cat.plan_cents)}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
