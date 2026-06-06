// GET /api/v1/home — aggregated HOME bootstrap payload (backend F3).
//
// One authed round-trip returns everything the Home screen needs (user,
// accounts, categories, period, balance, actuals). Replacing the prior 6-ish
// parallel fetches on the in-shell Home path with this single call removes the
// dominant cold-start latency, and lets HomeMount SEED the client cache so the
// very next navigation (Transactions / Accounts / CategoryDetail) reuses the
// already-loaded accounts / categories / period / actuals with zero refetch.
//
// The shape mirrors `components['schemas']['HomeResponse']` in the generated
// contract, but we express each field through the handwritten consumer types
// the rest of the v10 surface already imports (CategoryV10 / ActualV10Read /
// AccountResponse / PeriodRead / BalanceResponse / MeV10Response). The
// adapters layer (generated/adapters.ts) confirms these are wire-identical.

import { apiFetch } from './client';
import type { AccountResponse, BalanceResponse, PeriodRead } from './types';
import type { CategoryV10, ActualV10Read } from './v10';
import type { MeV10Response } from './me';

export interface HomeBootstrap {
  user: MeV10Response;
  accounts: AccountResponse[];
  categories: CategoryV10[];
  period: PeriodRead | null;
  balance: BalanceResponse | null;
  actuals: ActualV10Read[];
}

/**
 * Runtime shape guard — the e2e catch-all mock returns `[]` for any
 * un-enumerated GET, so a bare `getHome()` could resolve to a non-object.
 * HomeMount uses this to decide whether to trust the bootstrap or fall back
 * to the granular calls. We only assert the array slots that the Home view
 * destructures; `period` / `balance` are legitimately nullable.
 */
export function isHomeBootstrap(v: unknown): v is HomeBootstrap {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.accounts) &&
    Array.isArray(o.categories) &&
    Array.isArray(o.actuals) &&
    typeof o.user === 'object' &&
    o.user !== null
  );
}

/**
 * GET /api/v1/home → {@link HomeBootstrap}.
 *
 * NOT cached itself (it's a one-shot bootstrap; the caller seeds the granular
 * caches from the payload). Throws like any apiFetch on non-2xx.
 */
export async function getHome(): Promise<HomeBootstrap> {
  return apiFetch<HomeBootstrap>('/home');
}
