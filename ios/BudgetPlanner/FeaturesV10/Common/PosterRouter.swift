// PosterRouter.swift — Custom nav-stack router for V10 shell (DS-07 / ADR-002).
// Holds the screen stack + last-mutation direction so PosterNavStack can drive
// asymmetric forward/back transitions (28pt translate / 0.42s easeOut).

import SwiftUI
import Observation

/// Direction of the most recent stack mutation; drives asymmetric transitions.
enum PosterNavDirection { case forward, backward }

/// One entry in the nav stack. Heterogeneous screens via AnyView (per CONTEXT Area 3).
struct PosterNavEntry: Identifiable {
    let id = UUID()
    let view: AnyView
}

/// Stack-based navigation router for V10 shell. ADR-002.
@MainActor
@Observable
final class PosterRouter {
    private(set) var stack: [PosterNavEntry] = []
    private(set) var direction: PosterNavDirection = .forward

    init(root: some View) {
        stack = [PosterNavEntry(view: AnyView(root))]
    }

    func push(_ view: some View) {
        direction = .forward
        stack.append(PosterNavEntry(view: AnyView(view)))
    }

    func pop() {
        guard stack.count > 1 else { return }
        direction = .backward
        _ = stack.popLast()
    }

    func popToRoot() {
        guard stack.count > 1 else { return }
        direction = .backward
        stack = Array(stack.prefix(1))
    }

    var canPop: Bool { stack.count > 1 }
}

/// Environment key for child views to push/pop.
private struct PosterRouterKey: EnvironmentKey {
    static let defaultValue: PosterRouter? = nil
}
extension EnvironmentValues {
    var posterRouter: PosterRouter? {
        get { self[PosterRouterKey.self] }
        set { self[PosterRouterKey.self] = newValue }
    }
}
