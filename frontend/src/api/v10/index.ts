/**
 * Phase 25-03 — barrel for the v1.0 typed API client surface.
 *
 * Single source of truth for v1.0 wire shapes consumed by Phase 25 UI
 * plans (Home, Transactions, AddSheet) and downstream phases. Re-exports
 * value functions and named types from the three v10 modules so
 * consumers can `import { listAccounts, listCategoriesV10, createActualV10 }
 * from '../api/v10'` without reaching into individual files.
 */
export {
  listActualV10,
  createActualV10,
  updateActualV10,
  deleteActualV10,
} from './actual';
export type {
  ActualV10Read,
  ActualV10CreatePayload,
  ActualV10UpdatePayload,
  ActualV10Kind,
} from './actual';

export { listAccounts } from './accounts';
export type { AccountResponse, AccountKindStr } from './accounts';

export {
  listCategoriesV10,
  updateCategoryV10,
  createCategoryV10,
  archiveCategoryV10,
} from './categories';
export type {
  CategoryV10,
  CategoryV10UpdatePayload,
  CategoryV10CreatePayload,
} from './categories';

export {
  listSubscriptionsV10,
  patchSubscriptionV10,
  deleteSubscription,
  postSubscription,
  unpostSubscription,
} from './subscriptions';
export type {
  SubscriptionV10Read,
  SubscriptionV10Ext,
  SubscriptionV10UpdatePayload,
  SubscriptionPostResponse,
} from './subscriptions';

export { patchPlanMonth } from './planMonth';
export type {
  PlanMonthItem,
  PlanMonthPatchPayload,
  PlanMonthResponse,
} from './planMonth';

// v1.1 planning rework — planned-transaction detail surface + posting bridge.
export {
  listPlanned,
  createPlanned,
  patchPlanned,
  deletePlanned,
  postPlanned,
  unpostPlanned,
  postPlannedBatch,
} from './planned';
export type {
  PlannedV11Read,
  PlannedV11Create,
  PlannedV11Update,
  PostPlannedResponse,
  PostPlannedBatchResponse,
} from './planned';

// v1.1 planning rework — reusable budget template (limits + recurring lines).
export {
  listTemplateItems,
  upsertTemplateItem,
  listTemplateLines,
  createTemplateLine,
  patchTemplateLine,
  deleteTemplateLine,
} from './planTemplate';
export type {
  TemplateItemV11Read,
  TemplateItemV11Upsert,
  TemplateLineV11Read,
  TemplateLineV11Create,
  TemplateLineV11Update,
} from './planTemplate';

// v1.1 planning rework — per-period category limits (month-plan snapshot).
export { getPeriodPlan, patchPeriodPlan } from './periodPlan';
export type { PeriodPlanRow, PeriodPlanResponse } from './periodPlan';

// v1.1 planning rework — balance reconcile («Привести остаток»).
export { reconcileBalance } from './balance';
export type {
  ReconcileBalanceRequest,
  ReconcileBalanceResponse,
} from './balance';

// Phase 27-02 — AI observation (initial-state DM Serif text).
export { fetchObservation } from './ai';
export type { ObservationResponse } from './ai';

// Phase 27-05 — Analytics top-categories wrapper (ANAL-V10-04).
export { fetchTopCategories } from './analytics';
export type { TopCategoryItem, AnalyticsRange } from './analytics';
