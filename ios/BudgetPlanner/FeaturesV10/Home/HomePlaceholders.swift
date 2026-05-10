// Phase 25-05 Task 2: placeholder views for HomeView push routes.
//
// These are pushed onto the PosterRouter stack until the real implementations
// land in later plans:
//   - AccountsListPlaceholderView    → real Accounts list (Phase 27)
//   - PlanViewPlaceholderView        → real PLAN view (Phase 26)
//   - CategoryDetailPlaceholderView  → real Category detail (Phase 26)
//   - TransactionsViewPlaceholderView → REPLACED in Plan 25-07 by real
//     TransactionsView (Plan 25-09 wires HomeView to use it).
//
// Visual style: flat poster aesthetic — minimal Eyebrow + Mass + a one-line
// «WIP» note. They exist so HomeView's tap gestures have something to push
// to (and so the nav-stack itself can be exercised in #Preview).

import SwiftUI

private struct PosterPlaceholder: View {
    let section: String
    let title: String
    let note: String
    let bg: Color
    let fg: Color

    var body: some View {
        ZStack {
            bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow(section, color: fg)
                Mass(title, italic: true, size: 56)
                    .foregroundColor(fg)
                Text(note)
                    .font(.posterMono(size: PosterTokens.FontSize.bodySm))
                    .foregroundColor(fg)
                    .opacity(0.7)
                Spacer()
            }
            .padding(.horizontal, PosterTokens.Space.s22)
            .padding(.top, 56)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct AccountsListPlaceholderView: View {
    var body: some View {
        PosterPlaceholder(
            section: "WALLET",
            title: "Кошелёк.",
            note: "WIP — Accounts list (Phase 27).",
            bg: PosterTokens.Color.cream,
            fg: PosterTokens.Color.ink
        )
    }
}

/// Phase 26-05 (zero-touch swap): superseded — now renders the real
/// `PlanView`. Kept under the old type name so callsites that push
/// `PlanViewPlaceholderView()` (HomeV10View Plan-bar tap, CategoryDetailView
/// «+ ПОДНЯТЬ ЛИМИТ» CTA) continue to work without modification — same
/// pattern as TransactionsViewPlaceholderView (Plan 25-09) and
/// CategoryDetailPlaceholderView (Plan 26-03).
struct PlanViewPlaceholderView: View {
    var body: some View { PlanView() }
}

/// Phase 26-03 (zero-touch swap): superseded — now renders the real
/// `CategoryDetailView`. Kept under the old type name so HomeV10View's
/// `router?.push(CategoryDetailPlaceholderView(categoryId:))` callsite
/// (Plan 25-05) continues to work without modification — same pattern as
/// TransactionsViewPlaceholderView (Plan 25-09).
struct CategoryDetailPlaceholderView: View {
    let categoryId: Int
    var body: some View {
        CategoryDetailView(categoryId: categoryId)
    }
}

/// Phase 25-09 (gap-closure): superseded — now renders the real
/// `TransactionsV10View`. Kept under the old type name so HomeV10View's
/// `router?.push(TransactionsViewPlaceholderView())` callsite continues to
/// work without modification (zero-touch swap into the real screen).
struct TransactionsViewPlaceholderView: View {
    var body: some View { TransactionsV10View() }
}

#Preview("Placeholders") {
    VStack(spacing: 0) {
        AccountsListPlaceholderView().frame(height: 180)
        PlanViewPlaceholderView().frame(height: 180)
        CategoryDetailPlaceholderView(categoryId: 7).frame(height: 180)
        TransactionsViewPlaceholderView().frame(height: 180)
    }
}
