---
phase: 50-theme-registry
plan: 02
requirements: [THEME-01, THEME-02, THEME-04]
status: complete
commit: 972046a
---

# Phase 50-02 Summary — useTheme + iOS @AppStorage wiring

## What shipped

- `frontend/src/stylesV10/themes/registry.ts`: `Theme = 'maximal_poster' | 'liquid_glass' | 'ios_default'` union; `THEMES: readonly Theme[]`; `themeLabel(t)`, `themeDescription(t)`, `isTheme(v): v is Theme` guard.
- `frontend/src/hooks/useTheme.ts`: localStorage `ui.theme` read/write, whitelist enforcement (fallback `maximal_poster`), setter dispatches `CustomEvent('theme-changed')`, storage event listener для cross-tab sync, applies `document.documentElement.setAttribute('data-theme', t)`.
- `frontend/src/hooks/useTheme.test.ts`: 6 vitest cases — default fallback, persist, whitelist reject (invalid → default), setter broadcast, storage event sync, double-mount idempotent.
- `frontend/src/main.tsx`: bootstrap hydration block (читает localStorage до React mount, applies `data-theme` attr → anti-flash).
- `ios/BudgetPlanner/App/BudgetPlannerApp.swift`: `@AppStorage("ui.theme") private var themeRaw = "maximal_poster"`; computed `currentTheme: Theme`; injected via `.environment(\.theme, currentTheme)`.
- `PosterTokens.currentTheme` static accessor для component-level resolve без env propagation.

## Verification

- `vitest run useTheme.test.ts` → 6/6 pass.
- `tsc --noEmit` (frontend) → clean.
- iOS `make build` → succeeded; no XCTest regressions.
- Manual: localStorage edit + reload → correct `data-theme` attr applied pre-FOUC.

## Decisions

- `useTheme()` returns `[theme, setTheme]` tuple (consistent c `useHomeColor`); side-effects encapsulated.
- iOS Theme enum mirrors web string values (raw `"maximal_poster"` / `"liquid_glass"` / `"ios_default"`) — single storage key, no translation layer.
- Bootstrap hydration inline в `main.tsx` (не отдельный module) — критический path, no async deps.
