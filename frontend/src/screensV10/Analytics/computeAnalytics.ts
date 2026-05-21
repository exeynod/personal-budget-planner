// Phase 27-05 (ANAL-V10-01..04): pure compute helpers for AnalyticsView.
//
// Surface (consumed by AnalyticsMount + AnalyticsView):
//   - lastNMonths(now, n)                       → MonthOption[] segmented chips
//   - groupActualsByDay(actuals, ps, pe)        → bar chart, ДЕНЬ mode
//   - groupActualsByWeek(actuals, ps)           → bar chart, НЕД. mode
//   - groupActualsByCategory(actuals, cats)     → bar chart, КАТ. mode + KPI saved
//   - computeKPISpent(curr, prev)               → «ПОТРАЧЕНО» plate (with delta)
//   - computeKPISaved(actuals, cats)            → «СЭКОНОМЛЕНО» plate
//   - shouldHighlightRed(sum, plan, threshold)  → red bar gate ≥75% (T-27-05-03)
//   - computePct(sum, plan)                     → clamped 0..100
//
// All deterministic, side-effect-free, byte-identical to iOS sister helpers
// in plan 27-05-ios.
//
// Threat coverage (mirrors test cases):
//   - T-27-05-03: shouldHighlightRed + computePct guard `plan <= 0` to prevent
//                 division-by-zero / NaN bar render.

import type {
  ActualV10Read,
  CategoryV10,
  TopCategoryItem,
} from '../../api/v10';

export type GroupMode = 'day' | 'week' | 'cat';

const MONTHS_RU_SHORT = [
  'ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН',
  'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК',
] as const;

export interface MonthOption {
  /** Chip label, e.g. "МАР 26". */
  label: string;
  /** Calendar year (e.g. 2026). */
  year: number;
  /** Calendar month 1..12. */
  month: number;
  /** ISO date YYYY-MM-01. */
  period_start: string;
  /** ISO date YYYY-MM-DD (last day of month). */
  period_end: string;
}

/**
 * Build last N months ending at `now` (inclusive). Index 0 = oldest,
 * index N-1 = current month. Crosses year boundary correctly.
 *
 * Used by AnalyticsMount to seed the segmented period chips.
 */
export function lastNMonths(now: Date, n: number): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1; // 1..12
    const yy = String(y).slice(-2);
    const lastDay = new Date(y, m, 0).getDate(); // m here is 1-based; day 0 of next = last of curr
    const mm = String(m).padStart(2, '0');
    out.push({
      label: `${MONTHS_RU_SHORT[m - 1]} ${yy}`,
      year: y,
      month: m,
      period_start: `${y}-${mm}-01`,
      period_end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    });
  }
  return out;
}

/** Bar chart bucket — day-mode entry (ISO date key). */
export interface DayBar {
  key: string; // YYYY-MM-DD
  sumCents: number;
}

/**
 * Sum expense actuals by `tx_date` within [periodStart, periodEnd] inclusive.
 * Returns ascending-by-date.
 */
export function groupActualsByDay(
  actuals: ReadonlyArray<ActualV10Read>,
  periodStart: string,
  periodEnd: string,
): DayBar[] {
  const filtered = actuals.filter(
    (t) =>
      t.kind === 'expense' &&
      t.tx_date >= periodStart &&
      t.tx_date <= periodEnd,
  );
  const map = new Map<string, number>();
  for (const t of filtered) {
    map.set(t.tx_date, (map.get(t.tx_date) ?? 0) + Math.abs(t.amount_cents));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, sumCents]) => ({ key, sumCents }));
}

/** Bar chart bucket — week-mode entry (1..5 within calendar month). */
export interface WeekBar {
  weekIdx: number; // 1..5
  sumCents: number;
}

/**
 * Sum expense actuals by week-of-month bucket (week = ceil(day/7)).
 * `periodStart` reserved for future month-bound filtering — for now actuals
 * are assumed period-pre-filtered upstream.
 */
export function groupActualsByWeek(
  actuals: ReadonlyArray<ActualV10Read>,
  _periodStart: string,
): WeekBar[] {
  const filtered = actuals.filter((t) => t.kind === 'expense');
  const map = new Map<number, number>();
  for (const t of filtered) {
    const day = parseInt(t.tx_date.slice(8, 10), 10);
    if (!Number.isFinite(day) || day < 1) continue;
    const weekIdx = Math.min(5, Math.max(1, Math.ceil(day / 7)));
    map.set(weekIdx, (map.get(weekIdx) ?? 0) + Math.abs(t.amount_cents));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([weekIdx, sumCents]) => ({ weekIdx, sumCents }));
}

/** Bar chart bucket — category-mode entry (also used by KPI saved). */
export interface CategoryBar {
  category_id: number;
  category_name: string;
  plan_cents: number;
  sumCents: number;
}

/**
 * Sum expense actuals by `category_id`; join `category_name` + `plan_cents`
 * from the categories list. Sorted desc by `sumCents` so the top spender is
 * first. Actuals with null/undefined category_id are skipped.
 */
