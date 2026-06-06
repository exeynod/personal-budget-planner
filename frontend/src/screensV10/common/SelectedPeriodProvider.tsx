// Phase P2 (period switching): SelectedPeriodProvider — single source of
// truth for the period the user is currently VIEWING across the v10 shell.
//
// The v10 shell previously pinned Home / Transactions / AddSheet to the
// active period (getCurrentPeriod). That made it impossible to view a
// closed past period or add a back-dated fact (owner CRITICAL bug). This
// provider lifts the «which period am I looking at» state up to V10MainShell
// so Home, Transactions and AddSheet all read + write the same selection.
//
// Contract:
//   - On mount call listPeriods() (the backend returns newest-first).
//   - Default selectedPeriodId to the active period (status === 'active');
//     fall back to the newest period when there is no active one.
//   - `reload()` re-fetches the list (e.g. after close_period creates a new
//     active period, or AddSheet auto-creates a closed past period server-side).
//
// Like PosterRouter, we expose two read hooks:
//   - useSelectedPeriod()         — throws outside the provider (call-site bug).
//   - useSelectedPeriodOptional() — returns null outside the provider so Mount
//                                   unit-tests that render a screen standalone
//                                   (no V10MainShell) don't crash; the Mount
//                                   then degrades to its getCurrentPeriod path.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { listPeriods } from '../../api/periods';
import type { PeriodRead } from '../../api/types';

export interface SelectedPeriodAPI {
  /** All periods, newest-first (as returned by the backend). */
  periods: PeriodRead[];
  /** The period the user is currently viewing (null until first load). */
  selectedPeriodId: number | null;
  /** Switch the viewed period (PeriodSwitcher prev/next, AddSheet auto-switch). */
  setSelectedPeriodId: (id: number) => void;
  /** True while the initial listPeriods() (or a reload) is in flight. */
  loading: boolean;
  /** Re-fetch the period list (preserves the current selection when possible). */
  reload: () => void;
}

const SelectedPeriodCtx = createContext<SelectedPeriodAPI | null>(null);

/**
 * Pick the default period: the active one if present, else the newest.
 * `periods` is newest-first, so `periods[0]` is the newest fallback.
 */
function pickDefaultPeriodId(periods: PeriodRead[]): number | null {
  if (periods.length === 0) return null;
  const active = periods.find((p) => p.status === 'active');
  return (active ?? periods[0]).id;
}

export interface SelectedPeriodProviderProps {
  children: ReactNode;
}

export function SelectedPeriodProvider({
  children,
}: SelectedPeriodProviderProps) {
  const [periods, setPeriods] = useState<PeriodRead[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  // Track whether the user has explicitly chosen a period yet. Until they
  // have, every (re)fetch re-applies the default. Once they pick a period,
  // a reload keeps their choice (if it still exists in the new list).
  const userPickedRef = useRef(false);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const handleSelect = useCallback((id: number) => {
    userPickedRef.current = true;
    setSelectedPeriodId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const list = await listPeriods();
        if (cancelled) return;
        setPeriods(list);
        setSelectedPeriodId((prev) => {
          // Keep the user's pick across reloads if it still exists.
          if (
            userPickedRef.current &&
            prev !== null &&
            list.some((p) => p.id === prev)
          ) {
            return prev;
          }
          return pickDefaultPeriodId(list);
        });
      } catch {
        // Best-effort: on failure leave periods empty / selection null —
        // consumers fall back to their getCurrentPeriod path. A retry happens
        // on the next reload() (e.g. AddSheet submit).
        if (!cancelled) setPeriods([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const api = useMemo<SelectedPeriodAPI>(
    () => ({
      periods,
      selectedPeriodId,
      setSelectedPeriodId: handleSelect,
      loading,
      reload,
    }),
    [periods, selectedPeriodId, handleSelect, loading, reload],
  );

  return (
    <SelectedPeriodCtx.Provider value={api}>
      {children}
    </SelectedPeriodCtx.Provider>
  );
}

/**
 * Read-side hook — throws if called outside a `<SelectedPeriodProvider>`
 * tree (surfaces a missing-provider bug at the call site).
 */
export function useSelectedPeriod(): SelectedPeriodAPI {
  const ctx = useContext(SelectedPeriodCtx);
  if (ctx === null) {
    throw new Error(
      'useSelectedPeriod must be used inside <SelectedPeriodProvider>',
    );
  }
  return ctx;
}

/**
 * Soft-fallback variant — returns `null` when there is no surrounding
 * `<SelectedPeriodProvider>` instead of throwing. Mirrors
 * usePosterRouterOptional so Mount unit-tests that render a screen standalone
 * (no V10MainShell) keep working — the Mount degrades to getCurrentPeriod.
 */
export function useSelectedPeriodOptional(): SelectedPeriodAPI | null {
  return useContext(SelectedPeriodCtx);
}
