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

export { listAccounts } from './accounts';
export type { AccountResponse, AccountKindStr } from './accounts';

export { listCategoriesV10 } from './categories';
export type { CategoryV10, CategoryRollover } from './categories';
