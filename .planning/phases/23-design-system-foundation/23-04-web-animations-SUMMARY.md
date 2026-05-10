---
phase: 23-design-system-foundation
plan: 04
subsystem: web/design-system
tags: [design-system, animations, web, reduce-motion, css]
requires:
  - 23-design-system-foundation/01 (tokens.css with --poster-easing-* vars)
  - 23-design-system-foundation/02 (fonts.css for component context, not directly consumed)
provides:
  - frontend/src/stylesV10/animations.css
  - 11 named @keyframes + utility classes for opt-in usage
  - prefers-reduced-motion media query reducing all animations to opacity-only
affects:
  - 23-design-system-foundation/05 (web components — consume utility classes via className)
  - 23-design-system-foundation/09 (web shell + preview — gallery showcases all 11)
  - 23-design-system-foundation/11 (web smoke test — Playwright reduce-motion assertion)
tech-stack:
  added: []
  patterns:
    - "Pure CSS keyframes (no JS animation runtime)"
    - "Class-selector opt-in (.poster-row-in instead of inline style attribute)"
    - "Media-query-driven reduce-motion (re-declared @keyframes inside @media block)"
key-files:
  created:
    - frontend/src/stylesV10/animations.css
  modified: []
decisions:
  - "Standardize posterRowIn on 0.45s (not 0.42s) for utility class — DESIGN-SYSTEM range was 0.42–0.45s, prototype uses both; Plan 23.05 components needing 0.42s override via inline style"
  - "Inline literal cubic-bezier values inside @keyframes blocks (not var(--poster-easing-*)); CSS spec disallows custom properties in timing-function position inside keyframe rules. Inside `animation:` shorthand vars work, but for line-by-line traceability with DESIGN-SYSTEM.md §7.2 we use literals everywhere"
  - "Reduce-motion strategy: re-declare @keyframes with same names inside @media (prefers-reduced-motion: reduce) — overrides original keyframes via cascade, so existing animation: shorthand references resolve to no-motion variants automatically"
  - "Added belt-and-suspenders override for .poster-check inside reduce-motion (animation: none + stroke-dashoffset: 0) — extends plan's spec for stronger guarantee"
metrics:
  duration: "1m 14s"
  completed: "2026-05-10"
  tasks_completed: 1
  files_created: 1
  loc: 180
---

# Phase 23 Plan 04: Web Animations Summary

**One-liner:** 11 keyframe animations (posterRowIn/RiseIn/BarFill/TabPop/PopIn/Check/Dot/SlideInFwd/SlideInBack/TabSwap/ToastIn) defined in `animations.css` with exact durations + cubic-bezier curves from DESIGN-SYSTEM.md §7.2, plus class-selector utilities and `prefers-reduced-motion` media query reducing all to opacity-only fades.

## What Shipped

`frontend/src/stylesV10/animations.css` (180 LOC) containing:

1. **11 top-level `@keyframes` rules** — durations and easing curves match DESIGN-SYSTEM.md §7.2 and prototype/poster-screens.jsx line-by-line.
2. **11 utility classes** (`.poster-row-in`, `.poster-rise-in`, `.poster-bar-fill`, `.poster-tab-pop`, `.poster-pop-in`, `.poster-check`, `.poster-dot`, `.poster-slide-in-fwd`, `.poster-slide-in-back`, `.poster-tab-swap`, `.poster-toast-in`) — components in Plan 23.05 will opt in via className.
3. **`@media (prefers-reduced-motion: reduce)` block** — re-declares all 11 keyframes as opacity-only fades, sets duration to 0.2s linear for entry animations, disables transforms entirely for `.poster-bar-fill`, `.poster-tab-pop`, `.poster-dot`, `.poster-check`.

## Animation Inventory

Each animation committed with the (duration, easing) tuple from canonical sources:

| # | Name | Duration | Easing | Source |
|---|------|----------|--------|--------|
| 1 | posterRowIn | 0.45s | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | poster-screens.jsx L261 |
| 2 | posterRiseIn | 0.55s | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | DESIGN-SYSTEM §7.2 (range 0.5–0.65s, midpoint chosen) |
| 3 | posterBarFill | 0.7s | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | poster-screens.jsx L285 |
| 4 | posterTabPop | 0.45s | cubic-bezier(0.34, 1.56, 0.64, 1) overshoot | poster-screens.jsx L141 |
| 5 | posterPopIn | 0.5s | cubic-bezier(0.34, 1.56, 0.64, 1) overshoot | DESIGN-SYSTEM §7.2 reserved spec |
| 6 | posterCheck | 0.35s + 0.12s delay | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | DESIGN-SYSTEM §7.2 |
| 7 | posterDot | 1.2s infinite | ease-in-out | poster-screens.jsx L478 |
| 8 | posterSlideInFwd | 0.42s | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | DESIGN-SYSTEM §7.2 (28px translate3d) |
| 9 | posterSlideInBack | 0.42s | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | DESIGN-SYSTEM §7.2 (-28px translate3d) |
| 10 | posterTabSwap | 0.35s | cubic-bezier(0.22, 0.61, 0.36, 1) easeOut | DESIGN-SYSTEM §7.2 |
| 11 | posterToastIn | 0.5s | cubic-bezier(0.34, 1.56, 0.64, 1) overshoot | DESIGN-SYSTEM §7.2 |