export function groupActualsByCategory(
  actuals: ReadonlyArray<ActualV10Read>,
  categories: ReadonlyArray<CategoryV10>,
): CategoryBar[] {
  const filtered = actuals.filter((t) => t.kind === 'expense');
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const sumMap = new Map<number, number>();
  for (const t of filtered) {
    if (t.category_id == null) continue;
    sumMap.set(t.category_id, (sumMap.get(t.category_id) ?? 0) + Math.abs(t.amount_cents));
  }
  return Array.from(sumMap.entries())
    .map(([id, sumCents]) => {
      const c = catMap.get(id);
      return {
        category_id: id,
        category_name: c?.name ?? '?',
        plan_cents: c?.plan_cents ?? 0,
        sumCents,
      };
    })
    .sort((a, b) => b.sumCents - a.sumCents);
}

/**
 * P3-W2: Top-N expense categories for the SELECTED month, derived from the
 * same month-scoped actuals the bars consume (`groupActualsByCategory`). This
 * replaces the period-agnostic `fetchTopCategories('1M')` so the month chip
 * actually drives the «Топ-5» list.
 *
 * Output mirrors the backend-backed `TopCategoryItem` (api/v10/analytics.ts):
 *   category_id  ← category id
 *   category_name ← category name (or '?' for orphaned actuals)
 *   sum_cents    ← Σ |amount_cents| of expense actuals in the category
 *   plan_cents   ← category plan_cents
 *   pct_of_plan  ← clamp(round(sum/plan * 100), 0..100), null when plan ≤ 0
 *
 * Already sorted desc by sum (groupActualsByCategory guarantees this); sliced
 * to `limit`.
 */
export function computeTopCategories(
  actuals: ReadonlyArray<ActualV10Read>,
  categories: ReadonlyArray<CategoryV10>,
  limit = 5,
): TopCategoryItem[] {
  return groupActualsByCategory(actuals, categories)
    .slice(0, limit)
    .map((b) => {
      const pct =
        b.plan_cents > 0
          ? Math.max(
              0,
              Math.min(100, Math.round((b.sumCents / b.plan_cents) * 100)),
            )
          : null;
      return {
        category_id: b.category_id,
        category_name: b.category_name,
        sum_cents: b.sumCents,
        plan_cents: b.plan_cents,
        pct_of_plan: pct,
      };
    });
}

/** «ПОТРАЧЕНО» KPI plate model. */
export interface KPISpent {
  /** Σ |amount_cents| of current period expenses. */
  sumCents: number;
  /** Signed difference vs prev period (positive = spent more). */
  deltaCents: number;
  /** Rounded delta percent vs prev period (0 when prev is 0). */
  deltaPct: number;
}

/**
 * Sum current-period and prev-period expense totals; report delta + percent.
 * Income / roundup / deposit kinds are ignored.
 */
export function computeKPISpent(
  currActuals: ReadonlyArray<ActualV10Read>,
  prevActuals: ReadonlyArray<ActualV10Read>,
): KPISpent {
  const sumExpense = (xs: ReadonlyArray<ActualV10Read>): number =>
    xs
      .filter((t) => t.kind === 'expense')
      .reduce((s, t) => s + Math.abs(t.amount_cents), 0);
  const sumCents = sumExpense(currActuals);
  const prev = sumExpense(prevActuals);
  const deltaCents = sumCents - prev;
  const deltaPct = prev === 0 ? 0 : Math.round((deltaCents / prev) * 100);
  return { sumCents, deltaCents, deltaPct };
}

/** «СЭКОНОМЛЕНО» KPI plate model. */
export interface KPISaved {
  /** Σ positive remainders (plan − fact) across non-system, non-paused cats. */
  sumCents: number;
}

/**
 * Sum positive plan-fact remainders. Skip rules mirror PlanView aggregator:
 *   - skip `code === 'savings'` (system category)
 *   - skip `paused === true`
 *   - skip negative remainders (over-budget rows contribute 0)
 */
export function computeKPISaved(
  actuals: ReadonlyArray<ActualV10Read>,
  categories: ReadonlyArray<CategoryV10>,
): KPISaved {
  const facts = groupActualsByCategory(actuals, categories);
  const factById = new Map(facts.map((f) => [f.category_id, f.sumCents]));
  let saved = 0;
  for (const c of categories) {
    if (c.code === 'savings') continue;
    if (c.paused === true) continue;
    const fact = factById.get(c.id) ?? 0;
    saved += Math.max(0, (c.plan_cents ?? 0) - fact);
  }
  return { sumCents: saved };
}

/**
 * Bar should be highlighted red iff `barSum / barPlan >= threshold` (default
 * 0.75 per ANAL-V10-03). Guards against `plan <= 0` (T-27-05-03) by
 * returning false — callers render the bar in default ink colour.
 */
export function shouldHighlightRed(
  barSum: number,
  barPlan: number,
  threshold = 0.75,
): boolean {
  if (barPlan <= 0) return false;
  return barSum / barPlan >= threshold;
}

/**
 * Rounded percent of `sum / plan`, clamped to [0, 100]. Returns 0 when
 * plan <= 0 (T-27-05-03 — avoids NaN in pct labels).
 */
export function computePct(sum: number, plan: number): number {
  if (plan <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((sum / plan) * 100)));
}
