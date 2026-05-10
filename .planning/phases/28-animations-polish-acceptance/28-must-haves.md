# Phase 28 — Must-Haves (Goal-Backward)

**Phase Goal (from ROADMAP):** Финализация v1.0 — все 11 keyframe-анимаций работают точно по spec на каждом экране (web + iOS), accessibility audit (VoiceOver, edge-swipe label, UPPERCASE letter-by-letter override) пройден, pixel-perfect side-by-side QA каждого экрана через Playwright `toHaveScreenshot()` (web) и manual XcodeBuildMCP (iOS) выполнен с `DIVERGENCES.md`, performance целевые (Lighthouse mobile > 90, LCP < 2.5s, woff2 < 200kB gzipped, count-up first paint < 1.5s), migration safety + acceptance §14 ТЗ подтверждены.

**Phase character:** AUDIT + POLISH + ACCEPTANCE — не build phase. Большинство артефактов уже существуют (animations.css полный с reduce-motion overrides; PosterAnimations.swift с posterAnimation/posterTransition modifiers). Phase 28 проверяет применение, фиксирует пробелы малыми правками, документирует.

---

## Observable Truths

1. **POL-01/POL-02 (web).** Каждый V10-экран применяет ≥ одну `.poster-*` утилиту из `stylesV10/animations.css` где это уместно по DESIGN-SYSTEM §7.4 (rows: stagger 0.045s, day-groups 0.07s, hints 0.08s, regulars 0.09s; toast: top:64 + 1700ms life; FAB: scale(0.88) rotate(-90deg) на press; tab bar: 5 cols 1fr 1fr 64px 1fr 1fr + sliding indicator 350ms sheetEase). Проверяется grep-аудитом + автоматическим тестом.
2. **POL-01/POL-02 (iOS).** Каждый V10-экран применяет `PosterAnimations.*` через `.posterAnimation()` или `.posterTransition()` modifier (НЕ голый `.animation()`) для ключевых entry-анимаций. Проверяется grep-аудитом.
3. **POL-03 (web).** При `prefers-reduced-motion: reduce` все 11 keyframes редуцируются до opacity-only (overrides УЖЕ в animations.css:138-180); UPPERCASE+letter-spacing 0.18em элементы имеют корректный `aria-label` либо обычный text-content при letter-spacing≤0.18em (нет letter-by-letter VoiceOver-ломки). Проверяется Playwright media-emulate test + grep aria.
4. **POL-03 (iOS).** Все custom-анимации проходят через `posterAnimation`/`posterTransition` (которые честят `accessibilityReduceMotion`); `PosterEdgeSwipe` имеет `.accessibilityLabel("Назад") + .accessibilityAddTraits(.isButton)` (DS-07). Проверяется grep + одна XCTest на reduce-motion fallback.
5. **POL-04 (web).** Playwright `toHaveScreenshot()` снапшоты для 8 ключевых V10-экранов (Home, Transactions, AddSheet, CategoryDetail, PlanMonth, Subscriptions, Savings, AI initial-state) сохранены под `frontend/tests/e2e/__screenshots__/v10-pixel/`; повторный run проходит зелёным.
6. **POL-04 (iOS).** `.planning/v1.0-handoff/DIVERGENCES.md` создан и описывает известные расхождения от `prototype/index.html`: dual-font cyrillic fallback (ADR-001), iOS safe-area, посекундные различия easing (SwiftUI spring vs CSS cubic-bezier), edge-swipe gesture (UIKit vs CSS). Содержит manual screenshot-checklist для acceptance.
7. **POL-05.** Web prod build (`npm run build`) проходит; bundle-size raw output измерен и зафиксирован в `28-perf-report.md`; woff2 gzipped ≤ 200kB суммарно; Lighthouse-CLI run → score ≥ 90 для mobile/performance ИЛИ задокументированный fallback (proxy через bundle-size + manual smoke). Целевая `Home count-up < 1.5s` подтверждена manual measurement в reporting MD.
8. **POL-06.** `Makefile` target `hidden-unicode-grep` существует и greps U+00AD / U+200B / U+200C / U+200D / U+FEFF в `frontend/src ios/BudgetPlanner app`; exit non-zero на находку. Migration round-trip script `scripts/alembic-roundtrip.sh` (или make target `migration-roundtrip`) выполняет `upgrade head → downgrade -1 → upgrade head` без ошибок на dev-стэке. Существующий integration test `tests/test_multitenancy_v1_0_columns.py` (если есть; иначе создаётся минимальный) проходит зелёным.
9. **POL-07.** Cross-cutting Playwright e2e test `v10-acceptance-tz14.spec.ts` покрывает счастливый путь §14 ТЗ: onboarding (4 шага → submit < 60s wall-clock в test) → Home рендерит дневной темп с count-up → FAB → AddSheet → save → toast → Transactions показывает запись → PLAN меняет лимит и сохраняет → AI initial-state показывает observation + 4 chips → Savings показывает накопления + цели. Один test green = §14 ТЗ accepted.

