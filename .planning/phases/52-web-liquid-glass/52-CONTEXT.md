# Phase 52: Web Liquid Glass Port — Context

**Gathered:** 2026-05-11
**Status:** Complete
**Mode:** Auto-generated (autonomous v1.1.1).

## Phase Boundary

Apply Liquid Glass + iOS Default themes к existing 9 V10 screens БЕЗ переписи
.module.css каждого screen'а. Стратегия: theme-aware CSS overrides на root
attribute (`[data-theme="liquid_glass"]`) — переопределяют `--poster-*` CSS-vars
+ применяют `backdrop-filter` к surface classes globally.

## Implementation Decisions

- Single override stylesheet `frontend/src/stylesV10/liquid-glass.css` + minimal `ios-default.css`.
- Broad-stroke attribute selectors `[class*="plate"]`, `[class*="Card"]:not([class*="GlassCard"])` — touch ВСЕХ V10 plates без modify .module.css.
- GlassCard primitive (Phase 51) — exempted (own already-themed surface).
- Dark mode adaptive (`@media (prefers-color-scheme: dark)`) inside LG block — system-aware.
- prefers-reduced-motion — neutralizes animations under LG.
- Maximal Poster baselines preserved (default theme = maximal_poster — zero regression).

## Deferred (to Phase 55)

- LG-WEB-04 — pixel-snapshot baselines: defer к Phase 55 manual side-by-side acceptance. Browser-specific blur shader differences make Playwright determinism brittle.
- Per-screen fine-tuning visual polish (e.g. specific shadows на BigFig hero card) — TBD via manual QA Phase 55.
