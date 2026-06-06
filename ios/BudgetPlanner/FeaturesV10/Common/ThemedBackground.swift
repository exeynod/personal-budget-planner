// ThemedBackground.swift — Phase 53 (LG-IOS-01..04), Phase 4 (LG restore 2026-06).
//
// Theme-aware background wrapper. Substitutes Maximal Poster solid color
// backgrounds with a native adaptive frosted Material surface under the
// Liquid Glass theme — without rewriting each V10 screen.
//
// Usage:
//   .background(ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea())
// or as a content child:
//   ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea()
//
// ONLY the background substitution layer is theme-aware here. Cards / sheets
// use GlassCard (componentsV10) gated on the theme; other PosterUI primitives
// pick up the new background through normal SwiftUI composition.

import SwiftUI

/// Theme-aware background surface.
///
/// - `maximal`: the solid `PosterTokens.Color.*` painted under the
///              `.maximalPoster` theme — preserves the existing V10 visuals.
/// - `liquidGlass`: SwiftUI `Material` used under the `.liquidGlass` theme.
///                  Defaults to `.regularMaterial` (translucent frosted) over
///                  the system grouped background so it reads as iOS glass.
struct ThemedBackground: View {
    let maximal: Color
    var liquidGlass: Material = .regularMaterial

    @Environment(\.appTheme) private var theme

    var body: some View {
        switch theme {
        case .maximalPoster:
            maximal
        case .liquidGlass:
            ZStack {
                LiquidGlassTokens.bgPrimary
                Rectangle().fill(liquidGlass)
            }
        }
    }
}

#if DEBUG
#Preview("ThemedBackground · maximal coral") {
    ThemedBackground(maximal: PosterTokens.Color.coral)
        .ignoresSafeArea()
        .environment(\.appTheme, .maximalPoster)
}

#Preview("ThemedBackground · liquid glass") {
    ZStack {
        LinearGradient(
            colors: [.purple, .orange], startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
        ThemedBackground(maximal: PosterTokens.Color.coral)
            .ignoresSafeArea()
            .environment(\.appTheme, .liquidGlass)
    }
}
#endif
