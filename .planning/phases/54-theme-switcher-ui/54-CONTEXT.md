# Phase 54: Theme Switcher UI — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous v1.1.1).

## Phase Boundary

Surface theme switching к end-user: Settings screen adds row «Тема» (web + iOS)
после row «Цвет Home». Tap → bottom-sheet picker с 3 options + colour swatches
+ description + ✓ marker на текущем. Instant apply через existing `useTheme`
hook (web) и `@AppStorage("ui.theme")` (iOS) — both уже shipped в Phase 50.

## Implementation Decisions

- Web: `ThemePickerSheet.tsx` reuses `PosterSheet` primitive (same modal contract
  как `HomeColorPickerSheet`); `useTheme()` from Phase 50 — no new state plumbing.
- iOS: `ThemePickerSheet.swift` reuses `.posterSheet` modifier; `@AppStorage("ui.theme")`
  binding — SwiftUI propagates change automatically (LG-SW-05).
- Settings row pattern mirrors «Цвет Home» (DEBT-08): button-styled row с label,
  current preview, chevron «→».
- 4 vitest unit tests cover open/closed render + aria-checked + tap action.
- iOS не получает дискретный UI test — visual smoke deferred к Phase 55 manual
  acceptance (parity с Phase 53 approach).

## Deferred (to Phase 55)

- Manual visual side-by-side acceptance каждой темы (iOS + web) — Phase 55 LG-POL-01.
- Performance measurement theme switch < 100ms web / < 200ms iOS — Phase 55 LG-POL-04.
