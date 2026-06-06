// Phase 27-03: barrel for the Savings screen surface.
//
// Consumers (V10MainShell — to be wired by Plan 27-06; tests) import from
// `../Savings` rather than reaching into individual files.

export { SavingsMount } from './SavingsMount';
export { SavingsView, type SavingsViewProps } from './SavingsView';
export { NativeSavingsView } from './NativeSavingsView';
export { NewGoalSheet, type NewGoalSheetProps } from './NewGoalSheet';
export { DepositSheet, type DepositSheetProps } from './DepositSheet';
export {
  computeProgressPct,
  formatDueRu,
  isValidGoalDraft,
  isValidDepositDraft,
} from './computeSavings';
