// Phase 27-02 — barrel for the V10 AI screen module.
//
// Consumers (Plan 27-06 will mount AiMount inside V10MainShell after
// handleTab swap from PlanViewPlaceholder; tests import AiView/computeAi
// helpers directly).
export { AiMount } from './AiMount';
export { NativeAiView, type AiMessage, type AiViewProps } from './NativeAiView';
export { todayRu, DEFAULT_SUGGESTION_CHIPS, MONTHS_RU_GEN } from './computeAi';
