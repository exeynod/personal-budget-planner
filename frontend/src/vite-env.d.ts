/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Build-time SHELL override consumed by main.tsx readTheme() (P1-6). Despite
  // the historical name, this selects the SHELL (`v06`/`v10`), not the visual
  // theme. Runtime shell choice lives on localStorage `ui.shell`; the visual
  // theme lives on `ui.theme` (screensV10/common/useTheme.ts) — kept distinct.
  readonly VITE_UI_THEME?: 'v06' | 'v10';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