## Acceptance Gate Results

| Gate | Expected | Got | Pass |
|------|----------|-----|------|
| `test -f animations.css` | exists | OK | yes |
| `grep -c '^@keyframes poster'` | 11 | 11 | yes |
| `grep -c '@keyframes poster'` (incl reduce-motion) | 22 | 22 | yes |
| Unique keyframe names | 11 | 11 | yes |
| easeOut occurrences | ≥6 | 8 | yes |
| overshoot occurrences | ≥3 | 4 | yes |
| `prefers-reduced-motion` block | ≥1 | 2 (block + comment) | yes |
| `translate3d(28px, 0, 0)` | 1 | 1 | yes |
| `translate3d(-28px, 0, 0)` | 1 | 1 | yes |
| `stroke-dashoffset: 24` | ≥1 | 2 | yes |
| `.poster-` selector count | ≥22 | 23 | yes |
| File LOC bounds (100–300) | in range | 180 | yes |
| `vite build --mode development` | no errors | clean (274ms, zero warnings) | yes |

## Reduce-Motion Verification

The `@media (prefers-reduced-motion: reduce)` block:

- Re-declares all 11 `@keyframes` so any element using `animation: posterFoo ...` automatically resolves to opacity-only fade — no transforms execute even if components forget to add a class guard.
- For utility classes, applies `animation-duration: 0.2s !important; animation-timing-function: linear !important;` to neutralize overshoot curves.
- For `.poster-bar-fill`: `transform: scaleX(1) !important; animation: none !important;` — bar appears instantly filled, skipping the 700ms scale animation entirely.
- For `.poster-tab-pop`, `.poster-dot`: `animation: none !important;` — disables decorative loops/pops outright.
- For `.poster-check`: `stroke-dashoffset: 0 !important; animation: none !important;` — checkmark renders fully drawn instantly.

Manual Playwright verification deferred to Plan 23.11 (`page.emulateMedia({ reducedMotion: 'reduce' })` + `toHaveScreenshot`).

## Deviations from Plan

### Auto-added overrides (Rule 2 — accessibility correctness)

**1. [Rule 2 - A11y] Added explicit `.poster-check` reduce-motion override**
- **Found during:** Task 1 implementation
- **Issue:** Plan's reduce-motion block included re-declared `posterCheck` keyframe (stroke-dashoffset: 0 → 0) but did not add a class-level rule for `.poster-check`. Without it, the SVG path would still apply `stroke-dashoffset: 24` from the base `.poster-check` style and stay invisible until the (now-no-op) animation "completed" at frame 0.
- **Fix:** Added `.poster-check { stroke-dashoffset: 0 !important; animation: none !important; }` inside the reduce-motion block so the checkmark renders fully drawn immediately for users with reduce-motion enabled.
- **Files modified:** frontend/src/stylesV10/animations.css
- **Commit:** 1af42be

No other deviations from plan spec.

## Threat Surface Scan

No new endpoints, auth paths, or trust boundaries introduced. Pure CSS file — same threat surface as plan's `<threat_model>` section. T-23-04-02 (DoS via posterDot infinite loop) mitigated by reduce-motion override that sets `animation: none` for `.poster-dot`. No additional threat flags.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: frontend/src/stylesV10/animations.css (180 LOC)
- FOUND commit: 1af42be (`feat(23-04): add 11 poster keyframe animations + reduce-motion overrides`)
- All acceptance grep gates pass (table above)
- Vite build succeeds with zero errors/warnings
- All 11 unique keyframe names verified (top-level + reduce-motion override)

## Next

- Plan 23.05 will consume `.poster-row-in`, `.poster-bar-fill`, `.poster-toast-in`, `.poster-tab-pop` utility classes from componentsV10/ (Plate, TabBar, Toast, list rows).
- Plan 23.11 (web smoke test) will run Playwright with `reducedMotion: 'reduce'` and assert no transform-based animation fires.
