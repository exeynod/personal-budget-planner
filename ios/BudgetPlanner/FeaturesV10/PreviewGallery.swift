import SwiftUI

/// iOS preview surface (equivalent of web /preview). DS-08 acceptance gate.
/// Renders all 10 components + 11 animation triggers + PosterNavStack push test + PosterSheet test.
struct PreviewGallery: View {
    @Environment(\.posterRouter) private var router
    @State private var activeTab: TabId = .home
    @State private var chipActive: Int = 0
    @State private var sliderValue: Int = 7500
    @State private var toastVisible = false
    @State private var sheetVisible = false
    @State private var animKey: [String: Int] = [:]

    // Track applied animation triggers — re-mount target via .id() bump
    private let animationNames: [(name: String, demo: AnyView)] = [
        ("posterRowIn",       AnyView(AnimDemo(text: "ROW IN"))),
        ("posterRiseIn",      AnyView(AnimDemo(text: "RISE IN"))),
        ("posterBarFill",     AnyView(AnimDemo(text: "BAR FILL"))),
        ("posterTabPop",      AnyView(AnimDemo(text: "TAB POP"))),
        ("posterPopIn",       AnyView(AnimDemo(text: "POP IN"))),
        ("posterCheck",       AnyView(AnimDemo(text: "CHECK"))),
        ("posterDot",         AnyView(AnimDemo(text: "DOT"))),
        ("posterSlideInFwd",  AnyView(AnimDemo(text: "SLIDE FWD"))),
        ("posterSlideInBack", AnyView(AnimDemo(text: "SLIDE BACK"))),
        ("posterTabSwap",     AnyView(AnimDemo(text: "TAB SWAP"))),
        ("posterToastIn",     AnyView(AnimDemo(text: "TOAST IN"))),
    ]

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    // Header
                    VStack(alignment: .leading, spacing: 14) {
                        Eyebrow("VOL.23 / DS PREVIEW · iOS")
                        Mass("Maximal Poster.", italic: true, size: 56)
                    }

                    // Section 1: ADR-001 cyrillic glyph routing
                    section("1. ADR-001 ROUTING") {
                        HStack(spacing: 24) {
                            Mass("May", italic: true, size: 56)
                            Mass("Май", italic: true, size: 56)
                        }
                        Text("На iOS обе фразы рендерит PT Serif Italic — единый serif italic per ADR-001 (composite UIFont не оправдан).")
                            .font(.posterBody(size: 12))
                            .foregroundColor(PosterTokens.Color.paper)
                            .opacity(0.7)
                    }

                    // Section 2: BigFig
                    section("2. BIGFIG · COUNT-UP") {
                        BigFig(value: 142_380, sup: "₽", size: 64)
                    }

                    // Section 3: Plates
                    section("3. PLATE · 5 TONES") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            ForEach([PlateTone.inverted, .yellow, .red, .paper, .dark], id: \.self) { t in
                                Plate(tone: t) {
                                    Eyebrow(String(describing: t).uppercased(), color: t.fg)
                                }
                            }
                        }
                    }

                    // Section 4: PosterButton variants
                    section("4. POSTERBUTTON · 3 VARIANTS") {
                        VStack(spacing: 8) {
                            PosterButton("Сохранить", variant: .primary) {}
                            PosterButton("Отмена",    variant: .ghost) {}
                            PosterButton("Удалить",   variant: .destructive) {}
                        }
                    }

                    // Section 5: Chips
                    section("5. CHIPS · SINGLE-SELECT") {
                        FlowLayout(spacing: 5) {
                            ForEach(Array(["Все", "Кафе", "Продукты", "Транспорт", "Подписки"].enumerated()), id: \.offset) { i, label in
                                Chip(label, active: i == chipActive) { chipActive = i }
                            }
                        }
                    }

                    // Section 6: Slider
                    section("6. POSTERSLIDER · STEP 500") {
                        PosterSlider(value: $sliderValue, in: 0...30_000, step: 500, label: "Продукты")
                    }

                    // Section 7: Animation gallery
                    section("7. ANIMATIONS · 11 KEYFRAMES") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            ForEach(animationNames, id: \.name) { item in
                                AnimationCell(name: item.name, fireKey: animKey[item.name] ?? 0) {
                                    animKey[item.name, default: 0] += 1
                                }
                            }
                        }
                    }

                    // Section 8: PosterNavStack push test
                    section("8. NAV PUSH · ADR-002") {
                        PosterButton("Push test screen", variant: .ghost) {
                            router?.push(SecondScreen())
                        }
                    }

                    // Section 9: PosterSheet test
                    section("9. POSTERSHEET · DRAG-CLOSE") {
                        PosterButton("Show poster sheet", variant: .ghost) { sheetVisible = true }
                    }

                    // Section 10: Toast
                    section("10. TOAST · 1700ms") {
                        PosterButton("Show toast", variant: .primary) { toastVisible = true }
                    }

                    Spacer(minLength: 100)
                }
                .padding(.horizontal, 22)
                .padding(.top, 56)
            }

            Toast(message: "✓ Сохранено · −480 ₽", visible: $toastVisible)

            VStack { Spacer(); TabBar(active: $activeTab, dark: true, onFab: { toastVisible = true }) }
        }
        .posterSheet(isPresented: $sheetVisible) {
            VStack(alignment: .leading, spacing: 14) {
                Eyebrow("BOTTOM-SHEET DEMO", color: PosterTokens.Color.ink)
                Mass("Drag-close.", italic: true, size: 32)
                Text("Перетащи вниз больше чем на 100pt — закроется. Тапни фон — тоже.")
                    .foregroundColor(PosterTokens.Color.ink)
                PosterButton("Закрыть", variant: .primary) { sheetVisible = false }
                Spacer().frame(height: 40)
            }
            .padding(22)
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(title)
            content()
        }
        .padding(.top, 18)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(PosterTokens.Color.paper.opacity(0.18))
                .frame(height: 1)
        }
    }
}

