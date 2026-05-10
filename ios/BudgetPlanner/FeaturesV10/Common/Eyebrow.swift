// Eyebrow.swift — small uppercase mono label with letter-spacing.
// Symmetric to web <Eyebrow> (frontend/src/componentsV10/Eyebrow.tsx).
// DS-06 iOS.

import SwiftUI

/// Eyebrow label (mono uppercase, letter-spacing ~0.18em). Symmetric to web <Eyebrow>.
struct Eyebrow: View {
    let text: String
    var opacity: Double = 0.7
    var color: Color = PosterTokens.Color.paper

    init(_ text: String, opacity: Double = 0.7, color: Color = PosterTokens.Color.paper) {
        self.text = text.uppercased()
        self.opacity = opacity
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(.posterEyebrow())
            .tracking(2)                        // ~0.18em at 11pt ≈ 2pt absolute
            .foregroundColor(color)
            .opacity(opacity)
    }
}

#Preview("Eyebrow") {
    VStack(alignment: .leading, spacing: 12) {
        Eyebrow("Period · Sep")
        Eyebrow("Plan vs Fact", opacity: 0.5)
    }
    .padding()
    .background(PosterTokens.Color.ink)
}
