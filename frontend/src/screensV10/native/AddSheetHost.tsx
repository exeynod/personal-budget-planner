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

/** Which surface the sheet writes to: a real fact (default) or a planned row. */
export type AddSheetMode = 'fact' | 'plan';

interface AddSheetHostAPI {
  /**
   * Open the shared add-transaction sheet.
   *  - `'fact'` (default): creates an actual_transaction (Home «+»).
   *  - `'plan'`: creates a planned row in the selected period (Plan «+»).
   *  - `categoryId` (optional): pre-select this category in the sheet's category
   *    picker (CategoryDetail «Добавить транзакцию»). Positional + backward-
   *    compatible: `openAddSheet()` and `openAddSheet('plan')` keep working.
   */
  openAddSheet: (mode?: AddSheetMode, categoryId?: number) => void;
}

const AddSheetHostCtx = createContext<AddSheetHostAPI>({
  openAddSheet: () => {},
});

export function AddSheetHostProvider({
  openAddSheet,
  children,
}: {
  openAddSheet: (mode?: AddSheetMode, categoryId?: number) => void;
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
