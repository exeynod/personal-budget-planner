---
phase: 24-onboarding-4-step
plan: 05
subsystem: onboarding-ios
tags: [ios, onboarding, swiftui, step02, accounts, poster-sheet, plural]
requires: [24-01, 24-03, 24-04]
provides:
  - "Step02AccountsView — accounts step body (chip-list + accounts list + add)"
  - "AccountBalanceSheet — PosterSheet content for bank+balance entry"
  - "PluralRu.accounts(_:) — Russian plural helper (one/few/many + teen exception)"
  - "OnboardingV10View case 2 wired to real Step02 (placeholder removed)"
affects:
  - "ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift"
tech-stack:
  added: []
  patterns:
    - "PosterSheet bottom-sheet hosting a separate content view (drag-to-close inherited)"
    - "@Bindable @Observable model passed into step + sheet"
    - "Sheet-mode struct (initialBank/initialKind/editable) tracked as @State alongside isPresented Bool"
    - "Free-text inputs trimmed + uppercased + sliced before persist"
key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/AccountBalanceSheet.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift
    - ios/BudgetPlannerTests/Step02AccountsTests.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift
    - .planning/phases/24-onboarding-4-step/deferred-items.md
decisions:
  - "Plan named the root view file `OnboardingView.swift`; the existing iOS file is `OnboardingV10View.swift` (Plan 24-03 Rule 3 deviation kept). Modified that file in place rather than introducing a second name."
  - "PluralRu kept as a standalone enum (no SwiftUI imports) so plural logic is reusable across future onboarding screens (categories / goals)."
  - "AccountBalanceSheet content uses ink-on-paper colour scheme (sheet bg is paper) — opposite of OnboardingChrome's paper-on-coral. Coral used as accent on the ДОБАВИТЬ button."
  - "+ Добавить chip rendered with custom dashed-border style (Chip component does not support a dashed variant) — matches web prototype line 1438."
  - "Test file kept in Task 2 commit — its assertions cover both Task 1 (PluralRu) and Task 2 (flow integration), so a single test file is the right home."
metrics:
  duration: "~7m"
  completed: "2026-05-10"
  tasks: 2
  files_created: 4
  files_modified: 2
---

# Phase 24 Plan 05: iOS Step 02 Accounts (Onboarding) Summary

**One-liner:** SwiftUI step 02 accounts screen with chip-list entry pattern + bottom-sheet balance form + Russian plural helper, symmetric to web Plan 24-04.

## What was built

### PluralRu helper

`ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift` (39 lines).

```swift
enum PluralRu {
    static func accounts(_ n: Int) -> String { … }
}
```

Pure Swift, no SwiftUI imports. Implements the standard Russian one/few/many rule with the teen exception (11..14 always "many"):

- `n%10 == 1 && n%100 != 11` → "счёт"
- `n%10 ∈ 2..4 && n%100 ∉ 12..14` → "счёта"
- everything else (including 0, 5..20) → "счётов"

### AccountBalanceSheet (PosterSheet content)

`ios/BudgetPlanner/FeaturesV10/Onboarding/AccountBalanceSheet.swift` (258 lines).

VStack-laid-out form rendered inside the existing `PosterSheet` modifier. Owns:

- Eyebrow «НОВЫЙ СЧЁТ» (ink, opacity 0.6).
- Bank row — `TextField` when `editable=true` (the «+ Добавить» path), static `Text` label otherwise. PT Serif Italic 22pt for the editable field, Archivo Black 18pt for the static label.
- Balance row — `TextField` (digits-only, .numberPad keyboard, 9-digit cap, U+202F-grouped via `RubleFormatter`) + `₽` suffix.
- Buttons row — ОТМЕНА (ghost, 1pt ink-45 border) | ДОБАВИТЬ (coral bg, paper text, Archivo Black 11pt @ 0.16em). ДОБАВИТЬ disabled when `bank.trimmingCharacters(in:.whitespaces).isEmpty`.

**Save pipeline** (`handleSave`):

1. trim leading/trailing whitespace
2. uppercase
3. slice to 40 chars (server cap from HLD §3.3 / OnboardingV10Body)
4. emit `OnboardingAccount(bank: normalised, mask: nil, kind: initialKind, balanceCents:, primary: false)` — caller (`OnboardingFlow.addAccount`) auto-promotes the first added account to primary.

### Step02AccountsView

`ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift` (260 lines).

VStack(alignment: .leading, spacing: 14):

1. `Mass("Где лежат\nденьги?", italic: true, size: 32)`
2. `Eyebrow("ВСЕ КАРТЫ И НАЛИЧНЫЕ", opacity: 0.55)`
3. **Accounts list:** `ForEach(flow.accounts.indices)` rendering each row as
   `[bank | balance + «· основной» if primary] [★ button] [× button]`, with a 1pt paper-25-opacity separator between rows. Star toggles primary (paper bg + coral text when active, transparent + paper-45-opacity border otherwise). × removes the row.
4. **Chips row:** Three preset chips (Т-Банк kind=card, Сбер kind=card, Наличные kind=cash) reusing the existing `Chip` component, plus a custom `+ ДОБАВИТЬ` chip with a 1pt dashed paper-45-opacity border. Tap on a preset opens the sheet with `editable=false`; tap on the «+ ДОБАВИТЬ» opens it with `editable=true` and `initialBank=""`.
5. **Sheet:** `.posterSheet(isPresented: $showSheet)` hosting `AccountBalanceSheet` with `onSave` → `flow.addAccount(...)`, `onCancel` → close.

