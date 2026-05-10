/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UI_THEME?: 'v06' | 'v10';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
