import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@telegram-apps/sdk-react';
import { setupSafeArea } from './utils/safeArea';

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

// Sync TG safe-area insets into CSS vars (--tg-safe-top/etc).
// .appRoot применяет max(env, var(--tg-safe-*)) — корректно в обычном browser
// (где env работает) и в TG fullscreen (где env=0, но TG отдаёт инсеты).
setupSafeArea();

// ─── DS-08: dual-shell theme dispatcher ───
// Resolution order: VITE_UI_THEME env (build-time, trusted) →
// localStorage 'ui.theme' (runtime, validated) → default 'v10' (new installs).
type Theme = 'v06' | 'v10';
function readTheme(): Theme {
  // Env wins — controlled by CI/QA/prod build config (see vite-env.d.ts).
  const envTheme = (import.meta.env.VITE_UI_THEME as string | undefined)?.toLowerCase();
  if (envTheme === 'v06' || envTheme === 'v10') return envTheme;

  // localStorage fallback — VALIDATED to prevent tampering (T-23-09-01).
  // Any value other than the literal 'v06' / 'v10' falls through to the default.
  try {
    const raw = localStorage.getItem('ui.theme');
    if (raw === 'v06' || raw === 'v10') return raw;
  } catch {
    /* localStorage may throw in private mode or with strict cookie policies */
  }

  // Default for new installs — V10 poster shell.
  return 'v10';
}

const root = createRoot(document.getElementById('root')!);
const theme = readTheme();

if (theme === 'v10') {
  // Lazy-import V10 shell — keeps v0.6 bundle untouched when theme=v06.
  import('./AppV10')
    .then(({ default: AppV10 }) => {
      root.render(
        <StrictMode>
          <AppV10 />
        </StrictMode>,
      );
    })
    .catch((e) => {
      // Defensive fallback to v06 if AppV10 import fails (e.g. transient build error).
      console.error('[main] AppV10 import failed, falling back to v06:', e);
      Promise.all([
        import('@fontsource/inter/400.css'),
        import('@fontsource/inter/500.css'),
        import('@fontsource/inter/600.css'),
        import('@fontsource/inter/700.css'),
        import('./App'),
        import('./styles/tokens.css'),
        import('./styles/glass.css'),
      ]).then(([_a, _b, _c, _d, AppMod]) => {
        const App = AppMod.default;
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
      });
    });
} else {
  // v06 path — preserved exactly from previous main.tsx (Inter + legacy styles + App).
  Promise.all([
    import('@fontsource/inter/400.css'),
    import('@fontsource/inter/500.css'),
    import('@fontsource/inter/600.css'),
    import('@fontsource/inter/700.css'),
    import('./App'),
    import('./styles/tokens.css'),
    import('./styles/glass.css'),
  ]).then(([_a, _b, _c, _d, AppMod]) => {
    const App = AppMod.default;
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
