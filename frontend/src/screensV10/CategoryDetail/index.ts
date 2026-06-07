// Phase 26-02 Task 3: barrel for CategoryDetail (web).
//
// Single import surface: HomeMount + future PlanMount consumers reach into
// this barrel to mount the screen, while tests still hit individual files for
// View / compute helpers.

export { CategoryDetailMount } from './CategoryDetailMount';
export type { CategoryDetailMountProps } from './CategoryDetailMount';

export { NativeCategoryDetailView } from './NativeCategoryDetailView';

export {
  computeOverPercent,
  computeUnderPercent,
  computeBarSegments,
  filterActualsForCategory,
  computeFactForCategory,
  type BarSegments,
} from './computeCategoryDetail';
