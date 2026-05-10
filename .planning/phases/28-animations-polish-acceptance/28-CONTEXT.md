# Phase 28: Animations Polish + Acceptance — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — ROADMAP success_criteria + REQUIREMENTS used as spec).

<domain>
## Phase Boundary

Финализация v1.0 — НЕ build phase, а audit + polish + acceptance:

1. **POL-01** — все 11 keyframe-анимаций работают per spec (web + iOS), stagger-индексы соответствуют DESIGN-SYSTEM §7.4
2. **POL-02** — tab bar grid (5 cols), FAB scale, Toast life, sheet ease — pixel-correct timings
3. **POL-03** — accessibility: prefers-reduced-motion, VoiceOver labels, edge-swipe-back label
4. **POL-04** — pixel-perfect side-by-side QA через Playwright toHaveScreenshot (web) + manual Xcode screenshots (iOS); `DIVERGENCES.md`
5. **POL-05** — performance: Home count-up < 1.5s, Lighthouse > 90, LCP < 2.5s, woff2 < 200kB gzipped
6. **POL-06** — migration safety: alembic round-trip; multitenancy integration test; hidden-unicode CI-check
7. **POL-07** — acceptance §14 ТЗ: onboarding < 60s, Home count-up, Add Sheet один тап, PLAN меняет лимиты, AI initial state, Копилка с целями, нет FOUT после первого визита

</domain>

<decisions>
## Implementation Decisions

### Locked from Phase 25/26/27 patterns
- **Animations**: уже существуют как CSS keyframes (web) + SwiftUI .animation() (iOS). Phase 28 — audit что они применяются, не переписывает их.
- **Reduced-motion**: добавить `@media (prefers-reduced-motion: reduce)` overrides в `frontend/src/styles/animations.css` (или аналог); iOS — `@Environment(\.accessibilityReduceMotion)`.
- **Pixel-perfect QA**: Playwright `expect(page).toHaveScreenshot()` для каждого V10 экрана с reference snapshots в `frontend/tests/e2e/__screenshots__/`.
- **Performance**: Lighthouse CI или manual run.
- **Migration safety**: bash script `make migration-roundtrip` или GitHub Actions step.

### Open implementation choices (Claude's discretion)
- **Animations audit**: для POL-01/02 — single web plan + single iOS plan, проверка через grep в codebase + manual visual sanity check (logged в SUMMARY).
- **A11y plan**: single web+iOS plan (POL-03), reduced-motion CSS overrides + аудит aria-labels.
- **Pixel QA plan**: web Playwright snapshots (POL-04), iOS Xcode screenshots manual в DIVERGENCES.md. May skip iOS visual QA в favor of audit checklist.
- **Performance plan**: Lighthouse run + bundle size measurement (POL-05), документировано.
- **Migration safety**: backend script + integration test (POL-06).
- **Acceptance §14**: cross-cutting checklist plan, run E2E happy paths (POL-07).

### Plan structure recommendation
- 28-01: web animations + reduced-motion CSS overrides (POL-01 web, POL-03 web)
- 28-02: iOS animations + reduced-motion (POL-01 iOS, POL-03 iOS)
- 28-03: Playwright pixel-perfect screenshot tests for V10 screens (POL-04 web)
- 28-04: iOS DIVERGENCES.md + manual screenshot audit (POL-04 iOS)
- 28-05: Performance audit (Lighthouse + bundle size) — POL-05
- 28-06: Migration safety + hidden-unicode check + acceptance E2E (POL-06 + POL-07)

</decisions>

<code_context>
- Animation keyframes likely in `frontend/src/styles/animations.css` or per-screen `.module.css` files.
- Playwright config: `frontend/playwright.config.ts`; spec dir `frontend/tests/e2e/`.
- Existing Phase 25 spec: `frontend/tests/e2e/v10-phase25-acceptance.spec.ts`.
- iOS animations: `posterDot`, `posterRowIn`, `posterBarFill` likely in feature views as SwiftUI `.animation()`.
- alembic: `alembic upgrade head` / `alembic downgrade -1` from project root.
- bundle sizing: `npm run build` output already shows gzipped sizes.
</code_context>

<specifics>
## Specific Ideas

- POL-04 iOS visual QA may be deferred to manual user QA — document in plan as «human verification required, не auto-fail».
- POL-05 Lighthouse: run `npx lighthouse http://localhost:5173 --only-categories=performance` или skip + document target met based on bundle size proxy.
- POL-06 hidden-unicode: add `Makefile` target `hidden-unicode-grep` that greps for U+00AD / U+200B / U+200C / U+200D / U+FEFF in the repo and exits non-zero if found.

</specifics>

<deferred>
## Deferred Ideas

- Production deployment polish → outside Phase 28
- Analytics dashboard for performance metrics → v1.1
- A11y full WCAG audit → v1.1 (Phase 28 covers minimum: reduced-motion + aria labels)

</deferred>
