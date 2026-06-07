// Phase 27-05 Task 3: AnalyticsMount — data fetcher + period state +
// derived bar/KPI computation glue between API and AnalyticsView.
//
// Lifecycle:
//   1. On mount + on selectedMonth/groupMode change:
//        Parallel fetch:
//          - listCategoriesV10()                          (cat names + plan_cents)
//          - listPeriods()                                (resolve period_id by month)
//        Then sequential:
//          - listActualV10(matchingPeriod.id)             (current period actuals)
//          - listActualV10(prevPeriod.id) when available  (delta vs prev)
//   2. Compute derived state (KPI, bar data, Top-5) per group mode + month.
//   3. Render <AnalyticsView />.
//
// Threat coverage:
//   - T-27-05-02 (rapid month-switch DoS): cancellation guard on cleanup
//                 prevents stale fetches landing in setState.
//
// P3-W2 (was Phase-27 deferral): the «Топ-5 категорий» list now reflects the
//   SELECTED month chip rather than a hardwired `fetchTopCategories('1M')`.
//   The backend `/analytics/top-categories` only accepts a coarse `range`
//   (1M/3M/6M/12M) and cannot return a specific past month — so per-chip top
//   data is derived CLIENT-SIDE from the same month-scoped `actuals` already
//   fetched for the bars (`groupActualsByCategory`). This keeps the Top list
//   byte-consistent with the КАТ. bar mode and with the period the chips
//   resolve via `listPeriods`. (See computeTopCategories below.)
//   For bar data we rely on `listActualV10(periodId)` (period-scoped).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePosterRouter } from '../common';
import {
  listActualV10,
  listCategoriesV10,
  type ActualV10Read,
  type CategoryV10,
  type TopCategoryItem,
} from '../../api/v10';
import { listPeriods } from '../../api/periods';
import type { PeriodRead } from '../../api/types';
import { NativeAnalyticsView, type BarDatum } from './NativeAnalyticsView';
import {
  computeKPISaved,
  computeKPISpent,
  computeTopCategories,
  groupActualsByCategory,
  groupActualsByDay,
  groupActualsByWeek,
  lastNMonths,
  type GroupMode,
  type MonthOption,
} from './computeAnalytics';

// ─────────── Component ───────────

export function AnalyticsMount() {
  const router = usePosterRouter();

  // Build the period chips once — re-derive only if Date dependency changes
  // (today's date is stable for the screen's lifetime in mini-app context).
  const monthOptions = useMemo(() => lastNMonths(new Date(), 3), []);
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(
    () => monthOptions[monthOptions.length - 1],
  );
  const [groupMode, setGroupMode] = useState<GroupMode>('day');

  const [categories, setCategories] = useState<CategoryV10[]>([]);
  const [actuals, setActuals] = useState<ActualV10Read[]>([]);
  const [prevActuals, setPrevActuals] = useState<ActualV10Read[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─────────── fetch effect (re-runs on selectedMonth) ───────────
  useEffect(() => {
    let cancelled = false; // T-27-05-02 mitigation
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [cats, periods] = await Promise.all([
          listCategoriesV10(),
          listPeriods(),
        ]);
        if (cancelled) return;

        // Resolve current + previous period ids by matching month boundary.
        const currentPeriod = findPeriodForMonth(periods, selectedMonth);
        const prevMonthIdx = monthOptions.findIndex(
          (m) => m.label === selectedMonth.label,
        );
        const prevMonth =
          prevMonthIdx > 0 ? monthOptions[prevMonthIdx - 1] : null;
        const previousPeriod = prevMonth
          ? findPeriodForMonth(periods, prevMonth)
          : null;

        const [acts, prevs] = await Promise.all([
          currentPeriod ? listActualV10(currentPeriod.id) : Promise.resolve([]),
          previousPeriod
            ? listActualV10(previousPeriod.id)
            : Promise.resolve([]),
        ]);
        if (cancelled) return;

        setCategories(cats);
        setActuals(acts);
        setPrevActuals(prevs);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Не удалось загрузить аналитику',
        );
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, monthOptions]);

  // ─────────── derived view-model ───────────
  const kpiSpent = useMemo(
    () => computeKPISpent(actuals, prevActuals),
    [actuals, prevActuals],
  );
  const kpiSaved = useMemo(
    () => computeKPISaved(actuals, categories),
    [actuals, categories],
  );

  const barData: BarDatum[] = useMemo(() => {
    if (groupMode === 'day') {
      return groupActualsByDay(
        actuals,
        selectedMonth.period_start,
        selectedMonth.period_end,
      ).map((b) => ({
        label: b.key.slice(8, 10), // DD
        sumCents: b.sumCents,
      }));
    }
    if (groupMode === 'week') {
      return groupActualsByWeek(actuals, selectedMonth.period_start).map(
        (b) => ({
          label: `Н${b.weekIdx}`,
          sumCents: b.sumCents,
        }),
      );
    }
    // groupMode === 'cat'
    return groupActualsByCategory(actuals, categories).map((b) => ({
      label: b.category_name.slice(0, 4).toUpperCase(),
      sumCents: b.sumCents,
      planCents: b.plan_cents,
    }));
  }, [groupMode, actuals, categories, selectedMonth]);

  // P3-W2: Top-5 derived from the SELECTED month's actuals (same source the
  // bars use) so the chip drives the list. Re-derives on month switch via
  // `actuals` dependency.
  const topCategories: TopCategoryItem[] = useMemo(
    () => computeTopCategories(actuals, categories, 5),
    [actuals, categories],
  );

  // ─────────── handlers ───────────
  const handleSelectMonth = useCallback((m: MonthOption) => {
    setSelectedMonth(m);
  }, []);
  const handleSelectGroup = useCallback((g: GroupMode) => {
    setGroupMode(g);
  }, []);
  const handleBack = useCallback(() => {
    router.pop();
  }, [router]);

  const viewProps = {
    monthOptions,
    selectedMonth,
    onSelectMonth: handleSelectMonth,
    groupMode,
    onSelectGroup: handleSelectGroup,
    kpiSpent,
    kpiSaved,
    barData,
    topCategories,
    loading,
    error,
    canPop: router.canPop,
    onBack: handleBack,
  };

  // Liquid Glass native shell → native iOS Analytics view.
  return <NativeAnalyticsView {...viewProps} />;
}

// ─────────── helpers (private) ───────────

/**
 * Match a `PeriodRead` whose `period_start` falls in the given calendar month.
 * Returns `null` when no period matches (e.g. month before user onboarded).
 */
function findPeriodForMonth(
  periods: ReadonlyArray<PeriodRead>,
  month: MonthOption,
): PeriodRead | null {
  for (const p of periods) {
    // p.period_start is "YYYY-MM-DD" — match year + month prefix.
    if (p.period_start.slice(0, 7) === month.period_start.slice(0, 7)) {
      return p;
    }
  }
  return null;
}
