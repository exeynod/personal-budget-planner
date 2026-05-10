// PosterTransitions.swift — Asymmetric slide transitions for PosterNavStack (DS-07 / ADR-002).
// Forward push: trailing-in / leading-out.
// Back pop:     leading-in / trailing-out.
// Paired with PosterAnimations.posterSlide (0.42s easeOut) at the call site.

import SwiftUI

extension AnyTransition {
    /// Asymmetric slide per ADR-002.
    /// Forward = trailing-in / leading-out, Back = leading-in / trailing-out.
    /// SwiftUI `.move(edge:)` uses full-width offset; the prototype-exact 28pt nuance
    /// is deferred to Phase 28 polish (would require `.offset(x:)` + custom modifier).
    static func posterAsymmetricSlide(direction: PosterNavDirection) -> AnyTransition {
        switch direction {
        case .forward:
            return .asymmetric(
                insertion: .move(edge: .trailing).combined(with: .opacity),
                removal:   .move(edge: .leading).combined(with: .opacity)
            )
        case .backward:
            return .asymmetric(
                insertion: .move(edge: .leading).combined(with: .opacity),
                removal:   .move(edge: .trailing).combined(with: .opacity)
            )
        }
    }

    /// Convenience: forward-only slide (mirrors PosterAnimations.slideInFwdTransition()).
    static var posterSlideInFwd: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .trailing).combined(with: .opacity),
            removal:   .move(edge: .leading).combined(with: .opacity)
        )
    }

    /// Convenience: backward-only slide (mirrors PosterAnimations.slideInBackTransition()).
    static var posterSlideInBack: AnyTransition {
        .asymmetric(
            insertion: .move(edge: .leading).combined(with: .opacity),
            removal:   .move(edge: .trailing).combined(with: .opacity)
        )
    }
}
