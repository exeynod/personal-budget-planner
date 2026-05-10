// PosterEdgeSwipe.swift — UIScreenEdgePanGestureRecognizer bridge for SwiftUI (DS-07 / ADR-002).
// Edge-swipe-back gesture on the leading screen edge.
// Per ADR-002: edges = .left, threshold = translation.x > 80pt OR velocity.x > 800.
// Accessibility: «Назад» label + .button trait so VoiceOver users see the affordance.

import SwiftUI
import UIKit

/// Wraps UIScreenEdgePanGestureRecognizer for SwiftUI consumers.
/// Fires `onSwipeBack()` when pan ends with translation.x > 80pt OR velocity.x > 800.
struct PosterEdgeSwipe: UIViewRepresentable {
    let enabled: Bool
    let onSwipeBack: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onSwipeBack: onSwipeBack)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = enabled

        let gesture = UIScreenEdgePanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handle(_:))
        )
        gesture.edges = .left
        view.addGestureRecognizer(gesture)
        context.coordinator.gesture = gesture

        // Accessibility per ADR-002
        view.accessibilityLabel = "Назад"
        view.accessibilityTraits = .button
        view.isAccessibilityElement = enabled

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        uiView.isUserInteractionEnabled = enabled
        uiView.isAccessibilityElement = enabled
        context.coordinator.onSwipeBack = onSwipeBack
    }

    final class Coordinator: NSObject {
        var onSwipeBack: () -> Void
        weak var gesture: UIScreenEdgePanGestureRecognizer?

        init(onSwipeBack: @escaping () -> Void) {
            self.onSwipeBack = onSwipeBack
        }

        @objc func handle(_ recognizer: UIScreenEdgePanGestureRecognizer) {
            guard let view = recognizer.view else { return }
            let translation = recognizer.translation(in: view)
            let velocity = recognizer.velocity(in: view)

            if recognizer.state == .ended || recognizer.state == .recognized {
                if translation.x > 80 || velocity.x > 800 {
                    onSwipeBack()
                    // Announce screen change for VoiceOver
                    UIAccessibility.post(notification: .screenChanged, argument: nil)
                }
            }
        }
    }
}

/// SwiftUI helper modifier — overlays edge-swipe gesture area on the leading 24pt strip.
extension View {
    @ViewBuilder
    func posterEdgeSwipeBack(enabled: Bool, onSwipeBack: @escaping () -> Void) -> some View {
        self.overlay(alignment: .leading) {
            PosterEdgeSwipe(enabled: enabled, onSwipeBack: onSwipeBack)
                .frame(width: 24)
                .frame(maxHeight: .infinity)
                .allowsHitTesting(enabled)
        }
    }
}
