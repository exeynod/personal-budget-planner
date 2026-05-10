---
phase: 23-design-system-foundation
plan: 10
type: execute
wave: 6
depends_on: [23-design-system-foundation/03, 23-design-system-foundation/06, 23-design-system-foundation/07, 23-design-system-foundation/08]
files_modified:
  - ios/BudgetPlanner/App/AppRouter.swift
  - ios/BudgetPlanner/App/V10MainShell.swift
  - ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift
autonomous: true
requirements: [DS-08, DS-07]
tags: [design-system, ios, dual-shell, preview, swiftui]
must_haves:
  truths:
    - "@AppStorage(\"ui.theme\") String value 'v10' renders V10MainShell { PosterNavStack { PreviewGallery() } }; value 'v06' renders existing untouched MainShell."
    - "Default value for new installs = 'v10'; existing iPhone Denis install retains 'v06' until manually flipped (per CONTEXT decision)."
    - "PreviewGallery renders all 10 iOS components + buttons to trigger 11 animations + accessibility labels for VoiceOver smoke."
    - "PosterNavStack push test in PreviewGallery: tapping a 'Push' button pushes a second screen; back button or edge-swipe returns."
    - "PosterSheet test in PreviewGallery: tapping 'Show sheet' shows slide-up sheet; tap-backdrop or drag-down closes."
  artifacts:
    - path: "ios/BudgetPlanner/App/V10MainShell.swift"
      provides: "V10 root: instantiates PosterRouter + wraps PreviewGallery in PosterNavStack"
      max_lines: 60
    - path: "ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift"
      provides: "iOS preview surface — equivalent to web /preview"
    - path: "ios/BudgetPlanner/App/AppRouter.swift"
      provides: "Updated AppRouter — switch on @AppStorage(\"ui.theme\") between MainShell and V10MainShell"
  key_links:
    - from: "AppRouter @AppStorage(\"ui.theme\")"
      to: "V10MainShell or MainShell"
      via: "switch statement"
    - from: "V10MainShell"
      to: "FeaturesV10/PreviewGallery.swift"
      via: "PosterNavStack { PreviewGallery() }"
---

<objective>
Implement iOS dual-shell flag plumbing and V10 preview surface (DS-08 iOS + DS-07 reachability):
1. Modify `ios/BudgetPlanner/App/AppRouter.swift` — add `@AppStorage("ui.theme")` String binding (default `"v10"`); when authenticated, branch on theme: `"v10"` → `V10MainShell()`, `"v06"` → existing `MainShell()` (untouched).
2. Create `ios/BudgetPlanner/App/V10MainShell.swift` — root V10 view: instantiates `PosterRouter`, wraps `PreviewGallery()` in `PosterNavStack`.
3. Create `ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` — iOS equivalent of web /preview: gallery of 10 components + 11 animation triggers + push test (PosterNavStack child screen) + sheet test (PosterSheet).
4. Validate at-launch theme value to prevent corrupt UserDefaults entries (only `"v06"` or `"v10"` accepted, otherwise overwrite with `"v10"`).

Purpose: DS-08 iOS shell switch; DS-07 verified by PreviewGallery exercising PosterNavStack + PosterSheet.
Output: 3 Swift files (1 modified, 2 new).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-design-system-foundation/23-CONTEXT.md
@.planning/research/ADR-002-poster-nav-stack-approach.md

