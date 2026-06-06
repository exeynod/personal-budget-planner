// Liquid Glass v2 — AddSheet host context.
//
// In the native shell the «+» affordance lives in the Home header (top-right
// circle button), mirroring the iOS MainShell. It calls `openAddSheet()` from
// this context; the NativeShell owns the actual sheet presentation + the
// post-submit refetch bump.
//
// Default is a no-op so views that read it outside the native shell (unit
// tests, poster shell) don't crash.

import { createContext, useContext, type ReactNode } from 'react';

interface AddSheetHostAPI {
  openAddSheet: () => void;
}

const AddSheetHostCtx = createContext<AddSheetHostAPI>({
  openAddSheet: () => {},
});

export function AddSheetHostProvider({
  openAddSheet,
  children,
}: {
  openAddSheet: () => void;
  children: ReactNode;
}) {
  return (
    <AddSheetHostCtx.Provider value={{ openAddSheet }}>
      {children}
    </AddSheetHostCtx.Provider>
  );
}

export function useAddSheetHost(): AddSheetHostAPI {
  return useContext(AddSheetHostCtx);
}
