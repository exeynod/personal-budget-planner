// Phase 25-02: BottomNavV10 — V10 shell wrapper around the existing
// componentsV10/TabBar primitive.
//
// Two responsibilities beyond TabBar:
//  1. `isHidden` flag → returns null when AddSheet (or other full-bleed
//     poster sheet) is open, so the FAB inside the sheet doesn't double up.
//  2. Stable contract for V10MainShell / AppV10 to import a single component
//     instead of TabBar + ad-hoc visibility logic.
//
// Tabs delivered by TabBar: home / FAB-center / ai / mgmt
// (TXN-V10-06: v0.6 Transactions tab demoted from bottom nav — Transactions
// is reachable only via push-stack from Home «ВСЕ ОПЕРАЦИИ →»).

import { TabBar, type TabId } from '../../componentsV10';

export interface BottomNavV10Props {
  active: TabId;
  onTab: (id: TabId) => void;
  onFab: () => void;
  /** When true, nav is unmounted (no DOM). Used while AddSheet is open. */
  isHidden?: boolean;
  /** Pass-through to TabBar dark mode (used on cobalt/black backgrounds). */
  dark?: boolean;
}

export function BottomNavV10({
  active,
  onTab,
  onFab,
  isHidden = false,
  dark = false,
}: BottomNavV10Props) {
  if (isHidden) return null;
  return <TabBar active={active} onTab={onTab} onFab={onFab} dark={dark} />;
}
