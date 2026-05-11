---
phase: 54-theme-switcher-ui
plan: 01
requirements: [LG-SW-01, LG-SW-02, LG-SW-05]
status: complete
commit: a61fce9
---

# Phase 54-01-web Summary — Web ThemePickerSheet + Settings row «Тема»

## What shipped

- `frontend/src/screensV10/Management/ThemePickerSheet.tsx` — PosterSheet с vertical list 3 themes, swatch (36×36 rounded) + label + description + ✓ marker. `aria-checked` + `role="radiogroup"`.
- `frontend/src/screensV10/Management/ThemePickerSheet.module.css` — styles (JetBrains Mono label, Manrope description, coral check).
- `frontend/src/screensV10/Management/SettingsView.tsx` — добавляет row «Тема» после «Цвет Home» с `themeLabel(current)` + chevron `→`.
- `frontend/src/screensV10/Management/SettingsMount.tsx` — wires `useTheme()` + `themePickerOpen` local state to view.
- `frontend/src/screensV10/Management/__tests__/ThemePickerSheet.test.tsx` — 4 vitest cases.

## Verification

- Vitest: 4/4 pass on new ThemePickerSheet tests; 12/12 pass on SettingsView regression.
- TypeScript: clean (`npx tsc --noEmit` no errors на touched files).
- Instant apply (LG-SW-05): `useTheme` setter writes localStorage + dispatches `theme-changed` CustomEvent — same-frame re-render across SPA (already verified Phase 50-02).

## Strategy notes

- Reused PosterSheet primitive + `useTheme` hook — no new infra. Mirrors HomeColorPickerSheet pattern (DEBT-08).
- Picker swatch colours hardcoded to per-theme preview hex (`PREVIEW_HEX`) — independent of CSS-var resolution so swatches render correctly even under non-current theme.

## Deferred to Phase 55

- Visual side-by-side acceptance — Phase 55 LG-POL-01.
- Theme switch perf measurement — Phase 55 LG-POL-04.
