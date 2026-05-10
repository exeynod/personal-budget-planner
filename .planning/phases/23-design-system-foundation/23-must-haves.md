# Phase 23 — Must-Haves (Goal-Backward Verification)

**Phase:** 23 — Design System Foundation
**Source:** ROADMAP.md Phase 23 Success Criteria (6 items) + REQUIREMENTS.md DS-01..DS-08

## Truths (Observable Outcomes)

User-observable / human-verifiable behaviours that MUST be true at phase completion:

1. **Single-source tokens** — Designer edits `design/tokens.json` (e.g. coral hex), runs `npm run gen:tokens`; web `tokens.css` and iOS `PosterTokens.swift` regenerate automatically and round-trip through `make tokens-check` exits 0.
2. **Web cyrillic glyph routing** — On `/preview` route web renders italic «Май» using PT Serif Italic glyphs and italic «May» using DM Serif Italic glyphs (visual parity with prototype + no FOUT after first visit; `font-display: optional` + preload Manrope 400/700).
3. **iOS bundled fonts** — iOS test app launches and renders 5 font families (Manrope variable, JetBrains Mono variable, Archivo Black, DM Serif Italic, PT Serif Italic) from bundled TTF — synchronous registration via `UIAppFonts`, no async FOUT race.
4. **11 keyframe animations parity web↔iOS** — `/preview` (web) and SwiftUI `PreviewGallery` (iOS) demonstrate all 11 named animations: posterRowIn, posterRiseIn, posterBarFill, posterTabPop, posterPopIn, posterCheck, posterDot, posterSlideInFwd, posterSlideInBack, posterTabSwap, posterToastIn — with durations and cubic-bezier curves matching DESIGN-SYSTEM.md §7 and prototype JSX.
5. **OS reduce-motion respected** — Toggling OS-level `prefers-reduced-motion` (web) / `accessibilityReduceMotion` (iOS) reduces all 11 animations to opacity-only fade; no in-app toggle exists or required.
6. **10 base components symmetric** — Both web `componentsV10/` and iOS `FeaturesV10/Common/` expose `Eyebrow / Mass / BigFig / Plate / PosterButton / Chip / PosterSlider / TabBar / FAB / Toast` with matching prop names and behaviour contracts; the gallery renders all 10 without errors.
7. **iOS PosterNavStack works on real device** — Custom 50-LOC ZStack with asymmetric transitions; push 3 screens → swipe-back from left edge → assert top-of-stack reverts; accessibility label «Назад» + isButton trait present on edge area.
8. **iOS PosterSheet drag-to-close** — Slide-up from bottom + sheetEase + backdrop opacity 0.45 + tap-to-dismiss + drag-to-close (translation > 100pt OR velocity > 800).
9. **Dual-shell flag — iOS** — `@AppStorage("ui.theme")` value `"v10"` renders `V10MainShell { PreviewGallery }`; value `"v06"` renders existing untouched `MainShell`. Default `"v10"` for new installs.
10. **Dual-shell flag — web** — `VITE_UI_THEME=v10` env var OR `localStorage.setItem('ui.theme', 'v10')` causes lazy-import of `AppV10`; absence of both falls through default `'v10'`. localStorage tampering with invalid value falls back to `'v10'`.
11. **Preview gallery accessible** — Web `/preview?preview=1` route renders all 10 components + 11 animation triggers; iOS `V10MainShell { PreviewGallery() }` does the same on a real / simulated device.

## Required Artifacts

Files / build outputs that MUST exist at phase completion:

