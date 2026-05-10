// Phase 24-09: FinalView — onboarding step 5 «ВСЁ. деньги — под контролем.»
//
// Placeholder body for Task 1 (Step04 wiring); the real summary plate +
// «НАЧАТЬ →» CTA + 200/409/422 submit handler land in Task 2 of plan 24-09.

import SwiftUI

struct FinalView: View {
    @Bindable var flow: OnboardingFlow
    var onComplete: (OnboardingAPIResponse) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Eyebrow("VOL.04 · ГОТОВО", opacity: 0.65)
            Mass("ВСЁ.", italic: false, size: 88)
            Mass("деньги — под\u{00A0}контролем.", italic: true, size: 28)
            Spacer()
        }
        .padding(.top, PosterTokens.Space.s56)
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.bottom, PosterTokens.Space.s28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(PosterTokens.Color.coral.ignoresSafeArea())
    }
}
