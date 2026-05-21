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
    /// When true the header shrinks-to-fit on a single line instead of
    /// wrapping. Used for display titles fed arbitrary-length category
    /// names (e.g. CategoryDetail «ЗДОРОВЬЕ») where mid-word character
    /// breaks look broken. Defaults to false so existing callsites keep
    /// their multi-line wrap behavior unchanged.
    var fit: Bool = false

    init(
        _ text: String,
        italic: Bool = false,
        size: CGFloat = PosterTokens.FontSize.mass,
        fit: Bool = false
    ) {
        self.text = text
        self.italic = italic
        self.size = size
        self.fit = fit
    }

    var body: some View {
        let display = italic ? text : text.uppercased()
        return Text(display)
            .font(
                italic
                    ? .posterMassItalic(size: size)
                    : .posterMassBold(size: size)
            )
            .tracking(-size * 0.04)  // -0.04em
            .lineSpacing(-(size * 0.15))  // line-height ~0.85
            .foregroundColor(PosterTokens.Color.paper)
            // fit: shrink long single-word display titles to one line rather
            // than breaking mid-word. Wrapping (when it must) happens on word
            // boundaries via `.byWordWrapping`.
            .lineLimit(fit ? 1 : nil)
            .minimumScaleFactor(fit ? 0.5 : 1.0)
            .modifier(WordWrapModifier(enabled: !fit))
    }
}

/// Forces word-boundary wrapping (not character) when multi-line wrapping is
/// allowed, so long names degrade gracefully instead of orphaning a single
/// trailing letter.
private struct WordWrapModifier: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if enabled {
            content
                .fixedSize(horizontal: false, vertical: true)
        } else {
            content
        }
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
