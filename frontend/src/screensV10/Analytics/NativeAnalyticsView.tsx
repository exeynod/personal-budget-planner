// Liquid Glass v2 — native iOS Analytics view (pushed detail from the
// Management hub).
//
// Faithful native port of the poster AnalyticsView: it consumes the SAME props
// the poster receives (AnalyticsMount wires them identically) and renders the
// same data in native white grouped cards — no metric is invented, no data
// logic duplicated.
//
// Surface parity with the poster (AnalyticsView.tsx):
//   - NativeNavBar «Аналитика» with a back chevron (pushed detail).
//   - Period chips (last 3 months) → Segmented control, drives onSelectMonth.
//   - Two KPI stat cards: «Потрачено» (sum + delta-vs-prev) and «Сэкономлено»
//     (sum «от плана»). Delta colour follows the «+ = good» convention: spent
//     MORE than prev = red, LESS = green.
//   - Group-mode chips ДЕНЬ / НЕД. / КАТ. → Segmented, drives onSelectGroup.
//   - Bar chart card — CSS bars using the same sumCents/maxSum heights and the
//     same `shouldHighlightRed` (≥75% of plan) red gate as the poster SVG.
//   - «Топ-5 категорий» as an inset-grouped card: CategoryIcon + name +
//     «{sum} ₽ · {pct}%» trailing (same values the poster row shows).
//
// Pure presentational + router-agnostic: back is the `onBack` callback the
// Mount already supplies (router.pop()).

import { memo } from 'react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
  Segmented,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyNative, formatMoneyRubNative } from '../native/money';
import { shouldHighlightRed, type GroupMode } from './computeAnalytics';
import type { AnalyticsViewProps } from './AnalyticsView';
import styles from './NativeAnalyticsView.module.css';

// Group-mode labels — identical to the poster GROUP_LABEL map.
const GROUP_OPTIONS: ReadonlyArray<{ value: GroupMode; label: string }> = [
  { value: 'day', label: 'ДЕНЬ' },
  { value: 'week', label: 'НЕД.' },
  { value: 'cat', label: 'КАТ.' },
];