<read_first>
- `ios/BudgetPlanner/App/AppRouter.swift` (current 27-line state)
- `ios/BudgetPlanner/App/BudgetPlannerApp.swift` (uses `MainShell()` via AppRouter)
- `ios/BudgetPlanner/Features/` directory listing — locate the existing `MainShell` (likely `Features/Common/` or screen-specific)
- CONTEXT.md Area 4 — `@AppStorage("ui.theme")` default `"v10"` for new installs, existing user retains `"v06"` for migration
- Plan 23.07 component file paths (Eyebrow.swift, Mass.swift, BigFig.swift, etc.)
- Plan 23.08 PosterNavStack/PosterSheet APIs
- ADR-002 — push 3 screens → swipe-back assert top-of-stack reverts (acceptance test target for Plan 23.14)
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Locate existing MainShell + modify AppRouter to switch on @AppStorage("ui.theme")</name>
  <files>ios/BudgetPlanner/App/AppRouter.swift</files>
  <read_first>
    - Run `grep -rln "struct MainShell" ios/BudgetPlanner/Features/` to confirm location
    - Current `AppRouter.swift` (27 lines)
  </read_first>
  <action>
    Modify `ios/BudgetPlanner/App/AppRouter.swift` (preserve all existing auth flow; add only the post-authenticated branch):

    ```swift
    import SwiftUI

    struct AppRouter: View {
        @Environment(AuthStore.self) private var authStore
        @AppStorage("ui.theme") private var themeRaw: String = "v10"

        // DS-08: validate value at access time — defends against UserDefaults tampering or
        // schema drift. Falls back to "v10" if anything other than v06 / v10 is stored.
        private var theme: String {
            (themeRaw == "v06" || themeRaw == "v10") ? themeRaw : "v10"
        }

        var body: some View {
            Group {
                switch authStore.state {
                case .bootstrapping:
                    ZStack {
                        Color(.systemGroupedBackground).ignoresSafeArea()
                        ProgressView().controlSize(.large)
                    }
                case .unauthenticated, .error:
                    DevTokenSetupView()
                case .onboardingRequired(let user):
                    OnboardingView(initialUser: user)
                case .authenticated:
                    if theme == "v10" {
                        V10MainShell()
                    } else {
                        MainShell()
                    }
                }
            }
            .task {
                // Self-heal corrupt UserDefaults entries (overwrite once at launch)
                if themeRaw != "v06" && themeRaw != "v10" {
                    themeRaw = "v10"
                }
                await authStore.bootstrap()
            }
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - `grep -F '@AppStorage("ui.theme")' ios/BudgetPlanner/App/AppRouter.swift` returns 1
    - `grep -F 'V10MainShell()' ios/BudgetPlanner/App/AppRouter.swift` returns 1
    - `grep -F 'MainShell()' ios/BudgetPlanner/App/AppRouter.swift` returns ≥ 1 (existing v0.6 reference preserved)
    - `grep -F 'themeRaw == "v06" || themeRaw == "v10"' ios/BudgetPlanner/App/AppRouter.swift` returns ≥ 1 (validation)
    - `grep -F 'themeRaw = "v10"' ios/BudgetPlanner/App/AppRouter.swift` returns ≥ 1 (self-heal write)
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; grep -F '@AppStorage("ui.theme")' BudgetPlanner/App/AppRouter.swift &amp;&amp; grep -F 'V10MainShell()' BudgetPlanner/App/AppRouter.swift &amp;&amp; grep -F 'themeRaw == "v06" || themeRaw == "v10"' BudgetPlanner/App/AppRouter.swift</automated>
  </verify>
  <done>
    AppRouter switches on validated @AppStorage("ui.theme") between V10MainShell and MainShell; corrupt values self-heal to "v10".
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create V10MainShell.swift</name>
  <files>ios/BudgetPlanner/App/V10MainShell.swift</files>
  <read_first>
    - Plan 23.08 PosterNavStack init with `@ViewBuilder root: () -> Root`
    - PosterRouter API
    - CONTEXT.md Area 4: «V10MainShell initial scope = minimal placeholder: PosterNavStack { PreviewGallery() }»
  </read_first>
  <action>
    Create `ios/BudgetPlanner/App/V10MainShell.swift`:
    ```swift
    import SwiftUI

    /// V10 root view (DS-08). Phase 23 minimal scope: render PreviewGallery inside PosterNavStack.
    /// Real screens (Home, Transactions, Add Sheet, etc.) added in Phases 24-27.
    struct V10MainShell: View {
        var body: some View {
            ZStack {
                PosterTokens.Color.coral.ignoresSafeArea()
                PosterNavStack {
                    PreviewGallery()
                }
            }
            .preferredColorScheme(.dark)                  // poster fonts on dark backgrounds default to light text
        }
    }

    #Preview {
        V10MainShell()
            .environment(AuthStore())                     // for symmetry with v0.6 root
    }
    ```
  </action>
  <acceptance_criteria>
    - `test -f ios/BudgetPlanner/App/V10MainShell.swift`
    - `wc -l ios/BudgetPlanner/App/V10MainShell.swift` returns ≤ 60
    - `grep -F 'struct V10MainShell: View' ios/BudgetPlanner/App/V10MainShell.swift` returns 1
    - `grep -F 'PosterNavStack' ios/BudgetPlanner/App/V10MainShell.swift` returns 1
    - `grep -F 'PreviewGallery' ios/BudgetPlanner/App/V10MainShell.swift` returns ≥ 1
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'struct V10MainShell: View' BudgetPlanner/App/V10MainShell.swift &amp;&amp; grep -F 'PosterNavStack' BudgetPlanner/App/V10MainShell.swift</automated>
  </verify>
  <done>
    V10MainShell wraps PreviewGallery in PosterNavStack on a coral background.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Implement PreviewGallery.swift with 10 components + 11 animation triggers + push test + sheet test</name>
  <files>ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift</files>
  <read_first>
    - All 10 component APIs from Plan 23.07
    - Plan 23.06 PosterAnimations constants
    - Plan 23.08 PosterNavStack + PosterSheet APIs
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift`:
    ```swift
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
                                .opacity(0.7)
                        }

                        // Section 2: BigFig
                        section("2. BIGFIG · COUNT-UP") {
                            BigFig(value: 142380, sup: "₽", size: 64)
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
                            PosterSlider(value: $sliderValue, in: 0...30000, step: 500, label: "Продукты")
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
        private func section(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
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
                .scaleEffect(scaleX, anchor: .leading)
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
    ```
  </action>
  <acceptance_criteria>
    - `test -f ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift`
    - `grep -c 'Eyebrow\|Mass\|BigFig\|Plate\|PosterButton\|Chip\|PosterSlider\|TabBar\|FAB\|Toast' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns ≥ 12 (each component used ≥ once)
    - `grep -F 'PosterAnimations.posterRowIn' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns ≥ 1
    - `grep -F 'PosterAnimations.posterToastIn' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns ≥ 1
    - `grep -c 'posterRowIn\|posterRiseIn\|posterBarFill\|posterTabPop\|posterPopIn\|posterCheck\|posterDot\|posterSlideInFwd\|posterSlideInBack\|posterTabSwap\|posterToastIn' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns ≥ 11
    - `grep -F 'router?.push(SecondScreen())' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns 1 (DS-07 nav push test)
    - `grep -F '.posterSheet(isPresented:' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns 1 (DS-07 sheet test)
    - `grep -F '"Май"' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns 1
    - `grep -F '"May"' ios/BudgetPlanner/FeaturesV10/PreviewGallery.swift` returns 1
    - Build: `cd ios && xcodegen generate && make build` exits 0
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'router?.push(SecondScreen())' BudgetPlanner/FeaturesV10/PreviewGallery.swift &amp;&amp; grep -F '.posterSheet(isPresented:' BudgetPlanner/FeaturesV10/PreviewGallery.swift &amp;&amp; grep -c 'PosterAnimations.poster' BudgetPlanner/FeaturesV10/PreviewGallery.swift | awk '{ if ($1 &gt;= 8) exit 0; else exit 1; }'</automated>
  </verify>
  <done>
    PreviewGallery exercises all 10 components + 11 animations + nav-push test + sheet test; build succeeds.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UserDefaults `ui.theme` | iOS-stored, accessible to user via Settings/restore |
| @AppStorage binding | SwiftUI-managed, type-validated to String |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-10-01 | Tampering | UserDefaults `ui.theme` | mitigate | At-launch validation rewrites any value other than `"v06"` or `"v10"` to `"v10"` (self-heal); read-time validator returns safe default if drift |
| T-23-10-02 | Spoofing | View routing | accept | SwiftUI body branch on validated theme — no runtime view substitution from external input |
| T-23-10-03 | DoS | Animation re-mount via .id() bump | accept | Bounded by user taps; no infinite loop |
| T-23-10-04 | Information Disclosure | PreviewGallery content | accept | Static design metadata; gallery accessible only when authenticated AND ui.theme=v10 (preview is dev/internal only) |
</threat_model>

<verification>
1. `cd ios && make run` builds + launches simulator with default theme `"v10"` → V10MainShell renders PreviewGallery.
2. From simulator: tap "Push test screen" → SecondScreen mounts via PosterNavStack; tap "Pop back" or swipe from leading edge → returns to gallery.
3. Tap "Show poster sheet" → drag down beyond 100pt threshold → sheet dismisses.
4. Set `xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner ui.theme v06` + relaunch → MainShell (v0.6) renders.
5. Set `xcrun simctl spawn booted defaults write com.exeynod.BudgetPlanner ui.theme garbage` + relaunch → V10MainShell renders (self-heal default).
</verification>

<success_criteria>
- DS-08 iOS: AppRouter switch operational; default `"v10"` for new installs; corrupt values self-heal.
- DS-07 reachability: PreviewGallery exercises PosterNavStack push + PosterSheet drag-close.
- All 10 components + 11 animations exercised in gallery.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-10-SUMMARY.md` with: AppRouter diff, V10MainShell line count, PreviewGallery section count, build status, simulator launch verification result.
</output>
