// Phase 26-04: Plan barrel — Mount/View/Props + pure compute helpers.

export { PlanMount } from './PlanMount';
export type { PlanMountProps } from './PlanMount';

export { PlanView } from './PlanView';
export type { PlanViewProps } from './PlanView';

export {
  computeSurplus,
  computeIsOverflow,
  computeRolloverAggregates,
  computeRegularsList,
  applyPlanEdit,
  plansFromCategories,
} from './computePlan';
export type { RegularRow, RolloverAggregates } from './computePlan';
