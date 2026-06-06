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

import { memo, type CSSProperties } from 'react';
import { BigFig, Eyebrow, Mass } from '../../componentsV10';
import { PeriodSwitcher } from '../common';
import type { PeriodRead } from '../../api/types';
import { formatRubles } from '../Onboarding/format';
import type { CategoryAggregateRow } from './computeHomeData';
import { homeColorCssValue, type HomeColor } from './useHomeColor';
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
  onPlanTap: () => void;
  onCategoryTap: (id: number) => void;
  onAllOperationsTap: () => void;

  /**
   * Test-only escape hatch: when false, BigFig renders the final value
   * synchronously (skips count-up rAF). Default true so production
   * mounting keeps the cubicOut 900ms animation per HOME-V10-03.
   */
  bigFigAnimate?: boolean;

  /**
   * Phase 30-07 (DEBT-08): user-selected background color. When absent,
   * falls back to `'coral'` — matches pre-DEBT-08 visual behaviour.
   * HomeMount reads the value via `useHomeColor()` and passes it down.
   */
  homeColor?: HomeColor;

  /**
   * Phase P2 (period switching): all periods (newest-first) + the viewed id
   * + a switch handler. The PeriodSwitcher pill renders in the header ONLY
   * when there are ≥2 periods and a non-null selection + handler — so the
   * default single-period current view (and the snapshot tests) are unchanged.
   */
  periods?: PeriodRead[];
  selectedPeriodId?: number | null;
  onSelectPeriod?: (id: number) => void;
}

// Phase 31 (code-quality): leaf view wrapped in React.memo — HomeMount passes
// stable (useCallback) handlers + a memoised view-model, so re-renders driven
// by sibling state (router, refetch token) skip HomeView when its props are
// referentially unchanged.
function HomeViewInner(props: HomeViewProps) {
  const {
    eyebrow,
    dailyPaceCents,
    daysLeft,
    walletCents,
    surplusCents,
    categoryRows,
    onPlanTap,
    onCategoryTap,
    onAllOperationsTap,
    bigFigAnimate = true,
    homeColor = 'coral',
    periods,
    selectedPeriodId,
    onSelectPeriod,
  } = props;

  // Phase P2: show the switcher whenever a period selection + handler are wired
  // and at least one period exists. With ≥2 periods PeriodSwitcher renders its
  // prev/next pill; with exactly 1 it renders a static month chip (no arrows) so
  // the period concept stays visible. The no-provider / empty-list path (e.g. the
  // pixel-snapshot fixtures where /periods → []) still renders no extra DOM.
  const showSwitcher =
    !!periods &&
    periods.length >= 1 &&
    selectedPeriodId != null &&
    !!onSelectPeriod;

  // Phase 30-07 (DEBT-08): expose user-selected background color via inline
  // CSS-var override on the root. HomeView.module.css `.root` reads
  // `background: var(--color-home, var(--poster-coral))` so the default
  // coral keeps rendering whenever no preference is set.
  const rootStyle: CSSProperties = {
    ['--color-home' as keyof CSSProperties]: homeColorCssValue(homeColor),
  } as CSSProperties;

  const surplusPositive = surplusCents >= 0;
  const surplusAbs = Math.abs(surplusCents);
  const surplusSign = surplusPositive ? '+' : MINUS_SIGN;

  // BigFig consumes integer cents; useCountUp inside formats with U+202F
  // grouping. We render rubles (cents/100 floored) — matches prototype.
  // BigFig's `value` is the integer it animates / displays — we pass the
  // ruble integer directly so its built-in fmtThousands gives «4 000».
  const dailyPaceRubles = Math.floor(dailyPaceCents / 100);

  return (
    <div className={styles.root} style={rootStyle}>
      {/* ─────────── header row ─────────── */}
      <div className={styles.headerRow}>
        <Eyebrow color="var(--eyebrow-ink)">{eyebrow}</Eyebrow>
        <span className={styles.menuLink}>МЕНЮ ↗</span>
      </div>

      {/* Phase P2 (period switching): prev/next pill under the eyebrow. Only
       * rendered when ≥2 periods exist (guarded by showSwitcher) so the
       * default single-period current view keeps its exact layout. */}
      {showSwitcher && (
        <div className={styles.periodSwitcherRow}>
          <PeriodSwitcher
            periods={periods!}
            selectedId={selectedPeriodId!}
            onSelect={onSelectPeriod!}
          />
        </div>
      )}

      {/* ─────────── hero block ─────────── */}
      <div className={`${styles.heroHeadline} poster-rise-in`}>
        <Mass italic size={28} className={styles.heroHeadlineMass}>
          Дневной темп —
        </Mass>
      </div>

      <div
        className={`${styles.heroBigFig} poster-rise-in`}
        style={{ animationDelay: '0.06s' }}
      >
        <BigFig
          sup="₽"
          color="var(--ink-on-home)"
          size={88}
          value={dailyPaceRubles}
          animate={bigFigAnimate}
        />
        <div className={styles.heroSubline}>
          {'· осталось '}
          {daysLeft}
          {' дней · '}
          <span data-testid="home-wallet-value" className={styles.walletLink}>
            {`в кошельке ${formatRubles(walletCents)} ₽`}
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
          <Eyebrow color="var(--eyebrow-ink)">КАТЕГОРИИ</Eyebrow>
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

export const HomeView = memo(HomeViewInner);
