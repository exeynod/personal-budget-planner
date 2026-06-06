// Liquid Glass v2 — nav-level context.
//
// In the native shell tab destinations are PUSHED onto the same PosterRouter as
// drill-in detail screens, so `router.canPop` cannot tell a tab root from a
// pushed detail. This context marks tab destinations as roots: the shell wraps
// each tab push in <NavLevelProvider isRoot>. Native views read `useNavLevel()`
// to choose a large-title header (root) vs a nav bar with a back chevron
// (pushed detail).
//
// Default isRoot=false → an unmarked push is treated as a detail screen (back
// chevron), which is the correct default for drill-ins (CategoryDetail, Plan…).

import { createContext, useContext, type ReactNode } from 'react';

const NavLevelCtx = createContext<{ isRoot: boolean }>({ isRoot: false });

export function NavLevelProvider({
  isRoot,
  children,
}: {
  isRoot: boolean;
  children: ReactNode;
}) {
  return (
    <NavLevelCtx.Provider value={{ isRoot }}>{children}</NavLevelCtx.Provider>
  );
}

export function useNavLevel(): { isRoot: boolean } {
  return useContext(NavLevelCtx);
}
