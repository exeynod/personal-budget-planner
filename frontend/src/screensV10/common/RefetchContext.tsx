// Phase 30-02 (DEBT-02): RefetchToken context — bridges AddSheet submit
// success into HomeMount / TransactionsMount fetch effects without
// prop-drilling through PosterRouter pushes.
//
// V10MainShell owns `refetchToken` state (monotonic counter). It bumps
// the counter inside the AddSheet `onSubmitted` callback. Both HomeMount
// and TransactionsMount read the token via `useRefetchToken()` and include
// it in their `useEffect` deps array so the fetch re-runs after each submit.
//
// The default value (0) is what consumers get when the provider is absent
// (e.g. unit tests that render a Mount component standalone). In that case
// the token never changes and the mount behaves as it did pre-Phase 30-02.

import { createContext, useContext, type ReactNode } from 'react';

const RefetchTokenContext = createContext<number>(0);

export interface RefetchTokenProviderProps {
  /** Monotonic counter owned by V10MainShell. */
  value: number;
  children: ReactNode;
}

export function RefetchTokenProvider({
  value,
  children,
}: RefetchTokenProviderProps) {
  return (
    <RefetchTokenContext.Provider value={value}>
      {children}
    </RefetchTokenContext.Provider>
  );
}

/**
 * Returns the current `refetchToken` from V10MainShell. Falls back to `0`
 * when no provider is mounted (unit tests, standalone previews). The
 * consumer's `useEffect` deps array re-runs when the value changes —
 * AddSheet submit bumps it.
 */
export function useRefetchToken(): number {
  return useContext(RefetchTokenContext);
}
