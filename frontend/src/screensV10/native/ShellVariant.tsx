// Liquid Glass v2 — shell-variant context.
//
// The data layer (api/*, useResource, the Mount components, computeHomeData…)
// is design-agnostic and shared between both shells. Each Mount renders its
// presentational View based on the active shell variant:
//
//   variant === 'native'  → Liquid Glass native iOS view
//   variant === 'poster'  → Maximal Poster view (default — unchanged)
//
// Default is 'poster' so:
//   - existing Mounts rendered inside V10MainShell keep rendering poster views;
//   - standalone unit tests (Mount rendered without a provider) stay poster →
//     Maximal Poster pixel baselines never regress.
//
// The native shell provides value='native' once at its root.

import { createContext, useContext, type ReactNode } from 'react';

export type ShellVariant = 'poster' | 'native';

const ShellVariantCtx = createContext<ShellVariant>('poster');

export function ShellVariantProvider({
  value,
  children,
}: {
  value: ShellVariant;
  children: ReactNode;
}) {
  return (
    <ShellVariantCtx.Provider value={value}>
      {children}
    </ShellVariantCtx.Provider>
  );
}

/** Returns the active shell variant. Defaults to 'poster' outside a provider. */
export function useShellVariant(): ShellVariant {
  return useContext(ShellVariantCtx);
}