```yaml
artifacts:
  # Wave 1 — tokens
  - path: "design/tokens.json"
    provides: "single-source design tokens (palette, spacing, typography, radii, shadows)"
    contains: "coral, cobalt, cream, ink, paper, yellow, red, black"

  - path: "scripts/gen-tokens.ts"
    provides: "Node TS codegen — reads tokens.json, emits CSS + Swift"
    max_lines: 120
    dependencies: "stdlib only (no style-dictionary)"

  - path: "frontend/src/stylesV10/tokens.css"
    provides: "CSS custom properties --poster-*"
    contains: "--poster-coral: #FF5A3C"
    generated: true

  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift"
    provides: "Swift static let constants for SwiftUI Color/Font"
    contains: "static let coral = Color(hex: \"FF5A3C\")"
    generated: true

  # Wave 2 — fonts
  - path: "frontend/src/stylesV10/fonts.css"
    provides: "@font-face rules + unicode-range cyrillic fallback"
    min_face_rules: 6   # Manrope, JBM, Archivo, DMSerif latin, PTSerif cyrillic, optional helpers
    contains: "unicode-range: U+0400-04FF"

  - path: "ios/BudgetPlanner/Resources/Fonts/Manrope-VariableFont_wght.ttf"
  - path: "ios/BudgetPlanner/Resources/Fonts/JetBrainsMono-VariableFont_wght.ttf"
  - path: "ios/BudgetPlanner/Resources/Fonts/ArchivoBlack-Regular.ttf"
  - path: "ios/BudgetPlanner/Resources/Fonts/DMSerifDisplay-Italic.ttf"
  - path: "ios/BudgetPlanner/Resources/Fonts/PTSerif-Italic.ttf"

  # Wave 3 — animations + components (web)
  - path: "frontend/src/stylesV10/animations.css"
    provides: "11 keyframes + reduce-motion media query"
    contains: "@keyframes posterRowIn"
    min_keyframes: 11

  - path: "frontend/src/componentsV10/index.ts"
    provides: "Public re-exports of 10 components"
    exports: ["Eyebrow", "Mass", "BigFig", "Plate", "PosterButton", "Chip", "PosterSlider", "TabBar", "FAB", "Toast"]

  # 10 component files + corresponding .module.css
  - path: "frontend/src/componentsV10/Eyebrow.tsx"
  - path: "frontend/src/componentsV10/Mass.tsx"
  - path: "frontend/src/componentsV10/BigFig.tsx"
  - path: "frontend/src/componentsV10/Plate.tsx"
  - path: "frontend/src/componentsV10/PosterButton.tsx"
  - path: "frontend/src/componentsV10/Chip.tsx"
  - path: "frontend/src/componentsV10/PosterSlider.tsx"
  - path: "frontend/src/componentsV10/TabBar.tsx"
  - path: "frontend/src/componentsV10/FAB.tsx"
  - path: "frontend/src/componentsV10/Toast.tsx"

  # iOS animations + components
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift"
    provides: "AnimationCurve constants + reduce-motion guard helper"
    contains: "static let easeOut = Animation.timingCurve(0.22, 0.61, 0.36, 1"

  - path: "ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/Mass.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/Plate.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/Chip.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/FAB.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/Toast.swift"

  # Wave 4 — iOS nav + dual-shell + web shell
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift"
    max_lines: 80
    contains: "@Observable final class PosterRouter"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift"
    contains: "UIScreenEdgePanGestureRecognizer"
  - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift"
    contains: "translation > 100"

  - path: "frontend/src/AppV10.tsx"
    provides: "Web v10 shell — entry point lazy-loaded by main.tsx"
  - path: "frontend/src/preview/PreviewApp.tsx"
    provides: "Gallery of 10 components + 11 animations"
  - path: "frontend/src/main.tsx"
    contains: "VITE_UI_THEME"

  - path: "ios/BudgetPlanner/App/V10MainShell.swift"
    contains: "PosterNavStack"
  - path: "ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift"
    provides: "iOS preview of all 10 components + 11 animations"
  - path: "ios/BudgetPlanner/App/AppRouter.swift"
    contains: "@AppStorage(\"ui.theme\")"

  # Build infrastructure
  - path: "Makefile"
    contains: "tokens-check"
  - path: "package.json"
    provides: "root npm — scripts gen:tokens, gen:tokens:watch, tokens-check"
    contains: "gen:tokens"

  # Wave 5 — integration tests
  - path: "frontend/tests/e2e/preview.spec.ts"
    provides: "Playwright smoke + cyrillic glyph routing assertion"
```

## Key Links (Critical Wiring)

