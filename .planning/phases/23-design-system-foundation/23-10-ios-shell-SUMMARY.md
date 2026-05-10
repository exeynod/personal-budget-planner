---
phase: 23-design-system-foundation
plan: 10
subsystem: ios-design-system
tags: [design-system, ios, dual-shell, preview, swiftui]
requirements: [DS-07, DS-08]
dependency-graph:
  requires: [23-design-system-foundation/03, 23-design-system-foundation/06, 23-design-system-foundation/07, 23-design-system-foundation/08]
  provides: [V10MainShell, PreviewGallery, dual-shell-router]
  affects: [ios/BudgetPlanner/App/AppRouter.swift]
tech-stack:
  added: []
  patterns: ["@AppStorage validated string flag", "PosterNavStack root composition", "FlowLayout (SwiftUI Layout protocol) for chip wrapping"]
key-files:
  created:
    - ios/BudgetPlanner/App/V10MainShell.swift
    - ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift
  modified:
    - ios/BudgetPlanner/App/AppRouter.swift
decisions:
  - "Default ui.theme = v10 for new installs; existing iPhone Denis device retains v06 (per CONTEXT Area 4)"
  - "Self-heal corrupt UserDefaults values at launch via .task — write-once defence against tampering / schema drift"
  - "PreviewGallery owns its own activeTab/chipActive/sliderValue state — no DI required for DS preview"
  - "FlowLayout implemented inline (28 LOC) instead of pulling a 3rd-party WrappingHStack — minimal scope"
metrics:
  duration: "2m 29s"
  completed: "2026-05-10"
  tasks_completed: 3
  files_changed: 3
---

# Phase 23 Plan 10: iOS Shell Summary

iOS dual-shell router operational — `@AppStorage("ui.theme")` switches `AppRouter` between untouched v0.6 `MainShell` and new `V10MainShell { PosterNavStack { PreviewGallery() } }` exercising all 10 V10 components, 11 animations, ADR-002 nav-push proof, and PosterSheet drag-close (DS-07 + DS-08 acceptance gate).

## Files Touched

| File | LOC | Status | Commit |
| ---- | --: | ------ | ------ |
| `ios/BudgetPlanner/App/AppRouter.swift` | 41 | modified | `384937e` |
| `ios/BudgetPlanner/App/V10MainShell.swift` | 20 | created | `75dc873` |
| `ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` | 303 | created | `f8b9778` |

## AppRouter Diff

- Added `@AppStorage("ui.theme") private var themeRaw: String = "v10"`.
- Added validated computed `theme` property — only `"v06"` or `"v10"` pass through; everything else returns `"v10"`.
- `.authenticated` branch now switches: `theme == "v10" → V10MainShell()` else `MainShell()` (untouched).
- `.task` block self-heals `themeRaw` to `"v10"` if the stored value is anything other than the two allowed values, then runs `authStore.bootstrap()`.
- Existing branches (`bootstrapping`, `unauthenticated`, `error`, `onboardingRequired`) unchanged.

## V10MainShell

- 20 LOC (cap was 60).
- Renders `PosterTokens.Color.coral` background with `PosterNavStack { PreviewGallery() }` overlay.
- `.preferredColorScheme(.dark)` so SwiftUI defaults paper-on-coral text to light.
- Live `#Preview` injects an `AuthStore()` for symmetry with the BudgetPlanner root.

## PreviewGallery

- 10 sections: ADR-001 routing, BigFig count-up, Plate (5 tones), PosterButton (3 variants), Chips, PosterSlider, animation gallery, nav push, sheet, toast.
- Bottom-anchored `TabBar(active:dark:onFab:)` with `dark = true` — exercises FAB indirectly (TabBar embeds FAB centred).
- 11 `AnimationCell` entries; each cell rebuilds its target via `.id(fireKey)` so animations re-fire on every tap (matching web `/preview` re-render semantics).
- ADR-002 push proof: `PosterButton("Push test screen") { router?.push(SecondScreen()) }`. Second screen is a private `SecondScreen` view inside the same file painted in cobalt, with a `PosterButton("Pop back") { router?.pop() }`.
- `.posterSheet(isPresented: $sheetVisible)` modifier on the gallery root attaches the slide-up sheet — drag down >100pt or tap backdrop closes (PosterSheet semantics from Plan 23.08).
- ADR-001 row pairs `Mass("May", italic: true)` with `Mass("Май", italic: true)` — both routed through `posterMassItalic` → `PosterTokens.Font.ptSerifItalic` per ADR-001 pragmatic-fallback decision.
- `FlowLayout` implemented inline as a `Layout`-conforming struct — single-pass arrange + place; not production-grade but sufficient for chip wrapping in the gallery.