State plumbing: `@State sheetMode: SheetMode?` carries the per-tap form payload alongside `@State showSheet: Bool`, mirroring the web pattern but adapted for SwiftUI's binding-driven sheet API.

### OnboardingV10View integration

`ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift` updated:

- `case 2` now renders `step02` instead of the previous placeholder.
- New `step02` private property wires `OnboardingChrome` with label «ШАГ 02 / 04 · СЧЕТА», `onBack: { flow.back() }`, `nextDisabled: flow.accounts.isEmpty`, `hint: step02Hint`.
- `step02Hint` computed: empty → «нужен минимум один счёт»; otherwise `"\(n) \(PluralRu.accounts(n)) · \(RubleFormatter.format(cents: total)) ₽"`.

### Tests

`ios/BudgetPlannerTests/Step02AccountsTests.swift` (190 lines, **17 tests, 17 green**):

| Group | Cases |
|-------|-------|
| PluralRu | 0→"счётов", 1→"счёт", few (2..4), many (5..10), teen exception (11..14), after-twenty (20..31), hundred-edge (101 / 111 / 121 / 122) |
| Chip-tap dispatch | Т-Банк → addAccount auto-primary; Наличные → kind=.cash auto-primary |
| Row dispatch | × removes (primary handover invariant); ★ flips primary |
| NEXT gate | disabled at 0 accounts, enabled at ≥1 |
| Hint text | empty → «нужен минимум один счёт»; 1 → "1 счёт · …"; 2 → "2 счёта · …"; 5 → "5 счётов · …" |

Persistence isolated via `UserDefaults(suiteName: "test.onboarding.v10.step02")`.

## Verification

- `make build` ✅ (clean, simulator iPhone 17 Pro).
- `xcodebuild test -only-testing:BudgetPlannerTests/Step02AccountsTests` → **17/17 green** in 0.018s.
- `#Preview` blocks in Step02AccountsView (empty + 2-rows variants) and AccountBalanceSheet (predefined + free-text variants) compile.
- Full-suite `xcodebuild test` shows 2 pre-existing failures in `MoneyTests.testRoundRubles` and `PeriodTests.testCycleDayClampedInFebruary` — both out of scope (logged in `deferred-items.md`).

## Deviations from Plan

### Plan-doc / file-name reconciliation

**1. [Rule 3 — Blocking] Modified `OnboardingV10View.swift` instead of `OnboardingView.swift`**

- **Found during:** Task 2.
- **Issue:** Plan 24-05 frontmatter lists `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingView.swift`, but Plan 24-03 already renamed that file to `OnboardingV10View.swift` to avoid a name-collision with the legacy v0.5 `OnboardingView`.
- **Fix:** Edited `OnboardingV10View.swift` in place; no new file created. Same Rule-3 deviation Plan 24-03 documented.
- **Files modified:** `OnboardingV10View.swift`.
- **Commit:** `d0b3ec2`.

### Clarifications (not deviations)

- The plan's "Task 2 verify" runs the full `Step02AccountsTests` suite, but the test file references `PluralRu` (Task 1 type). Because both tasks commit before the suite runs, this works as documented. Test file is committed in Task 2's commit so the build sequence remains: T1 (helpers) → T2 (view + integration + tests).
- The plan called out "isolated tests — covered in Step02AccountsTests via flow assertions" for AccountBalanceSheet — followed: no separate suite for the sheet; flow-side semantics covered by chip-tap and add/remove tests.

## Authentication Gates

None — fully autonomous.

## Threat Mitigations Applied

| Threat | Mitigation | Where |
|--------|------------|-------|
| T-24-05-01 (free-text bank tampering) | trim + uppercase + slice to 40 chars in `handleSave` | AccountBalanceSheet.swift |
| T-24-05-02 (XSS / format string) | accepted — SwiftUI `Text(String)` doesn't interpret format specifiers, no markup | n/a |
| T-24-05-03 (multiple primary accounts) | Inherited — `OnboardingFlow.addAccount` auto-primary first-only; `setPrimary` clears others (Plan 24-01) | OnboardingFlow.swift |

Test coverage:
- T-24-05-01 → indirectly covered by `testAddTBankFromChipAutoPrimary` / `testAddCashFromNalichnyeChip` asserting the bank string survives the round-trip; explicit max-length assertion deferred to Plan 24-11 (XCUI integration).
- T-24-05-03 → `testSetPrimaryFromStarTap` + `testRemoveAccountFromXButton` exercise the invariant.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `0ab6d83` | feat(24-05): add PluralRu helper + AccountBalanceSheet (PosterSheet content) |
| 2 | `d0b3ec2` | feat(24-05): wire Step02AccountsView (chip-list + accounts list + sheet) into OnboardingV10View |

## Self-Check: PASSED

- File `ios/BudgetPlanner/FeaturesV10/Onboarding/Step02AccountsView.swift`: FOUND
- File `ios/BudgetPlanner/FeaturesV10/Onboarding/AccountBalanceSheet.swift`: FOUND
- File `ios/BudgetPlanner/FeaturesV10/Onboarding/PluralRu.swift`: FOUND
- File `ios/BudgetPlannerTests/Step02AccountsTests.swift`: FOUND
- File `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingV10View.swift`: MODIFIED
- Commit `0ab6d83`: FOUND
- Commit `d0b3ec2`: FOUND
- `make build`: ✅ clean
- `xcodebuild test -only-testing:Step02AccountsTests`: ✅ 17/17 green
