import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@telegram-apps/sdk-react';
import App from './App.tsx';
import { setupSafeArea } from './utils/safeArea';
import './styles/tokens.css';
import './styles/glass.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
