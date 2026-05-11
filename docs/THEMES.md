# THEMES — TG Budget Planner v1.1.1

Multi-theme system intoroduced в v1.1.1 (2026-05-11). Три темы:

| Theme | Storage value | Default | Style |
|-------|---------------|---------|-------|
| Maximal Poster | `maximal_poster` | ✅ default | Custom design system (Archivo Black + DM Serif Italic + кораллово-кобальтовая палитра + 11 keyframe animations) |
| Liquid Glass | `liquid_glass` | | iOS 26 Liquid Glass — system materials, прозрачные слои, SF Pro typography, light/dark adaptive |
| iOS Default | `ios_default` | | Минималистичный iOS — solid surfaces, system grey/blue, SF Pro |

## Architecture

### Storage
- Web: `localStorage['ui.theme']`
- iOS: `@AppStorage("ui.theme")`
- Whitelist: `maximal_poster | liquid_glass | ios_default`. Invalid → fallback default = `maximal_poster`.

### Source of truth
- `design/tokens.json` — single source. `themes.{maximal_poster,liquid_glass,ios_default}` sections.
- `scripts/gen-tokens.ts` — codegen → `frontend/src/stylesV10/tokens.css` + `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift`.

### Web mechanism
1. `useTheme()` hook (`frontend/src/screensV10/common/useTheme.ts`) reads/writes `localStorage`, applies `data-theme` attribute на `<html>`.
2. `frontend/src/stylesV10/liquid-glass.css` + `ios-default.css` — broad-stroke overrides активируются по `[data-theme="X"]` selector.
3. `<GlassCard>` primitive (`frontend/src/componentsV10/GlassCard.tsx`) — translucent surface для LG theme.

### iOS mechanism
1. `@AppStorage("ui.theme")` binding в `BudgetPlannerApp` injects `Theme` enum в SwiftUI environment.
2. `ThemedBackground` SwiftUI view (`ios/BudgetPlanner/FeaturesV10/Common/ThemedBackground.swift`) reads `@Environment(\.appTheme)` and branches: Maximal solid color / `.regularMaterial` (LG) / `Color(.systemGroupedBackground)` (iOS Default).
3. `GlassCard.swift` primitive — `.background(.regularMaterial, in: shape)` для LG screens.

### Switcher UI
- Web: `frontend/src/screensV10/Management/ThemePickerSheet.tsx` (PosterSheet с 3 rows + swatch + ✓).
- iOS: `ios/BudgetPlanner/FeaturesV10/Management/ThemePickerSheet.swift` (SwiftUI sheet + ForEach Theme.allCases).
- Trigger: Settings → row «Тема» → tap → opens picker → tap option → instant apply (CustomEvent web / @AppStorage iOS).

## Token comparison (high-level)

| Token | Maximal Poster | Liquid Glass | iOS Default |
|-------|----------------|--------------|-------------|
| Background | coral / cobalt / black / cream / red | adaptive light/dark | system grouped grey |
| Surface | paper #FFF6E8 (solid) | rgba(255,255,255,0.72) + blur 40px | white solid |
| Display font | Archivo Black + DM Serif Italic | SF Pro Display | SF Pro Display |
| Text font | Manrope | SF Pro Text | SF Pro Text |
| Body radius | 0px (Mass) / 14px (Plate) | 14pt | 10pt |
| Animations | 11 keyframe (posterRowIn etc.) | iOS spring `.smooth` (0.32s) | system default |

## Adding a new theme

1. Add `themes.<new_name>` section to `design/tokens.json`.
2. Add value to `Theme` whitelist в `useTheme.ts` + `Theme` enum в `PosterTokens.swift` (via codegen).
3. Run `npx tsx scripts/gen-tokens.ts`.
4. Create override stylesheet `frontend/src/stylesV10/<new_name>.css` если нужны broad-stroke surface changes.
5. Add option to `ThemePickerSheet` (web + iOS).

## Accessibility

- `prefers-reduced-motion: reduce` (web) + `accessibilityReduceMotion` (iOS) — neutralize blur transitions; opacity-only fallback.
- `prefers-color-scheme: dark` (web) — LG theme adapts к dark palette automatically.
- WCAG AA contrast verification — manual audit per Phase 55 LG-POL-03 (deferred).

## Known limitations

- LG pixel-snapshot baselines (LG-WEB-04) — defer к manual QA (browser blur-shader determinism).
- 27×2 side-by-side screenshots (LG-POL-01) — manual user-side review.
- VoiceOver / a11y audit — automated tooling limited; full audit manual.
- Theme switch perf <100ms (LG-POL-04) — measured via analytics event embed deferred к real-user instrumentation.

## File map

### Web
- `frontend/src/screensV10/common/useTheme.ts` — hook + types.
- `frontend/src/stylesV10/{liquid-glass,ios-default}.css` — override stylesheets.
- `frontend/src/componentsV10/GlassCard.{tsx,module.css}` — primitive.
- `frontend/src/screensV10/Management/ThemePickerSheet.{tsx,module.css}` — picker UI.

### iOS
- `ios/BudgetPlanner/FeaturesV10/Common/ThemeEnvironment.swift` — env key.
- `ios/BudgetPlanner/FeaturesV10/Common/ThemedBackground.swift` — conditional bg helper.
- `ios/BudgetPlanner/FeaturesV10/Common/GlassCard.swift` — primitive.
- `ios/BudgetPlanner/FeaturesV10/Management/ThemePickerSheet.swift` — picker UI.

### Codegen
- `design/tokens.json` — source.
- `scripts/gen-tokens.ts` — generator.
- `frontend/src/stylesV10/tokens.css` — generated (DO NOT edit).
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` — generated (DO NOT edit).
