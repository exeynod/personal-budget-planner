// Phase 24-03: OnboardingChrome — shared poster scaffold for all onboarding
// step views (steps 1..4 + Final step 5).
//
// Symmetric to web `<OnboardingChrome>` from Plan 24-02
// (frontend/src/screensV10/Onboarding/OnboardingChrome.tsx). Same slot
// shape:
//   header[ ←back · eyebrow · skip? ]
//   content (ViewBuilder)
//   footer[ hint? · 4-dot progress · NEXT CTA ]
//
// Steps 1..4 render the dot row and CTA. Step 5 (Final) hides both — that
// screen owns its own «НАЧАТЬ →» CTA (Plan 24-09 / 24-10).
//
// CTA visual note: the onboarding CTA is "paper-on-coral" inverted —
// paper background with coral text + Archivo Black. The Phase 23
// `PosterButton` variants (.primary yellow / .ghost / .destructive red)
// don't carry that inversion, so we render a custom CTA row inline. This
// keeps tracking + padding identical to web (Archivo Black 13pt,
// kerning ~0.18em, padding 16pt vertical, full-width).

import SwiftUI

struct OnboardingChrome<Content: View>: View {
    // MARK: - Inputs

    let step: Int
    var total: Int = 4
    let label: String
    var onBack: (() -> Void)? = nil
    var onSkip: (() -> Void)? = nil
    var onNext: (() -> Void)? = nil
    var nextLabel: String = "ДАЛЕЕ →"
    var nextDisabled: Bool = false
    var hint: String? = nil

    @ViewBuilder var content: () -> Content

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            header
            contentBody
            footer
        }
        .padding(.top, PosterTokens.Space.s56)
        .padding(.horizontal, PosterTokens.Space.s22)
        .padding(.bottom, PosterTokens.Space.s28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(PosterTokens.Color.coral.ignoresSafeArea())
    }

    // MARK: - Header (back · eyebrow · skip)

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            // Back arrow — opacity reflects availability.
            backButton
                .frame(width: 32, alignment: .leading)

            Spacer(minLength: 0)

            Eyebrow(label, opacity: 0.65)

            Spacer(minLength: 0)

            // Skip CTA — visible only when callback provided.
            if let onSkip {
                Button(action: onSkip) {
                    Text("ПРОПУСТИТЬ")
                        .font(.custom(PosterTokens.Font.jetBrainsMono, size: PosterTokens.FontSize.monoSm)
                            .weight(.semibold))
                        .kerning(PosterTokens.FontSize.monoSm * 0.14)   // ~0.14em
                        .foregroundColor(PosterTokens.Color.paper)
                        .opacity(0.65)
                }
                .buttonStyle(.plain)
                .frame(width: 96, alignment: .trailing)
            } else {
                // Reserve symmetric width so eyebrow stays centred.
                Spacer().frame(width: 32)
            }
        }
    }

    @ViewBuilder
    private var backButton: some View {
        if let onBack {
            Button(action: onBack) {
                Text("←")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.85)
            }
            .buttonStyle(.plain)
        } else {
            // Disabled placeholder — keeps layout symmetric.
            Text("←")
                .font(.custom(PosterTokens.Font.archivoBlack, size: 22))
                .foregroundColor(PosterTokens.Color.paper)
                .opacity(0.25)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Content slot

    private var contentBody: some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.top, PosterTokens.Space.s40)
    }

    // MARK: - Footer (hint · dots · CTA)

    @ViewBuilder
    private var footer: some View {
        VStack(spacing: PosterTokens.Space.s14) {
            if let hint {
                Text(hint)
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: PosterTokens.FontSize.monoSm))
                    .foregroundColor(PosterTokens.Color.paper)
                    .opacity(0.65)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            // Dots: only shown for steps 1..4 (Final hides them).
            if step >= 1 && step <= 4 {
                progressDots
            }

            // CTA: only shown for steps 1..4 — Final owns its own CTA.
            if step >= 1 && step <= 4, let onNext {
                ctaButton(action: onNext)
            }
        }
    }

    private var progressDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<total, id: \.self) { i in
                Rectangle()
                    .fill(PosterTokens.Color.paper)
                    .opacity(i < step ? 1.0 : 0.25)
                    .frame(height: 2)
            }
        }
    }

    private func ctaButton(action: @escaping () -> Void) -> some View {
        Button(action: { if !nextDisabled { action() } }) {
            Text(nextLabel)
                .font(.custom(PosterTokens.Font.archivoBlack, size: 13))
                .kerning(13 * 0.18)                                    // ~0.18em at 13pt
                .foregroundColor(PosterTokens.Color.coral)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(PosterTokens.Color.paper)
                .opacity(nextDisabled ? 0.45 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(nextDisabled)
    }
}

// MARK: - Preview

#Preview("OnboardingChrome step 1") {
    OnboardingChrome(
        step: 1,
        label: "ШАГ 01 / 04 · ДОХОД",
        onBack: nil,
        onSkip: nil,
        onNext: { },
        nextLabel: "ДАЛЕЕ →",
        nextDisabled: true,
        hint: "введи примерную сумму после налогов"
    ) {
        Mass("Какой доход\nв месяц?", italic: true, size: 36)
    }
}
