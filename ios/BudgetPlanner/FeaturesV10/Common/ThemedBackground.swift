// ThemedBackground.swift — Phase 53 (LG-IOS-01..04).
//
// Theme-aware background wrapper. Substitutes Maximal Poster solid color
// backgrounds with native adaptive surfaces under Liquid Glass / iOS Default
// themes — without rewriting each V10 screen.
//
// Usage:
//   .background(ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea())
// or as a content child:
//   ThemedBackground(maximal: PosterTokens.Color.coral).ignoresSafeArea()
//
// Per Phase 53 plan: ONLY the background substitution layer is touched.
// All other PosterUI primitives (PosterCard / PosterSheet / BottomNav / FAB /
// Plate / Mass / BigFig) remain untouched in this phase — they already render
// inside V10 screens and pick up the new background through normal SwiftUI
// composition.

import SwiftUI

/// Theme-aware background surface.
///
/// - `maximal`: the solid `PosterTokens.Color.*` painted under the
///              `.maximalPoster` theme — preserves the existing V10 visuals.
/// - `liquidGlass`: SwiftUI `Material` used under `.liquidGlass` theme.
///                  Defaults to `.regularMaterial` (translucent frosted).
/// - `iosDefault`: System grouped background under `.iosDefault` theme —
///                 honors light/dark adaptive system color.
struct ThemedBackground: View {
    let maximal: Color
    var liquidGlass: Material = .regularMaterial
    var iosDefault: Color = Color(.systemGroupedBackground)

    @Environment(\.appTheme) private var theme

    var body: some View {
        switch theme {
        case .maximalPoster:
            maximal
        case .liquidGlass:
            Rectangle().fill(liquidGlass)
        case .iosDefault:
            iosDefault
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
        LinearGradient(colors: [.purple, .orange], startPoint: .topLeading, endPoint: .bottomTrailing)
            .ignoresSafeArea()
        ThemedBackground(maximal: PosterTokens.Color.coral)
            .ignoresSafeArea()
            .environment(\.appTheme, .liquidGlass)
    }
}

#Preview("ThemedBackground · iOS default") {
    ThemedBackground(maximal: PosterTokens.Color.coral)
        .ignoresSafeArea()
        .environment(\.appTheme, .iosDefault)
}
#endif
