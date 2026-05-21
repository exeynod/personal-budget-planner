---
phase: 51-liquid-glass-system
plan: 02
requirements: [LG-SYS-05]
status: complete
commits:
  - 78d6a27 (web)
  - ac7689b (ios)
---

# Phase 51-02 Summary — GlassCard primitive (web + iOS)

## What shipped

### Web (commit 78d6a27)

- `frontend/src/componentsV10/GlassCard.tsx` (58 LOC): forwardRef React component, `GlassCardProps` interface (material / innerBorder / elevation / radius / className / style / onClick / testId), CSS-module class composition.
- `frontend/src/componentsV10/GlassCard.module.css` (75 LOC): root + 4 material classes + 4 elevation classes + `withBorder` ::before highlight + `interactive` cursor/active feedback + `:root:not([data-theme="liquid_glass"])` fallback to solid `--poster-paper` surface + `prefers-reduced-motion` neutralization + `prefers-color-scheme: dark` glass-tint swap.
- `frontend/src/componentsV10/__tests__/GlassCard.test.tsx` (47 LOC): 6 vitest cases — children render, material class, elevation class, button role + onClick fire, innerBorder skip, radius override.
- `frontend/src/componentsV10/index.ts`: added `export { GlassCard }` + `export type { GlassCardProps }`.

### iOS (commit ac7689b)

- `ios/BudgetPlanner/FeaturesV10/Common/GlassCard.swift` (139 LOC): generic `GlassCard<Content: View>` SwiftUI view, `MaterialLevel` enum (4 cases → SwiftUI Material), `Elevation` enum (4 cases с computed shadowRadius/opacity/Y), `RoundedRectangle` clip + `.background(Material, in: shape)` + optional inner gradient stroke + Button wrapper когда `onTap` provided; PreviewProvider с 2 variants.

## Verification

- `vitest run src/componentsV10/__tests__/GlassCard.test.tsx` → 6/6 pass (Duration 400ms).
- `tsc --noEmit` (frontend) — clean for GlassCard files.
- iOS `make generate && make build` → Build Succeeded на iPhone 17 Pro Simulator (Xcode 26 SDK).

## Decisions

- Web: testId default `glass-card` (consistent с другими V10 компонентами); cleanup в test via `afterEach(cleanup)` — explicit, no globals dependency.
- Web: `:root:not([data-theme="liquid_glass"]) .root` fallback — solid `--poster-paper` surface обеспечивает Maximal Poster compat без impl branching.
- iOS: Material backing через `.background(_, in: shape)` modifier (iOS 16+ API) — не custom UIVisualEffectView wrapper; `.glassEffect()` upgrade deferred к Phase 53.
- iOS: inner border = LinearGradient stroke (top white opacity 0.2 → bottom 0.05) для light-catching effect; параметр `innerBorder=false` reduces stroke width to 0 (no allocation overhead).
