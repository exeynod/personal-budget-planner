// Phase 30-07 (DEBT-08): Home screen color preference — client-only state.
//
// Persists user's choice for Home background color via `localStorage`.
// Default = coral (legacy/baseline). Whitelist: coral | cobalt | black | cream.
//
// Apply path: HomeMount reads value via this hook → passes as prop into
// HomeView → root `<div>` gets inline `style={{ '--color-home': … }}` which
// overrides the default CSS-var fallback in HomeView.module.css `.root
// background: var(--color-home, var(--poster-coral))`.
//
// Instant re-render: setter writes localStorage AND dispatches a
// `home-color-changed` CustomEvent on `window`. Any mounted hook instance
// (HomeMount, SettingsMount picker preview) subscribes to that event AND to
// the native `storage` event (cross-tab sync) so picker tap immediately
// re-renders the Home screen without page reload.
//
// User-request 2026-05-11 — продвинутый из v1.1 backlog DF-V11-04.

import { useCallback, useEffect, useState } from 'react';

export type HomeColor = 'coral' | 'cobalt' | 'black' | 'cream';
export const HOME_COLORS: readonly HomeColor[] = [
  'coral',
  'cobalt',
  'black',
  'cream',
] as const;

const STORAGE_KEY = 'ui.home-color';
const EVENT = 'home-color-changed';
const DEFAULT: HomeColor = 'coral';

function isHomeColor(v: unknown): v is HomeColor {
  return v === 'coral' || v === 'cobalt' || v === 'black' || v === 'cream';
}

function readStored(): HomeColor {
  try {
    const raw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    return isHomeColor(raw) ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Russian label rendered in picker swatches + Settings row preview. */
export function homeColorLabel(c: HomeColor): string {
  switch (c) {
    case 'coral':
      return 'КОРАЛ';
    case 'cobalt':
      return 'КОБАЛЬТ';
    case 'black':
      return 'ЧЁРНЫЙ';
    case 'cream':
      return 'КРЕМ';
  }
}

/** Map HomeColor → CSS-var reference. Used as background value. */
export function homeColorCssValue(c: HomeColor): string {
  switch (c) {
    case 'coral':
      return 'var(--poster-coral)';
    case 'cobalt':
      return 'var(--poster-cobalt)';
    case 'black':
      return 'var(--poster-black)';
    case 'cream':
      return 'var(--poster-cream)';
  }
}

/**
 * Reactive hook: returns `[value, setter]`.
 *
 * Initial value reads `localStorage`; invalid/missing → `'coral'`.
 * Setter writes localStorage + broadcasts CustomEvent so all mounted
 * hook instances re-render in the same frame.
 *
 * Subscribes to both `home-color-changed` (same-tab) and `storage`
 * (cross-tab) — picker tap in one tab updates Home in another.
 */
export function useHomeColor(): [HomeColor, (next: HomeColor) => void] {
  const [value, setValue] = useState<HomeColor>(readStored);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<HomeColor>).detail;
      if (isHomeColor(detail)) setValue(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isHomeColor(e.newValue)) {
        setValue(e.newValue);
      }
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setter = useCallback((next: HomeColor) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / private-mode errors — state still updates in-memory.
    }
    window.dispatchEvent(new CustomEvent<HomeColor>(EVENT, { detail: next }));
    setValue(next);
  }, []);

  return [value, setter];
}
