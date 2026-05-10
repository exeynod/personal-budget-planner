// PosterAnimations.swift — Maximal Poster animation suite for SwiftUI (DS-04 + DS-05)
// Symmetric to frontend/src/stylesV10/animations.css.
// Easing control points come from PosterTokens.Easing.* (codegen).
// Duration values match web implementation per DESIGN-SYSTEM.md §7.2 and animations.css.

import SwiftUI

enum PosterAnimations {
    // ─────────────── Easing curves (cubic-bezier from PosterTokens.Easing) ───────────────
    // SwiftUI Animation.timingCurve takes (c0x, c0y, c1x, c1y, duration: Double).
    // PosterTokens.Easing tuple components may be inferred as Double or Int (literal `1`),
    // so we Double()-cast each component to satisfy the API in all cases.
    static func easeOut(_ duration: Double) -> Animation {
        let c = PosterTokens.Easing.easeOutControl
        return .timingCurve(Double(c.c0x), Double(c.c0y), Double(c.c1x), Double(c.c1y), duration: duration)
    }
    static func overshoot(_ duration: Double) -> Animation {
        let c = PosterTokens.Easing.overshootControl
        return .timingCurve(Double(c.c0x), Double(c.c0y), Double(c.c1x), Double(c.c1y), duration: duration)
    }
    static func sheetEase(_ duration: Double) -> Animation {
        let c = PosterTokens.Easing.sheetEaseControl
        return .timingCurve(Double(c.c0x), Double(c.c0y), Double(c.c1x), Double(c.c1y), duration: duration)
    }

    // ─────────────── 1. posterRowIn — list-row stagger (0.45s easeOut, 8px translateY) ───────────────
    static func posterRowIn(delay: Double = 0) -> Animation {
        easeOut(0.45).delay(delay)
    }
    /// Stagger formula per DESIGN-SYSTEM §7.4: rows = 0.08 + i*0.045
    static func rowStagger(i: Int) -> Double { 0.08 + Double(i) * 0.045 }
    /// Day groups: 0.05 + i*0.07
    static func dayGroupStagger(i: Int) -> Double { 0.05 + Double(i) * 0.07 }
    /// AI hints: 0.18 + i*0.08
    static func hintStagger(i: Int) -> Double { 0.18 + Double(i) * 0.08 }
    /// Regulars: 0.32 + i*0.09
    static func regularStagger(i: Int) -> Double { 0.32 + Double(i) * 0.09 }

    // ─────────────── 2. posterRiseIn — hero block rise (0.55s easeOut, 14px translateY) ───────────────
    static func posterRiseIn(delay: Double = 0) -> Animation {
        easeOut(0.55).delay(delay)
    }

    // ─────────────── 3. posterBarFill — progress bar fill (0.7s easeOut, scaleX leading) ───────────────
    static func posterBarFill(delay: Double = 0, duration: Double = 0.7) -> Animation {
        easeOut(duration).delay(delay)
    }

    // ─────────────── 4. posterTabPop — active tab glyph pop (0.45s overshoot via spring) ───────────────
    /// SwiftUI spring approximating the overshoot 1.35× scale at 35% progress.
    /// response 0.45 + dampingFraction 0.55 yields visible bounce comparable to web keyframe.
    static var posterTabPop: Animation {
        .spring(response: 0.45, dampingFraction: 0.55)
    }

    // ─────────────── 5. posterPopIn — generic pop entry (0.5s overshoot) ───────────────
    static func posterPopIn(delay: Double = 0) -> Animation {
        overshoot(0.5).delay(delay)
    }

    // ─────────────── 6. posterCheck — toast checkmark stroke draw (0.35s easeOut, 0.12s delay) ───────────────
    /// Apply to a `Path.trim(from: 0, to: drawn)` value via `.posterAnimation(PosterAnimations.posterCheck, value: drawn)`.
    static var posterCheck: Animation {
        easeOut(0.35).delay(0.12)
    }

    // ─────────────── 7. posterDot — AI typing 3-dot loop (1.2s ease-in-out infinite) ───────────────
    static var posterDot: Animation {
        .easeInOut(duration: 1.2).repeatForever(autoreverses: true)
    }
    /// Per-dot phase offset (web: i*0.18s; replicated here for staggered start).
    static func dotPhase(i: Int) -> Double { Double(i) * 0.18 }

    // ─────────────── 8. posterSlideInFwd — push transition (forward, 0.42s easeOut, 28px X) ───────────────
    static func slideInFwdTransition() -> AnyTransition {
        .asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal:   .move(edge: .leading).combined(with: .opacity)
        )
    }

    // ─────────────── 9. posterSlideInBack — pop transition (back, 0.42s easeOut, 28px X) ───────────────
    static func slideInBackTransition() -> AnyTransition {
        .asymmetric(
            insertion: .move(edge: .leading).combined(with: .opacity),
            removal:   .move(edge: .trailing).combined(with: .opacity)
        )
    }
    /// Animation paired with both slide-in transitions (forward/back share duration & easing).
    static var posterSlide: Animation { easeOut(0.42) }

    // ─────────────── 10. posterTabSwap — tab content swap (0.35s easeOut, 8px translateY) ───────────────
    static var posterTabSwap: Animation {
        easeOut(0.35)
    }

    // ─────────────── 11. posterToastIn — toast entry (0.5s overshoot — translateY -8 → 2 → 0, scale 0.9 → 1.04 → 1) ───────────────
    static var posterToastIn: Animation {
        overshoot(0.5)
    }

    /// Toast on-screen lifetime (matches web `--poster-toast-life` 1700ms).
    static let toastLifeMs: Int = 1700
}

// ─────────────── Reduce-motion modifier (DS-05) ───────────────
// Wraps an animation closure; when accessibilityReduceMotion=true, short-circuits to opacity-only fade.
extension View {
    /// Apply animation honoring `accessibilityReduceMotion`: motion-rich curve when off,
    /// short opacity-only fade when on. Components MUST use this instead of bare `.animation()`.
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

// ─────────────── Reduce-motion-aware transition wrapper (DS-05) ───────────────
extension View {
    /// Apply transition that respects `accessibilityReduceMotion`.
    /// Returns the supplied motion-rich transition when off, opacity-only fade when on.
    /// Components MUST use this instead of bare `.transition()`.
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
