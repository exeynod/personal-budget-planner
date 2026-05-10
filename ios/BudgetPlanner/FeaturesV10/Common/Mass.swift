// Mass.swift — large screen header (Archivo Black uppercase OR italic serif).
// Symmetric to web <Mass> (frontend/src/componentsV10/Mass.tsx).
// DS-06 iOS.

import SwiftUI

/// Mass screen header. Two visual modes:
///   - italic = false → Archivo Black uppercase (display)
///   - italic = true  → PT Serif Italic (preserves casing)
struct Mass: View {
    let text: String
    var italic: Bool = false
    var size: CGFloat = PosterTokens.FontSize.mass

    init(_ text: String, italic: Bool = false, size: CGFloat = PosterTokens.FontSize.mass) {
        self.text = text
        self.italic = italic
        self.size = size
    }

    var body: some View {
        let display = italic ? text : text.uppercased()
        return Text(display)
            .font(italic
                  ? .posterMassItalic(size: size)
                  : .posterMassBold(size: size))
            .tracking(-size * 0.04)                                 // -0.04em
            .lineSpacing(-(size * 0.15))                            // line-height ~0.85
            .foregroundColor(PosterTokens.Color.paper)
    }
}

#Preview("Mass") {
    VStack(alignment: .leading, spacing: 16) {
        Mass("Sentyabr")
        Mass("Sentyabr", italic: true)
    }
    .padding()
    .background(PosterTokens.Color.ink)
}
