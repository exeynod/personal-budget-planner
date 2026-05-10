// PosterButton.swift — CTA button with 3 variants (primary/ghost/destructive).
// Symmetric to web <PosterButton> (frontend/src/componentsV10/PosterButton.tsx).
// DS-06 iOS.

import SwiftUI

enum PosterButtonVariant { case primary, ghost, destructive }

/// Full-width CTA button. Archivo Black 12pt uppercase, tracking ~0.18em, padding 16pt vertical.
struct PosterButton: View {
    let variant: PosterButtonVariant
    let action: () -> Void
    var disabled: Bool = false
    let label: String

    init(_ label: String,
         variant: PosterButtonVariant,
         disabled: Bool = false,
         action: @escaping () -> Void) {
        self.label = label
        self.variant = variant
        self.disabled = disabled
        self.action = action
    }

    var body: some View {
        Button(action: { if !disabled { action() } }) {
            Text(label.uppercased())
                .font(.custom(PosterTokens.Font.archivoBlack, size: 12))
                .tracking(2)                                         // ~0.18em at 12pt
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .foregroundColor(fg)
                .background(bg)
                .overlay(border)
                .opacity(disabled ? 0.45 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private var bg: Color {
        switch variant {
        case .primary:     return PosterTokens.Color.yellow
        case .ghost:       return .clear
        case .destructive: return PosterTokens.Color.red
        }
    }

    private var fg: Color {
        switch variant {
        case .primary:     return PosterTokens.Color.ink
        case .ghost:       return PosterTokens.Color.paper
        case .destructive: return PosterTokens.Color.paper
        }
    }

    @ViewBuilder private var border: some View {
        if variant == .ghost {
            Rectangle().stroke(PosterTokens.Color.paper.opacity(0.45), lineWidth: 1)
        }
    }
}

#Preview("PosterButton") {
    VStack(spacing: 12) {
        PosterButton("Save", variant: .primary) {}
        PosterButton("Cancel", variant: .ghost) {}
        PosterButton("Delete", variant: .destructive) {}
        PosterButton("Disabled", variant: .primary, disabled: true) {}
    }
    .padding()
    .background(PosterTokens.Color.ink)
}
