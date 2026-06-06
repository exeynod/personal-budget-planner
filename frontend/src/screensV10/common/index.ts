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
  // Phase P2 (period switching): eyebrow built from a PeriodRead so a closed
  // past period shows its own month rather than today's.
  formatPeriodEyebrowFromPeriod,
} from './format';

// Phase P2 (period switching): viewed-period context + v10 prev/next pill.
export {
  SelectedPeriodProvider,
  useSelectedPeriod,
  useSelectedPeriodOptional,
  type SelectedPeriodAPI,
  type SelectedPeriodProviderProps,
} from './SelectedPeriodProvider';

export { PeriodSwitcher, type PeriodSwitcherProps } from './PeriodSwitcher';

// Phase 31 (code-quality): async-fetch state machine + parameterised plate
// extracted from the Mount components (was copy-pasted in each).
export {
  useResource,
  type ResourceStatus,
  type UseResourceOptions,
  type UseResourceResult,
} from './useResource';
export { StatePlate, type StatePlateProps } from './StatePlate';

// Phase 50-02 (THEME-01): multi-theme runtime selector.
export {
  useTheme,
  THEMES,
  themeLabel,
  themeDescription,
  type Theme,
} from './useTheme';
