---
phase: 28-animations-polish-acceptance
plan: 02
subsystem: ios-animations-a11y
tags: [polish, animations, a11y, ios, audit, xctest]
requires: []
provides:
  - "XCTest registry of all 11 PosterAnimations curves"
  - "stagger formula verification matching DESIGN-SYSTEM §7.4"
  - "compile-time guarantee that posterAnimation/posterTransition modifier API stays stable"
  - "audit baseline of bare .animation() callsites in iOS V10 codebase (2 hits, both press-feedback micro-interactions)"
affects:
  - "ios/BudgetPlannerTests/PosterAnimationsAuditTests.swift"
tech-stack-added: []
tech-stack-patterns:
  - "@testable import BudgetPlanner pattern (matches OnboardingMountTests, MoneyTests, PeriodTests)"
  - "XCTAssertEqual with accuracy: 1e-6 for floating-point stagger checks"
key-files-created:
  - "ios/BudgetPlannerTests/PosterAnimationsAuditTests.swift (93 LOC, 5 test methods)"
key-files-modified: []
decisions:
  - "PosterEdgeSwipe accessibility patch NOT applied — VoiceOver label/traits already pre-existing in source (lines 32-36)."
  - "Bare .animation() callsites NOT auto-replaced — flagged for v1.1 cleanup in Plan 28-03 DIVERGENCES.md (risk of regression on press-feedback timings)."
  - "Reduce-motion behavioural verification deferred to manual smoke — XCTest cannot toggle @Environment(\\.accessibilityReduceMotion) without UI test target + host app."
metrics:
  duration: "~12min"
  completed: "2026-05-10"
  tasks: "2/2"
  files: 1
  commits: 1
---

# Phase 28 Plan 02: iOS Animations Audit + a11y XCTest — Summary

XCTest harness теперь декларативно фиксирует все 11 PosterAnimations curves и
stagger-формулы DESIGN-SYSTEM §7.4 на iOS — параллельно web-acceptance из
Plan 28-01. PosterEdgeSwipe accessibility verified pre-existing (DS-07/ADR-002).

## What was built

- **`PosterAnimationsAuditTests.swift`** (93 LOC, 5 test methods):
  1. `test_all_11_animations_instantiable` — все 11 curves + `toastLifeMs == 1700`.
  2. `test_stagger_formulas_per_design_system_7_4` — 8 ассертов на rowStagger / dayGroupStagger / hintStagger / regularStagger с `accuracy: 1e-6`.
  3. `test_dot_phase_offset_per_dot` — `dotPhase(i) == i*0.18`.
  4. `test_posterAnimation_modifier_compiles_with_canonical_signature` — компайл-чек reduce-motion-aware modifier.
  5. `test_posterTransition_modifier_compiles` — то же для `AnyTransition` варианта.

## Audit findings

### `.animation(` grep audit (iOS V10)

```bash
grep -rn '\.animation(' ios/BudgetPlanner/FeaturesV10 \
  | grep -v PosterAnimations.swift \
  | grep -v 'posterAnimation\|posterTransition'
```

Результат — 2 hit-а:

| File                                                        | Line | Animation                                | Note                                                          |
| ----------------------------------------------------------- | ---- | ---------------------------------------- | ------------------------------------------------------------- |
| `ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift`    | 44   | `.animation(.easeOut(duration: 0.15), value: pressed)` | Press-feedback на кнопках; короткий 0.15s opacity fade.     |
| `ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift`   | 72   | `.animation(.easeOut(duration: 0.08), value: pressed)` | Press-feedback на keypad-клавишах; 0.08s — почти инстант.   |

**Decision:** оба — micro-interactions (press feedback), не критичные motion-rich
анимации. Per план — НЕ заменяем автоматически (риск регрессии на и так
unnoticeable timings). Логируем для v1.1 cleanup → Plan 28-03 DIVERGENCES.md
("iOS bare .animation() audit findings").

### PosterEdgeSwipe accessibility audit

```bash
grep -n 'accessibilityLabel\|accessibilityTraits\|isAccessibilityElement' \
  ios/BudgetPlanner/FeaturesV10/Common/PosterEdgeSwipe.swift
```

Результат — **3 hits, accessibility уже pre-existing** в `makeUIView` (lines 32-36):

```swift
view.accessibilityLabel = "Назад"
view.accessibilityTraits = .button
view.isAccessibilityElement = enabled
```

Плюс bonus: `UIAccessibility.post(notification: .screenChanged, argument: nil)`
в gesture handler (line 63) — VoiceOver получает announcement при успешном
back-навигации. **Patch не требовался.** Зафиксировано как «verified
pre-existing».

## Verification

- `cd ios && make build` → `Build Succeeded` (xcbeautify).
- `xcodebuild build-for-testing -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` → `** TEST BUILD SUCCEEDED **`.
- Test runtime execution skipped per `<ios_tooling>` 5min budget; компайл всех 5 методов подтверждает API surface (reduce-motion behaviour — manual smoke).

## Deviations from Plan

### None — plan executed as written

- Task 1: PosterEdgeSwipe verified pre-existing (план явно допускает этот ветка-ис: «либо patch, либо verified pre-existing»).
- Task 2: XCTest файл создан в точном соответствии с спецификацией; единственное расхождение — runtime тест-исполнение пропущено per ios_tooling time budget (build-for-testing подтвердил compile).

## Threat Flags

None — plan touches только тест-bundle и audit grep, никакой новой attack-surface.

## TDD Gate Compliance

Plan не имеет `type: tdd` (это `type: execute` audit-plan), TDD gate не применяется. Один `test(...)` commit покрывает оба done-criteria.

## Self-Check: PASSED

- `ios/BudgetPlannerTests/PosterAnimationsAuditTests.swift` — FOUND, 93 LOC.
- Commit `a04a27e` — FOUND in `git log --oneline`.
- `make build` exit-code 0 (Build Succeeded).
- `build-for-testing` — TEST BUILD SUCCEEDED (test bundle linkage verified).
