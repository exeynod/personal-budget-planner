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
} from './actual';
export type {
  ActualV10Read,
  ActualV10CreatePayload,
  ActualV10Kind,
} from './actual';

export { listAccounts, createAccount } from './accounts';
export type {
  AccountResponse,
  AccountKindStr,
  AccountCreatePayload,
} from './accounts';

export { listCategoriesV10, updateCategoryV10 } from './categories';
export type {
  CategoryV10,
  CategoryRollover,
  CategoryV10UpdatePayload,
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

// Phase 27-02 — AI observation (initial-state DM Serif text).
export { fetchObservation } from './ai';
export type { ObservationResponse } from './ai';

// Phase 27-03 — Savings + Goals (SAV-V10-01..04).
export {
  fetchSavingsSummary,
  patchSavingsConfig,
  postDeposit,
} from './savings';
export type {
  SavingsSnapshot,
  SavingsConfig,
  SavingsConfigPatchPayload,
  DepositCreatePayload,
  DepositResponse,
} from './savings';

export { listGoals, createGoal, deleteGoal } from './goals';
export type { GoalRead, GoalCreatePayload } from './goals';

// Phase 27-05 — Analytics top-categories wrapper (ANAL-V10-04).
export { fetchTopCategories } from './analytics';
export type { TopCategoryItem, AnalyticsRange } from './analytics';
