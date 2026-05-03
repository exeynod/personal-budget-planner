import {
  retrieveLaunchParams,
  retrieveRawLaunchParams,
  openTelegramLink as sdkOpenTelegramLink,
} from '@telegram-apps/sdk-react';

const API_BASE = '/api/v1';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: unknown;
        MainButton?: {
          setText: (t: string) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        openTelegramLink?: (url: string) => void;
        ready?: () => void;
      };
    };
  }
}

/**
 * Read raw initData from Telegram WebApp environment.
 *
 * Tries `@telegram-apps/sdk-react` retrieveLaunchParams first; falls back to
 * `window.Telegram.WebApp.initData` if SDK throws (e.g. running outside Telegram).
 * In dev (browser, no Telegram), returns null — backend with DEV_MODE=true
 * will inject mock owner per Phase 1 D-05.
 */
export function getInitDataRaw(): string | null {
  // Strategy 1: SDK retrieveRawLaunchParams (returns the raw query string we'd parse out tgWebAppData from).
  try {
    const params = retrieveLaunchParams() as Record<string, unknown>;
    // tgWebAppData is a string in raw form according to @telegram-apps/sdk types.
    const candidate = (params.tgWebAppData ?? params.initDataRaw ?? params.initData) as
      | string
      | undefined;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    // Some SDK versions expose tgWebAppData as parsed object — fall back to raw query string.
    const raw = retrieveRawLaunchParams();
    if (typeof raw === 'string' && raw.length > 0) {
      // raw is the full launch params query (e.g. "tgWebAppData=...&tgWebAppVersion=...").
      const usp = new URLSearchParams(raw);
      const data = usp.get('tgWebAppData');
      if (data) return data;
    }
  } catch {
    // SDK throws if not running inside Telegram — fall through.
  }

  // Strategy 2: window.Telegram.WebApp.initData (raw query string).
  const wa = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  if (wa?.initData) return wa.initData;

  return null;
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  const initDataRaw = getInitDataRaw();
  if (initDataRaw) {
    headers.set('X-Telegram-Init-Data', initDataRaw);
  } else if (import.meta.env.DEV) {
    // Backend with DEV_MODE=true ignores header content (Phase 1 D-05).
    headers.set('X-Telegram-Init-Data', 'dev-mode-stub');
  }

  const response = await fetch(API_BASE + path, { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(`API ${path} → ${response.status}`, response.status, text);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * Small Telegram bridge — kept here to centralise SDK version tolerance.
 *
 * Tries SDK `openTelegramLink` first; falls back to `window.Telegram.WebApp.openTelegramLink`;
 * final fallback is `window.open` for browser dev.
 */
export function openTelegramLink(url: string): void {
  try {
    sdkOpenTelegramLink(url);
    return;
  } catch {
    // SDK function throws if scope isn't supported in current environment.
  }
  const wa = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(url);
    return;
  }
  // Final fallback (browser dev): open in new tab.
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}
