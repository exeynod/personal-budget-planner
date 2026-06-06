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

// ─── DS-08 / P1-6 (FE-F4): dual-shell dispatcher ───
// Shell selection lives on its OWN localStorage key `ui.shell` (vocabulary
// `v06`/`v10`), kept ORTHOGONAL to the visual theme key `ui.theme`
// (vocabulary `maximal_poster`/`liquid_glass`/`ios_default`, owned by
// `screensV10/common/useTheme.ts`). Previously both systems shared the single
// `ui.theme` key with incompatible vocabularies, so picking a v10 theme stored
// a value the shell dispatcher didn't recognise and the v06 web shell became
// unreachable. Splitting the keys removes that collision (T-67-06-02).
//
// Resolution order: VITE_UI_THEME env (build-time, trusted) →
// localStorage 'ui.shell' (runtime, validated) → one-time legacy migration
// from a `v06`/`v10` value left on the old `ui.theme` key → default 'v10'.
type Theme = 'v06' | 'v10';
const SHELL_KEY = 'ui.shell';
const LEGACY_SHELL_KEY = 'ui.theme';

function readTheme(): Theme {
  // Env wins — controlled by CI/QA/prod build config (see vite-env.d.ts).
  // Env override stays VITE_UI_THEME (documented) to minimise build-config churn.
  const envTheme = (
    import.meta.env.VITE_UI_THEME as string | undefined
  )?.toLowerCase();
  if (envTheme === 'v06' || envTheme === 'v10') return envTheme;

  // localStorage fallback — VALIDATED to prevent tampering (T-67-06-01).
  // Any value other than the literal 'v06' / 'v10' falls through.
  try {
    const raw = localStorage.getItem(SHELL_KEY);
    if (raw === 'v06' || raw === 'v10') return raw;

    // One-time migration shim: existing installs may still hold their shell
    // choice on the legacy `ui.theme` key as `v06`/`v10`. Adopt it as the
    // shell value and persist under `ui.shell`. We do NOT clobber theme values
    // — only the literal shell vocabulary (`v06`/`v10`) is migrated; any theme
    // value (`maximal_poster`/…) is left untouched on `ui.theme`.
    const legacy = localStorage.getItem(LEGACY_SHELL_KEY);
    if (legacy === 'v06' || legacy === 'v10') {
      try {
        localStorage.setItem(SHELL_KEY, legacy);
      } catch {
        /* persistence best-effort — still honour the resolved shell below */
      }
      return legacy;
    }
  } catch {
    /* localStorage may throw in private mode or with strict cookie policies */
  }

  // Default for new installs — V10 poster shell.
  return 'v10';
}

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
