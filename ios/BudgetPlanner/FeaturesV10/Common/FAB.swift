// FAB.swift — 48x48 yellow square «+» button with press scale 0.88 + rotate -90deg.
// Symmetric to web <FAB> (frontend/src/componentsV10/FAB.tsx).
// DS-06 iOS.

import SwiftUI

/// Floating action button — 48x48 yellow square.
/// On press: scaleEffect 0.88 + rotationEffect -90° via PosterAnimations.overshoot.
struct FAB: View {
    let action: () -> Void
    var ariaLabel: String = "Добавить транзакцию"

    @State private var pressed: Bool = false

    var body: some View {
        Button(action: action) {
            Text("+")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 24))
                .frame(width: 48, height: 48)
                .foregroundColor(PosterTokens.Color.ink)
                .background(PosterTokens.Color.yellow)
                .scaleEffect(pressed ? 0.88 : 1.0)
                .rotationEffect(.degrees(pressed ? -90 : 0))
                .shadow(
                    color: PosterTokens.Color.yellow.opacity(PosterTokens.Shadow.fab.opacity),
                    radius: PosterTokens.Shadow.fab.blur,
                    x: PosterTokens.Shadow.fab.x,
                    y: PosterTokens.Shadow.fab.y
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ariaLabel)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !pressed {
                        withAnimation(PosterAnimations.overshoot(0.25)) { pressed = true }
                    }
                }
                .onEnded { _ in
                    withAnimation(PosterAnimations.overshoot(0.25)) { pressed = false }
                }
        )
    }
}

#Preview("FAB") {
    FAB(action: {})
        .padding()
        .background(PosterTokens.Color.ink)
}
