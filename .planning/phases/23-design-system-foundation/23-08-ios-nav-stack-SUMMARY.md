---
phase: 23-design-system-foundation
plan: 08
subsystem: ios-design-system
tags: [design-system, ios, navigation, swiftui, accessibility]
requirements_completed: [DS-07]
dependency_graph:
  requires:
    - 23-design-system-foundation/06  # PosterAnimations.posterSlide / sheetEase + posterAnimation()/posterTransition()
    - 23-design-system-foundation/07  # PosterTokens.Color.paper for sheet background
  provides:
    - PosterRouter (@Observable nav-stack router)
    - PosterNavStack<Root> ZStack composition with asymmetric transitions
    - AnyTransition.posterAsymmetricSlide(direction:)
    - PosterEdgeSwipe / posterEdgeSwipeBack(enabled:onSwipeBack:)
    - PosterSheet / posterSheet(isPresented:content:)
  affects:
    - V10MainShell (Phase 23-10) — will own a PosterRouter and host PosterNavStack
    - Phase 25-onwards — push/pop call sites
tech-stack:
  added:
    - "@Observable (Observation) — iOS 17+"
    - UIKit interop via UIViewRepresentable
    - UIScreenEdgePanGestureRecognizer
  patterns:
    - "PosterNavEntry uses AnyView for heterogeneous screens (CONTEXT Area 3 decision)"
    - "Asymmetric transition driven by router.direction"
    - "All animations gated by posterAnimation()/posterTransition() so reduce-motion is respected"
key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift  # 57 LOC
    - ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift  # 44 LOC
    - ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift  # 80 LOC
    - ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift  # 50 LOC
    - ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift  # 81 LOC
  modified: []
decisions:
  - "AnyView per stack entry — heterogeneous screens, simpler than enum-based dispatch."
  - "Two PosterNavStack inits: owning (fresh router) and borrowed (router lives in V10MainShell)."
  - "Edge-swipe area is overlay-leading 24pt strip (allowsHitTesting only when canPop)."
  - "PosterSheet backdrop and sheet receive separate zIndex (10 / 20) so transition layers compose correctly."
  - "Drag-to-close velocity computed as (predictedEndTranslation.height − translation.height); >800 OR translation>100pt closes (CONTEXT Area 3 spec)."
  - "28pt translate3d nuance from ADR-002 deferred — SwiftUI .move(edge:) uses full-width offset; Phase 28 polish may tune via custom .offset(x:) modifier."
metrics:
  tasks_completed: 3
  files_created: 5
  files_modified: 0
  loc_added: ~312
  duration_minutes: ~6
  build_status: pass
---

# Phase 23 Plan 08: iOS Nav Stack Summary

Custom `PosterNavStack` (50 LOC SwiftUI ZStack) + `@Observable` `PosterRouter` + asymmetric forward/back transitions + `UIScreenEdgePanGestureRecognizer` edge-swipe-back + custom `PosterSheet` (slide-up + backdrop 0.45 + drag-to-close at translation>100pt OR velocityY>800), all routed through `posterAnimation()`/`posterTransition()` so `accessibilityReduceMotion` flattens to opacity-only. Closes DS-07 / ADR-002.

## Tasks Completed

| Task | Name                                                  | Commit  | Files                                                                                                       |
| ---- | ----------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | PosterRouter @Observable class + PosterNavEntry      | 908d972 | `PosterRouter.swift`                                                                                        |
| 2    | PosterTransitions + PosterEdgeSwipe (gesture bridge) | f77cb7d | `PosterTransitions.swift`, `PosterEdgeSwipe.swift`                                                          |
| 3    | PosterNavStack composition + PosterSheet             | 24d179d | `PosterNavStack.swift`, `PosterSheet.swift`                                                                 |

## Implementation Notes

### PosterRouter (57 LOC)

- `@MainActor @Observable final class PosterRouter`
- `private(set) var stack: [PosterNavEntry]` — mutation only via push/pop/popToRoot (T-23-08-01 mitigation).
- `private(set) var direction: PosterNavDirection` — flipped before each mutation; consumed by `PosterNavStack` for asymmetric transition direction.
- `init(root: some View)` seeds stack with one entry.
- `canPop` derived from `stack.count > 1` — drives edge-swipe enabled flag.
- `EnvironmentValues.posterRouter: PosterRouter?` so child views can push/pop without prop-drilling.

### PosterTransitions

