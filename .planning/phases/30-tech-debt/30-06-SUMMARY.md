---
phase: 30-tech-debt
plan: 06
subsystem: ios
tags: [refactor, ios, animations, networking, debt]
requires: []
provides:
  - posterAnimation-consistent-press-feedback
  - settingsapi-own-file
affects:
  - ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift
  - ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift
  - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
  - ios/BudgetPlanner/Networking/Endpoints/SettingsAPI.swift
tech-stack:
  added: []
  patterns:
    - reduce-motion-aware press feedback via PosterAnimations.easeOut
    - one-enum-per-file networking endpoint layout
key-files:
  created:
    - ios/BudgetPlanner/Networking/Endpoints/SettingsAPI.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift
    - ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift
    - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
decisions:
  - PosterAnimations has no named "snap"/"press" alias; chose PosterAnimations.easeOut(duration) preserving original 0.15s / 0.08s durations and routing through reduce-motion-aware modifier with project's cubic-bezier easing curve.
  - SettingsAPI extraction is pure code motion (no API changes); call-sites in SettingsView.swift + SettingsV10ViewModel.swift required no edits (same module).
metrics:
  duration: "0m 33s"
  tasks_completed: 3
  files_changed: 4
  completed: 2026-05-10
---

# Phase 30 Plan 06: posterAnimation modifier + SettingsAPI file split (DEBT-06+07) Summary

Bundled iOS tech-debt cleanup: switched two bare `.animation(.easeOut...)` callsites
to the project's reduce-motion-aware `.posterAnimation(...)` modifier, and extracted
`enum SettingsAPI` from `TransactionsAPI.swift` into its own `SettingsAPI.swift` file
per Plan 27-11's intent of one-enum-per-file for the Networking/Endpoints layer.

## What Was Built

### DEBT-06: bare `.animation` → `.posterAnimation` (PosterStyle, KeypadView)

Two callsites used bare SwiftUI `.animation(.easeOut(duration: X), value: pressed)`
for press-feedback `scaleEffect`, bypassing the DS-05 `posterAnimation` modifier
that honours `accessibilityReduceMotion`:

- `PosterStyle.swift:44` — `PosterPress.body(content:)` press 0.97 scale, duration 0.15s.
- `KeypadView.swift:72` — `KeyButton.body` press 0.95 scale, duration 0.08s.

Both replaced with:

```swift
.posterAnimation(PosterAnimations.easeOut(<duration>), value: pressed)
```

This preserves the original durations (0.15s / 0.08s) and the easeOut shape (now
via `PosterTokens.Easing.easeOutControl` cubic-bezier instead of SwiftUI's built-in
ease-out), while gaining the reduce-motion fallback to opacity-only animation that
all other V10 surfaces already use (TabBar, PosterNavStack, PosterSheet, Toast).

### DEBT-07: extract `enum SettingsAPI` to its own file

Per Plan 27-11 frontmatter intent (one-enum-per-file in `Networking/Endpoints/`),
`enum SettingsAPI` was the last endpoint still co-located with `TransactionsAPI.swift`.
Moved verbatim to new `SettingsAPI.swift` (same module — Swift visibility unchanged,
no `import` updates needed at call-sites).

Call-sites verified:
- `Features/Management/SettingsView.swift` (2 refs) — no changes needed
- `FeaturesV10/Management/SettingsV10ViewModel.swift` (4 refs) — no changes needed

## Deviations from Plan

### Plan Action vs. Available API

**[Plan guidance vs. reality] `PosterAnimations.snap` / `.press` alias does not exist**
- **Found during:** Task 1
- **Issue:** Plan suggested `.posterAnimation(PosterAnimations.snap, value: pressed)` or
  `.posterAnimation(PosterAnimations.press, value: pressed)`. Reading
  `PosterAnimations.swift` shows no such named alias — the enum exposes only
  generic curves (`easeOut(duration:)`, `overshoot(duration:)`, `sheetEase(duration:)`)
  and pre-baked use-cases (`posterRowIn`, `posterRiseIn`, `posterToastIn`, etc.).
- **Decision:** Used `PosterAnimations.easeOut(<duration>)` preserving the original
  bare-`.easeOut` durations (0.15s and 0.08s). This is the minimal-change path:
  same easing family, same durations, gains reduce-motion handling. Adding a
  dedicated `.press` named alias would have been scope creep across the
  animation enum + risked changing the durations away from established UX.
- **Files modified:** PosterStyle.swift, KeypadView.swift
- **Commit:** [see final commit hash]

Otherwise no deviations — plan executed as written, both build verifications passed
on the first iteration.

## Verification

```
$ cd ios && make build
Build Succeeded
```

```
$ grep -n "\.animation(\.easeOut" ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift \
                                   ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift
(no matches — clean)

$ test -f ios/BudgetPlanner/Networking/Endpoints/SettingsAPI.swift && echo OK
OK

$ grep -n "SettingsAPI" ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
(no matches — extracted)
```

iOS build: succeeded (xcbeautify reports `Build Succeeded`). No warnings introduced.

## Known Stubs

None — both items are pure refactors with no behaviour change. No UI elements were
added or removed; reduce-motion fallback for the two press-feedback callsites is the
only user-visible effect, and only when accessibility setting is enabled.

## Self-Check: PASSED

- FOUND: ios/BudgetPlanner/Networking/Endpoints/SettingsAPI.swift
- FOUND: ios/BudgetPlanner/FeaturesV10/Common/PosterStyle.swift (modified)
- FOUND: ios/BudgetPlanner/FeaturesV10/AddSheet/KeypadView.swift (modified)
- FOUND: ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift (modified)
- Build clean: xcodebuild Debug exit 0
