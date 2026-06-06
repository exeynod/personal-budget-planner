/**
 * Telegram Mini App viewport + safe-area sync.
 *
 * В fullscreen-режиме (Bot API 8+) TG WebView расширяется до верха экрана и
 * под системный status-bar, и под TG-chrome (Close-кнопка + ⋯). Без явных
 * insets шапка приложения уезжает под эти элементы и становится не
 * кликабельной (см. UI-аудит #25).
 *
 * Phase 3 (web UX) добавил viewport-байндинг: в TG layout viewport (100vh)
 * НЕ сжимается при открытии клавиатуры — сжимается только
 * `viewportStableHeight`. Без него композер AI-чата прячется за клавиатурой
 * («строка ввода убегает»). Поэтому мы синкаем высоту в CSS-var
 * `--tg-viewport-stable`, на которую завязан height shell-root.
 *
 * Подход:
 *   1. CSS-vars `--tg-safe-top/right/bottom/left` (дефолт 0) и
 *      `--tg-viewport-stable` (дефолт 100dvh) — заданы в stylesV10/responsive.css.
 *   2. JS читает `safeAreaInset` (system status-bar / home-indicator),
 *      `contentSafeAreaInset` (TG-chrome когда fullscreen) и
 *      `viewportStableHeight`, и сетит значения в CSS-vars. Подписывается на
 *      `safeAreaChanged` / `contentSafeAreaChanged` / `viewportChanged` —
 *      обновляется на лету при смене ориентации, fullscreen и клавиатуре.
 *   3. CSS применяет `max(env(safe-area-inset-X), var(--tg-safe-X))`, что
 *      отрабатывает и в Telegram, и в обычном browser/PWA.
 *
 * NO-OP вне Telegram (browser / jsdom / тесты): `window.Telegram` undefined →
 * функции тихо выходят, CSS-vars остаются на дефолтах (env + 100dvh).
 */

interface TelegramWebApp {
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
  viewportHeight?: number;
  expand?: () => void;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
}

function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window.Telegram?.WebApp ?? null) as TelegramWebApp | null;
}

/**
 * Best-effort `expand()` — растягивает TG WebView на всю доступную высоту.
 * Безопасен вне Telegram (no-op) и при отсутствии метода в старом клиенте.
 */
export function expandWebApp(): void {
  const tg = getWebApp();
  try {
    tg?.expand?.();
  } catch {
    /* старый клиент / урезанный API surface — игнорируем */
  }
}

export function setupSafeArea(): void {
  const tg = getWebApp();
  if (!tg) return;

  const root = document.documentElement;

  const applyInsets = () => {
    const sa = tg.safeAreaInset ?? {};
    const csa = tg.contentSafeAreaInset ?? {};
    const top = (sa.top ?? 0) + (csa.top ?? 0);
    const right = (sa.right ?? 0) + (csa.right ?? 0);
    const bottom = (sa.bottom ?? 0) + (csa.bottom ?? 0);
    const left = (sa.left ?? 0) + (csa.left ?? 0);
    root.style.setProperty('--tg-safe-top', `${top}px`);
    root.style.setProperty('--tg-safe-right', `${right}px`);
    root.style.setProperty('--tg-safe-bottom', `${bottom}px`);
    root.style.setProperty('--tg-safe-left', `${left}px`);
  };

  const applyViewport = () => {
    // `viewportStableHeight` — высота, не считая клавиатуру. Когда TG её не
    // отдаёт (старый клиент), не трогаем var → остаётся дефолт 100dvh.
    const stable = tg.viewportStableHeight;
    if (typeof stable === 'number' && stable > 0) {
      root.style.setProperty('--tg-viewport-stable', `${stable}px`);
    }
  };

  applyInsets();
  applyViewport();

  // Старые TG-клиенты не отправят эти события — это OK, тогда insets
  // покрываются env() в CSS, а высота — дефолтом 100dvh.
  tg.onEvent?.('safeAreaChanged', applyInsets);
  tg.onEvent?.('contentSafeAreaChanged', applyInsets);
  tg.onEvent?.('viewportChanged', applyViewport);
}
