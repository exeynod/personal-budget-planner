// Liquid Glass v2 — shell-variant context.
//
// The data layer (api/*, useResource, the Mount components, computeHomeData…)
// is design-agnostic. With the Maximal Poster design retired from web, the only
// remaining variant is 'native' (the Liquid Glass iOS shell). The context is
// kept as a thin seam (NativeShell still wraps its tree with the provider) and
// defaults to 'native', so any consumer resolves to the native view.

import { createContext, type ReactNode } from 'react';

export type ShellVariant = 'native';

const ShellVariantCtx = createContext<ShellVariant>('native');

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