- `AnyTransition.posterAsymmetricSlide(direction:)` — forward = trailing-in / leading-out, backward = leading-in / trailing-out (combined with `.opacity` for soft cross-fade).
- Convenience aliases `posterSlideInFwd` / `posterSlideInBack` mirror `PosterAnimations.slideInFwdTransition()` / `slideInBackTransition()`.
- 28pt translate from prototype is deferred to Phase 28 polish: SwiftUI `.move(edge:)` uses full-width offset (~screen.width). For prototype-exact 28pt we'd need a custom `.offset(x:)` + opacity transition.

### PosterEdgeSwipe (80 LOC)

- `UIViewRepresentable` wrapper around `UIScreenEdgePanGestureRecognizer` with `edges = .left`.
- Coordinator listens for `.ended`/`.recognized` and fires `onSwipeBack()` when `translation.x > 80 || velocity.x > 800` (ADR-002 thresholds).
- `UIAccessibility.post(notification: .screenChanged, argument: nil)` announces VO screen change after successful pop.
- Accessibility traits applied to the gesture view: `accessibilityLabel = "Назад"`, `accessibilityTraits = .button`, `isAccessibilityElement = enabled`.
- View modifier `posterEdgeSwipeBack(enabled:onSwipeBack:)` overlays a 24pt-wide strip on the leading edge, only hit-testing when `enabled == true`.

### PosterNavStack (50 LOC)

- ZStack of `router.stack.enumerated()` with `zIndex(Double(idx))` — newest screen on top.
- `posterTransition(.posterAsymmetricSlide(direction: router.direction))` so reduce-motion flattens.
- `posterAnimation(PosterAnimations.posterSlide, value: router.stack.map(\.id))` triggers transition on identity change.
- `posterEdgeSwipeBack(enabled: router.canPop)` only attaches gesture when there's something to pop.
- Two inits: owning (creates fresh router) and borrowed (router from shell — for V10MainShell where lifecycle lives outside the stack).

### PosterSheet (81 LOC)

- Backdrop `Color.black.opacity(0.45)` + `.ignoresSafeArea()` + `onTapGesture { isPresented = false }` (animated via `sheetEase(0.35)`).
- Sheet body anchored bottom via `VStack(spacer + content)` in a full-screen `GeometryReader`.
- Drag gesture clamps `dragOffset = max(0, v.translation.height)` (downward only).
- On end: if `translation.height > 100 || velocityY > 800` → close with `sheetEase(0.35)`; else snap back with `sheetEase(0.25)` (CONTEXT Area 3 spec).
- Velocity computed as `predictedEndTranslation.height - translation.height` (UIKit-equivalent points-per-second proxy).
- Backdrop and sheet on separate zIndex (10 / 20) so the slide-up transition stacks correctly above the dimmed underlayer.
- View modifier `posterSheet(isPresented:content:)` for ergonomic call sites.

## Verification

- Build: `cd ios && xcodegen generate && make build` → **Build Succeeded** (xcbeautify output: all 5 files compiled, dylib + binary linked, App Intents metadata extracted).
- Acceptance grep checks (Tasks 1–3): all pass.
  - `wc -l PosterRouter.swift` → 57 (≤70 ✓)
  - `wc -l PosterNavStack.swift` → 50 (≤100 ✓)
  - `grep '@Observable' PosterRouter.swift` → 1 ✓
  - `grep 'final class PosterRouter' PosterRouter.swift` → 1 ✓
  - `grep 'UIScreenEdgePanGestureRecognizer' PosterEdgeSwipe.swift` → 5 ✓
  - `grep 'translation.x > 80' PosterEdgeSwipe.swift` → 3 ✓
  - `grep 'velocity.x > 800' PosterEdgeSwipe.swift` → 3 ✓
  - `grep '"Назад"' PosterEdgeSwipe.swift` → 1 ✓
  - `grep 'accessibilityTraits = .button' PosterEdgeSwipe.swift` → 1 ✓
  - `grep 'translation.height > 100' PosterSheet.swift` → 3 ✓
  - `grep 'velocityY > 800' PosterSheet.swift` → 3 ✓
  - `grep 'PosterAnimations.sheetEase(0.35)' PosterSheet.swift` → 3 ✓
  - `grep 'enabled: router.canPop' PosterNavStack.swift` → 1 ✓
- Top-level marker count `@Observable | UIScreenEdgePanGestureRecognizer | UIViewRepresentable | UIViewControllerRepresentable` across `Poster*.swift`: **7** (1 in PosterRouter + 6 in PosterEdgeSwipe) — exceeds ≥3 acceptance gate.