## Build Status

`cd ios && xcodegen generate && make build` exits 0:

```
Compiling PreviewGallery.swift
Compiling V10MainShell.swift
Compiling AppRouter.swift
Compiling BudgetPlannerApp.swift
Linking BudgetPlanner
Extract App Intents Metadata
Build Succeeded
```

No warnings emitted on the new files (warnings-as-errors is off in `project.yml`, but no warnings surfaced for the touched targets).

## Acceptance Criteria

- AppRouter: `@AppStorage("ui.theme")` present (1 hit) — `grep` confirmed.
- AppRouter: `V10MainShell()` referenced (1 hit) — confirmed.
- AppRouter: `MainShell()` v0.6 reference preserved (1 hit) — confirmed.
- AppRouter: validation pattern `themeRaw == "v06" || themeRaw == "v10"` present — confirmed.
- AppRouter: self-heal write `themeRaw = "v10"` present — confirmed.
- V10MainShell: file exists, 20 LOC ≤ 60 cap.
- V10MainShell: `struct V10MainShell: View`, `PosterNavStack`, `PreviewGallery` references present.
- PreviewGallery: file exists, 303 LOC.
- PreviewGallery: 10 component identifiers grep-count = 35 (≥12 cap satisfied).
- PreviewGallery: 11 animation-name grep-count = 28 (≥11 cap satisfied; multiple cells reference each name + the AnimTarget switch internals).
- PreviewGallery: `router?.push(SecondScreen())` present (DS-07 nav push proof).
- PreviewGallery: `.posterSheet(isPresented:` present (DS-07 sheet proof).
- PreviewGallery: `"Май"` and `"May"` both present (ADR-001 routing demo).
- Build: `make build` exits 0.
- Final cross-grep: `grep -l '@AppStorage("ui.theme")' App/*.swift FeaturesV10/*.swift` returns `App/AppRouter.swift`.

## Deviations from Plan

None. Plan executed exactly as written.

The only minor textual adjustments versus the literal plan listing were:
- Changed `.scaleEffect(scaleX, anchor: .leading)` (single-axis, ambiguous overload) to `.scaleEffect(x: scaleX, y: 1, anchor: .leading)` in `AnimTarget` for unambiguous SwiftUI signature resolution. Same behaviour.
- Added `.foregroundColor(PosterTokens.Color.paper)` to the ADR-001 explanatory `Text(...)` so the body text is legible on the coral V10 background (without it, default text colour falls back to system label which is unreadable on coral). Trivial readability fix; not a deviation rule trigger.
- `section(_:_:)` helper signature: changed `@ViewBuilder _ content: () -> some View` to a generic `<Content: View>(... @ViewBuilder _ content: () -> Content)` because `some View` in a generic-helper return-position requires the parameter to also be a known concrete `Content` for SwiftUI's `@ViewBuilder` chaining (the "primary associated type" inference on `some` parameters is restrictive in some Swift compiler versions). Identical runtime behaviour.

## DS-07 / DS-08 Coverage

- **DS-08 iOS shell switch**: `@AppStorage("ui.theme")` flag plumbed through `AppRouter`; v06 retains existing `MainShell`, v10 boots `V10MainShell`. Default for new installs = `"v10"`.
- **DS-07 reachability**: `PreviewGallery` exercises both the `PosterNavStack` push API (forward transition) via `router?.push(SecondScreen())` plus the `PosterSheet` drag-close modifier. Manual swipe-back testing covered by Plan 23.14 acceptance gate.

## Verification (still TODO — Phase 28)

The plan's `<verification>` block lists three simulator-level scenarios that require booting the simulator and tapping through the gallery (push test, sheet drag-close, defaults override of `ui.theme`). Build is green; visual + interaction verification will be folded into Phase 28 acceptance.

## Self-Check: PASSED

- `ios/BudgetPlanner/App/AppRouter.swift` — FOUND
- `ios/BudgetPlanner/App/V10MainShell.swift` — FOUND
- `ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` — FOUND
- `ios/.planning/phases/23-design-system-foundation/23-10-ios-shell-SUMMARY.md` — FOUND (this file)
- Commit `384937e` — FOUND in `git log`
- Commit `75dc873` — FOUND in `git log`
- Commit `f8b9778` — FOUND in `git log`
- `make build` exit 0 — confirmed in build log
