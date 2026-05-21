# Phase 51: Liquid Glass Design System — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous v1.1.1 milestone).

## Phase Boundary

Liquid Glass design tokens (palette, materials, typography SF Pro, motion springs, radius)
+ GlassCard primitive (web + iOS) — foundational building blocks для Phase 52 (web port)
и Phase 53 (iOS native).

## Implementation Decisions

- LG tokens — emit-only под `[data-theme="liquid_glass"]` selector; default `:root` untouched
  (zero regression on Maximal Poster theme).
- Material blur values web-only (CSS `backdrop-filter`); iOS использует native
  `.ultraThinMaterial` / `.thinMaterial` / `.regularMaterial` / `.thickMaterial` (iOS 15+)
  с upgrade path до `.glassEffect()` API (iOS 26) в Phase 53.
- GlassCard primitive — minimal API (material / elevation / radius / innerBorder / onClick);
  no theme-aware fallback внутри компонента — outer `[data-theme]` selector управляет
  visual mode.
- iOS GlassCard использует SwiftUI Material (iOS 15+) — `.glassEffect()` upgrade отложен
  к Phase 53 после iOS 26 SDK availability check.

## Deferred (52-55 follow-ups not in scope)

- Web 9 V10 screens render под `[data-theme="liquid_glass"]` (Phase 52).
- iOS 5 component wrappers conditional на theme (Phase 53).
- Theme picker UI (Phase 54).
- Side-by-side acceptance + a11y + docs (Phase 55).
