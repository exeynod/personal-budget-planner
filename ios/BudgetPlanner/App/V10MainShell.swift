// V10 root shell (Phase 25-07 wiring).
//
// Composes:
//   - PosterNavStack (custom router, ADR-002) rooted at OnboardingMountView.
//     OnboardingMountView's internal gateway picks OnboardingV10View when
//     `me.onboardedAt == nil` and HomeV10View otherwise.
//   - BottomNavV10 (4-tab + FAB layout — TXN-V10-06: NO Транзакции tab).
//     Hidden while AddSheet is open (T-25-07-03 mitigation).
//   - AddSheet PosterSheet bound to FAB tap. Body is a temporary
//     placeholder — real AddSheet ships in Plan 25-11.
//
// HomeV10View reads `@Environment(\.posterRouter)` from the PosterNavStack
// established here and pushes Transactions / Accounts / Plan / Category
// placeholders without holding a strong shell reference.

import Observation
import SwiftUI

struct V10MainShell: View {
    @State private var router: PosterRouter
    @State private var activeTab: TabId = .home
    @State private var isAddSheetOpen: Bool = false

    /// Production init — creates the router with OnboardingMountView at the
    /// bottom of the nav stack. Marked @MainActor because PosterRouter is
    /// MainActor-isolated and OnboardingMountView's init likewise.
    @MainActor
    init() {
        let mount = OnboardingMountView()
        _router = State(initialValue: PosterRouter(root: mount))
    }

    var body: some View {
        ZStack {
            // Stack: nav-stack content (root + pushed screens) under the chrome.
            PosterNavStack(router: router) {
                // ViewBuilder param is unused by the borrowed-router init's
                // body (it renders router.stack instead) but required by the
                // generic signature; pass an empty container.
                Color.clear
            }
            .ignoresSafeArea()

            // Bottom nav overlays content; hidden during AddSheet (T-25-07-03).
            VStack(spacing: 0) {
                Spacer()
                BottomNavV10(
                    active: $activeTab,
                    isHidden: isAddSheetOpen,
                    dark: false,
                    onFab: { isAddSheetOpen = true }
                )
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .preferredColorScheme(.dark)
        .onChange(of: activeTab) { _, newTab in
            handleTabChange(newTab)
        }
        .posterSheet(isPresented: $isAddSheetOpen) {
            AddSheetPlaceholderBody(onClose: { isAddSheetOpen = false })
        }
    }

    /// Tab → push routing matrix.
    /// home  → popToRoot (back to OnboardingMountView, which renders HomeV10View)
    /// savings → AccountsListPlaceholderView (real Accounts list lands in Phase 27)
    /// ai     → PlanViewPlaceholderView      (real AI screen   lands in Phase 27)
    /// mgmt   → PlanViewPlaceholderView      (real Mgmt screen lands in Phase 27)
    private func handleTabChange(_ tab: TabId) {
        switch tab {
        case .home:
            router.popToRoot()
        case .savings:
            router.push(AccountsListPlaceholderView())
        case .ai:
            router.push(PlanViewPlaceholderView())
        case .mgmt:
            router.push(PlanViewPlaceholderView())
        }
    }
}

// MARK: - AddSheet placeholder

/// Temporary placeholder body for the AddSheet PosterSheet.
/// Plan 25-11 replaces this with the full AddSheet UI (3×4 keypad,
/// category picker, account picker, etc.).
private struct AddSheetPlaceholderBody: View {
    let onClose: () -> Void

    var body: some View {
        ZStack {
            PosterTokens.Color.black.ignoresSafeArea()
            VStack(alignment: .leading, spacing: PosterTokens.Space.s18) {
                HStack {
                    Eyebrow("NEW ENTRY · WIP", opacity: 0.7)
                    Spacer()
                    Button(action: onClose) {
                        Text("×")
                            .font(.custom(PosterTokens.Font.archivoBlack, size: 28))
                            .foregroundColor(PosterTokens.Color.paper)
                    }
                    .buttonStyle(.plain)
                }
                Mass("AddSheet —", italic: true, size: 36)
                Text("WIP — Real AddSheet ships in Plan 25-11.")
                    .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11))
                    .foregroundColor(PosterTokens.Color.paper.opacity(0.6))
                Spacer()
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
        }
        .frame(maxWidth: .infinity, maxHeight: 480, alignment: .topLeading)
    }
}

// MARK: - Preview

#Preview {
    V10MainShell()
        .environment(AuthStore())
}
