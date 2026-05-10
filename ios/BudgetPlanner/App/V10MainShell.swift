import SwiftUI

/// V10 root view (DS-08).
///
/// Phase 24-11 wiring: replaces the prior Phase 23 PreviewGallery default
/// with the real onboarding gateway. `OnboardingMountView` fetches GET
/// /api/v1/me on appear and:
///   - renders OnboardingV10View when `onboarded_at == nil`
///     (ONB-V10-01 trigger)
///   - renders the Home placeholder when `onboarded_at != nil`
///     (real Home lands in Phase 25)
///
/// PreviewGallery is still reachable via #Preview blocks in its own
/// file for component-level QA; production builds no longer surface it.
struct V10MainShell: View {
    var body: some View {
        OnboardingMountView()
            .preferredColorScheme(.dark)              // poster fonts on dark backgrounds default to light text
    }
}

#Preview {
    V10MainShell()
        .environment(AuthStore())                     // for symmetry with v0.6 root
}
