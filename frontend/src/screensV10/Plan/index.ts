// Phase 26-04: Plan barrel — Mount/View/Props + pure compute helpers.

export { PlanMount } from './PlanMount';
export type { PlanMountProps } from './PlanMount';

export { NativePlanView } from './NativePlanView';

// v1.1 plan-side per-category planned-transaction drill-down (pushed from the
// month-plan category rows).
export { PlanCategoryDetailMount } from './PlanCategoryDetailMount';
export type { PlanCategoryDetailMountProps } from './PlanCategoryDetailMount';
export { PlanCategoryDetailView } from './PlanCategoryDetailView';
export type { PlanCategoryDetailViewProps } from './PlanCategoryDetailView';

export {
  computeSurplus,
  computeIsOverflow,
  computeRegularsList,
  applyPlanEdit,
  plansFromCategories,
} from './computePlan';
export type { RegularRow } from './computePlan';
