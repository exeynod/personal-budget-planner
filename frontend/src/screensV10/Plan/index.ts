// Phase 26-04: Plan barrel — Mount/View/Props + pure compute helpers.

export { PlanMount } from './PlanMount';
export type { PlanMountProps } from './PlanMount';

export { NativePlanView } from './NativePlanView';

export {
  computeSurplus,
  computeIsOverflow,
  computeRegularsList,
  applyPlanEdit,
  plansFromCategories,
} from './computePlan';
export type { RegularRow } from './computePlan';
