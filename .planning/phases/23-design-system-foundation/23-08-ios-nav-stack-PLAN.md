---
phase: 23-design-system-foundation
plan: 08
type: execute
wave: 5
depends_on: [23-design-system-foundation/06, 23-design-system-foundation/07]
files_modified:
  - ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift
  - ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift
  - ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift
  - ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift
  - ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift
autonomous: true
requirements: [DS-07]
tags: [design-system, ios, navigation, swiftui, accessibility]
must_haves:
  truths:
    - "PosterNavStack ZStack composition with asymmetric forward/back transitions per ADR-002 (28pt translate3d, 0.42s easeOut)."
    - "@Observable PosterRouter exposes push(:), pop(), popToRoot() and tracks direction (forward/backward) for asymmetric transitions."
    - "Edge-swipe-back via UIScreenEdgePanGestureRecognizer (minimumDistance 24, threshold 80px), wrapped in UIViewRepresentable, attached only when stack.count > 1."
    - "Edge-swipe area carries .accessibilityLabel(\"Назад\") + .accessibilityAddTraits(.isButton)."
    - "PosterSheet presentation: slide-up from bottom + sheetEase + backdrop opacity 0.45 + tap-to-dismiss + drag-to-close (translation > 100pt OR velocity > 800)."
    - "All animations wrapped via posterAnimation()/posterTransition() so reduce-motion is respected."
  artifacts:
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift"
      provides: "@Observable router state — stack array + direction"
      max_lines: 60
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift"
      provides: "ZStack composition with edge-swipe gesture"
      max_lines: 100
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift"
      provides: ".asymmetricSlide(direction:) transition modifier"
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift"
      provides: "UIScreenEdgePanGestureRecognizer bridge via UIViewRepresentable"
    - path: "ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift"
      provides: "Custom slide-up sheet with drag-to-close"
  key_links:
    - from: "PosterNavStack body"
      to: "PosterRouter.stack"
      via: "ForEach(router.stack) { entry in entry.view }"
    - from: "PosterNavStack body"
      to: "PosterEdgeSwipeGesture"
      via: ".overlay(PosterEdgeSwipeGesture(onSwipeBack: router.pop))"
    - from: "PosterEdgeSwipe"
      to: "router.pop()"
      via: "callback when translation > 80pt"
---

<objective>
Implement custom navigation primitives for V10 iOS shell per ADR-002:
1. **`PosterRouter`** — `@Observable` class managing nav stack + direction.
2. **`PosterNavStack`** — ZStack with asymmetric transitions (forward = trailing-edge slide-in / leading-edge slide-out; back = leading-edge slide-in / trailing-edge slide-out), 0.42s easeOut, 28pt offset.
3. **`PosterTransitions.swift`** — reusable asymmetric transition modifier.
4. **`PosterEdgeSwipe.swift`** — `UIScreenEdgePanGestureRecognizer` adapter via `UIViewRepresentable`, fires `onSwipeBack` callback when leading-edge pan exceeds 80pt translation. Includes accessibility traits «Назад» + isButton.
5. **`PosterSheet`** — Custom slide-up sheet (NOT system .sheet — needs sheetEase override). Slide-up from bottom + cubic-bezier(0.32, 0.72, 0, 1) + backdrop opacity 0.45 + tap-to-dismiss + drag-to-close (translation > 100pt OR velocity > 800).

All animations route through `posterAnimation()`/`posterTransition()` modifiers (Plan 23.06) so accessibilityReduceMotion flattens to opacity-only.

