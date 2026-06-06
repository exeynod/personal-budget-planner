// Phase 3 (web UX): unit tests for the Telegram viewport + safe-area binder.
//
// Verifies setupSafeArea()/expandWebApp():
//   - write --tg-viewport-stable from viewportStableHeight,
//   - write --tg-safe-* from safeAreaInset + contentSafeAreaInset,
//   - subscribe to viewportChanged / safeAreaChanged / contentSafeAreaChanged
//     and re-apply on event,
//   - call expand() exactly once,
//   - be a NO-OP (no throw, no CSS-var writes) when window.Telegram is undefined.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupSafeArea, expandWebApp } from './safeArea';

type EventCb = () => void;

interface MockWebApp {
  safeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  viewportStableHeight?: number;
  expand: ReturnType<typeof vi.fn>;
  onEvent: ReturnType<typeof vi.fn>;
  __handlers: Record<string, EventCb[]>;
  __emit: (event: string) => void;
}

function makeWebApp(over: Partial<MockWebApp> = {}): MockWebApp {
  const handlers: Record<string, EventCb[]> = {};
  return {
    safeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
    contentSafeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
    viewportStableHeight: 600,
    expand: vi.fn(),
    onEvent: vi.fn((event: string, cb: EventCb) => {
      (handlers[event] ??= []).push(cb);
    }),
    __handlers: handlers,
    __emit(event: string) {
      (handlers[event] ?? []).forEach((cb) => cb());
    },
    ...over,
  };
}

function clearVars() {
  const s = document.documentElement.style;
  for (const v of [
    '--tg-viewport-stable',
    '--tg-safe-top',
    '--tg-safe-right',
    '--tg-safe-bottom',
    '--tg-safe-left',
  ]) {
    s.removeProperty(v);
  }
}

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  clearVars();
  vi.restoreAllMocks();
});

describe('setupSafeArea', () => {
  it('writes --tg-viewport-stable from viewportStableHeight', () => {
    const webApp = makeWebApp({ viewportStableHeight: 540 });
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    setupSafeArea();

    expect(
      document.documentElement.style.getPropertyValue('--tg-viewport-stable'),
    ).toBe('540px');
  });

  it('writes --tg-safe-* as the sum of safeAreaInset + contentSafeAreaInset', () => {
    const webApp = makeWebApp({
      safeAreaInset: { top: 44, right: 0, bottom: 34, left: 0 },
      contentSafeAreaInset: { top: 56, right: 0, bottom: 0, left: 0 },
    });
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    setupSafeArea();

    const s = document.documentElement.style;
    expect(s.getPropertyValue('--tg-safe-top')).toBe('100px'); // 44 + 56
    expect(s.getPropertyValue('--tg-safe-bottom')).toBe('34px');
    expect(s.getPropertyValue('--tg-safe-right')).toBe('0px');
    expect(s.getPropertyValue('--tg-safe-left')).toBe('0px');
  });

  it('re-applies on viewportChanged (keyboard open shrinks stable height)', () => {
    const webApp = makeWebApp({ viewportStableHeight: 600 });
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    setupSafeArea();
    expect(
      document.documentElement.style.getPropertyValue('--tg-viewport-stable'),
    ).toBe('600px');

    // Simulate keyboard opening — stable height shrinks, event fires.
    webApp.viewportStableHeight = 360;
    webApp.__emit('viewportChanged');

    expect(
      document.documentElement.style.getPropertyValue('--tg-viewport-stable'),
    ).toBe('360px');
  });

  it('re-applies insets on safeAreaChanged / contentSafeAreaChanged', () => {
    const webApp = makeWebApp();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    setupSafeArea();
    expect(
      document.documentElement.style.getPropertyValue('--tg-safe-top'),
    ).toBe('0px');

    webApp.safeAreaInset = { top: 44 };
    webApp.contentSafeAreaInset = { top: 10 };
    webApp.__emit('safeAreaChanged');

    expect(
      document.documentElement.style.getPropertyValue('--tg-safe-top'),
    ).toBe('54px');
  });

  it('subscribes to all three events', () => {
    const webApp = makeWebApp();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    setupSafeArea();

    const events = webApp.onEvent.mock.calls.map((c) => c[0]);
    expect(events).toContain('safeAreaChanged');
    expect(events).toContain('contentSafeAreaChanged');
    expect(events).toContain('viewportChanged');
  });

  it('does NOT write --tg-viewport-stable when viewportStableHeight is absent', () => {
    const webApp = makeWebApp({ viewportStableHeight: undefined });
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    setupSafeArea();

    // Untouched → empty string (CSS default 100dvh from responsive.css applies).
    expect(
      document.documentElement.style.getPropertyValue('--tg-viewport-stable'),
    ).toBe('');
  });

  it('is a NO-OP (no throw, no CSS-var writes) when window.Telegram is undefined', () => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;

    expect(() => setupSafeArea()).not.toThrow();
    expect(
      document.documentElement.style.getPropertyValue('--tg-viewport-stable'),
    ).toBe('');
    expect(
      document.documentElement.style.getPropertyValue('--tg-safe-top'),
    ).toBe('');
  });
});

describe('expandWebApp', () => {
  it('calls expand() exactly once when inside Telegram', () => {
    const webApp = makeWebApp();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    expandWebApp();

    expect(webApp.expand).toHaveBeenCalledTimes(1);
  });

  it('is a NO-OP (no throw) when window.Telegram is undefined', () => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    expect(() => expandWebApp()).not.toThrow();
  });

  it('swallows a throwing expand()', () => {
    const webApp = makeWebApp({
      expand: vi.fn(() => {
        throw new Error('old client');
      }),
    });
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };

    expect(() => expandWebApp()).not.toThrow();
    expect(webApp.expand).toHaveBeenCalledTimes(1);
  });
});
