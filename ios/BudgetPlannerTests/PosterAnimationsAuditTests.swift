// PosterAnimationsAuditTests.swift — Phase 28 POL-01 / POL-02 / POL-03 (iOS).
//
// Verifies all 11 PosterAnimations curves are instantiable, that the staggered
// timing formulas match DESIGN-SYSTEM §7.4 to the millisecond, and that the
// `posterAnimation` / `posterTransition` View modifiers (which wrap
// `@Environment(\.accessibilityReduceMotion)`) compile against their canonical
// signatures. Real reduce-motion behavioural verification requires a host app
// + UI test target — that gap is documented in Phase 28-04 DIVERGENCES.md as a
// human-verify smoke checklist item per CONTEXT D-01.

import XCTest
import SwiftUI

@testable import BudgetPlanner

final class PosterAnimationsAuditTests: XCTestCase {

    // MARK: - 1. Animation enum surface (all 11 curves declared per DESIGN-SYSTEM §7.2)

    func test_all_11_animations_instantiable() throws {
        // Curves 1-11 — each must be constructible without throwing / nil.
        _ = PosterAnimations.posterRowIn(delay: 0.1)              // 1. row stagger
        _ = PosterAnimations.posterRiseIn(delay: 0)               // 2. hero rise
        _ = PosterAnimations.posterBarFill(delay: 0, duration: 0.7) // 3. progress fill
        _ = PosterAnimations.posterTabPop                         // 4. tab glyph pop
        _ = PosterAnimations.posterPopIn(delay: 0)                // 5. generic pop
        _ = PosterAnimations.posterCheck                          // 6. toast checkmark
        _ = PosterAnimations.posterDot                            // 7. AI typing dot
        _ = PosterAnimations.slideInFwdTransition()               // 8. slide-in fwd
        _ = PosterAnimations.slideInBackTransition()              // 9. slide-in back
        _ = PosterAnimations.posterSlide                          //    paired anim for 8/9
        _ = PosterAnimations.posterTabSwap                        // 10. tab content swap
        _ = PosterAnimations.posterToastIn                        // 11. toast entry

        XCTAssertEqual(
            PosterAnimations.toastLifeMs, 1700,
            "Toast lifetime must equal web --poster-toast-life (1700 ms)"
        )
    }

    // MARK: - 2. Stagger formulas (DESIGN-SYSTEM §7.4)

    func test_stagger_formulas_per_design_system_7_4() throws {
        // rows = 0.08 + i*0.045
        XCTAssertEqual(PosterAnimations.rowStagger(i: 0), 0.08, accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.rowStagger(i: 1), 0.125, accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.rowStagger(i: 4), 0.26, accuracy: 1e-6)

        // day groups = 0.05 + i*0.07
        XCTAssertEqual(PosterAnimations.dayGroupStagger(i: 0), 0.05, accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.dayGroupStagger(i: 2), 0.19, accuracy: 1e-6)

        // AI hints = 0.18 + i*0.08
        XCTAssertEqual(PosterAnimations.hintStagger(i: 0), 0.18, accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.hintStagger(i: 3), 0.42, accuracy: 1e-6)

        // regulars = 0.32 + i*0.09
        XCTAssertEqual(PosterAnimations.regularStagger(i: 0), 0.32, accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.regularStagger(i: 1), 0.41, accuracy: 1e-6)
    }

    // MARK: - 3. AI typing dot phase offsets

    func test_dot_phase_offset_per_dot() throws {
        XCTAssertEqual(PosterAnimations.dotPhase(i: 0), 0.0,  accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.dotPhase(i: 1), 0.18, accuracy: 1e-6)
        XCTAssertEqual(PosterAnimations.dotPhase(i: 2), 0.36, accuracy: 1e-6)
    }

    // MARK: - 4. View modifiers (reduce-motion-aware wrappers)

    /// Confirms `posterAnimation` modifier exists with the canonical signature.
    /// Real `accessibilityReduceMotion` env-override behaviour cannot be toggled
    /// from a plain XCTest without a host app, so we only assert compile-time
    /// correctness here. Manual smoke (Simulator → Settings → Accessibility →
    /// Reduce Motion ON) is tracked in Phase 28-04 DIVERGENCES.md.
    func test_posterAnimation_modifier_compiles_with_canonical_signature() throws {
        let probe = Color.red.posterAnimation(
            PosterAnimations.posterRiseIn(),
            value: 0
        )
        XCTAssertNotNil(probe)
    }

    /// Confirms `posterTransition` modifier exists; mirrors the assertion above
    /// for the AnyTransition variant used by V10 push/pop screen transitions.
    func test_posterTransition_modifier_compiles() throws {
        let probe = Color.red.posterTransition(
            PosterAnimations.slideInFwdTransition()
        )
        XCTAssertNotNil(probe)
    }
}
