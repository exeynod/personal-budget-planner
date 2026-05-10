import SwiftUI

/// V10 root view (DS-08). Phase 23 minimal scope: render PreviewGallery inside PosterNavStack.
/// Real screens (Home, Transactions, Add Sheet, etc.) added in Phases 24-27.
struct V10MainShell: View {
    var body: some View {
        ZStack {
            PosterTokens.Color.coral.ignoresSafeArea()
            PosterNavStack {
                PreviewGallery()
            }
        }
        .preferredColorScheme(.dark)                  // poster fonts on dark backgrounds default to light text
    }
}

#Preview {
    V10MainShell()
        .environment(AuthStore())                     // for symmetry with v0.6 root
}
