---
phase: 23-design-system-foundation
plan: 06
type: execute
wave: 3
depends_on: [23-design-system-foundation/01, 23-design-system-foundation/03]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift
  - ios/BudgetPlanner.xcodeproj
autonomous: true
requirements: [DS-04, DS-05]
tags: [design-system, animations, ios, swiftui, reduce-motion]
must_haves:
  truths:
    - "PosterAnimations.swift exposes static Animation constants for all 11 web keyframe analogs (easeOut, overshoot, sheetEase, posterRowIn, posterRiseIn, posterBarFill, posterTabPop, posterPopIn, posterCheck, posterDot, posterSlideInFwd, posterSlideInBack, posterTabSwap, posterToastIn)."
    - "Each animation references the exact cubic-bezier control points emitted by codegen into PosterTokens.swift (Easing struct)."
    - "ReducedMotion modifier short-circuits transform-based animations to a 0.2s opacity fade when @Environment(\\.accessibilityReduceMotion) is true."
    - "Phase animator helpers and Path.trim helpers exposed for posterCheck (SVG-equivalent) and posterBarFill (Path scale)."
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift"
      provides: "SwiftUI Animation constants + ReduceMotion guard view-modifier"
  key_links:
    - from: "PosterAnimations.swift"
      to: "ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift"
      via: "PosterTokens.Easing.easeOutControl, etc."
    - from: "Plan 23.07 components"
      to: "PosterAnimations"
      via: ".animation(PosterAnimations.posterRowIn(delay:), value:)"
---

<objective>
Implement `ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` containing SwiftUI `Animation` constants for the 11 web keyframes (mapping per DESIGN-SYSTEM.md §7.5), plus a `.reducedMotionGuard()` view modifier that flattens transform-based animations to opacity-only fades when `@Environment(\.accessibilityReduceMotion)` is true. Use the cubic-bezier control points emitted by codegen into `PosterTokens.Easing.*Control` (Plan 23.01).

Purpose: DS-04 + DS-05 on iOS — symmetric to web Plan 23.04. Components in Plan 23.07 attach these to their views via `.animation(PosterAnimations.posterRowIn(delay:), value:)`.
Output: 1 Swift file (~150 LOC), referenced by xcodeproj after `make generate`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/phases/23-design-system-foundation/23-04-web-animations-PLAN.md

