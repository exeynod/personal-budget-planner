// Phase 27-05: Analytics barrel — Mount/View/Props + pure compute helpers.
//
// Consumers (V10MainShell wire — plan 27-06) import from this barrel rather
// than reaching into individual files. Mirrors Plan / Subscriptions barrel
// pattern from Phase 26.

export { AnalyticsMount } from './AnalyticsMount';

export { AnalyticsView } from './AnalyticsView';
export type { AnalyticsViewProps, BarDatum } from './AnalyticsView';

export {
  lastNMonths,
  groupActualsByDay,
  groupActualsByWeek,
  groupActualsByCategory,
  computeKPISpent,
  computeKPISaved,
  shouldHighlightRed,
  computePct,
} from './computeAnalytics';
export type {
  GroupMode,
  MonthOption,
  DayBar,
  WeekBar,
  CategoryBar,
  KPISpent,
  KPISaved,
} from './computeAnalytics';
