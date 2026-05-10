// Plate.swift — flat information plate (radius 0, 14pt padding, 5 colour tones).
// Symmetric to web <Plate> (frontend/src/componentsV10/Plate.tsx).
// DS-06 iOS.

import SwiftUI

enum PlateTone {
    case inverted, yellow, red, paper, dark

    var bg: Color {
        switch self {
        case .inverted: return PosterTokens.Color.ink
        case .yellow:   return PosterTokens.Color.yellow
        case .red:      return PosterTokens.Color.red
        case .paper:    return PosterTokens.Color.paper
        case .dark:     return PosterTokens.Color.black
        }
    }

    var fg: Color {
        switch self {
        case .inverted, .red, .dark: return PosterTokens.Color.paper
        case .yellow, .paper:        return PosterTokens.Color.ink
        }
    }
}

/// Flat information plate (radius 0, 14pt padding). Symmetric to web <Plate>.
struct Plate<Content: View>: View {
    var tone: PlateTone = .inverted
    @ViewBuilder let content: () -> Content

    init(tone: PlateTone = .inverted, @ViewBuilder content: @escaping () -> Content) {
        self.tone = tone
        self.content = content
    }

    var body: some View {
        content()
            .padding(PosterTokens.Space.s14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tone.bg)
            .foregroundColor(tone.fg)
    }
}

#Preview("Plate") {
    VStack(spacing: 12) {
        Plate(tone: .inverted) { Text("Inverted plate") }
        Plate(tone: .yellow) { Text("Yellow plate") }
        Plate(tone: .red) { Text("Red plate") }
        Plate(tone: .paper) { Text("Paper plate") }
        Plate(tone: .dark) { Text("Dark plate") }
    }
    .padding()
    .background(PosterTokens.Color.cream)
}
