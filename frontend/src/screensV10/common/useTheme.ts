// Phase 50-02 (THEME-01, THEME-02, THEME-04): multi-theme runtime selector.
//
// Reactive React hook returning `[theme, setTheme]` over localStorage key
// `ui.theme`. Persists choice and applies `data-theme` attribute on
// `<html>` so per-theme CSS rules (Phase 50-01 codegen output in
// `stylesV10/tokens.css`) take effect across the entire SPA.
//
// Style mirrors `useHomeColor` (Phase 30-07 / DEBT-08): both hooks share
// the same persistence + cross-tab broadcast pattern (localStorage write +
// `CustomEvent` dispatch + `storage` event listener), so any number of
// mounted instances re-render in the same frame after the picker tap.
//
// Note (P1-6 / FE-F4, Phase 67-06): main.tsx historically also used `ui.theme`
// for v06/v10 SHELL dispatch, sharing one key with two incompatible
// vocabularies — picking a v10 theme made the v06 web shell unreachable. The
// shell dispatcher now reads its own key `ui.shell` (`v06`/`v10`), so this hook
// is the SOLE owner of `ui.theme` (theme values only). The two systems are
// orthogonal; no shared vocabulary remains.
//
// User-request 2026-05-11 — Phase 50 multi-theme milestone (v1.1.1).

import { useCallback, useEffect, useState } from 'react';

// Phase 4 (UX refactor, 2026-06): reduced to TWO themes — Maximal Poster
// (shipping default) and Liquid Glass (iOS look). The former `ios_default`
// option was removed; stale persisted `ios_default` values map to the default.
export type Theme = 'maximal_poster' | 'liquid_glass';
export const THEMES: readonly Theme[] = [
  'maximal_poster',
  'liquid_glass',
] as const;

const STORAGE_KEY = 'ui.theme';
const EVENT = 'theme-changed';
const DEFAULT: Theme = 'liquid_glass';

function isTheme(v: unknown): v is Theme {
  return v === 'maximal_poster' || v === 'liquid_glass';
}

function readStored(): Theme {
  try {
    const raw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    return isTheme(raw) ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Russian/Latin label rendered in picker swatches + Settings row preview. */
export function themeLabel(t: Theme): string {
  switch (t) {
    case 'maximal_poster':
      return 'MAXIMAL POSTER';
    case 'liquid_glass':
      return 'LIQUID GLASS';
  }
}

/** Long-form description rendered under the label in the theme picker. */
export function themeDescription(t: Theme): string {
  switch (t) {
    case 'maximal_poster':
      return 'Кораллово-кобальтовая палитра, Archivo Black + DM Serif Italic';
    case 'liquid_glass':
      return 'Нативный iOS-дизайн: SF Pro, сгруппированные списки, таб-бар';
  }
}

/**
 * Reactive hook: returns `[value, setter]`.
 *
 * Initial value reads `localStorage`; invalid/missing → `'maximal_poster'`.
 * Setter writes localStorage + broadcasts CustomEvent so all mounted
 * hook instances re-render in the same frame.
 *
 * Applies `data-theme` attribute on `<html>` on mount and on every change
 * so per-theme CSS variables (Phase 50-01) take effect.
 *
 * Subscribes to both `theme-changed` (same-tab) and `storage` (cross-tab)
 * — picker tap in one tab updates UI in another.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [value, setValue] = useState<Theme>(readStored);

  useEffect(() => {
    // Apply theme to <html data-theme="..."> on mount + each change.
    document.documentElement.setAttribute('data-theme', value);
  }, [value]);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (isTheme(detail)) setValue(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isTheme(e.newValue)) {
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

  const setter = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / private-mode errors — state still updates in-memory.
    }
    window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: next }));
    setValue(next);
  }, []);

  return [value, setter];
}
