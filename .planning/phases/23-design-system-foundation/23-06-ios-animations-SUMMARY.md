---
phase: 23-design-system-foundation
plan: 06
subsystem: ui
tags: [design-system, animations, ios, swiftui, reduce-motion, accessibility]

# Dependency graph
requires:
  - phase: 23-design-system-foundation/01
    provides: PosterTokens.Easing.{easeOut,overshoot,sheetEase}Control cubic-bezier control points
  - phase: 23-design-system-foundation/03
    provides: iOS Fonts pipeline (Resources/Fonts) — unchanged but lives in same target
  - phase: 23-design-system-foundation/04
    provides: animations.css — durations + cubic-bezier reference for iOS parity
provides:
  - SwiftUI `PosterAnimations` namespace with 11 named animation analogs of web keyframes
  - 3 easing helper functions (easeOut/overshoot/sheetEase) wrapping `Animation.timingCurve` over PosterTokens.Easing
  - 4 stagger helpers (rowStagger / dayGroupStagger / hintStagger / regularStagger)
  - `View.posterAnimation(_:value:reduceMotionFallback:)` modifier — DS-05 reduce-motion-aware
  - `View.posterTransition(_:)` modifier — DS-05 reduce-motion-aware
  - `slideInFwdTransition()` / `slideInBackTransition()` AnyTransition factories for PosterNavStack
affects: [23-07-components, 23-08-ios-navstack, 23-09-ios-shell, 24-onboarding, 25-home, 26-plan, 27-ai-savings]

# Tech tracking
tech-stack:
  added: []  # No new libraries — pure SwiftUI standard surface (Animation, ViewModifier, @Environment)
  patterns:
    - "Component animations: always via .posterAnimation(_:value:) (NEVER bare .animation)"
    - "Component transitions: always via .posterTransition(_:) (NEVER bare .transition)"
    - "Cubic-bezier control points centralized in PosterTokens.Easing — no literals in PosterAnimations"
    - "SwiftUI spring approximation for keyframe overshoot at posterTabPop (response 0.45 / damping 0.55)"

key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift
  modified: []

key-decisions:
  - "Spring approximation for posterTabPop (response 0.45, dampingFraction 0.55) — closest SwiftUI primitive to web overshoot 1.35× scale at 35% progress; Phase 28 polish may tune"
  - "Reduce-motion fallback = .easeOut(duration: 0.2) by default; per-call override available via reduceMotionFallback: parameter"
  - "Double-cast each PosterTokens.Easing tuple component before passing to .timingCurve — defensive against codegen tuple inferring `1` as Int (would otherwise fail to satisfy Double param)"
  - "posterCheck applied to Path.trim(from:to:) animatable values (not stroke-dashoffset) — SwiftUI-idiomatic equivalent"
  - "Stagger formulas mirrored exactly from DESIGN-SYSTEM §7.4 web spec — rows / dayGroups / hints / regulars"

patterns-established:
  - "Animation namespace pattern: enum PosterAnimations { static func/var } — discoverable via PosterAnimations. autocomplete"
  - "ViewModifier+Environment pattern for accessibility short-circuiting (PosterAnimationModifier / PosterTransitionModifier)"

requirements-completed: [DS-04, DS-05]

# Metrics
duration: 7min
completed: 2026-05-10
---

# Phase 23 Plan 06: iOS Animations Summary

**`PosterAnimations.swift` — 11 SwiftUI animation analogs of the web poster keyframes, sourced from `PosterTokens.Easing` cubic-bezier control points, plus reduce-motion-aware view-modifier wrappers (`posterAnimation` / `posterTransition`).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-10T08:34:00Z
- **Completed:** 2026-05-10T08:41:29Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- 11 SwiftUI `Animation` analogs implemented with web-parity durations + cubic-bezier curves
- 3 easing helpers (`easeOut(_:)` / `overshoot(_:)` / `sheetEase(_:)`) routing through `PosterTokens.Easing.*Control` from codegen
- 4 stagger helpers exposing the exact §7.4 stagger formulas to component code
- DS-05 honored via two view modifiers — `posterAnimation` and `posterTransition` — both fall back to opacity-only fade when `accessibilityReduceMotion` is true
- iOS app builds cleanly (`make generate && make build` — Build Succeeded) with no warnings on the new file