<read_first>
- `.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md` §7.1 (easing curves), §7.2 (keyframes), §7.5 (CSS→SwiftUI mapping)
- `.planning/phases/23-design-system-foundation/23-04-web-animations-PLAN.md` <extracted_animation_values> table (web durations + easing — iOS MUST match for parity)
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` (post-Plan 23.01) — verifies `PosterTokens.Easing.easeOutControl` etc. tuple shape `(c0x:, c0y:, c1x:, c1y:)`
- DESIGN-SYSTEM §7.5 mapping table:
  - posterRowIn → `.opacity` + `.offset(y:)` with `.transition`, `.animation(.easeOut(0.42))`
  - posterRiseIn → same, offset 14px
  - posterBarFill → `.scaleEffect(x: progress, anchor: .leading)`
  - posterTabPop → `.scaleEffect(active ? 1.35 : 1)` with `.spring(response:0.45, damping:0.55)`
  - posterCheck → `Path.trim(from: 0, to: drawn)` + animate
  - posterDot → `Timer.publish(every: 0.18)` + opacity loop (or phaseAnimator on iOS 17+)
  - posterSlideInFwd → `.transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading)))`
- iOS deployment target: 26.0 (project.yml line 4) — `phaseAnimator` (iOS 17+), `@Observable` (iOS 17+), all available
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Implement PosterAnimations.swift with 11 animations + reduce-motion guard</name>
  <files>ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift</files>
  <read_first>
    - DESIGN-SYSTEM.md §7.1, §7.2, §7.5
    - Plan 23.04 final animations.css for web duration parity
    - PosterTokens.swift post-Plan 23.01 for `PosterTokens.Easing.*Control` shape
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift`:

    ```swift
    // PosterAnimations.swift — Maximal Poster animation suite for SwiftUI (DS-04 + DS-05)
    // Symmetric to frontend/src/stylesV10/animations.css.
    // Easing control points come from PosterTokens.Easing.* (codegen).
    // Duration values match web implementation per DESIGN-SYSTEM.md §7.2.

    import SwiftUI

    enum PosterAnimations {
        // ─── Easing curves (cubic-bezier from PosterTokens.Easing) ───
        // SwiftUI Animation.timingCurve takes (c0x, c0y, c1x, c1y, duration)
        static func easeOut(_ duration: Double) -> Animation {
            let c = PosterTokens.Easing.easeOutControl
            return .timingCurve(c.c0x, c.c0y, c.c1x, c.c1y, duration: duration)
        }
        static func overshoot(_ duration: Double) -> Animation {
            let c = PosterTokens.Easing.overshootControl
            return .timingCurve(c.c0x, c.c0y, c.c1x, c.c1y, duration: duration)
        }
        static func sheetEase(_ duration: Double) -> Animation {
            let c = PosterTokens.Easing.sheetEaseControl
            return .timingCurve(c.c0x, c.c0y, c.c1x, c.c1y, duration: duration)
        }

        // ─── 1. posterRowIn (0.45s easeOut + 8px translate) ───
        static func posterRowIn(delay: Double = 0) -> Animation {
            easeOut(0.45).delay(delay)
        }
        // Stagger formula per DESIGN-SYSTEM §7.4: rows = 0.08 + i*0.045
        static func rowStagger(i: Int) -> Double { 0.08 + Double(i) * 0.045 }
        // Day groups: 0.05 + i*0.07
        static func dayGroupStagger(i: Int) -> Double { 0.05 + Double(i) * 0.07 }
        // AI hints: 0.18 + i*0.08
        static func hintStagger(i: Int) -> Double { 0.18 + Double(i) * 0.08 }
        // Regulars: 0.32 + i*0.09
        static func regularStagger(i: Int) -> Double { 0.32 + Double(i) * 0.09 }

        // ─── 2. posterRiseIn (0.55s easeOut + 14px translateY) ───
        static func posterRiseIn(delay: Double = 0) -> Animation {
            easeOut(0.55).delay(delay)
        }

        // ─── 3. posterBarFill (0.7s-0.85s easeOut + scaleEffect leading) ───
        static func posterBarFill(delay: Double = 0, duration: Double = 0.7) -> Animation {
            easeOut(duration).delay(delay)
        }

        // ─── 4. posterTabPop (0.45s overshoot via spring) ───
        // SwiftUI spring tuned to overshoot ratio 1.35 / 1.0 with response 0.45 + damping 0.55
        static var posterTabPop: Animation {
            .spring(response: 0.45, dampingFraction: 0.55)
        }

        // ─── 5. posterPopIn (0.5s overshoot) ───
        static func posterPopIn(delay: Double = 0) -> Animation {
            overshoot(0.5).delay(delay)
        }

        // ─── 6. posterCheck (0.35s easeOut, delay 0.12s, applied to Path.trim animatable to) ───
        static var posterCheck: Animation {
            easeOut(0.35).delay(0.12)
        }

        // ─── 7. posterDot (1.2s ease-in-out infinite, used on 3 dots with i*0.18s offset) ───
        static var posterDot: Animation {
            .easeInOut(duration: 1.2).repeatForever(autoreverses: true)
        }
        static func dotPhase(i: Int) -> Double { Double(i) * 0.18 }

        // ─── 8 + 9. posterSlideInFwd / posterSlideInBack (push/pop transition, 0.42s easeOut, 28px X-translate) ───
        // Used in PosterNavStack (Plan 23.08); exposed as transition presets via static methods
        static func slideInFwdTransition() -> AnyTransition {
            .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal:   .move(edge: .leading).combined(with: .opacity)
            )
        }
        static func slideInBackTransition() -> AnyTransition {
            .asymmetric(
                insertion: .move(edge: .leading).combined(with: .opacity),
                removal:   .move(edge: .trailing).combined(with: .opacity)
            )
        }
        static var posterSlide: Animation { easeOut(0.42) }

        // ─── 10. posterTabSwap (0.35s easeOut, 8px translateY, no direction) ───
        static var posterTabSwap: Animation {
            easeOut(0.35)
        }

        // ─── 11. posterToastIn (0.5s overshoot — translateY -8 → 2 → 0, scale 0.9 → 1.04 → 1) ───
        static var posterToastIn: Animation {
            overshoot(0.5)
        }

        // Toast life
        static let toastLifeMs: Int = 1700
    }

    // ─── Reduce-motion modifier (DS-05) ───
    // Wraps an animation closure; when accessibilityReduceMotion=true, short-circuits to opacity fade.
    extension View {
        /// Apply animation honoring accessibilityReduceMotion: motion-rich curve when off,
        /// opacity-only fade when on.
        func posterAnimation<V: Equatable>(
            _ animation: Animation,
            value: V,
            reduceMotionFallback: Animation = .easeOut(duration: 0.2)
        ) -> some View {
            modifier(PosterAnimationModifier(motion: animation, reduced: reduceMotionFallback, value: value))
        }
    }

    private struct PosterAnimationModifier<V: Equatable>: ViewModifier {
        @Environment(\.accessibilityReduceMotion) private var reduce
        let motion: Animation
        let reduced: Animation
        let value: V

        func body(content: Content) -> some View {
            content.animation(reduce ? reduced : motion, value: value)
        }
    }

    // ─── Reduce-motion-aware transition wrapper ───
    extension View {
        /// Apply transition that respects accessibilityReduceMotion.
        /// Provides motion transition when off, opacity-only when on.
        func posterTransition(_ motion: AnyTransition) -> some View {
            modifier(PosterTransitionModifier(motion: motion))
        }
    }

    private struct PosterTransitionModifier: ViewModifier {
        @Environment(\.accessibilityReduceMotion) private var reduce
        let motion: AnyTransition

        func body(content: Content) -> some View {
            content.transition(reduce ? .opacity : motion)
        }
    }
    ```

    NOTES:
    - Spring approximation for posterTabPop: SwiftUI spring(response:0.45, dampingFraction:0.55) approximates the overshoot 1.35× scale. Phase 28 polish may tune.
    - Stagger helpers (`rowStagger`, `dayGroupStagger`, etc.) exposed publicly for components to call: `view.posterAnimation(PosterAnimations.posterRowIn(delay: PosterAnimations.rowStagger(i: index)), value: appearTrigger)`.
    - posterCheck is meant to be applied to a `Path.trim(from: 0, to: drawn)` value via `.posterAnimation(PosterAnimations.posterCheck, value: drawn)` — Plan 23.07 Toast component wires this.
    - Reduce-motion: BOTH modifiers (animation + transition) have reduced fallbacks. Components MUST use `posterAnimation()` and `posterTransition()` instead of bare `.animation()` and `.transition()`.

    After file is written, run `cd ios && make generate` to regenerate xcodeproj (XcodeGen picks up new Swift files automatically — no manual project.yml edit required), then `make build` to confirm Swift compiles.
  </action>
  <acceptance_criteria>
    - `test -f ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift`
    - `wc -l ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns 100-200
    - `grep -c "static func\|static var\|static let" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 18 (3 easing helpers + 11 animations × ~1.5 each + 4 stagger helpers)
    - `grep -F "posterRowIn" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterRiseIn" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterBarFill" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterTabPop" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterPopIn" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterCheck" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterDot" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterSlide" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterTabSwap" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "posterToastIn" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 1
    - `grep -F "accessibilityReduceMotion" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 2 (modifier + transition wrapper)
    - `grep -F "PosterTokens.Easing.easeOutControl" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns 1
    - `grep -F ".timingCurve(" ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` returns ≥ 3
    - After `cd ios && make generate && make build`: build succeeds (no Swift compile errors)
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'posterRowIn' BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift &amp;&amp; grep -F 'posterToastIn' BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift &amp;&amp; grep -F 'accessibilityReduceMotion' BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift &amp;&amp; grep -F 'PosterTokens.Easing.easeOutControl' BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift</automated>
  </verify>
  <done>
    PosterAnimations.swift exposes 11 animation constants + 3 easing helpers + 4 stagger helpers + reduce-motion view modifiers; references PosterTokens.Easing for control points; xcodeproj regenerates and Swift compiles.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Component view → Animation modifier | Animation parameters from PosterTokens (codegen-validated) |
| OS reduce-motion preference | iOS-supplied via @Environment, trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-06-01 | Tampering | PosterAnimations constants | mitigate | Constants only — no runtime mutation; values come from PosterTokens.Easing (codegen) |
| T-23-06-02 | DoS | infinite posterDot loop | accept | Standard SwiftUI `.repeatForever` is bounded by view lifecycle; reduce-motion bypasses |
| T-23-06-03 | Information Disclosure | accessibilityReduceMotion env value | accept | Standard iOS accessibility API, no PII leak |
</threat_model>

<verification>
1. `cd ios && make generate && make build` succeeds.
2. Grep gates above pass.
3. (Plan 23.14 manual) iOS PreviewGallery exercises all 11 animations under both motion modes.
</verification>

<success_criteria>
- DS-04 iOS: 11 animation analogs available as PosterAnimations.* constants matching web durations + easing.
- DS-05 iOS: posterAnimation() and posterTransition() modifiers respect accessibilityReduceMotion.
- All references to PosterTokens.Easing resolve cleanly.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-06-SUMMARY.md` with: file LOC, list of 11 animation constants and their durations/easings, build status.
</output>
