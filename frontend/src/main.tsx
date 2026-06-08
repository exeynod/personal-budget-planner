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

// Perceived-speed: kick off the Home bootstrap (auth /me + aggregated /home)
// as EARLY as possible — right after SDK init (so initData is available),
// before React mounts. Both are cached (api/cache), so AuthGate /
// OnboardingMount / HomeMount dedupe to these in-flight promises instead of
// firing their own — the network round-trip overlaps React mount + JS parse
// instead of waiting for it. Fire-and-forget; the gate/mounts own error UX.
void Promise.allSettled([
  import('./api/me').then(({ getMeV10 }) => getMeV10()),
  import('./api/home').then(({ getHome }) => getHome()),
]);

// Phase 3 (web UX): best-effort expand to the full TG viewport. No-op outside
// Telegram. Combined with setupSafeArea() below this binds the stable viewport
// height into --tg-viewport-stable so the AI composer stays above the keyboard.
expandWebApp();

// Sync TG safe-area insets into CSS vars (--tg-safe-top/etc).
// .appRoot применяет max(env, var(--tg-safe-*)) — корректно в обычном browser
// (где env работает) и в TG fullscreen (где env=0, но TG отдаёт инсеты).
setupSafeArea();

// ─── Single design: Liquid Glass native iOS shell ───
// The Maximal Poster design has been retired from web. Liquid Glass
// (NativeShell) is the sole shipping design, so there is no longer any theme
// dispatch — we hydrate <html data-theme="liquid_glass"> before first paint so
// the per-theme CSS variables apply without a flash of the default tokens.
document.documentElement.setAttribute('data-theme', 'liquid_glass');

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
