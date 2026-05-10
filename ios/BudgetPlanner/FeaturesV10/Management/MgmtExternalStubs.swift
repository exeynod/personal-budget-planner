// Phase 27-11: local fallback stubs for sibling Phase 27 V10 screens
// that have not yet shipped at compile time (parallel-wave execution).
//
// Symmetric to web Plan 27-06 `_externalMountStubs.tsx`. When the
// sibling plans (27-07 Savings / 27-08 Accounts / 27-09 Analytics /
// 27-10 AI) land their real `*V10View` types, downstream consumers
// (`MgmtHubView` row tap, `V10MainShell.handleTabChange`) swap a single
// import / type reference each. Stubs become dead code after the wave
// merges and can be removed in a follow-up cleanup commit.
//
// Visual style: minimal poster-style placeholder — Eyebrow + Mass +
// mono caption. Black background (matches the would-be real screens'
// chroma so the swap is visually low-impact).

import SwiftUI

private struct MgmtPosterStub: View {
    let section: String
    let title: String
    let bg: Color
    let fg: Color

    @Environment(\.posterRouter) private var router

    var body: some View {
        ZStack {
            bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    if let r = router, r.canPop {
                        Button(action: { r.pop() }) {
                            Text("← НАЗАД")
                                .font(.posterMono(size: 11, weight: .semibold))
                                .tracking(0.14 * 11)
                                .foregroundColor(fg)
                                .opacity(0.7)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    Eyebrow(section, color: fg)
                }
                .padding(.top, 56)

                Mass(title, italic: true, size: 56)
                    .foregroundColor(fg)

                Text("WIP — replaced when sibling Phase 27 V10 screen lands.")
                    .font(.posterMono(size: PosterTokens.FontSize.bodySm))
                    .foregroundColor(fg)
                    .opacity(0.6)

                Spacer()
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Sibling Plan 27-07 swap target — replace with real `SavingsV10View()`
/// in V10MainShell.handleTabChange when Savings ships.
struct SavingsV10ViewStub: View {
    var body: some View {
        MgmtPosterStub(
            section: "SAVINGS / КОПИЛКА",
            title: "Копилка.",
            bg: PosterTokens.Color.black,
            fg: PosterTokens.Color.paper
        )
    }
}

/// Sibling Plan 27-10 swap target — replace with real `AiV10View()`
/// in V10MainShell.handleTabChange when AI ships.
struct AiV10ViewStub: View {
    var body: some View {
        MgmtPosterStub(
            section: "AI / ASSISTANT",
            title: "AI —",
            bg: PosterTokens.Color.cream,
            fg: PosterTokens.Color.ink
        )
    }
}

/// Sibling Plan 27-08 swap target — replace with real `AccountsListV10View()`
/// in MgmtHubView.onTap(.accounts) when Accounts ships.
struct AccountsListV10ViewStub: View {
    var body: some View {
        MgmtPosterStub(
            section: "WALLET / СЧЕТА",
            title: "Счета —",
            bg: PosterTokens.Color.cream,
            fg: PosterTokens.Color.ink
        )
    }
}

/// Sibling Plan 27-09 swap target — replace with real `AnalyticsV10View()`
/// in MgmtHubView.onTap(.analytics) when Analytics ships.
struct AnalyticsV10ViewStub: View {
    var body: some View {
        MgmtPosterStub(
            section: "ANALYTICS / МЕСЯЦ",
            title: "Месяц —",
            bg: PosterTokens.Color.cream,
            fg: PosterTokens.Color.ink
        )
    }
}
