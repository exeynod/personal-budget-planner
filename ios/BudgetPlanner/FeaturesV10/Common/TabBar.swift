// TabBar.swift — 5-column bottom navigation with FAB centered as 3rd column.
// Symmetric to web <TabBar> (frontend/src/componentsV10/TabBar.tsx).
// DS-06 iOS.

import SwiftUI

enum TabId: String, CaseIterable, Hashable { case home, savings, ai, mgmt }

/// 5-col bottom tab bar (FAB centered as 3rd column). Symmetric to web TabBar.
/// Sliding indicator (1/5 width × 2pt) animates between active tab columns.
/// Light variant: paper bg + ink text. Dark variant: black bg + paper text + yellow active.
struct TabBar: View {
    @Binding var active: TabId
    var dark: Bool = false
    let onFab: () -> Void

    var body: some View {
        GeometryReader { geo in
            let availableWidth = geo.size.width
            let columnWidth = (availableWidth - 64) / 4              // 4 flex columns share rest
            let activeIdx: Int = {
                switch active {
                case .home:    return 0
                case .savings: return 1
                case .ai:      return 3
                case .mgmt:    return 4
                }
            }()

            ZStack(alignment: .topLeading) {
                HStack(spacing: 0) {
                    TabButton(id: .home,    label: "ГЛАВНАЯ", glyph: "■", dark: dark, active: $active, width: columnWidth)
                    TabButton(id: .savings, label: "КОПИЛКА", glyph: "◊", dark: dark, active: $active, width: columnWidth)
                    FAB(action: onFab).frame(width: 64)
                    TabButton(id: .ai,      label: "AI",      glyph: "✦", dark: dark, active: $active, width: columnWidth)
                    TabButton(id: .mgmt,    label: "УПР.",    glyph: "⌘", dark: dark, active: $active, width: columnWidth)
                }
                .frame(height: 68)

                // Sliding indicator (2pt height, 1/5 width per column)
                Rectangle()
                    .fill(dark ? PosterTokens.Color.yellow : PosterTokens.Color.ink)
                    .frame(width: availableWidth / 5, height: 2)
                    .offset(x: CGFloat(activeIdx) * (availableWidth / 5))
                    .posterAnimation(PosterAnimations.sheetEase(0.35), value: active)
            }
            .frame(height: 68)
            .background(dark ? PosterTokens.Color.black : PosterTokens.Color.paper)
            .overlay(
                Rectangle().stroke(
                    dark
                      ? PosterTokens.Color.paper.opacity(0.15)
                      : PosterTokens.Color.ink.opacity(0.12),
                    lineWidth: 1
                )
            )
            .shadow(color: .black.opacity(0.45),
                    radius: PosterTokens.Shadow.tabBar.blur,
                    x: PosterTokens.Shadow.tabBar.x,
                    y: PosterTokens.Shadow.tabBar.y)
        }
        .frame(height: 68)
        .padding(.horizontal, PosterTokens.Space.s14)
        .padding(.bottom, PosterTokens.Space.s18)
    }
}

private struct TabButton: View {
    let id: TabId
    let label: String
    let glyph: String
    let dark: Bool
    @Binding var active: TabId
    let width: CGFloat

    var body: some View {
        let isActive = active == id
        let activeColor = dark ? PosterTokens.Color.yellow : PosterTokens.Color.ink
        let mutedColor: Color = dark
            ? PosterTokens.Color.paper.opacity(0.55)
            : PosterTokens.Color.ink.opacity(0.45)

        Button {
            withAnimation(PosterAnimations.posterTabPop) { active = id }
        } label: {
            VStack(spacing: 2) {
                Text(glyph)
                    .font(.system(size: 13))
                    .scaleEffect(isActive ? 1.0 : 1.0)
                    // posterTabPop scaling drives via withAnimation on `active` binding above —
                    // implicit transition propagates through the SwiftUI render graph.
                Text(label)
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                    .tracking(1.4)
            }
            .frame(width: width)
            .foregroundColor(isActive ? activeColor : mutedColor)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isActive ? [.isSelected, .isButton] : [.isButton])
    }
}

#Preview("TabBar (light)") {
    struct Demo: View {
        @State private var t: TabId = .home
        var body: some View {
            VStack {
                Spacer()
                TabBar(active: $t, dark: false, onFab: {})
            }
            .background(PosterTokens.Color.paper)
        }
    }
    return Demo()
}

#Preview("TabBar (dark)") {
    struct Demo: View {
        @State private var t: TabId = .ai
        var body: some View {
            VStack {
                Spacer()
                TabBar(active: $t, dark: true, onFab: {})
            }
            .background(PosterTokens.Color.black)
        }
    }
    return Demo()
}