## Task Commits

1. **Task 1: Implement PosterAnimations.swift with 11 animations + reduce-motion guard** — `792c4a0` (feat)

## Animation Inventory

| # | Constant | Duration | Easing | Web counterpart |
|---|----------|----------|--------|-----------------|
| 1 | `posterRowIn(delay:)` | 0.45s | easeOut (PosterTokens) | `posterRowIn` |
| 2 | `posterRiseIn(delay:)` | 0.55s | easeOut | `posterRiseIn` |
| 3 | `posterBarFill(delay:duration:)` | 0.7s (default) | easeOut | `posterBarFill` |
| 4 | `posterTabPop` | spring response 0.45 | dampingFraction 0.55 | `posterTabPop` (overshoot keyframe) |
| 5 | `posterPopIn(delay:)` | 0.5s | overshoot | `posterPopIn` |
| 6 | `posterCheck` | 0.35s + 0.12s delay | easeOut | `posterCheck` (SVG stroke) |
| 7 | `posterDot` | 1.2s, repeats forever | easeInOut | `posterDot` |
| 8 | `posterSlide` + `slideInFwdTransition()` | 0.42s | easeOut | `posterSlideInFwd` |
| 9 | `posterSlide` + `slideInBackTransition()` | 0.42s | easeOut | `posterSlideInBack` |
| 10 | `posterTabSwap` | 0.35s | easeOut | `posterTabSwap` |
| 11 | `posterToastIn` | 0.5s | overshoot | `posterToastIn` |

Stagger helpers: `rowStagger(i:)` (0.08 + i·0.045), `dayGroupStagger(i:)` (0.05 + i·0.07), `hintStagger(i:)` (0.18 + i·0.08), `regularStagger(i:)` (0.32 + i·0.09). Per-dot phase: `dotPhase(i:)` (i·0.18). Toast life: `toastLifeMs = 1700`.

## Files Created/Modified

- `ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` — 148 LOC; exposes the `PosterAnimations` namespace, two `View` extensions, and two private `ViewModifier` types

## Decisions Made

See `key-decisions` frontmatter — main calls:
- Spring approximation for `posterTabPop` (web keyframe → SwiftUI primitive map)
- Default reduce-motion fallback = `.easeOut(0.2)`, overridable per call site
- Defensive `Double(_:)` cast for `PosterTokens.Easing` tuple components

## Deviations from Plan

None — plan executed exactly as written.

The PLAN's reference snippet allowed for Double inference quirks in the codegen tuple; I added explicit `Double()` casts on each `c.c0x/c0y/c1x/c1y` access in the easing helpers as defensive coding (no behavior change vs. plan, just safer against future Int-vs-Double codegen output). Documented in `key-decisions`.

## Issues Encountered

None. The build succeeded on the first attempt after `xcodegen generate`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 23.07 (V10 components) can now wire `.posterAnimation(PosterAnimations.posterRowIn(delay: PosterAnimations.rowStagger(i: index)), value: appearTrigger)` directly on rows, plates, hints, etc.
- Plan 23.08 (`PosterNavStack`) can use `slideInFwdTransition()` / `slideInBackTransition()` + `posterSlide` directly.
- DS-04 + DS-05 acceptance gates ready for Phase 28 verification (PreviewGallery exercise of all 11 animations under both motion modes).

---
*Phase: 23-design-system-foundation*
*Completed: 2026-05-10*

## Self-Check: PASSED

- `ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` — FOUND
- `.planning/phases/23-design-system-foundation/23-06-ios-animations-SUMMARY.md` — FOUND
- Task commit `792c4a0` — FOUND in git log