Purpose: DS-07 — iOS custom navigation foundation per ADR-002 (NavigationStack cannot match 28px / 420ms / cubic-bezier spec).
Output: 5 Swift files (~250 LOC total).
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
- `.planning/research/ADR-002-poster-nav-stack-approach.md` (full ADR — copy code snippets verbatim where applicable)
- `.planning/phases/23-design-system-foundation/23-CONTEXT.md` Area 3 (PosterNavStack target ~50 LOC, edge-swipe via UIScreenEdgePanGestureRecognizer wrapped in UIViewControllerRepresentable, drag-to-close threshold 100pt OR velocity 800)
- `ios/BudgetPlanner/FeaturesV10/Common/PosterAnimations.swift` (post-Plan 23.06) for `slideInFwdTransition()`, `slideInBackTransition()`, `posterSlide` (0.42s easeOut), `sheetEase()`
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTokens.swift` for backdrop color (.black.opacity(0.45))
- iOS 26 SDK: `@Observable` (iOS 17+), `UIScreenEdgePanGestureRecognizer` (UIKit always available)
</read_first>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: PosterRouter @Observable class + PosterNavEntry struct</name>
  <files>ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift</files>
  <read_first>
    - ADR-002 — class skeleton lines 17-28
    - Use `AnyView` for stack entries to allow heterogeneous screens; alternative (enum-based) is less flexible. We'll use AnyView per CONTEXT decision.
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift`:
    ```swift
    import SwiftUI
    import Observation

    /// Direction of the most recent stack mutation; drives asymmetric transitions.
    enum PosterNavDirection { case forward, backward }

    /// One entry in the nav stack.
    struct PosterNavEntry: Identifiable {
        let id = UUID()
        let view: AnyView
    }

    /// Stack-based navigation router for V10 shell. ADR-002.
    @MainActor
    @Observable
    final class PosterRouter {
        private(set) var stack: [PosterNavEntry] = []
        private(set) var direction: PosterNavDirection = .forward

        init(root: some View) {
            stack = [PosterNavEntry(view: AnyView(root))]
        }

        func push(_ view: some View) {
            direction = .forward
            stack.append(PosterNavEntry(view: AnyView(view)))
        }

        func pop() {
            guard stack.count > 1 else { return }
            direction = .backward
            _ = stack.popLast()
        }

        func popToRoot() {
            guard stack.count > 1 else { return }
            direction = .backward
            stack = Array(stack.prefix(1))
        }

        var canPop: Bool { stack.count > 1 }
    }

    /// Environment key for child views to push/pop.
    private struct PosterRouterKey: EnvironmentKey {
        static let defaultValue: PosterRouter? = nil
    }
    extension EnvironmentValues {
        var posterRouter: PosterRouter? {
            get { self[PosterRouterKey.self] }
            set { self[PosterRouterKey.self] = newValue }
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - `test -f ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift`
    - `wc -l ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift` returns ≤ 70
    - `grep -F '@Observable' ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift` returns 1
    - `grep -F 'final class PosterRouter' ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift` returns 1
    - `grep -F 'func push' ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift` returns 1
    - `grep -F 'func pop' ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift` returns ≥ 1
    - `grep -F 'enum PosterNavDirection' ios/BudgetPlanner/FeaturesV10/Common/PosterRouter.swift` returns 1
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'final class PosterRouter' BudgetPlanner/FeaturesV10/Common/PosterRouter.swift &amp;&amp; grep -F '@Observable' BudgetPlanner/FeaturesV10/Common/PosterRouter.swift</automated>
  </verify>
  <done>
    PosterRouter @Observable class compiles; push/pop/popToRoot work; direction tracked.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: PosterTransitions + PosterEdgeSwipe (gesture bridge)</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift,
    ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift
  </files>
  <read_first>
    - PosterAnimations.swift (post-Plan 23.06) — `slideInFwdTransition()`, `slideInBackTransition()`, `posterSlide`
    - ADR-002 lines 46-51 (edge-swipe specs: minimumDistance 24, threshold 80px, coordinateSpace .global)
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift`:
    ```swift
    import SwiftUI

    extension AnyTransition {
        /// Asymmetric slide per ADR-002: forward = trailing-in / leading-out, back = leading-in / trailing-out.
        /// 28pt translate is approximated by SwiftUI .move(edge:) which uses full-width;
        /// for prototype-exact 28pt we'd need .offset(x:) instead — Phase 28 polish may tune.
        static func posterAsymmetricSlide(direction: PosterNavDirection) -> AnyTransition {
            switch direction {
            case .forward:
                return .asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal:   .move(edge: .leading).combined(with: .opacity)
                )
            case .backward:
                return .asymmetric(
                    insertion: .move(edge: .leading).combined(with: .opacity),
                    removal:   .move(edge: .trailing).combined(with: .opacity)
                )
            }
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift`:
    ```swift
    import SwiftUI
    import UIKit

    /// Wraps UIScreenEdgePanGestureRecognizer for SwiftUI consumers.
    /// Per ADR-002: minimumDistance 24, threshold 80px, leading edge.
    /// Fires onSwipeBack() callback when pan ends with translation.x > 80pt OR velocity.x > 800.
    struct PosterEdgeSwipe: UIViewRepresentable {
        let enabled: Bool
        let onSwipeBack: () -> Void

        func makeCoordinator() -> Coordinator {
            Coordinator(onSwipeBack: onSwipeBack)
        }

        func makeUIView(context: Context) -> UIView {
            let view = UIView(frame: .zero)
            view.backgroundColor = .clear
            view.isUserInteractionEnabled = enabled

            let gesture = UIScreenEdgePanGestureRecognizer(
                target: context.coordinator,
                action: #selector(Coordinator.handle(_:))
            )
            gesture.edges = .left
            view.addGestureRecognizer(gesture)
            context.coordinator.gesture = gesture

            // Accessibility per ADR-002
            view.accessibilityLabel = "Назад"
            view.accessibilityTraits = .button
            view.isAccessibilityElement = enabled

            return view
        }

        func updateUIView(_ uiView: UIView, context: Context) {
            uiView.isUserInteractionEnabled = enabled
            uiView.isAccessibilityElement = enabled
            context.coordinator.onSwipeBack = onSwipeBack
        }

        final class Coordinator: NSObject {
            var onSwipeBack: () -> Void
            weak var gesture: UIScreenEdgePanGestureRecognizer?

            init(onSwipeBack: @escaping () -> Void) {
                self.onSwipeBack = onSwipeBack
            }

            @objc func handle(_ recognizer: UIScreenEdgePanGestureRecognizer) {
                guard let view = recognizer.view else { return }
                let translation = recognizer.translation(in: view)
                let velocity = recognizer.velocity(in: view)

                if recognizer.state == .ended || recognizer.state == .recognized {
                    if translation.x > 80 || velocity.x > 800 {
                        onSwipeBack()
                        // Announce screen change for VoiceOver
                        UIAccessibility.post(notification: .screenChanged, argument: nil)
                    }
                }
            }
        }
    }

    /// SwiftUI helper modifier — overlays edge-swipe gesture area on the leading 24pt strip.
    extension View {
        @ViewBuilder
        func posterEdgeSwipeBack(enabled: Bool, onSwipeBack: @escaping () -> Void) -> some View {
            self.overlay(alignment: .leading) {
                PosterEdgeSwipe(enabled: enabled, onSwipeBack: onSwipeBack)
                    .frame(width: 24)
                    .frame(maxHeight: .infinity)
                    .allowsHitTesting(enabled)
            }
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - 2 files present
    - `grep -F 'static func posterAsymmetricSlide' ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift` returns 1
    - `grep -F '.move(edge: .trailing)' ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift` returns ≥ 2 (forward.insertion + backward.removal)
    - `grep -F 'UIScreenEdgePanGestureRecognizer' ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` returns ≥ 1
    - `grep -F '.left' ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` returns ≥ 1
    - `grep -F 'translation.x > 80' ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` returns 1
    - `grep -F 'velocity.x > 800' ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` returns 1
    - `grep -F '"Назад"' ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` returns 1
    - `grep -F 'accessibilityTraits = .button' ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` returns 1
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'UIScreenEdgePanGestureRecognizer' BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift &amp;&amp; grep -F 'translation.x &gt; 80' BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift &amp;&amp; grep -F '"Назад"' BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift</automated>
  </verify>
  <done>
    PosterTransitions + PosterEdgeSwipe compile; edge-swipe gesture fires callback at 80pt threshold; accessibility «Назад» label set.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: PosterNavStack composition (50 LOC ZStack) + PosterSheet</name>
  <files>
    ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift,
    ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift
  </files>
  <read_first>
    - PosterRouter from Task 1
    - PosterTransitions + PosterEdgeSwipe from Task 2
    - PosterAnimations.posterSlide and sheetEase
    - ADR-002 lines 17-44 (PosterRoot example)
  </read_first>
  <action>
    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` (target ~80 LOC including doc comments):
    ```swift
    import SwiftUI

    /// Custom nav stack per ADR-002. Uses ZStack of router.stack entries with asymmetric
    /// transitions; edge-swipe-back on the leading 24pt strip (only when stack.count > 1).
    /// Animations route through posterAnimation() so accessibilityReduceMotion is respected.
    struct PosterNavStack<Root: View>: View {
        @State private var router: PosterRouter
        let root: Root

        init(@ViewBuilder root: () -> Root) {
            let r = root()
            self._router = State(initialValue: PosterRouter(root: r))
            self.root = r
        }

        // Accept an existing router (for V10MainShell where router lives in the shell)
        init(router: PosterRouter, @ViewBuilder root: () -> Root) {
            self._router = State(initialValue: router)
            self.root = root()
        }

        var body: some View {
            ZStack {
                ForEach(Array(router.stack.enumerated()), id: \.element.id) { idx, entry in
                    entry.view
                        .zIndex(Double(idx))
                        .posterTransition(.posterAsymmetricSlide(direction: router.direction))
                }
            }
            .environment(\.posterRouter, router)
            .posterAnimation(PosterAnimations.posterSlide, value: router.stack.map(\.id))
            .posterEdgeSwipeBack(enabled: router.canPop) {
                router.pop()
            }
        }
    }

    // Convenience for child views to navigate without pulling the env every time.
    extension View {
        func posterPush<V: View>(_ view: V, using router: PosterRouter) -> some View {
            self.onTapGesture { router.push(view) }
        }
    }
    ```

    Create `ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift`:
    ```swift
    import SwiftUI

    /// Slide-up sheet with cubic-bezier(0.32, 0.72, 0, 1) + backdrop 0.45 + tap-to-dismiss + drag-to-close.
    /// Replaces system .sheet because sheetEase is not customizable on system sheet.
    /// Drag-to-close threshold: translation > 100pt OR velocity > 800 (per CONTEXT Area 3).
    struct PosterSheet<Content: View>: ViewModifier {
        @Binding var isPresented: Bool
        @ViewBuilder let sheetContent: () -> Content

        @State private var dragOffset: CGFloat = 0
        @GestureState private var isDragging: Bool = false

        func body(content: Content) -> some View {
            ZStack {
                content
                if isPresented {
                    // Backdrop
                    Color.black
                        .opacity(0.45)
                        .ignoresSafeArea()
                        .onTapGesture {
                            withAnimation(PosterAnimations.sheetEase(0.35)) { isPresented = false }
                        }
                        .posterTransition(.opacity)
                        .zIndex(10)

                    // Sheet
                    GeometryReader { geo in
                        VStack(spacing: 0) {
                            Spacer(minLength: 0)
                            sheetContent()
                                .frame(maxWidth: .infinity)
                                .background(PosterTokens.Color.paper)
                                .offset(y: dragOffset)
                                .gesture(
                                    DragGesture()
                                        .updating($isDragging) { _, state, _ in state = true }
                                        .onChanged { v in
                                            // only allow downward drag
                                            dragOffset = max(0, v.translation.height)
                                        }
                                        .onEnded { v in
                                            // CONTEXT Area 3: close if translation > 100 OR velocity > 800
                                            let velocityY = v.predictedEndTranslation.height - v.translation.height
                                            if v.translation.height > 100 || velocityY > 800 {
                                                withAnimation(PosterAnimations.sheetEase(0.35)) {
                                                    isPresented = false
                                                    dragOffset = 0
                                                }
                                            } else {
                                                withAnimation(PosterAnimations.sheetEase(0.25)) {
                                                    dragOffset = 0
                                                }
                                            }
                                        }
                                )
                        }
                        .frame(width: geo.size.width, height: geo.size.height)
                    }
                    .posterTransition(.move(edge: .bottom))
                    .zIndex(20)
                }
            }
            .posterAnimation(PosterAnimations.sheetEase(0.35), value: isPresented)
        }
    }

    extension View {
        func posterSheet<Content: View>(
            isPresented: Binding<Bool>,
            @ViewBuilder content: @escaping () -> Content
        ) -> some View {
            modifier(PosterSheet(isPresented: isPresented, sheetContent: content))
        }
    }
    ```
  </action>
  <acceptance_criteria>
    - 2 files present
    - `wc -l ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` returns ≤ 100
    - `grep -F 'struct PosterNavStack' ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` returns 1
    - `grep -F 'posterTransition(.posterAsymmetricSlide' ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` returns 1
    - `grep -F 'posterEdgeSwipeBack' ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` returns 1
    - `grep -F 'enabled: router.canPop' ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` returns 1
    - `grep -F 'Color.black' ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift` returns ≥ 1
    - `grep -F '0.45' ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift` returns ≥ 1 (backdrop opacity)
    - `grep -F 'translation.height > 100' ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift` returns 1
    - `grep -F 'velocityY > 800' ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift` returns 1
    - `grep -F 'PosterAnimations.sheetEase(0.35)' ios/BudgetPlanner/FeaturesV10/Common/PosterSheet.swift` returns ≥ 1
    - Build: `cd ios && xcodegen generate && make build` exits 0
  </acceptance_criteria>
  <verify>
    <automated>cd ios &amp;&amp; xcodegen generate &amp;&amp; grep -F 'struct PosterNavStack' BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift &amp;&amp; grep -F 'translation.height &gt; 100' BudgetPlanner/FeaturesV10/Common/PosterSheet.swift &amp;&amp; grep -F 'velocityY &gt; 800' BudgetPlanner/FeaturesV10/Common/PosterSheet.swift</automated>
  </verify>
  <done>
    PosterNavStack composes router.stack with asymmetric transitions + edge-swipe; PosterSheet supports tap-to-dismiss + drag-to-close per CONTEXT spec.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UIKit gesture → SwiftUI callback | UIView gesture recognizer feeds back into SwiftUI state |
