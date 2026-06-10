// Phase 25-02: PosterRouter (web) — symmetric to iOS PosterRouter.
//
// Mirrors the iOS contract:
//   - stack: PosterStackEntry[] (heterogeneous ReactNode entries)
//   - direction: 'forward' | 'backward' (drives slide-in animation class)
//   - push(node) / pop() / popToRoot()
//   - canPop: boolean
//
// Implementation: useReducer-based state machine keyed by an auto-incremented
// entry id (used for the React `key={}` prop on the view wrapper so the
// `posterSlideIn{Fwd|Back}` keyframe replays on every push/pop).
//
// Threat T-25-02-02 (DoS via unbounded push): hard cap MAX_STACK=16 — pushes
// beyond cap silently shift the oldest entry out (queue-like behaviour).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import styles from './PosterRouter.module.css';

/** Hard cap on stack depth (T-25-02-02). 16 covers Home → Tx → CatDet → ... × 4. */
export const MAX_STACK = 16;

export type PosterDirection = 'forward' | 'backward';

export interface PosterStackEntry {
  /** Auto-incremented unique id; used as React `key` so animation replays. */
  id: number;
  node: ReactNode;
}

interface State {
  stack: PosterStackEntry[];
  direction: PosterDirection;
  nextId: number;
}

type Action =
  | { type: 'PUSH'; node: ReactNode }
  | { type: 'POP' }
  | { type: 'POP_TO_ROOT' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'PUSH': {
      const entry: PosterStackEntry = { id: state.nextId, node: action.node };
      let next = [...state.stack, entry];
      // Cap-enforcement: shift oldest entries until length ≤ MAX_STACK.
      if (next.length > MAX_STACK) {
        next = next.slice(next.length - MAX_STACK);
      }
      return { stack: next, direction: 'forward', nextId: state.nextId + 1 };
    }
    case 'POP': {
      if (state.stack.length <= 1) return state; // no-op at root
      return {
        stack: state.stack.slice(0, -1),
        direction: 'backward',
        nextId: state.nextId,
      };
    }
    case 'POP_TO_ROOT': {
      if (state.stack.length <= 1) return state; // no-op
      return {
        stack: state.stack.slice(0, 1),
        direction: 'backward',
        nextId: state.nextId,
      };
    }
    default: {
      // Exhaustive check — TypeScript should ensure all branches handled.
      return state;
    }
  }
}

export interface PosterRouterAPI {
  stack: PosterStackEntry[];
  direction: PosterDirection;
  push: (node: ReactNode) => void;
  pop: () => void;
  popToRoot: () => void;
  canPop: boolean;
}

const RouterCtx = createContext<PosterRouterAPI | null>(null);

/**
 * Telegram WebApp `BackButton` handle, or `null` outside Telegram (browser /
 * jsdom / tests) — every caller no-ops gracefully there (mirrors the optional
 * access in `api/client.ts` / `utils/safeArea.ts`).
 */
function tgBackButton(): {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
} | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp?.BackButton ?? null;
}

/**
 * Sync the Telegram `BackButton` to the router stack: visible whenever a pop is
 * possible, its tap pops one level. Re-registers the handler whenever `pop` or
 * `canPop` changes and tears the registration + visibility down on unmount, so
 * the hardware/native back chevron drives the SAME navigation as the in-view
 * chevrons. No-op outside Telegram.
 */
function useTelegramBackButton(canPop: boolean, pop: () => void): void {
  useEffect(() => {
    const bb = tgBackButton();
    if (!bb) return;
    const onClick = () => pop();
    bb.onClick(onClick);
    if (canPop) bb.show();
    else bb.hide();
    return () => {
      bb.offClick(onClick);
      bb.hide();
    };
  }, [canPop, pop]);
}

export interface PosterRouterProviderProps {
  /** Bottom-of-stack root node (HomeView in V10MainShell). */
  root: ReactNode;
  /**
   * Optional override for what is rendered. Defaults to <PosterRouterView />
   * (top-of-stack only). Pass children to interleave router-aware UI (e.g.
   * test consumers, debug overlays) alongside the router view.
   */
  children?: ReactNode;
}

export function PosterRouterProvider({
  root,
  children,
}: PosterRouterProviderProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    stack: [{ id: 0, node: root } satisfies PosterStackEntry],
    direction: 'forward' as const,
    nextId: 1,
  }));

  const api = useMemo<PosterRouterAPI>(
    () => ({
      stack: state.stack,
      direction: state.direction,
      push: (node) => dispatch({ type: 'PUSH', node }),
      pop: () => dispatch({ type: 'POP' }),
      popToRoot: () => dispatch({ type: 'POP_TO_ROOT' }),
      canPop: state.stack.length > 1,
    }),
    [state],
  );

  // Drive the Telegram BackButton from the stack (no-op outside Telegram).
  useTelegramBackButton(api.canPop, api.pop);

  return (
    <RouterCtx.Provider value={api}>
      {children ?? <PosterRouterView />}
    </RouterCtx.Provider>
  );
}

/**
 * Read-side hook — throws if called outside a `<PosterRouterProvider>` tree
 * (mirrors common React-context patterns; surfaces missing-provider bugs at
 * call site rather than crashing on `null.push(...)`).
 */
export function usePosterRouter(): PosterRouterAPI {
  const ctx = useContext(RouterCtx);
  if (ctx === null) {
    throw new Error(
      'usePosterRouter must be used inside <PosterRouterProvider>',
    );
  }
  return ctx;
}

/**
 * Soft-fallback variant — returns `null` when there is no surrounding
 * `<PosterRouterProvider>` instead of throwing. Use this in components
 * that may also be rendered standalone (Storybook previews, isolated
 * unit-tests, placeholder shells outside the v10 nav stack).
 *
 * WR-25-07 (review fix): added so `_placeholders.tsx` and similar
 * components can degrade gracefully (hide back-buttons / no-op pop)
 * without try/catch around `usePosterRouter`.
 */
export function usePosterRouterOptional(): PosterRouterAPI | null {
  return useContext(RouterCtx);
}

/**
 * Renders only the top-of-stack entry inside an animated wrapper.
 *
 * The wrapper's `key={top.id}` causes React to remount the wrapper on every
 * push/pop, replaying the `.poster-slide-in-{fwd|back}` keyframe each time.
 */
export function PosterRouterView() {
  const { stack, direction } = usePosterRouter();
  const top = stack[stack.length - 1];
  const animClass =
    direction === 'forward' ? 'poster-slide-in-fwd' : 'poster-slide-in-back';
  return (
    <div key={top.id} className={`${styles.viewWrap} ${animClass}`}>
      {top.node}
    </div>
  );
}
