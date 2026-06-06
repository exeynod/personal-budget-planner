# Web UX Refactor — Master Plan (2026-06-06)

Source: owner feedback after prod launch + 5-agent review (`reviews` workflow wf_3ea06b06-925).
Scope: shipping **web v10 shell** (`src/screensV10/*`, `src/stylesV10/*`, `AppV10`) + iOS Liquid Glass restore.

## Decisions (autonomous, per owner "до идеала")

- **Two themes only**: Maximal Poster + Liquid Glass. Remove `ios_default` from web picker & iOS.
- **Period nav**: prev/next switcher (month mental model), shared `SelectedPeriodProvider`.
- **Auth**: hard gate above shell; 401/403 → static `AccessRequiredScreen`, zero interactive surface.
- **Responsive**: 420px centered column, breakpoint 540px, neutral letterbox on desktop; constrain fixed nav/sheets/toasts.
- **TMA**: hand-rolled `window.Telegram.WebApp` viewport+safe-area binding (thin bespoke), `expand()` on boot.
- **Backend**: confirmed sufficient — `create_actual` (actual.py:153,176) auto-creates past/closed periods on past tx_date; `listPeriods`/`getPeriodBalance`/`listActualV10(id)` already exist. No backend changes needed for period work.

## Phases (sequential; test after each)

### P1 — Auth gate (security) [outermost shell wrapper]

- `src/api/client.ts`: typed `AuthError` (kind 'unauthenticated'|'forbidden') for 401/403.
- New `src/screensV10/Auth/AuthGate.tsx` + `AccessRequiredScreen.tsx`(+css): fetch /me once; authorized → children; 401/403 → AccessRequiredScreen (static, no TabBar/FAB/AddSheet, no retry on 403); transient/5xx → Retry error.
- `AppV10.tsx`/`V10MainShell.tsx`: move /me probe up into AuthGate; ShellChrome+AddSheet mount only in authorized branch. OnboardingMount stops owning the /me probe.
- Tests: 403 → only AccessRequiredScreen (no v10-shell/nav/FAB), single network call; 200 → full shell; 5xx → Retry distinct.

### P2 — Period switching (CRITICAL)

- New `src/screensV10/common/SelectedPeriodProvider.tsx`: `periods`, `selectedPeriodId`, `setSelectedPeriodId`; loads `listPeriods()`, default = current.
- New v10 `PeriodSwitcher` (port v06 prev/next logic, themed).
- `HomeMount`/`HomeView`: period-driven (read context, fetch `listActualV10(selectedId)`+`getPeriodBalance(selectedId)`); render switcher; eyebrow/daysLeft from SELECTED period (fix `format.ts` to take a PeriodRead, not `new Date()`).
- `TransactionsMount`/`View`: selected-period actuals; groupByDay vs period.
- `AddSheet`: default tx_date into viewed period; min/max date guides; post-submit refetch routes to the tx's period (auto-switch or toast).
- `CategoryDetailMount`/`AccountDetailMount`: consume selected period.
- Tests: switch re-fetches; eyebrow shows MAY when clock=June; past-period list; AddSheet defaults into viewed period.

### P3 — Responsive column + TMA viewport/safe-area [layout]

- `stylesV10/tokens.css`: add `--col-width:420px`, `--tg-viewport-stable`(100dvh), `--tg-safe-*`(0).
- `src/main.tsx` + new `src/utils/safeArea.ts` (or reuse): `expand()` + viewportChanged listener → write `--tg-viewport-stable` + safe-area vars.
- `V10MainShell.module.css`/`AppV10.module.css`: height = `var(--tg-viewport-stable,100dvh)`; `@media(min-width:540px)` → center 420px column + letterbox; top safe-area padding.
- Constrain fixed elements to column on desktop: `TabBar`, `PosterSheet`, `Toast`, onboarding overlays, AccountPickerSheet.
- `TabBar`: `bottom: calc(18px + env(safe-area-inset-bottom))`.
- `AiView.composer`: `padding-bottom: calc(14px + env(safe-area-inset-bottom))`; height tracks stable viewport (fix "chat input runs away").
- `SettingsView`/`MgmtHubView`: safe-area top padding + bottom scroll-padding (fix settings scroll/placement).
- Tests (Playwright): desktop 1280 → column ≤420px centered, nav/sheet within column, no h-scroll; mobile 390/TMA → full-width unchanged.

### P4 — Themes / Liquid Glass (make it real + 2 options)

- `stylesV10/tokens.css`: semantic tokens (`--surface-bg/-card`, `--radius-card/-button`, `--font-display/-body`, `--shadow-card`, `--text-*`) with full value set per theme block.
- Fix wrong-name LG overrides now (`-italic` font names, `--poster-black`).
- Replace structural hard-codes in `screensV10/**/*.module.css` (15+ `border-radius:0`, literal sizes, `--poster-font-*-italic`) with semantic tokens. Maximal Poster keeps radius0+Archivo via its token values (must visually-unchanged); Liquid Glass → 14px radius, SF Pro, frosted surfaces (wire GlassCard materials / `[data-theme=liquid_glass]` rules), neutral grey bg, neutralize poster shadows + `--color-home`.
- `useTheme.ts`/`ThemePickerSheet.tsx`: drop `ios_default` → 2 themes.
- iOS: revert theme-removal part of commit e96affa — restore `.liquidGlass` in Theme enum, ThemeOption, ThemePickerSheet, ThemedBackground (SwiftUI Material); rewire existing Glass.swift/GlassCard.swift.
- Tests: LG card radius non-zero + SF Pro font; MP unchanged; iOS ThemeOption has .liquidGlass.

### P5 — Verify + ship

- vitest (web unit) + backend pytest green; Playwright e2e green incl. new tests.
- **Web screenshots**: capture all key screens both themes (Playwright fullPage, mobile viewport) → `.planning/ux-refactor-screenshots/`.
- Regenerate linux pixel baselines if poster visuals intentionally changed.
- Push master → green CI → auto-Deploy. Confirm Deploy success.

## Risk notes

- Theme semantic-token refactor must NOT regress Maximal Poster (pixel snapshots guard).
- Auth gate restructure interacts with onboarding flow (e2e onboarding tests).
- Period eyebrow change touches `format.ts` used by snapshot tests → update baselines.
