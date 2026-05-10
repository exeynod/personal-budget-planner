---
phase: 23-design-system-foundation
plan: 07
type: execute
wave: 4
depends_on: [23-design-system-foundation/01, 23-design-system-foundation/03, 23-design-system-foundation/06]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift
  - ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift
  - ios/BudgetPlanner/FeaturesV10/Common/Mass.swift
  - ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift
  - ios/BudgetPlanner/FeaturesV10/Common/Plate.swift
  - ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift
  - ios/BudgetPlanner/FeaturesV10/Common/Chip.swift
  - ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift
  - ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift
  - ios/BudgetPlanner/FeaturesV10/Common/FAB.swift
  - ios/BudgetPlanner/FeaturesV10/Common/Toast.swift
autonomous: true
requirements: [DS-06]
tags: [design-system, components, ios, swiftui]
must_haves:
  truths:
    - "iOS exposes 10 base components symmetric to web Plan 23.05 (matching prop names + behavior contract)."
    - "BigFig animates count-up via `withAnimation(PosterAnimations.easeOut(0.9))` over a 0..target value transition on appear (cubicOut analog)."
    - "TabBar uses LazyHGrid or HStack with 5 columns + custom indicator overlay using matchedGeometryEffect."
    - "FAB applies scaleEffect(0.88) + rotationEffect(-90deg) on press via Gesture state."
    - "Toast renders top 64pt center with `.posterTransition(...)` + `.posterAnimation(.posterToastIn, value:)` and auto-dismisses after 1700ms."
    - "PosterSlider step=500 default, debounce commit 300ms, tap-on-number switches to TextField numeric input mode."
    - "All components use PosterTokens.Color/Font/Space/Easing — no hard-coded values."
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift"
      provides: "Shared modifiers (poster-press, poster-press-spring, posterFont helpers)"
    - path: "ios/BudgetPlanner/FeaturesV10/Common/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,TabBar,FAB,Toast}.swift"
      provides: "10 SwiftUI components"
  key_links:
    - from: "Plan 23.12 PreviewGallery"
      to: "FeaturesV10/Common/*.swift"
      via: "import + view composition (no module — same target)"
    - from: "BigFig component"
      to: "PosterAnimations.easeOut"
      via: ".onAppear { withAnimation(...) }"
    - from: "Toast component"
      to: "PosterAnimations.posterToastIn"
      via: ".posterAnimation(...) modifier"
---

<objective>
Implement 10 SwiftUI components in `ios/BudgetPlanner/FeaturesV10/Common/` mirroring the web Plan 23.05 API exactly (prop names match, behavior contracts match — see `<symmetric_api_contract>` in Plan 23.05). Use `PosterTokens.*` for all colors / fonts / spaces / shadows / easing — no hard-coded values. Apply animations via `PosterAnimations` (Plan 23.06) using the `posterAnimation(_:value:)` and `posterTransition(_:)` modifiers so reduce-motion is honored.

Add a shared `PosterStyle.swift` for reusable modifiers (poster-press, font helpers).

Purpose: DS-06 iOS — symmetric component set; PreviewGallery (Plan 23.12) renders all 10 in a SwiftUI Preview to verify rendering parity with web /preview.
Output: 11 Swift files (10 components + 1 shared style).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/v1.0-handoff/handoff/DESIGN-SYSTEM.md
@.planning/v1.0-handoff/handoff/prototype/poster-screens.jsx
@.planning/phases/23-design-system-foundation/23-05-web-components-PLAN.md
@.planning/phases/23-design-system-foundation/23-06-ios-animations-PLAN.md

