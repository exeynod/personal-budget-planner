// Phase 27-02 Task 2 RED stub: real AiView implementation lands in GREEN.
// Test imports succeed, but rendering is empty so the assertions fail.
import type { ReactNode } from 'react';

export type AiMessage = { role: 'user' | 'ai'; text: string; id: string };

export interface AiViewProps {
  observation: string | null;
  observationGeneratedAt: Date | null;
  observationLoading: boolean;
  observationError: string | null;
  suggestionChips: readonly string[];
  messages: AiMessage[];
  isStreaming: boolean;
  input: string;
  onInputChange: (s: string) => void;
  onSend: (text: string) => void;
  onChipTap: (text: string) => void;
  canPop: boolean;
  onBack: () => void;
  todayLabel: string;
}

export function AiView(_props: AiViewProps): ReactNode {
  return null;
}
