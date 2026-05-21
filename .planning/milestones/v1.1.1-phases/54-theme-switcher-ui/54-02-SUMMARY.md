---
phase: 54-theme-switcher-ui
plan: 02
requirements: [LG-SW-03, LG-SW-04, LG-SW-05]
status: complete
commit: 2115167
---

# Phase 54-02-ios Summary — iOS ThemePickerSheet + Settings row «Тема»

## What shipped

- `ios/BudgetPlanner/FeaturesV10/Management/ThemePickerSheet.swift` — VStack of 3 button rows; swatch (RoundedRectangle 36×36) + label (JetBrains Mono 12pt) + description (Manrope 12pt) + ✓ (Archivo Black 18pt coral) на текущем. `accessibilityIdentifier` per row.
- `ios/BudgetPlanner/FeaturesV10/Management/SettingsV10View.swift` — добавляет `themeRow` after `homeColorRow`; second `.posterSheet(isPresented:)` modifier для theme picker; `@AppStorage("ui.theme")` binding в view.

## Verification

- iOS build (XcodeBuildMCP via `make build`): **Build Succeeded**. No warnings, no errors.
- Instant apply (LG-SW-05 ios): SwiftUI `@AppStorage` propagates change automatically — no manual notification.

## Strategy notes

- Reused `.posterSheet` modifier + existing `Theme` enum (Phase 50-02). Mirrors HomeColorPickerSheet pattern.
- No iOS-side unit test (parity с Phase 53 — visual smoke deferred к Phase 55 acceptance).

## Deferred to Phase 55

- Manual XcodeBuildMCP screenshots picker UI — Phase 55 LG-POL-01.
- Theme switch perf measurement (< 200ms first paint) — Phase 55 LG-POL-04.