Connections that, if broken, cause cascading failures:

```yaml
key_links:
  - from: "design/tokens.json"
    to: "frontend/src/stylesV10/tokens.css"
    via: "scripts/gen-tokens.ts"
    pattern: "--poster-coral:\\s*#FF5A3C"
    if_broken: "designer edits don't propagate to web"

  - from: "design/tokens.json"
    to: "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift"
    via: "scripts/gen-tokens.ts"
    pattern: "static let coral = Color\\(hex: \"FF5A3C\""
    if_broken: "designer edits don't propagate to iOS"

  - from: "frontend/src/stylesV10/fonts.css"
    to: "@fontsource-variable/manrope"
    via: "@font-face src url(...)"
    pattern: "@fontsource-variable/manrope"
    if_broken: "Manrope doesn't load — body text falls back"

  - from: "frontend/src/stylesV10/fonts.css"
    to: "@fontsource/pt-serif"
    via: "@font-face src + unicode-range U+0400-04FF"
    pattern: "unicode-range:\\s*U\\+0400-04FF"
    if_broken: "cyrillic glyphs render in DM Serif (missing) — fallback Times shows"

  - from: "ios/BudgetPlanner/Info.plist"
    to: "ios/BudgetPlanner/Resources/Fonts/*.ttf"
    via: "UIAppFonts array"
    pattern: "UIAppFonts"
    if_broken: "Font.custom() returns system font — silent visual failure"

  - from: "frontend/src/main.tsx"
    to: "frontend/src/AppV10.tsx"
    via: "lazy import + theme flag"
    pattern: "import\\(\\s*['\"]\\./AppV10"
    if_broken: "v10 theme never renders"

  - from: "ios/BudgetPlanner/App/AppRouter.swift"
    to: "ios/BudgetPlanner/App/V10MainShell.swift"
    via: "@AppStorage(\"ui.theme\") switch"
    pattern: "V10MainShell"
    if_broken: "v10 theme never renders on iOS"

  - from: "ios/BudgetPlanner/App/V10MainShell.swift"
    to: "ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift"
    via: "PosterNavStack { PreviewGallery() }"
    if_broken: "v10 launches into empty shell — DS-08 fails"

  - from: "frontend/src/AppV10.tsx"
    to: "frontend/src/preview/PreviewApp.tsx"
    via: "?preview=1 query OR import.meta.env.DEV route"
    if_broken: "preview surface unreachable"

  - from: "Makefile"
    to: "scripts/gen-tokens.ts"
    via: "tokens-check target"
    pattern: "npm run gen:tokens && git diff --exit-code"
    if_broken: "CI doesn't catch designer commits without regen"

  - from: "ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift"
    to: "ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift"
    via: ".gesture(edgeSwipeGesture) modifier in PosterNavStack body"
    if_broken: "edge-swipe-back never fires — accessibility regress"
```

## Reachability Check

| Must-have | Reachable via |
|---|---|
| tokens round-trip | Wave 1 plan 23.01 (codegen) + 23.02 (Makefile target) — verifiable in CI |
| web fonts | Wave 2 plan 23.03 (`@fontsource` + fonts.css with unicode-range) |
| iOS fonts | Wave 2 plan 23.04 (TTF bundle + UIAppFonts + XcodeGen regen) |
| 11 web animations | Wave 3 plan 23.05 (animations.css + reduce-motion media query) |
| 10 web components | Wave 3 plan 23.06 (componentsV10/) |
| 11 iOS animations | Wave 3 plan 23.07 (PosterAnimations.swift) |
| 10 iOS components | Wave 3 plan 23.08 (FeaturesV10/Common/) |
| iOS PosterNavStack + edge swipe | Wave 4 plan 23.09 |
| iOS PosterSheet | Wave 4 plan 23.10 |
| Web shell + /preview | Wave 4 plan 23.11 |
| iOS V10MainShell + dual-shell switch | Wave 4 plan 23.12 |
| End-to-end preview smoke | Wave 5 plan 23.13 |

All artifacts have a creating plan. No must-have is UNREACHABLE.