private struct AnimDemo: View {
    let text: String
    var body: some View {
        Plate(tone: .yellow) {
            Eyebrow(text, color: PosterTokens.Color.ink)
        }
    }
}

private struct AnimationCell: View {
    let name: String
    let fireKey: Int
    let onTrigger: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: onTrigger) {
                HStack {
                    Text("▶ \(name)")
                        .font(.posterMono(size: 11))
                        .tracking(1.2)
                    Spacer()
                }
                .padding(8)
                .overlay(Rectangle().stroke(PosterTokens.Color.paper, lineWidth: 1))
                .foregroundColor(PosterTokens.Color.paper)
            }
            .buttonStyle(.plain)

            // Re-mount target via .id(fireKey) so animation re-fires on each tap
            AnimTarget(name: name)
                .id(fireKey)
        }
    }
}

private struct AnimTarget: View {
    let name: String
    @State private var animated = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        Rectangle()
            .fill(PosterTokens.Color.yellow)
            .frame(height: 28)
            .opacity(animated ? 1 : 0)
            .scaleEffect(x: scaleX, y: 1, anchor: .leading)
            .offset(x: offsetX, y: offsetY)
            .onAppear {
                let anim = animationFor(name)
                withAnimation(reduce ? .easeOut(duration: 0.2) : anim) {
                    animated = true
                }
            }
    }

    private var scaleX: CGFloat {
        if name == "posterBarFill" { return animated ? 1.0 : 0.0 }
        return 1.0
    }
    private var offsetX: CGFloat {
        switch name {
        case "posterSlideInFwd":  return animated ? 0 : 28
        case "posterSlideInBack": return animated ? 0 : -28
        default: return 0
        }
    }
    private var offsetY: CGFloat {
        switch name {
        case "posterRowIn", "posterTabSwap": return animated ? 0 : 8
        case "posterRiseIn":                 return animated ? 0 : 14
        case "posterToastIn":                return animated ? 0 : -8
        default: return 0
        }
    }

    private func animationFor(_ n: String) -> Animation {
        switch n {
        case "posterRowIn":       return PosterAnimations.posterRowIn(delay: 0)
        case "posterRiseIn":      return PosterAnimations.posterRiseIn(delay: 0)
        case "posterBarFill":     return PosterAnimations.posterBarFill()
        case "posterTabPop":      return PosterAnimations.posterTabPop
        case "posterPopIn":       return PosterAnimations.posterPopIn(delay: 0)
        case "posterCheck":       return PosterAnimations.posterCheck
        case "posterDot":         return PosterAnimations.posterDot
        case "posterSlideInFwd",
             "posterSlideInBack": return PosterAnimations.posterSlide
        case "posterTabSwap":     return PosterAnimations.posterTabSwap
        case "posterToastIn":     return PosterAnimations.posterToastIn
        default:                  return .easeOut(duration: 0.4)
        }
    }
}

/// Second screen pushed onto PosterNavStack from gallery.
private struct SecondScreen: View {
    @Environment(\.posterRouter) private var router
    var body: some View {
        ZStack(alignment: .topLeading) {
            PosterTokens.Color.cobalt.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                Eyebrow("SECOND · NAV PUSH PROOF")
                Mass("Назад.", italic: true, size: 64)
                PosterButton("Pop back", variant: .primary) { router?.pop() }
                Spacer()
            }
            .padding(.horizontal, 22)
            .padding(.top, 56)
        }
    }
}

/// Minimal flow-layout for chip rows (iOS 16+). For simple wrapping; not production-grade.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(in: proposal.replacingUnspecifiedDimensions().width, subviews: subviews)
        return result.size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(in: bounds.width, subviews: subviews)
        for (i, point) in result.points.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func arrange(in width: CGFloat, subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        var points: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineH: CGFloat = 0
        var maxX: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > width {
                x = 0
                y += lineH + spacing
                lineH = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += s.width + spacing
            lineH = max(lineH, s.height)
            maxX = max(maxX, x)
        }
        return (CGSize(width: maxX, height: y + lineH), points)
    }
}