---

## Required Artifacts

### Audit / Polish (Plan 28-01 web, 28-02 iOS)

- `frontend/tests/e2e/v10-animations-audit.spec.ts` — программный grep-style тест проходит по экранам и проверяет наличие `.poster-row-in` / stagger inline styles / Toast top:64 + life 1700ms.
- `frontend/src/stylesV10/animations.css` — без изменений (reduce-motion overrides уже есть); если grep вскроет пробел в применении — small inline patch на затронутых `.module.css`.
- `ios/BudgetPlannerTests/PosterAnimationsAuditTests.swift` — XCTest проверяет, что `PosterAnimations` экспортирует все 11 expected curves + reduce-motion modifier работает.
- `ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` — patch (если grep покажет отсутствие) для добавления `.accessibilityLabel("Назад")` + `.accessibilityAddTraits(.isButton)`.

### Pixel Snapshots (Plan 28-03)

- `frontend/tests/e2e/v10-pixel-snapshots.spec.ts` — Playwright spec, 8 snapshot tests с `await expect(page).toHaveScreenshot(...)`.
- `frontend/tests/e2e/__screenshots__/v10-pixel/*.png` — baseline-снапшоты, committed.
- `.planning/v1.0-handoff/DIVERGENCES.md` — список известных divergences от prototype + manual iOS screenshot-checklist; ссылается на ADR-001/-002.

### Performance (Plan 28-04)

- `Makefile` target `perf-report` — `npm --prefix frontend run build` + bundle output capture.
- `.planning/phases/28-animations-polish-acceptance/28-perf-report.md` — bundle sizes, woff2 sum, Lighthouse output (если CLI работает) или manual measurement summary, Home count-up wall-clock на dev.

### Safety + Acceptance (Plan 28-05)

- `Makefile` target `hidden-unicode-grep` — greps 5 hidden codepoints; exits 1 на находку.
- `scripts/alembic-roundtrip.sh` (либо `make migration-roundtrip` цель) — runs upgrade head → downgrade -1 → upgrade head через docker-compose.
- `frontend/tests/e2e/v10-acceptance-tz14.spec.ts` — §14 happy-path E2E.

---

## Key Links

- `frontend/tests/e2e/*.spec.ts` ← `playwright.config.ts` (existing webServer config; reused).
- `Makefile` ← project root, currently has `tokens-check`; add `hidden-unicode-grep`, `perf-report`, `migration-roundtrip` (в `.PHONY`).
- `DIVERGENCES.md` ← refs `prototype/index.html`, `ADR-001`, `ADR-002`, `28-perf-report.md`.
- `v10-acceptance-tz14.spec.ts` ← reuses existing onboarding flow (Phase 24), AddSheet (Phase 25), PLAN (Phase 26), AI/Savings (Phase 27).

---

## Plan Sketch (5 plans, 1 wave)

Все плана можно гнать параллельно — file-ownership не пересекается. Все `autonomous: true` за исключением 28-04 (содержит `checkpoint:human-verify` для Lighthouse-результата).

| # | Plan | REQs | Tasks | Files |
|---|------|------|-------|-------|
| 28-01 | Web animations + a11y audit + Playwright reduce-motion test | POL-01 (web), POL-02 (web), POL-03 (web) | 2 | `frontend/tests/e2e/v10-animations-audit.spec.ts`, optional `.module.css` patches |
| 28-02 | iOS animations + a11y audit + edge-swipe a11y patch + reduce-motion XCTest | POL-01 (iOS), POL-02 (iOS), POL-03 (iOS) | 2 | `ios/BudgetPlannerTests/PosterAnimationsAuditTests.swift`, `ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` (patch), optional view patches |
| 28-03 | Pixel-perfect snapshots (web Playwright) + DIVERGENCES.md (web + iOS hybrid) | POL-04 (web), POL-04 (iOS) | 2 | `frontend/tests/e2e/v10-pixel-snapshots.spec.ts`, `__screenshots__/v10-pixel/`, `.planning/v1.0-handoff/DIVERGENCES.md` |
| 28-04 | Performance audit (bundle + Lighthouse + count-up) | POL-05 | 2 (1 auto + 1 checkpoint:human-verify for Lighthouse + Home count-up) | `Makefile`, `.planning/phases/28-animations-polish-acceptance/28-perf-report.md` |
| 28-05 | Migration safety + hidden-unicode + §14 ТЗ E2E | POL-06, POL-07 | 3 | `Makefile`, `scripts/alembic-roundtrip.sh`, `frontend/tests/e2e/v10-acceptance-tz14.spec.ts` |

**Wave 1:** all 5 plans (no inter-plan dependencies; file ownership disjoint).
