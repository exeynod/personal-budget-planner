// PosterNavStack.swift — Custom nav stack composition for V10 shell (DS-07 / ADR-002).
// ZStack of router.stack entries with asymmetric forward/back transitions.
// Edge-swipe-back attached only when router.canPop (stack.count > 1).
// All animations route through posterAnimation()/posterTransition() so
// accessibilityReduceMotion flattens motion-rich curves to opacity-only fades.

import SwiftUI

/// Custom nav stack per ADR-002. Composes a router-driven ZStack with
/// asymmetric transitions and an edge-swipe-back gesture.
struct PosterNavStack<Root: View>: View {
    @State private var router: PosterRouter
    let root: Root

    /// Owning init — creates a fresh router with `root` as the bottom of the stack.
    init(@ViewBuilder root: () -> Root) {
        let r = root()
        self._router = State(initialValue: PosterRouter(root: r))
        self.root = r
    }

    /// Borrowed-router init — for V10MainShell where the router lives in the shell
    /// (allows host code to invoke push/pop/popToRoot from outside).
    init(router: PosterRouter, @ViewBuilder root: () -> Root) {
        self._router = State(initialValue: router)
        self.root = root()
    }

    var body: some View {
        ZStack {
            ForEach(Array(router.stack.enumerated()), id: \.element.id) { idx, entry in
                entry.view
                    .zIndex(Double(idx))
                    .posterTransition(.posterAsymmetricSlide(direction: router.direction))
            }
        }
        .environment(\.posterRouter, router)
        .posterAnimation(PosterAnimations.posterSlide, value: router.stack.map(\.id))
        .posterEdgeSwipeBack(enabled: router.canPop) {
            router.pop()
        }
    }
}

/// Convenience for child views to trigger a push without pulling the env every time.
extension View {
    func posterPush<V: View>(_ view: V, using router: PosterRouter) -> some View {
        self.onTapGesture { router.push(view) }
    }
}
