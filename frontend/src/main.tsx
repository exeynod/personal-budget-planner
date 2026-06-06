import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@telegram-apps/sdk-react';
import { setupSafeArea, expandWebApp } from './utils/safeArea';

// Initialise Telegram SDK (best-effort — tolerate missing/altered API surface
// or running outside Telegram during browser dev).
try {
  init();
} catch {
  // SDK init throws if not running inside Telegram (e.g. plain browser dev).
  // Frontend gracefully falls back to window.Telegram.WebApp via api/client.ts
  // (or, in DEV_MODE, the backend ignores the header content entirely).
}

// Tell Telegram WebApp we're ready (if running inside Telegram).
if (typeof window !== 'undefined' && window.Telegram?.WebApp?.ready) {
  window.Telegram.WebApp.ready();
}

// Phase 3 (web UX): best-effort expand to the full TG viewport. No-op outside
// Telegram. Combined with setupSafeArea() below this binds the stable viewport
// height into --tg-viewport-stable so the AI composer stays above the keyboard.
expandWebApp();

// Sync TG safe-area insets into CSS vars (--tg-safe-top/etc).
// .appRoot применяет max(env, var(--tg-safe-*)) — корректно в обычном browser
// (где env работает) и в TG fullscreen (где env=0, но TG отдаёт инсеты).
setupSafeArea();

// ─── Single shell: V10 poster shell ───
// The legacy v0.6 web shell has been retired (the entire src/screens, src/App,
// v06-only src/components/src/hooks/src/styles trees were deleted). The app now
// always boots the V10 poster shell. The old `ui.shell` dispatcher key (v06/v10)
// is gone; the VISUAL theme key `ui.theme` (vocabulary
// `maximal_poster`/`liquid_glass`, owned by `screensV10/common/useTheme.ts`)
// stays intact and is hydrated below.

// Phase 50-02 (THEME-02): early-bootstrap hydration of <html data-theme="…">
// so per-theme CSS variables (Phase 50-01) apply BEFORE first paint, preventing
// a flash of the default theme. Must run before createRoot(...).render().
//
// This reads the THEME key `ui.theme` (vocabulary `maximal_poster`/
// `liquid_glass`) — distinct from the SHELL key `ui.shell` read
// by readTheme() above (P1-6). Whitelist mirrors `useTheme` hook in
// screensV10/common/useTheme.ts. After the P1-6 key split, `ui.theme` only ever
// holds theme values, so shell choice never leaks in here.
(() => {
  try {
    const raw = localStorage.getItem('ui.theme');
    // Phase 4: two themes only. Stale `ios_default` / unknown → default.
    const initial =
      raw === 'maximal_poster' || raw === 'liquid_glass'
        ? raw
        : 'maximal_poster';
    document.documentElement.setAttribute('data-theme', initial);
  } catch {
    document.documentElement.setAttribute('data-theme', 'maximal_poster');
  }
})();

const root = createRoot(document.getElementById('root')!);

// Lazy-import the V10 shell so the visual-theme CSS vars (hydrated above) apply
// before first paint. There is no longer a fallback shell — if the V10 bundle
// fails to load we surface a minimal error rather than booting a dead shell.
import('./AppV10')
  .then(({ default: AppV10 }) => {
    root.render(
      <StrictMode>
        <AppV10 />
      </StrictMode>,
    );
  })
  .catch((e) => {
    console.error('[main] AppV10 import failed:', e);
    root.render(
      <StrictMode>
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          Не удалось загрузить приложение. Обновите страницу.
        </div>
      </StrictMode>,
    );
  });
