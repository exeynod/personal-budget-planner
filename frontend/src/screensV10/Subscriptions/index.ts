// Phase 26-06 Task 3: barrel for Subscriptions screen surface.
//
// Consumers (PlanMount «РЕГУЛЯРНЫЕ» row tap, future Phase 27 Mgmt-хаб entry):
//   import { SubscriptionsMount } from '../Subscriptions';
//
// View / MenuSheet exported for testability + composition (Phase 27 may embed
// a slim variant in the Mgmt-хаб). Pure compute helpers re-exported via
// `export *` so consumers can `import { computeMonthlyTotal } from '../Subscriptions'`.

export { SubscriptionsMount } from './SubscriptionsMount';
export { SubscriptionsView } from './SubscriptionsView';
export type { SubscriptionsViewProps } from './SubscriptionsView';
export { SubscriptionMenuSheet } from './SubscriptionMenuSheet';
export type { SubscriptionMenuSheetProps } from './SubscriptionMenuSheet';
export * from './computeSubscriptions';
