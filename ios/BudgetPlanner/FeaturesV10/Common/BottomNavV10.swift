// BottomNavV10.swift — Wrapper around TabBar exposing isHidden gate
// for AddSheet integration (T-25-07-03 mitigation: nav hidden while sheet up).
// Symmetric to web BottomNavV10 (frontend/src/screensV10/common/BottomNavV10.tsx).
// Phase 25-07 wiring (TXN-V10-06: 4-tab + FAB layout — v0.6 transactions tab
// was removed; absence is enforced upstream in TabBar.swift `enum TabId`).

import SwiftUI

struct BottomNavV10: View {
    @Binding var active: TabId
    var isHidden: Bool = false
    var dark: Bool = false
    let onFab: () -> Void

    var body: some View {
        if isHidden {
            EmptyView()
        } else {
            TabBar(active: $active, dark: dark, onFab: onFab)
                .transition(.opacity)
        }
    }
}

// MARK: - Previews

#Preview("BottomNavV10 · visible") {
    BottomNavV10PreviewWrapper(initial: .home, isHidden: false)
}

#Preview("BottomNavV10 · hidden") {
    BottomNavV10PreviewWrapper(initial: .home, isHidden: true)
}

/// Preview-only wrapper that owns the @State binding for the active tab.
/// Lives at file scope so multiple #Preview blocks can re-use it without
/// clashing with any other StatefulPreviewWrapper in the codebase.
private struct BottomNavV10PreviewWrapper: View {
    @State var active: TabId
    let isHidden: Bool

    init(initial: TabId, isHidden: Bool) {
        self._active = State(initialValue: initial)
        self.isHidden = isHidden
    }

    var body: some View {
        VStack {
            Spacer()
            BottomNavV10(active: $active, isHidden: isHidden, onFab: {})
        }
        .frame(height: 220)
        .background(PosterTokens.Color.coral)
    }
}
