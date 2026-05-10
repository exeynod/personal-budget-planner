// Phase 27-02 — barrel for the V10 AI screen module.
//
// Consumers (Plan 27-06 will mount AiMount inside V10MainShell after
// handleTab swap from PlanViewPlaceholder; tests import AiView/computeAi
// helpers directly).
export { AiMount } from './AiMount';
export { AiView, type AiMessage, type AiViewProps } from './AiView';
export {
  todayRu,
  DEFAULT_SUGGESTION_CHIPS,
  MONTHS_RU_GEN,
} from './computeAi';