## Deviations from Plan

### Auto-fixed / Adjustments

**1. [Adjustment - Convenience] Added `posterSlideInFwd` / `posterSlideInBack` static AnyTransition aliases in `PosterTransitions.swift`**

- **Found during:** Task 2 implementation
- **Issue:** The plan's PosterTransitions snippet exposes only `posterAsymmetricSlide(direction:)`. CONTEXT Area 3 references `slideInFwdTransition()` / `slideInBackTransition()` (already in `PosterAnimations.swift`) but call sites might also want them as `AnyTransition` static members for symmetry.
- **Fix:** Added two pure-AnyTransition static convenience accessors that mirror the asymmetric slide for forward and backward directions independently. Pure additions — no functional change to `posterAsymmetricSlide`.
- **Files modified:** `ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift`
- **Commit:** f77cb7d

**2. [Adjustment - UIViewRepresentable instead of UIViewControllerRepresentable]**

- **Source:** Plan key_links and ADR-002 mention "UIViewControllerRepresentable" once in PLAN.md but the actual snippet (lines 210, 256) and CONTEXT Area 3 use `UIViewRepresentable`. The ADR notes "wrapped в UIViewControllerRepresentable adapter" but the simpler `UIViewRepresentable` is sufficient for attaching a `UIScreenEdgePanGestureRecognizer` to a view.
- **Decision:** `UIViewRepresentable` per the actual code snippet in PLAN.md tasks. No view-controller lifecycle is needed — gesture lives on a UIView and the coordinator routes events back to SwiftUI.
- **Acceptance gate uses an OR-set across {UIViewRepresentable, UIViewControllerRepresentable}** — gate passes (count = 6 in PosterEdgeSwipe.swift via UIViewRepresentable).

### None of plan's behavior changed

The plan executed as written — no Rule 1/2/3 fixes were necessary, no architectural Rule 4 questions arose. Build is green on first attempt.

## Threat Model Compliance

| Threat ID  | Disposition | Implementation                                                                                          |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| T-23-08-01 | mitigate    | `PosterRouter.stack` and `direction` are `private(set)` — only push/pop/popToRoot mutate.              |
| T-23-08-02 | accept      | Standard UIKit gesture; TabView swipe conflict to be POC-verified in Plan 23.14.                       |
| T-23-08-03 | mitigate    | No hard cap on stack here; each call site can `popToRoot()` and `canPop` is exposed for guard checks.  |
| T-23-08-04 | accept      | Static «Назад» label is the only PII-free string surface.                                              |
| T-23-08-05 | mitigate    | `EnvironmentValues.posterRouter` is `PosterRouter?` — child views must guard.                          |

## Open Risks for Plan 23.14 (Manual Verification)

1. **Edge-swipe vs. TabView swipe conflict** — needs real-device confirmation; `minimumDistance` defaults are SwiftUI-managed but UIKit gesture recognizer should win on the leading 24pt strip.
2. **28pt translate vs. full-width `.move(edge:)`** — animation distance differs from prototype. If pixel-perfect reproduction is required pre-Phase 28, swap `.move(edge:)` for `.offset(x: ±28)` + opacity transition (Phase 28 polish task tracked in ADR-002 consequences).
3. **PosterSheet content size** — current implementation lets `sheetContent()` be any height; if the content is taller than safe area, drag-to-close still works but the sheet may be partially obscured by the keyboard on text-input sheets. Phase 25/26 callers should test text-field sheets.
4. **Reduce-motion behavior** — `posterTransition(.posterAsymmetricSlide(...))` falls back to `.opacity` automatically (per `PosterTransitionModifier`), but the asymmetric direction is moot under reduce-motion. Verify in Plan 23.14 with VoiceOver/Reduce Motion enabled.
5. **VO announcement timing** — `UIAccessibility.post(.screenChanged, ...)` fires immediately after `onSwipeBack()`; on slow devices the screen may not yet have transitioned. Plan 23.14 should confirm on iPhone 11 (slowest target).

## Self-Check: PASSED

- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift
- FOUND: 908d972 (PosterRouter)
- FOUND: f77cb7d (PosterTransitions + PosterEdgeSwipe)
- FOUND: 24d179d (PosterNavStack + PosterSheet)
- BUILD: pass (xcodegen generate + make build → Build Succeeded)
