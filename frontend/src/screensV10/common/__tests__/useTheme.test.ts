// Phase 50-02 (THEME-01) smoke tests for `useTheme`.
//
// Covers: default resolution, persistence, <html data-theme> application,
// reading existing storage, validation guard, and THEMES const integrity.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme, THEMES } from '../useTheme';

// jsdom's default Storage stub in this project lacks `clear`, so we install
// the same Map-backed stub used by useOnboardingDraft tests (Phase 24-01)
// before each spec for full isolation.
function makeStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  } as Storage;
}

describe('useTheme', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageStub());
    document.documentElement.removeAttribute('data-theme');
  });

  it('returns default liquid_glass when localStorage empty', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('liquid_glass');
  });

  it('persists choice to localStorage on setTheme', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]('liquid_glass'));
    expect(localStorage.getItem('ui.theme')).toBe('liquid_glass');
  });

  it('applies data-theme attribute on <html>', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]('liquid_glass'));
    expect(document.documentElement.getAttribute('data-theme')).toBe(
      'liquid_glass',
    );
  });

  it('maps stale ios_default value to default liquid_glass', () => {
    localStorage.setItem('ui.theme', 'ios_default');
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('liquid_glass');
  });

  it('reads existing localStorage value on mount', () => {
    localStorage.setItem('ui.theme', 'liquid_glass');
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('liquid_glass');
  });

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('ui.theme', 'invalid_garbage');
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe('liquid_glass');
  });

  it('THEMES const has the 2 supported values', () => {
    expect(THEMES).toHaveLength(2);
    expect(THEMES).toContain('maximal_poster');
    expect(THEMES).toContain('liquid_glass');
    expect(THEMES).not.toContain('ios_default');
  });
});
