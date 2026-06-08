// ADR-0008 — bridge so a pushed screen (Management hub «Спланировать» row) can
// open the monthly planning gate in MANUAL mode without prop-drilling through
// the PosterRouter stack. NativeShell owns the manual-launch state and provides
// `launch()`; MgmtHubMount consumes it.

import { createContext, useContext, type ReactNode } from 'react';

export interface PlanningLaunch {
  /** Open the planning gate in manual (closeable) mode. */
  launch: () => void;
}

const PlanningLaunchContext = createContext<PlanningLaunch | null>(null);

export function PlanningLaunchProvider({
  value,
  children,
}: {
  value: PlanningLaunch;
  children: ReactNode;
}) {
  return (
    <PlanningLaunchContext.Provider value={value}>
      {children}
    </PlanningLaunchContext.Provider>
  );
}

/**
 * Returns the planning-launch API, or `null` when no provider is mounted
 * (standalone unit tests / previews) so consumers can hide the entry gracefully.
 */
export function usePlanningLaunchOptional(): PlanningLaunch | null {
  return useContext(PlanningLaunchContext);
}
