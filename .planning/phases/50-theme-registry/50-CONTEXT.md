# Phase 50: Theme Registry Foundation — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous v1.1.1 milestone).

## Phase Boundary

Multi-theme infrastructure: tokens.json расширен с per-theme overrides + codegen
emit'ит CSS-vars под `[data-theme="X"]` + Swift `Theme` enum. React `useTheme()`
hook (mirror useHomeColor pattern) + iOS `@AppStorage("ui.theme")` env binding.

## Implementation Decisions

- 3 темы: `maximal_poster` (default, current) / `liquid_glass` (new) / `ios_default` (v0.6 wise-tide baseline).
- Storage key `ui.theme` (consistent web + iOS).
- Web: `[data-theme="X"]` CSS-var swap; iOS: `@AppStorage` SwiftUI binding + environment injection.
- Codegen `scripts/gen-tokens.ts` extended — additive: existing tokens — maximal_poster defaults; new `themes.{liquid_glass,ios_default}` секции — overrides только.
- Bootstrap hydration в `main.tsx` (раннее чем React mount) для anti-flash.

## Deferred (50-02..05 follow-ups not in scope)

- Web GlassCard primitive (Phase 51).
- iOS GlassCard SwiftUI view (Phase 53).
- Theme picker UI (Phase 54).
