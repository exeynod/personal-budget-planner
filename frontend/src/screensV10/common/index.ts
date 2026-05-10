// Phase 25-02: Barrel re-export for screensV10/common primitives.
//
// Consumers (HomeView, TransactionsView, AddSheet, V10MainShell, AppV10)
// import from `screensV10/common` rather than reaching into individual files.

export {
  PosterRouterProvider,
  PosterRouterView,
  usePosterRouter,
  // WR-25-07 (review fix): soft-fallback variant for previews / standalone
  // use without `<PosterRouterProvider>`.
  usePosterRouterOptional,
  MAX_STACK,
  type PosterRouterAPI,
  type PosterRouterProviderProps,
  type PosterStackEntry,
  type PosterDirection,
} from './PosterRouter';

export { PosterSheet, type PosterSheetProps } from './PosterSheet';

export { BottomNavV10, type BottomNavV10Props } from './BottomNavV10';

// Phase 30-02 (DEBT-02): refetch-token context so AddSheet submit triggers
// HomeMount / TransactionsMount re-fetch without prop-drilling.
export {
  RefetchTokenProvider,
  useRefetchToken,
  type RefetchTokenProviderProps,
} from './RefetchContext';

export {
  MONTHS_EN,
  MONTHS_RU_GENITIVE,
  formatDay,
  formatTimeHM,
  pluralDays,
  formatPeriodEyebrow,
} from './format';
