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
import type { ActualV10Read } from '../../api/v10';

/** Which surface the sheet writes to: a real fact (default) or a planned row. */
export type AddSheetMode = 'fact' | 'plan';

/**
 * REQ 4a — income/expense context for the add flow. Optional: when omitted the
 * controller derives the kind from the pre-selected category (if any) and
 * defaults to `'expense'`.
 */
export type AddSheetKind = 'income' | 'expense';

interface AddSheetHostAPI {
  /**
   * Open the shared add-transaction sheet.
   *  - `'fact'` (default): creates an actual_transaction (Home «+»).
   *  - `'plan'`: creates a planned row in the selected period (Plan «+»).
   *  - `categoryId` (optional): pre-select this category in the sheet's category
   *    picker (CategoryDetail «Добавить транзакцию»). Positional + backward-
   *    compatible: `openAddSheet()` and `openAddSheet('plan')` keep working.
   *  - `kind` (optional, REQ 4a): force the income/expense context. When set, the
   *    sheet seeds that kind AND filters the visible category list to it. Still
   *    positional + backward-compatible: 2-arg callers are unaffected.
   */
  openAddSheet: (
    mode?: AddSheetMode,
    categoryId?: number,
    kind?: AddSheetKind,
  ) => void;
  /**
   * REQ 7 — open the shared sheet in EDIT mode pre-filled with an existing
   * actual transaction. On submit the sheet PATCHes (instead of POSTing) and
   * offers a «Удалить» action. Same host pattern as `openAddSheet`.
   */
  openEditSheet: (actual: ActualV10Read) => void;
}

const AddSheetHostCtx = createContext<AddSheetHostAPI>({
  openAddSheet: () => {},
  openEditSheet: () => {},
});

export function AddSheetHostProvider({
  openAddSheet,
  openEditSheet,
  children,
}: {
  openAddSheet: (
    mode?: AddSheetMode,
    categoryId?: number,
    kind?: AddSheetKind,
  ) => void;
  openEditSheet: (actual: ActualV10Read) => void;
  children: ReactNode;
}) {
  return (
    <AddSheetHostCtx.Provider value={{ openAddSheet, openEditSheet }}>
      {children}
    </AddSheetHostCtx.Provider>
  );
}

export function useAddSheetHost(): AddSheetHostAPI {
  return useContext(AddSheetHostCtx);
}
