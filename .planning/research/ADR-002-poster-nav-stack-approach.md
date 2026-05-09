# ADR-002: PosterNavStack Approach — Custom ZStack + ручной edge-swipe

**Дата:** 2026-05-09
**Статус:** ✅ Decided
**Phase:** 23 (Design System Foundation), 25 (первое использование), 28 (accessibility audit)

## Context

ТЗ §2 + DESIGN-SYSTEM §7.2 требуют `posterSlideInFwd` (28px справа, 420ms easeOut, ease curve `cubic-bezier(0.22, 0.61, 0.36, 1)`). Native iOS 26 `NavigationStack` использует системный slide ~60% width ~350ms — нельзя override на custom-bezier+offset через `.navigationTransition` (iOS 18+ имеет только presets `.slide` / `.zoom` / `.automatic`).

Pixel-perfect 1:1 (зафиксировано в плане v1.0) требует **точного контроля** transition.

## Decision

**Custom `PosterNavStack`** (ZStack + asymmetric transition + `@Observable` router, ~50 LOC) **+ обязательная ручная имплементация edge-swipe-back** через `UIScreenEdgePanGestureRecognizer`.

```swift
@MainActor @Observable
final class PosterNavStack {
    private(set) var stack: [Screen] = [.home]
    var direction: NavDirection = .forward
    func push(_ screen: Screen) { direction = .forward; stack.append(screen) }
    func pop() {
        guard stack.count > 1 else { return }
        direction = .backward; stack.removeLast()
    }
    func popToRoot() { direction = .backward; stack = [stack.first!] }
}

struct PosterRoot: View {
    @State var nav = PosterNavStack()
    var body: some View {
        ZStack {
            ForEach(Array(nav.stack.enumerated()), id: \.offset) { idx, screen in
                screenView(for: screen)
                    .transition(asymmetricSlide(direction: nav.direction))
                    .zIndex(Double(idx))
            }
        }
        .animation(.easeOut(duration: 0.42), value: nav.stack)
        .gesture(edgeSwipeGesture)
    }
}
```

Edge-swipe enabled только когда `stack.count > 1`, `minimumDistance: 24`, `coordinateSpace: .global`. Threshold 80px translation для commit pop.

Accessibility:
- `.accessibilityLabel("Назад")` на edge-area
- `.accessibilityAddTraits(.isButton)`
- VoiceOver announce при push/pop через `UIAccessibility.post(notification: .screenChanged, argument: ...)`

## Alternatives Considered

| Вариант | Pros | Cons |
|---|---|---|
| **A.** NavigationStack + `.navigationTransition(.slide)` (iOS 18+) | Edge-swipe out-of-box, accessibility traits, 0 кастомного кода | Spec-violation: 28px ≠ system slide (~60% width); curve fixed |
| **C.** UINavigationController + UIViewControllerRepresentable + custom UIViewControllerAnimatedTransitioning | Абсолютный контроль, edge-swipe сохраняется | ~150 LOC boilerplate, UIKit↔SwiftUI state sync, nested coordinator pattern |

## Consequences

- Phase 23 пишет `PosterNavStack.swift` (50 LOC) + `PosterTransitions.swift` (asymmetric slide modifier) + edge-swipe gesture helper
- Phase 28 acceptance включает manual real-device тест edge-swipe на iPhone 11/Pro: жест с левого края, threshold, animation reverse-progress
- Memory growth cap: 8 экранов в стеке, после — `popToRoot` from anywhere
- Tab integration: 4 independent stacks в `V10MainShell` (homeNav, savingsNav, aiNav, mgmtNav)
- Risk: edge-swipe gesture может конфликтовать с `TabView` swipe — `minimumDistance: 24` minimizes false positives, но требует POC на real device первую неделю Phase 23

## Implementation

- `ios/BudgetPlanner/FeaturesV10/Common/PosterNavStack.swift` — `@Observable` router
- `ios/BudgetPlanner/FeaturesV10/Common/PosterTransitions.swift` — `.asymmetricSlide(direction:)` modifier
- `ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift` — `UIScreenEdgePanGestureRecognizer` UIKit bridge через `UIViewRepresentable`
- Phase 28 verification: e2e UI test на real device: push 3 screens → swipe-back → assert top of stack

## Open Risks

- iPad split-view (out of v1.0 scope) может ломать edge-swipe — defer
- VoiceOver users: edge-swipe не доступен через AT, но `Back` button в UI остаётся accessible — acceptance OK
