// V10 root shell (Phase 25-07 wiring; Phase 25-11 replaced the prior
// AddSheet placeholder with the real AddSheetView).
//
// Composes:
//   - PosterNavStack (custom router, ADR-002) rooted at OnboardingMountView.
//     OnboardingMountView's internal gateway picks OnboardingV10View when
//     `me.onboardedAt == nil` and HomeV10View otherwise.
//   - BottomNavV10 (4-tab + FAB layout — TXN-V10-06: NO Транзакции tab).
//     Hidden while AddSheet is open (T-25-07-03 mitigation).
//   - AddSheetView PosterSheet bound to FAB tap (Phase 25-11 — closes
//     ADD-V10-01..05; replaces the prior 25-07 placeholder body).
//
// HomeV10View reads `@Environment(\.posterRouter)` from the PosterNavStack
// established here and pushes Transactions / Accounts / Plan / Category
// placeholders without holding a strong shell reference.

import Observation
import SwiftUI

struct V10MainShell: View {
    /// PosterRouter for the entire app session.
    ///
    /// **Invariant (WR-25-05 review fix):** the router (and the
    /// `OnboardingMountView` instance held inside it as the stack root) is
    /// initialised exactly once — on the first `init()` of `V10MainShell`.
    /// `@State`'s `initialValue:` only takes effect on the very first SwiftUI
    /// re-evaluation of this view; subsequent `init()` calls (which SwiftUI
    /// may invoke many times when the parent re-renders) DO NOT recreate the
    /// router. This is by design — it lets the gateway `OnboardingMountView`
    /// keep its `loadStatus` / `me` state across body re-evaluations.
    ///
    /// If a future feature needs to reset the router (e.g. logout flushes
    /// onboarding cache) add an explicit `reset()` method on `PosterRouter`
    /// or move `V10MainShell` into a parent that toggles a `.id(...)` binding
    /// — do NOT rely on re-running `init()`.
    @State private var router: PosterRouter
    @State private var activeTab: TabId = .home
    @State private var isAddSheetOpen: Bool = false

    /// Production init — creates the router with OnboardingMountView at the
    /// bottom of the nav stack. Marked @MainActor because PosterRouter is
    /// MainActor-isolated and OnboardingMountView's init likewise.
    ///
    /// See the `router` invariant above: this body runs many times but only
    /// the first call's `initialValue:` is honoured by `@State`.
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
                //
                // WR-25-05 (review fix): if `PosterNavStack` is ever changed
                // to render this closure as fallback content (e.g. when the
                // router stack is empty), this `Color.clear` would silently
                // become the user-visible background. Audit the call sites
                // when modifying the borrowed-router branch in PosterRouter.
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
            AddSheetView(
                onSubmitted: { _ in isAddSheetOpen = false },
                onClose: { isAddSheetOpen = false }
            )
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

// MARK: - Preview

#Preview {
    V10MainShell()
        .environment(AuthStore())
}