| Backdrop tap → isPresented binding | User-triggered, bounded |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-08-01 | Tampering | PosterRouter.stack | mitigate | `private(set)` on stack — only push/pop/popToRoot can mutate; no public arbitrary mutation |
| T-23-08-02 | Spoofing | PosterEdgeSwipe gesture | accept | Standard UIKit gesture recognizer; gesture conflicts with TabView swipe noted as ADR-002 risk — POC verification covered in Plan 23.14 |
| T-23-08-03 | DoS | unbounded stack growth | mitigate | ADR-002 mentions 8-screen cap; not enforced in this plan but each screen call site can `popToRoot()`. Phase 28 may add hard cap. |
| T-23-08-04 | Information Disclosure | accessibilityLabel «Назад» | accept | Static localized string |
| T-23-08-05 | Elevation of Privilege | environment posterRouter | mitigate | `posterRouter` env value is `PosterRouter?` — child views must check existence; cannot create privileged views |
</threat_model>

<verification>
1. `cd ios && xcodegen generate && make build` succeeds.
2. (Plan 23.14 manual checkpoint) Real-device push 3 screens → swipe-back from leading edge → assert top-of-stack reverts.
3. (Plan 23.14 manual) PosterSheet drag-to-close beyond 100pt threshold dismisses; below threshold snaps back.
</verification>

<success_criteria>
- DS-07: PosterNavStack + edge-swipe + PosterSheet implemented per ADR-002.
- All 5 files compile with iOS 26 SDK.
- Accessibility traits applied to swipe area.
</success_criteria>

<output>
Create `.planning/phases/23-design-system-foundation/23-08-SUMMARY.md` with: PosterNavStack LOC, edge-swipe threshold values committed, build status, any open risks for Plan 23.14 verification.
</output>
