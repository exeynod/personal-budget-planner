// Phase 25-04: Barrel re-export for the Home screen tree.
//
// Consumers (V10MainShell / AppV10 — wired in Plan 25-09) import HomeMount
// from `screensV10/Home`. HomeView is also re-exported so iOS/web parity
// integration tests can mount it directly with mocked props.

export { HomeMount } from './HomeMount';
export { HomeView } from './HomeView';
export type { HomeViewProps } from './HomeView';
export {
  computeDailyPace,
  computeSurplus,
  computeWalletTotal,
  computeCategoryAggregates,
  computePlanTotalCents,
  sortCategoriesForHome,
} from './computeHomeData';
export type { CategoryAggregateRow } from './computeHomeData';