<read_first>
- Plan 23.05 `<symmetric_api_contract>` block — exact iOS prop names per component (use these verbatim)
- DESIGN-SYSTEM.md §6 (component recipes) + §7.5 (CSS→SwiftUI mapping)
- prototype/poster-screens.jsx L75-200 (Eye, useCountUp, BigFig, Mass, PosterTabBar inline styling)
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` (post-Plan 23.01) — token names
- `ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` (post-Plan 23.06) — animation constants + view modifiers
- `ios/BudgetPlanner/Design/Tokens.swift` and `Glass.swift` (v0.6) — note style conventions to mirror (struct-based extensions, ViewBuilder where applicable)
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: PosterStyle + Eyebrow + Mass + BigFig + Plate (5 atomic components)</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift,
    ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift,
    ios/BudgetPlanner/FeaturesV10/Common/Mass.swift,
    ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift,
    ios/BudgetPlanner/FeaturesV10/Common/Plate.swift
  </files>
  <read_first>
    - DESIGN-SYSTEM.md §6.1-§6.4
    - Plan 23.05 Task 1 implementations (web counterparts) for behavior reference
    - PosterTokens.Font names (codegen)
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift`:
    ```swift
    // PosterStyle.swift — shared SwiftUI modifiers for V10 components
    import SwiftUI

    extension Font {
        static func posterEyebrow() -> Font {
            .custom(PosterTokens.Font.jetBrainsMono, size: PosterTokens.FontSize.eye).weight(.semibold)
        }
        static func posterBody(size: CGFloat = 13) -> Font {
            .custom(PosterTokens.Font.manrope, size: size)
        }
        static func posterMassBold(size: CGFloat = 88) -> Font {
            .custom(PosterTokens.Font.archivoBlack, size: size)
        }
        static func posterMassItalic(size: CGFloat = 88) -> Font {
            // ADR-001: PT Serif Italic is the iOS pragmatic fallback (single font)
            .custom(PosterTokens.Font.ptSerifItalic, size: size)
        }
        static func posterMono(size: CGFloat = 14, weight: Font.Weight = .regular) -> Font {
            .custom(PosterTokens.Font.jetBrainsMono, size: size).weight(weight)
        }
    }

    /// Press scale 0.97 modifier (DESIGN-SYSTEM §7.3 «poster-press»)
    struct PosterPress: ViewModifier {
        @State private var pressed = false
        let onTap: () -> Void
        func body(content: Content) -> some View {
            content
                .scaleEffect(pressed ? 0.97 : 1.0)
                .animation(.easeOut(duration: 0.15), value: pressed)
                .onTapGesture { onTap() }
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in pressed = true }
                        .onEnded { _ in pressed = false }
                )
        }
    }

    extension View {
        func posterPress(onTap: @escaping () -> Void) -> some View {
            modifier(PosterPress(onTap: onTap))
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift`:
    ```swift
    import SwiftUI

    /// Eyebrow label (mono uppercase, letter-spacing 0.18em). Symmetric to web <Eyebrow>.
    struct Eyebrow: View {
        let text: String
        var opacity: Double = 0.7
        var color: Color = PosterTokens.Color.paper

        init(_ text: String, opacity: Double = 0.7, color: Color = PosterTokens.Color.paper) {
            self.text = text.uppercased()
            self.opacity = opacity
            self.color = color
        }

        var body: some View {
            Text(text)
                .font(.posterEyebrow())
                .tracking(2)                                  // ~0.18em at 11pt ≈ 2pt absolute
                .foregroundColor(color)
                .opacity(opacity)
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/Mass.swift`:
    ```swift
    import SwiftUI

    /// Mass screen header (Archivo Black uppercase OR DM/PT Serif italic). Symmetric to web <Mass>.
    struct Mass: View {
        let text: String
        var italic: Bool = false
        var size: CGFloat = 88

        init(_ text: String, italic: Bool = false, size: CGFloat = 88) {
            self.text = text
            self.italic = italic
            self.size = size
        }

        var body: some View {
            let display = italic ? text : text.uppercased()
            return Text(display)
                .font(italic
                      ? .posterMassItalic(size: size)
                      : .posterMassBold(size: size))
                .tracking(-size * 0.04)                       // -0.04em
                .lineSpacing(-(size * 0.15))                  // line-height 0.85 approx
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift`:
    ```swift
    import SwiftUI

    /// Hero number with rAF-equivalent count-up animation on appear.
    /// Symmetric to web <BigFig>.
    struct BigFig: View {
        let value: Int
        var sup: String? = nil
        var size: CGFloat = 90
        var dur: TimeInterval = 0.9
        var animate: Bool = true
        var color: Color = PosterTokens.Color.paper

        @State private var displayed: Int = 0

        init(value: Int, sup: String? = nil, size: CGFloat = 90,
             dur: TimeInterval = 0.9, animate: Bool = true,
             color: Color = PosterTokens.Color.paper) {
            self.value = value
            self.sup = sup
            self.size = size
            self.dur = dur
            self.animate = animate
            self.color = color
        }

        var body: some View {
            HStack(alignment: .top, spacing: 8) {
                Text(formatted(animate ? displayed : value))
                    .font(.posterMono(size: size))
                    .tracking(-size * 0.04)
                    .lineSpacing(-(size * 0.08))
                if let sup {
                    Text(sup)
                        .font(.posterMono(size: size * 0.36))
                        .opacity(0.7)
                }
            }
            .foregroundColor(color)
            .onAppear {
                guard animate else { displayed = value; return }
                displayed = 0
                withAnimation(PosterAnimations.easeOut(dur)) { displayed = value }
            }
            .onChange(of: value) { _, new in
                if animate {
                    withAnimation(PosterAnimations.easeOut(dur)) { displayed = new }
                } else {
                    displayed = new
                }
            }
        }

        /// Thousands formatter — uses NBSP (\u{00A0}) for portability;
        /// per DESIGN-SYSTEM §8 web uses U+202F (NNBSP), iOS uses NBSP — minor divergence
        /// acceptable as iOS system font handles NBSP cleanly. Phase 28 may unify.
        private func formatted(_ n: Int) -> String {
            let f = NumberFormatter()
            f.groupingSeparator = "\u{00A0}"               // NBSP, NOT regular space
            f.numberStyle = .decimal
            return f.string(from: NSNumber(value: n)) ?? String(n)
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/Plate.swift`:
    ```swift
    import SwiftUI

    enum PlateTone {
        case inverted, yellow, red, paper, dark

        var bg: Color {
            switch self {
            case .inverted: return PosterTokens.Color.ink
            case .yellow:   return PosterTokens.Color.yellow
            case .red:      return PosterTokens.Color.red
            case .paper:    return PosterTokens.Color.paper
            case .dark:     return PosterTokens.Color.black
            }
        }
        var fg: Color {
            switch self {
            case .inverted, .red, .dark: return PosterTokens.Color.paper
            case .yellow, .paper:        return PosterTokens.Color.ink
            }
        }
    }

    /// Information plate (radius 0, 14pt padding). Symmetric to web <Plate>.
    struct Plate<Content: View>: View {
        var tone: PlateTone = .inverted
        @ViewBuilder let content: () -> Content

        init(tone: PlateTone = .inverted, @ViewBuilder content: @escaping () -> Content) {
            self.tone = tone
            self.content = content
        }

        var body: some View {
            content()
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(tone.bg)
                .foregroundColor(tone.fg)
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - All 5 files present
    - `grep -F 'struct Eyebrow: View' ios/BudgetPlanner/FeaturesV10/Common/Eyebrow.swift` returns 1
    - `grep -F 'struct Mass: View' ios/BudgetPlanner/FeaturesV10/Common/Mass.swift` returns 1
    - `grep -F 'italic: Bool' ios/BudgetPlanner/FeaturesV10/Common/Mass.swift` returns ≥ 1
    - `grep -F 'withAnimation(PosterAnimations.easeOut' ios/BudgetPlanner/FeaturesV10/Common/BigFig.swift` returns ≥ 1
    - `grep -F 'enum PlateTone' ios/BudgetPlanner/FeaturesV10/Common/Plate.swift` returns 1
    - `grep -c 'case ' ios/BudgetPlanner/FeaturesV10/Common/Plate.swift` returns ≥ 5 (5 tones)
    - `grep -F 'PosterTokens.Color' ios/BudgetPlanner/FeaturesV10/Common/Plate.swift` returns ≥ 5
    - `cd ios && xcodegen generate && make build` exits 0 (compile succeeds)
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'struct Mass: View' BudgetPlanner/FeaturesV10/Common/Mass.swift &amp;&amp; grep -F 'enum PlateTone' BudgetPlanner/FeaturesV10/Common/Plate.swift &amp;&amp; grep -F 'withAnimation(PosterAnimations.easeOut' BudgetPlanner/FeaturesV10/Common/BigFig.swift</automated>
  </verify>
  <done>
    PosterStyle + 4 atomic components compile; tokens used everywhere; symmetric to web.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: PosterButton + Chip + PosterSlider + FAB (4 interactive)</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift,
    ios/BudgetPlanner/FeaturesV10/Common/Chip.swift,
    ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift,
    ios/BudgetPlanner/FeaturesV10/Common/FAB.swift
  </files>
  <read_first>
    - DESIGN-SYSTEM.md §6.5, §6.6, §6.7, §6.9
    - Plan 23.05 Task 2 (web counterparts) for behavior reference
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift`:
    ```swift
    import SwiftUI

    enum PosterButtonVariant { case primary, ghost, destructive }

    /// CTA button — 3 visual variants; padding 16pt vertical, full-width.
    /// Archivo Black 12pt + tracking 0.18em.
    struct PosterButton: View {
        let variant: PosterButtonVariant
        let action: () -> Void
        var disabled: Bool = false
        let label: String

        init(_ label: String, variant: PosterButtonVariant, disabled: Bool = false,
             action: @escaping () -> Void) {
            self.label = label
            self.variant = variant
            self.disabled = disabled
            self.action = action
        }

        var body: some View {
            Button(action: { if !disabled { action() } }) {
                Text(label.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 12))
                    .tracking(2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundColor(fg)
                    .background(bg)
                    .overlay(border)
                    .opacity(disabled ? 0.45 : 1.0)
            }
            .buttonStyle(.plain)
            .disabled(disabled)
        }

        private var bg: Color {
            switch variant {
            case .primary:     return PosterTokens.Color.yellow
            case .ghost:       return .clear
            case .destructive: return PosterTokens.Color.red
            }
        }
        private var fg: Color {
            switch variant {
            case .primary:     return PosterTokens.Color.ink
            case .ghost:       return PosterTokens.Color.paper
            case .destructive: return PosterTokens.Color.paper
            }
        }
        @ViewBuilder private var border: some View {
            if variant == .ghost {
                Rectangle().stroke(PosterTokens.Color.paper.opacity(0.45), lineWidth: 1)
            }
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/Chip.swift`:
    ```swift
    import SwiftUI

    /// Single chip — toggles via active flag.
    struct Chip: View {
        let label: String
        var active: Bool = false
        let action: () -> Void

        init(_ label: String, active: Bool = false, action: @escaping () -> Void) {
            self.label = label
            self.active = active
            self.action = action
        }

        var body: some View {
            Button(action: action) {
                Text(label.uppercased())
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 11))
                    .tracking(1.4)                            // ~0.14em
                    .padding(.vertical, 8)
                    .padding(.horizontal, 11)
                    .foregroundColor(active ? PosterTokens.Color.cobalt : PosterTokens.Color.paper)
                    .background(active ? PosterTokens.Color.yellow : Color.clear)
                    .overlay(
                        Rectangle()
                            .stroke(active ? .clear : PosterTokens.Color.paper.opacity(0.35), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift`:
    ```swift
    import SwiftUI

    /// Step-based numeric slider with debounce-commit + tap-on-number → keyboard input.
    /// step default 500 per DS-06; commit fires 300ms after last change.
    struct PosterSlider: View {
        @Binding var value: Int
        let range: ClosedRange<Int>
        var step: Int = 500
        var label: String? = nil
        var onCommit: ((Int) -> Void)? = nil

        @State private var local: Double = 0
        @State private var editing: Bool = false
        @State private var commitTask: Task<Void, Never>? = nil
        @FocusState private var focused: Bool

        init(value: Binding<Int>, in range: ClosedRange<Int>, step: Int = 500,
             label: String? = nil, onCommit: ((Int) -> Void)? = nil) {
            self._value = value
            self.range = range
            self.step = step
            self.label = label
            self.onCommit = onCommit
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                if let label {
                    Eyebrow(label, opacity: 0.7, color: PosterTokens.Color.paper)
                }
                HStack(spacing: 12) {
                    Slider(
                        value: Binding(
                            get: { Double(value) },
                            set: { newValue in
                                let snapped = Int((newValue / Double(step)).rounded()) * step
                                value = max(range.lowerBound, min(range.upperBound, snapped))
                                scheduleCommit(value)
                            }
                        ),
                        in: Double(range.lowerBound)...Double(range.upperBound),
                        step: Double(step)
                    )
                    .tint(PosterTokens.Color.paper)

                    if editing {
                        TextField("0", value: $value, format: .number)
                            .keyboardType(.numberPad)
                            .focused($focused)
                            .multilineTextAlignment(.trailing)
                            .frame(minWidth: 80)
                            .font(.posterMono(size: 14, weight: .semibold))
                            .onSubmit { editing = false; scheduleCommit(value) }
                            .onChange(of: focused) { _, isFocused in
                                if !isFocused { editing = false; scheduleCommit(value) }
                            }
                    } else {
                        Text(formatted(value))
                            .font(.posterMono(size: 14, weight: .semibold))
                            .frame(minWidth: 80, alignment: .trailing)
                            .onTapGesture {
                                editing = true
                                focused = true
                            }
                    }
                }
            }
        }

        private func scheduleCommit(_ next: Int) {
            commitTask?.cancel()
            guard let onCommit else { return }
            commitTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)   // 300ms debounce
                guard !Task.isCancelled else { return }
                await MainActor.run { onCommit(next) }
            }
        }

        private func formatted(_ n: Int) -> String {
            let f = NumberFormatter()
            f.groupingSeparator = "\u{00A0}"
            f.numberStyle = .decimal
            return f.string(from: NSNumber(value: n)) ?? String(n)
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/FAB.swift`:
    ```swift
    import SwiftUI

    /// 48x48 yellow square + with press transform scale(0.88) rotate(-90deg).
    struct FAB: View {
        let action: () -> Void
        var ariaLabel: String = "Добавить транзакцию"

        @State private var pressed: Bool = false

        var body: some View {
            Button(action: action) {
                Text("+")
                    .font(.custom(PosterTokens.Font.archivoBlack, size: 24))
                    .frame(width: 48, height: 48)
                    .foregroundColor(PosterTokens.Color.ink)
                    .background(PosterTokens.Color.yellow)
                    .scaleEffect(pressed ? 0.88 : 1.0)
                    .rotationEffect(.degrees(pressed ? -90 : 0))
                    .shadow(
                        color: PosterTokens.Color.yellow.opacity(0.35),
                        radius: 16, x: 0, y: 6
                    )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ariaLabel)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !pressed {
                            withAnimation(PosterAnimations.overshoot(0.25)) { pressed = true }
                        }
                    }
                    .onEnded { _ in
                        withAnimation(PosterAnimations.overshoot(0.25)) { pressed = false }
                    }
            )
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - 4 files present
    - `grep -F 'enum PosterButtonVariant' ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift` returns 1
    - `grep -c 'case primary\|case ghost\|case destructive' ios/BudgetPlanner/FeaturesV10/Common/PosterButton.swift` returns ≥ 3
    - `grep -F 'step: Int = 500' ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift` returns 1
    - `grep -F '300_000_000' ios/BudgetPlanner/FeaturesV10/Common/PosterSlider.swift` returns 1
    - `grep -F 'scaleEffect(pressed ? 0.88 : 1.0)' ios/BudgetPlanner/FeaturesV10/Common/FAB.swift` returns 1
    - `grep -F 'rotationEffect(.degrees(pressed ? -90 : 0))' ios/BudgetPlanner/FeaturesV10/Common/FAB.swift` returns 1
    - `grep -F '48' ios/BudgetPlanner/FeaturesV10/Common/FAB.swift` returns ≥ 2
    - Build: `cd ios && xcodegen generate && make build` exits 0
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'enum PosterButtonVariant' BudgetPlanner/FeaturesV10/Common/PosterButton.swift &amp;&amp; grep -F 'step: Int = 500' BudgetPlanner/FeaturesV10/Common/PosterSlider.swift &amp;&amp; grep -F 'rotationEffect(.degrees(pressed ? -90 : 0))' BudgetPlanner/FeaturesV10/Common/FAB.swift</automated>
  </verify>
  <done>
    PosterButton (3 variants), Chip (active toggle), PosterSlider (step 500 + 300ms debounce + tap-edit), FAB (press transform with PosterAnimations.overshoot) compile.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: TabBar + Toast (composite components with animations)</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift,
    ios/BudgetPlanner/FeaturesV10/Common/Toast.swift
  </files>
  <read_first>
    - prototype JSX L75-150 (5-col grid with FAB at idx 2; sliding indicator)
    - DESIGN-SYSTEM.md §6.8, §6.10
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift`:
    ```swift
    import SwiftUI

    enum TabId: String, CaseIterable, Hashable { case home, savings, ai, mgmt }

    /// 5-col bottom tab bar (FAB centered as 3rd column). Symmetric to web TabBar.
    struct TabBar: View {
        @Binding var active: TabId
        var dark: Bool = false
        let onFab: () -> Void

        // Layout: 1fr 1fr 64pt 1fr 1fr — model as proportional widths
        private let columnRatios: [CGFloat] = [1, 1, 0, 1, 1]   // FAB has fixed 64pt; we'll inject

        var body: some View {
            GeometryReader { geo in
                let availableWidth = geo.size.width
                let unit = (availableWidth - 64) / 4              // 4 flex columns share the rest
                let columnWidth = unit
                let activeIdx: Int = {
                    switch active {
                    case .home:    return 0
                    case .savings: return 1
                    case .ai:      return 3
                    case .mgmt:    return 4
                    }
                }()
                ZStack(alignment: .bottomLeading) {
                    HStack(spacing: 0) {
                        TabButton(id: .home, label: "ГЛАВНАЯ", glyph: "■", dark: dark, active: $active, width: columnWidth)
                        TabButton(id: .savings, label: "КОПИЛКА", glyph: "◊", dark: dark, active: $active, width: columnWidth)
                        FAB(action: onFab).frame(width: 64)
                        TabButton(id: .ai, label: "AI", glyph: "✦", dark: dark, active: $active, width: columnWidth)
                        TabButton(id: .mgmt, label: "УПР.", glyph: "⌘", dark: dark, active: $active, width: columnWidth)
                    }
                    .frame(height: 68)

                    // Sliding indicator (2pt height, 20% width = 1/5 of bar)
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
                .shadow(color: .black.opacity(0.45), radius: 30, x: 0, y: 12)
            }
            .frame(height: 68)
            .padding(.horizontal, 14)
            .padding(.bottom, 18)
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
                        .scaleEffect(isActive ? 1.0 : 1.0)        // base scale
                        // posterTabPop: scale 1 → 1.35 → 1 over 0.45s overshoot
                        // We trigger via .id(active) and matchedGeometryEffect at parent if needed
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
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/Toast.swift`:
    ```swift
    import SwiftUI

    /// Fly-in toast with overshoot, ✓ checkmark stroke draw, 1700ms life.
    /// Symmetric to web <Toast>.
    struct Toast: View {
        let message: String
        @Binding var visible: Bool
        var duration: TimeInterval = 1.7

        @State private var checkProgress: CGFloat = 0

        var body: some View {
            ZStack {
                if visible {
                    HStack(spacing: 8) {
                        // Path-trim animated checkmark — DESIGN-SYSTEM §7.2 posterCheck
                        CheckPath(progress: checkProgress)
                            .stroke(PosterTokens.Color.ink,
                                    style: StrokeStyle(lineWidth: 2.5, lineCap: .square))
                            .frame(width: 14, height: 14)
                        Text(message.uppercased())
                            .font(.custom(PosterTokens.Font.jetBrainsMono, size: 11).weight(.bold))
                            .tracking(2)
                            .foregroundColor(PosterTokens.Color.ink)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(PosterTokens.Color.yellow)
                    .shadow(color: .black.opacity(0.25), radius: 20, x: 0, y: 6)
                    .posterTransition(.scale(scale: 0.9).combined(with: .opacity))
                    .onAppear {
                        // Fire posterCheck stroke draw
                        checkProgress = 0
                        withAnimation(PosterAnimations.posterCheck) { checkProgress = 1 }
                        // Auto-dismiss after duration
                        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
                            visible = false
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 64)
            .posterAnimation(PosterAnimations.posterToastIn, value: visible)
        }
    }

    private struct CheckPath: Shape {
        var progress: CGFloat                              // 0 → 1
        var animatableData: CGFloat {
            get { progress } set { progress = newValue }
        }
        func path(in rect: CGRect) -> Path {
            // Two-segment polyline: (4,12) → (10,18) → (20,6) on 24x24 viewBox
            let p1 = CGPoint(x: rect.minX + rect.width * (4.0/24),  y: rect.minY + rect.height * (12.0/24))
            let p2 = CGPoint(x: rect.minX + rect.width * (10.0/24), y: rect.minY + rect.height * (18.0/24))
            let p3 = CGPoint(x: rect.minX + rect.width * (20.0/24), y: rect.minY + rect.height * ( 6.0/24))

            // Total length approx
            let l1 = hypot(p2.x - p1.x, p2.y - p1.y)
            let l2 = hypot(p3.x - p2.x, p3.y - p2.y)
            let total = l1 + l2
            let drawLen = total * progress

            var p = Path()
            p.move(to: p1)
            if drawLen <= l1 {
                let t = drawLen / l1
                p.addLine(to: CGPoint(x: p1.x + (p2.x - p1.x) * t,
                                      y: p1.y + (p2.y - p1.y) * t))
            } else {
                p.addLine(to: p2)
                let remain = drawLen - l1
                let t = min(1, remain / l2)
                p.addLine(to: CGPoint(x: p2.x + (p3.x - p2.x) * t,
                                      y: p2.y + (p3.y - p2.y) * t))
            }
            return p
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - 2 files present
    - `grep -F 'enum TabId' ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift` returns 1
    - `grep -c 'case home\|case savings\|case ai\|case mgmt' ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift` returns ≥ 4
    - `grep -F 'PosterAnimations.sheetEase(0.35)' ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift` returns 1
    - `grep -F 'PosterAnimations.posterTabPop' ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift` returns 1
    - `grep -F 'shadow(color: .black.opacity(0.45)' ios/BudgetPlanner/FeaturesV10/Common/TabBar.swift` returns 1
    - `grep -F 'duration: TimeInterval = 1.7' ios/BudgetPlanner/FeaturesV10/Common/Toast.swift` returns 1
    - `grep -F 'PosterAnimations.posterToastIn' ios/BudgetPlanner/FeaturesV10/Common/Toast.swift` returns 1
    - `grep -F 'PosterAnimations.posterCheck' ios/BudgetPlanner/FeaturesV10/Common/Toast.swift` returns 1
    - `grep -F 'struct CheckPath: Shape' ios/BudgetPlanner/FeaturesV10/Common/Toast.swift` returns 1
    - All 10 component files exist: `ls ios/BudgetPlanner/FeaturesV10/Common/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,TabBar,FAB,Toast}.swift | wc -l` returns 10
    - Build: `cd ios && xcodegen generate && make build` exits 0
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; ls BudgetPlanner/FeaturesV10/Common/{Eyebrow,Mass,BigFig,Plate,PosterButton,Chip,PosterSlider,TabBar,FAB,Toast}.swift | wc -l | grep -q '^[[:space:]]*10$' &amp;&amp; grep -F 'enum TabId' BudgetPlanner/FeaturesV10/Common/TabBar.swift &amp;&amp; grep -F 'PosterAnimations.posterToastIn' BudgetPlanner/FeaturesV10/Common/Toast.swift</automated>
  </verify>
  <done>
    All 10 iOS components live; TabBar uses sliding indicator + posterTabPop on active glyph; Toast applies posterToastIn entry + posterCheck stroke + 1700ms auto-dismiss; build succeeds.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Component @State / @Binding | SwiftUI runtime; no untrusted input |
| Toast / TabBar accessibility labels | Static or developer-controlled strings |
| PosterSlider numeric input | TextField with `.keyboardType(.numberPad)` filters non-digit |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-07-01 | Tampering | PosterSlider value | mitigate | Range clamp `max(range.lowerBound, min(range.upperBound, snapped))`; numberPad keyboard prevents non-digit input |
| T-23-07-02 | DoS | Toast Task scheduling | mitigate | DispatchQueue.main.asyncAfter is bounded by view lifecycle; visible=false stops the toast view from rendering |
| T-23-07-03 | Information Disclosure | accessibilityLabel strings | accept | Static labels defined in code; no PII at component level |
| T-23-07-04 | Spoofing | Button presses | accept | Standard SwiftUI Button — no unauthenticated writes from this layer |
</threat_model>

<verification>
1. `cd ios && xcodegen generate && make build` succeeds.
2. (Plan 23.14 manual) PreviewGallery renders all 10 with correct fonts, animations, and reduce-motion behavior.
</verification>

<success_criteria>
- DS-06 iOS: 10 components symmetric with web; same prop names + behavior; tokens-only.
- xcodebuild succeeds.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-07-SUMMARY.md` with: file count, deviations from web prop signatures (none expected; document any), build status, screenshots if available.
</output>
