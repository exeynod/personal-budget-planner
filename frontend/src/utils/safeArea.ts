/**
 * Telegram Mini App safe-area sync.
 *
 * В fullscreen-режиме (Bot API 8+) TG WebView расширяется до верха экрана и
 * под системный status-bar, и под TG-chrome (Close-кнопка + ⋯). Без явных
 * insets шапка приложения уезжает под эти элементы и становится не
 * кликабельной (см. UI-аудит #25).
 *
 * Подход:
 *   1. CSS-vars `--tg-safe-top/right/bottom/left` — дефолт 0.
 *   2. JS читает `safeAreaInset` (system status-bar / home-indicator) и
 *      `contentSafeAreaInset` (TG-chrome когда fullscreen) и сетит сумму
 *      в CSS-vars. Подписывается на оба события — обновляется на лету
 *      при смене ориентации и переходе в/из fullscreen.
 *   3. CSS .appRoot применяет `padding: max(env(safe-area-inset-X), var(--tg-safe-X)) ...`,
 *      что отрабатывает и в Telegram, и в обычном browser/PWA.
 */

interface TelegramWebAppSafeArea {
  safeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
  contentSafeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
}

export function setupSafeArea(): void {
  if (typeof window === 'undefined') return;
  const tg = (window.Telegram?.WebApp ?? null) as TelegramWebAppSafeArea | null;
  if (!tg) return;

  const root = document.documentElement;

  const apply = () => {
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

  apply();

  // Старые TG-клиенты не отправят эти события — это OK, тогда всё
  // покрывается env() в CSS как fallback.
  tg.onEvent?.('safeAreaChanged', apply);
  tg.onEvent?.('contentSafeAreaChanged', apply);
}
