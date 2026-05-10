// Chip.swift — toggleable filter chip.
// Symmetric to web <Chip> (frontend/src/componentsV10/Chip.tsx).
// DS-06 iOS.

import SwiftUI

/// Single chip — visually toggles via `active` flag.
/// active=true  → yellow bg + cobalt text (no border)
/// active=false → transparent bg + paper text + 1pt 35%-opacity outline
struct Chip: View {
    let label: String
    var active: Bool = false
    let action: () -> Void

    init(_ label: String, active: Bool = false, action: @escaping () -> Void) {
        self.label = label
        self.active = active
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(label.uppercased())
                .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                .tracking(1.4)                                            // ~0.14em
                .padding(.vertical, 8)
                .padding(.horizontal, 11)
                .foregroundColor(active ? PosterTokens.Color.cobalt : PosterTokens.Color.paper)
                .background(active ? PosterTokens.Color.yellow : Color.clear)
                .overlay(
                    Rectangle()
                        .stroke(active ? .clear : PosterTokens.Color.paper.opacity(0.35),
                                lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : [.isButton])
    }
}

#Preview("Chip") {
    HStack(spacing: 8) {
        Chip("Food", active: true) {}
        Chip("Transport") {}
        Chip("Subs") {}
    }
    .padding()
    .background(PosterTokens.Color.ink)
}