function formatDeltaPct(pct: number): string {
  if (pct === 0) return 'к прошлому —';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct)}% к прошлому`;
}

// Day-mode can emit ~28-31 buckets — labelling every column overlaps. Pick a
// stride so at most ~8 labels render, evenly spaced (first + every Nth + last),
// the rest get an empty tick. Week/cat modes are short → stride 1 (label all).
function labelStride(count: number): number {
  if (count <= 8) return 1;
  return Math.ceil(count / 7);
}

function NativeAnalyticsViewInner(props: AnalyticsViewProps) {
  const {
    monthOptions,
    selectedMonth,
    onSelectMonth,
    groupMode,
    onSelectGroup,
    kpiSpent,
    kpiSaved,
    barData,
    topCategories,
    loading,
    error,
    onBack,
  } = props;

  // Loading / error subviews mirror the poster's (same back affordance).
  if (loading) {
    return (
      <div className={styles.root} data-testid="native-analytics-loading">
        <NativeNavBar title="Аналитика" onBack={onBack} />
        <div className={styles.empty}>Загрузка…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.root} data-testid="native-analytics-error">
        <NativeNavBar title="Аналитика" onBack={onBack} />
        <div className={styles.errorMsg}>{error}</div>
      </div>
    );
  }

  // Bar heights use the same max-normalisation as the poster SVG.
  const maxSum = Math.max(1, ...barData.map((b) => b.sumCents));
  // The chart has real spend iff at least one bucket is non-zero; an all-zero
  // (or empty) dataset renders the «Нет данных» placeholder instead of a row of
  // flat min-height stubs.
  const hasChartData = barData.some((b) => b.sumCents > 0);
  // Index of the tallest (peak-spend) bar — highlighted with a stronger accent.
  const peakIdx = hasChartData
    ? barData.reduce(
        (best, b, i) => (b.sumCents > barData[best].sumCents ? i : best),
        0,
      )
    : -1;
  const stride = labelStride(barData.length);

  // «−100% к прошлому» on a fresh/empty month reads as an error. Suppress the
  // delta colour + value when the current period has no spend at all.
  const spentEmpty = kpiSpent.sumCents === 0;
  const savedEmpty = kpiSaved.sumCents === 0;
  const spentDeltaClass = spentEmpty
    ? ''
    : kpiSpent.deltaPct > 0
      ? styles.kpiDeltaUp
      : kpiSpent.deltaPct < 0
        ? styles.kpiDeltaDown
        : '';

  // Period chips: map MonthOption[] → Segmented options keyed by label (the
  // poster compares by `label`, so we do too).
  const monthSegOptions = monthOptions.map((m) => ({
    value: m.label,
    label: m.label,
  }));

  return (
    <div className={styles.root}>
      <NativeNavBar title="Аналитика" onBack={onBack} />

      {/* Period chips */}
      <div className={styles.segmentRow}>
        <Segmented
          ariaLabel="Период"
          value={selectedMonth.label}
          onChange={(label) => {
            const next = monthOptions.find((m) => m.label === label);
            if (next) onSelectMonth(next);
          }}
          options={monthSegOptions}
        />
      </div>

      {/* KPI stat cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard} data-testid="native-kpi-spent">
          <span className={styles.kpiLabel}>Потрачено</span>
          <span className={styles.kpiValue}>
            {formatMoneyNative(kpiSpent.sumCents)}
            <span className={styles.kpiCur}>₽</span>
          </span>
          <span className={`${styles.kpiDelta} ${spentDeltaClass}`}>
            {spentEmpty ? 'к прошлому —' : formatDeltaPct(kpiSpent.deltaPct)}
          </span>
        </div>

        <div className={styles.kpiCard} data-testid="native-kpi-saved">
          <span className={styles.kpiLabel}>Сэкономлено</span>
          <span className={styles.kpiValue}>
            {formatMoneyNative(kpiSaved.sumCents)}
            <span className={styles.kpiCur}>₽</span>
          </span>
          <span className={styles.kpiDelta}>
            {savedEmpty ? '—' : 'от плана'}
          </span>
        </div>
      </div>

      {/* Group-mode chips */}
      <div className={styles.segmentRow}>
        <Segmented<GroupMode>
          ariaLabel="Группировка"
          value={groupMode}
          onChange={onSelectGroup}
          options={GROUP_OPTIONS}
        />
      </div>

      {/* Bar chart */}
      <SectionHeader>Динамика расходов</SectionHeader>
      <div className={styles.chartCard} data-testid="native-bar-chart">
        {!hasChartData ? (
          <div className={styles.chartEmpty}>Нет данных</div>
        ) : (
          <div className={styles.chartPlot}>
            <div className={styles.chartBars}>
              {barData.map((b, i) => {
                const pct = (b.sumCents / maxSum) * 100;
                const red = shouldHighlightRed(b.sumCents, b.planCents ?? 0);
                const peak = i === peakIdx;
                // Label every Nth column (always first + last) so day-mode
                // ticks don't overlap; the rest get an empty placeholder that
                // preserves column alignment.
                const showLabel = i % stride === 0 || i === barData.length - 1;
                const fillClass = red
                  ? styles.barFillRed
                  : peak
                    ? styles.barFillPeak
                    : '';
                return (
                  <div
                    key={`${b.label}-${i}`}
                    className={styles.barCol}
                    data-testid={`native-bar-${i}${red ? '-red' : ''}`}
                  >
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${fillClass}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className={styles.barLabel}>
                      {showLabel ? b.label : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={styles.chartBaseline} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Top-5 categories */}
      <SectionHeader>Топ-5 категорий</SectionHeader>
      {topCategories.length === 0 ? (
        <div className={styles.empty}>Нет категорий</div>
      ) : (
        <InsetGroup>
          {topCategories.slice(0, 5).map((c) => (
            <InsetRow
              key={c.category_id}
              testId={`native-top-row-${c.category_id}`}
              leading={
                <CategoryIcon name={c.category_name} id={c.category_id} />
              }
              title={c.category_name}
              trailing={
                <span className={styles.topAmount}>
                  {formatMoneyRubNative(c.sum_cents)}
                  {c.pct_of_plan != null && (
                    <span className={styles.topPct}>· {c.pct_of_plan}%</span>
                  )}
                </span>
              }
            />
          ))}
        </InsetGroup>
      )}
    </div>
  );
}

export const NativeAnalyticsView = memo(NativeAnalyticsViewInner);
