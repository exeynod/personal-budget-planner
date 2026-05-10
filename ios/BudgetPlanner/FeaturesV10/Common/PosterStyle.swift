// PosterStyle.swift — shared SwiftUI modifiers + font helpers for V10 components
// DS-06 iOS — symmetric to web stylesV10 utilities (poster-press, posterFont).
// All values come from PosterTokens.* — no hard-coded magic numbers.

import SwiftUI

// MARK: - Font helpers
extension Font {
    /// Eyebrow label font: JetBrains Mono semibold at PosterTokens.FontSize.eye (11pt).
    static func posterEyebrow() -> Font {
        .custom(PosterTokens.Font.jetBrainsMono, size: PosterTokens.FontSize.eye).weight(.semibold)
    }

    /// Generic body text in Manrope (default 13pt = PosterTokens.FontSize.body).
    static func posterBody(size: CGFloat = PosterTokens.FontSize.body) -> Font {
        .custom(PosterTokens.Font.manrope, size: size)
    }

    /// Mass display — Archivo Black uppercase variant.
    static func posterMassBold(size: CGFloat = PosterTokens.FontSize.mass) -> Font {
        .custom(PosterTokens.Font.archivoBlack, size: size)
    }

    /// Mass display — italic serif variant.
    /// ADR-001: PT Serif Italic is the iOS pragmatic fallback (single Italic font).
    static func posterMassItalic(size: CGFloat = PosterTokens.FontSize.mass) -> Font {
        .custom(PosterTokens.Font.ptSerifItalic, size: size)
    }

    /// JetBrains Mono numeric / accent text. Default 14pt (= PosterTokens.FontSize.monoMd).
    static func posterMono(size: CGFloat = PosterTokens.FontSize.monoMd, weight: Font.Weight = .regular) -> Font {
        .custom(PosterTokens.Font.jetBrainsMono, size: size).weight(weight)
    }
}

// MARK: - Press scale 0.97 modifier (DESIGN-SYSTEM §7.3 «poster-press»)
struct PosterPress: ViewModifier {
    @State private var pressed = false
    let onTap: () -> Void

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed ? 0.97 : 1.0)
            .animation(.easeOut(duration: 0.15), value: pressed)
            .contentShape(Rectangle())
            .onTapGesture { onTap() }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in pressed = true }
                    .onEnded { _ in pressed = false }
            )
    }
}

extension View {
    /// Apply «poster-press» 0.97 scale on touch with tap callback.
    func posterPress(onTap: @escaping () -> Void) -> some View {
        modifier(PosterPress(onTap: onTap))
    }
}
