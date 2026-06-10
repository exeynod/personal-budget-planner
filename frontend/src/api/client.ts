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
        BackButton?: {
          show: () => void;
          hide: () => void;
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
 * Read raw initData from the Telegram WebApp environment — native, dependency-free.
 *
 * Replaces the heavy `@telegram-apps/sdk-react` (which pulled valibot ≈179KB just
 * to read this string). Telegram launches a Mini App with initData in the URL
 * hash (`#tgWebAppData=...`); we parse it once and persist to sessionStorage so
 * later calls survive hash/navigation clearing (the SDK did the same internally).
 *
 * Resolution order:
 *   1. `window.Telegram.WebApp.initData` (present when telegram-web-app.js is loaded).
 *   2. URL hash `tgWebAppData` (the reliable source at launch, no script needed).
 *   3. sessionStorage cache (survives in-app navigation after the hash is gone).
 * In dev (plain browser, no Telegram), returns null — backend DEV_MODE injects the
 * mock owner per Phase 1 D-05.
 */
const _INITDATA_SS_KEY = 'tgWebAppData';
let _initDataCache: string | null = null;

export function getInitDataRaw(): string | null {
  if (_initDataCache) return _initDataCache;
  if (typeof window === 'undefined') return null;

  // 1. window.Telegram.WebApp.initData (raw query string), if injected.
  const wa = window.Telegram?.WebApp;
  if (wa?.initData) return (_initDataCache = wa.initData);

  // 2. URL hash: Telegram appends `#tgWebAppData=...&tgWebAppVersion=...` at launch.
  try {
    const hash = window.location.hash.replace(/^#/, '');
    const fromHash = new URLSearchParams(hash).get('tgWebAppData');
    if (fromHash) {
      try {
        window.sessionStorage.setItem(_INITDATA_SS_KEY, fromHash);
      } catch {
        /* sessionStorage may be unavailable (privacy mode) — non-fatal. */
      }
      return (_initDataCache = fromHash);
    }
  } catch {
    /* malformed hash — fall through. */
  }

  // 3. sessionStorage cache from an earlier call this session.
  try {
    const stored = window.sessionStorage.getItem(_INITDATA_SS_KEY);
    if (stored) return (_initDataCache = stored);
  } catch {
    /* ignore */
  }

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

/**
 * Phase 14 (MTONB-04 / D-14-01): apiFetch throws this when backend returns
 * 409 with body shape `{"detail": {"error": "onboarding_required"}}`.
 *
 * Caught by App.tsx's onboarding gate to force-render OnboardingScreen
 * even if the cached /me response hasn't yet flipped to onboarded_at===null.
 * Other 409 cases (e.g. AlreadyOnboardedError on /onboarding/complete)
 * remain plain ApiError so existing handlers keep working.
 */
export class OnboardingRequiredError extends ApiError {
  constructor(body: string) {
    super('onboarding_required', 409, body);
    this.name = 'OnboardingRequiredError';
  }
}

/**
 * Phase 35-03 (REQ-35-03): apiFetch throws this when backend returns 402 with
 * body shape `{"detail": {"error": "PRO_TIER_REQUIRED", "current_tier": "free",
 * "trial_ends_at": "..."}}` from AI endpoints.
 *
 * Caught by feature-level handlers (AI chat, tools) to open the PaywallSheet.
 * Other 402 shapes remain plain ApiError so existing handlers keep working.
 */
export class ProTierRequiredError extends ApiError {
  readonly currentTier: string;
  readonly trialEndsAt: string | null;
  constructor(body: string, currentTier: string, trialEndsAt: string | null) {
    super('PRO_TIER_REQUIRED', 402, body);
    this.name = 'ProTierRequiredError';
    this.currentTier = currentTier;
    this.trialEndsAt = trialEndsAt;
  }
}

/**
 * Auth failure: backend returned 401 (no/invalid Telegram initData) or 403
 * (valid identity but not authorized — e.g. not whitelisted). Carries `kind`
 * so the auth gate can render the static "access required" screen and never
 * mount the interactive app shell. Distinct from transient 5xx/network errors
 * which keep a Retry affordance.
 */
export class AuthError extends ApiError {
  readonly kind: 'unauthenticated' | 'forbidden';
  constructor(status: number, body: string) {
    super(status === 401 ? 'unauthenticated' : 'forbidden', status, body);
    this.name = 'AuthError';
    this.kind = status === 401 ? 'unauthenticated' : 'forbidden';
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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
    // Phase 14 (D-14-01): detect 409 onboarding_required sub-shape.
    if (response.status === 409) {
      let parsed: { detail?: { error?: string } } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed?.detail?.error === 'onboarding_required') {
        throw new OnboardingRequiredError(text);
      }
    }
    // Phase 35-03 (REQ-35-03): detect 402 PRO_TIER_REQUIRED sub-shape from AI endpoints.
    if (response.status === 402) {
      let parsed: {
        detail?: {
          error?: string;
          current_tier?: string;
          trial_ends_at?: string | null;
        };
      } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed?.detail?.error === 'PRO_TIER_REQUIRED') {
        throw new ProTierRequiredError(
          text,
          parsed.detail.current_tier ?? 'free',
          parsed.detail.trial_ends_at ?? null,
        );
      }
    }
    // Auth failures: 401 (no/invalid initData) or 403 (not authorized /
    // not whitelisted). Thrown as AuthError so the auth gate can hard-block
    // the UI. Subclass of ApiError → existing generic handlers still catch it.
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status, text);
    }
    throw new ApiError(
      `API ${path} → ${response.status}`,
      response.status,
      text,
    );
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
  // Native first: window.Telegram.WebApp.openTelegramLink (in-Telegram), else
  // open in a new tab (browser dev). No SDK dependency needed.
  const wa =
    typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(url);
    return;
  }
  // Final fallback (browser dev): open in new tab.
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}
