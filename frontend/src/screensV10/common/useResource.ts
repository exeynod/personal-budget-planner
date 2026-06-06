// Phase 31 (code-quality): useResource<T> — the async-fetch state machine that
// the v10 Mount components used to hand-roll. Each Mount declared the same
// `{ status: 'loading' | 'error' | 'ready' }` union, a `cancelled` flag inside
// a useEffect, a `reloadToken` counter for retry/refetch, and the boilerplate
// to ignore late results after unmount or a newer fetch. This hook centralises
// that pattern so the Mounts stay thin and behaviour stays identical.
//
// Contract:
//   - `fetcher` is called on mount and whenever `deps` change or `reload()`
//     fires. It receives an `isCancelled()` predicate so a fetcher that runs
//     several sequential awaits can bail early (mirrors the old `if (cancelled)
//     return;` checks); callers may ignore it for single-await fetchers — the
//     hook itself also drops stale results.
//   - Returns `{ status, data, error, reload, setData, refreshing }`.
//   - `status` is the same union the Mounts rendered against.
//   - `setData` is an escape hatch for optimistic mutations that patch the
//     already-loaded payload without a refetch (e.g. CategoryDetail toggles).
//   - `keepPreviousData` (option): on a NON-initial fetch (deps change or
//     reload) keep returning the previous `data` and `status: 'ready'` instead
//     of flashing the full-screen loading plate; `refreshing` flips to true for
//     the duration so the caller can show a subtle inline hint. The initial
//     mount still reports `status: 'loading'`.

import { useCallback, useEffect, useRef, useState } from 'react';

export type ResourceStatus = 'loading' | 'error' | 'ready';

export interface UseResourceOptions {
  /**
   * When true, a re-fetch triggered by a deps change or `reload()` keeps the
   * previously-loaded data on screen (status stays 'ready', `refreshing` goes
   * true) instead of dropping back to the 'loading' plate. The very first
   * fetch still reports 'loading'. Default: false.
   */
  keepPreviousData?: boolean;
}

export interface UseResourceResult<T> {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
  /** Force a re-fetch (retry button, post-mutation refresh). */
  reload: () => void;
  /** Patch the loaded payload in place (optimistic mutation escape hatch). */
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
  /** True while a keepPreviousData re-fetch is in flight (initial load = false). */
  refreshing: boolean;
}

interface InternalState<T> {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
  refreshing: boolean;
}

/**
 * Async resource loader with cancelled-result handling, retry, optimistic
 * patching and optional keep-previous-data behaviour.
 *
 * @param fetcher  async producer of the resource; receives `isCancelled()` so
 *                 multi-await fetchers can bail like the old `cancelled` flag.
 * @param deps     dependency list — a change re-runs the fetcher (like the
 *                 Mount's useEffect deps: selectedPeriodId, refetchToken, …).
 * @param options  see {@link UseResourceOptions}.
 */
export function useResource<T>(
  fetcher: (isCancelled: () => boolean) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: UseResourceOptions = {},
): UseResourceResult<T> {
  const { keepPreviousData = false } = options;

  const [state, setState] = useState<InternalState<T>>({
    status: 'loading',
    data: null,
    error: null,
    refreshing: false,
  });
  const [reloadToken, setReloadToken] = useState(0);

  // Latest fetcher without making it a fetch trigger: only `deps` + reloadToken
  // re-run the effect, identical to the hand-rolled Mounts where the inline
  // `load()` closure was redefined every render but only the deps array mattered.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Whether we have completed at least one fetch — gates keepPreviousData so the
  // very first load always shows 'loading'.
  const hasLoadedRef = useRef(false);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setState((s) => {
      const nextData =
        typeof updater === 'function'
          ? (updater as (prev: T | null) => T | null)(s.data)
          : updater;
      return { ...s, data: nextData, status: 'ready', error: null };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    // keepPreviousData re-fetch (we've loaded before): keep data + 'ready',
    // flip `refreshing`. Otherwise drop to the full 'loading' plate.
    if (keepPreviousData && hasLoadedRef.current) {
      setState((s) => ({ ...s, refreshing: true }));
    } else {
      setState((s) => ({
        status: 'loading',
        data: s.data,
        error: null,
        refreshing: false,
      }));
    }

    fetcherRef
      .current(isCancelled)
      .then((data) => {
        if (cancelled) return;
        hasLoadedRef.current = true;
        setState({
          status: 'ready',
          data,
          error: null,
          refreshing: false,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Не удалось загрузить данные';
        setState({
          status: 'error',
          // On error we drop the stale data so the error plate renders, matching
          // the old `setState({ status: 'error', message })` which replaced the
          // whole state.
          data: null,
          error: message,
          refreshing: false,
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, keepPreviousData, ...deps]);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    reload,
    setData,
    refreshing: state.refreshing,
  };
}
