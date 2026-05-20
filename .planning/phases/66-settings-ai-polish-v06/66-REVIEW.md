---
phase: 66-settings-ai-polish-v06
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - ios/BudgetPlanner/Features/Management/SettingsView.swift
  - ios/BudgetPlanner/Features/Management/ThemeOption.swift
  - ios/BudgetPlannerTests/Features/Management/ThemeOptionTests.swift
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 66: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found (info-only)

## Summary

Phase 66 adds a 4-row theme picker to the v06 `SettingsView` «Дизайн» section
backed by a pure, Foundation-only `ThemeOption` helper and a dedicated unit
suite. The implementation is correct and well-scoped. I traced the helper
against the source-of-truth `Theme` enum (`FeaturesV10/Common/PosterTokens.swift`)
and the routing logic in `AppRouter.swift`, and found no correctness, security,
or robustness defects. Only two minor maintainability observations remain, both
Info-level.

Verified against the focus areas:

- **`ThemeOption` resolve/round-trip correctness — PASS.** `selected(forRaw:)`
  short-circuits `"v06"` → `.legacyV06` before delegating to `Theme.resolve`,
  which maps unknown/empty raw → `.maximalPoster` (`Theme(rawValue:) ?? .maximalPoster`,
  PosterTokens.swift:72-74). The `switch Theme.resolve(...)` is exhaustive over
  the three real `Theme` cases, so no default-fallthrough gap. `rawValue(for:)`
  mirrors `Theme.*.rawValue` (`maximal_poster`/`liquid_glass`/`ios_default`) plus
  the `"v06"` sentinel. Round-trip is consistent for all four options; the unit
  test `testRoundTripForAllOptions` proves it.
- **`allOptions` order/completeness — PASS.** `[.maximalPoster, .liquidGlass,
  .iosDefault, .legacyV06]` = `Theme.allCases` order + sentinel last, matching the
  spec (MAXIMAL POSTER / LIQUID GLASS / IOS DEFAULT + СТАРЫЙ IOS).
- **`@AppStorage` write + AppRouter reactivity — PASS.** The picker writes
  `ThemeOption.rawValue(for: option)` to `@AppStorage("ui.theme")`. AppRouter
  reads the same key with the identical default (`Theme.maximalPoster.rawValue`,
  AppRouter.swift:5) and switches on `themeRaw == "v06"` (AppRouter.swift:12).
  Writing a V10 raw flips `isLegacyV06Shell` false → `V10MainShell`; writing
  `"v06"` stays on `MainShell`. Selecting v06 from within v06 is a valid no-op stay.
- **Default consistency — PASS.** `SettingsView.themeRaw` default
  (`Theme.maximalPoster.rawValue`) is identical to `AppRouter`'s default; no
  divergence on a fresh install with no stored value.
- **Edge: empty/garbage stored value — PASS.** `selected(forRaw: "")` and
  `selected(forRaw: "garbage")` both resolve to `.maximalPoster` (the checkmark
  lands on MAXIMAL POSTER), which matches what AppRouter actually renders for
  such a value (any non-`"v06"` raw → V10MainShell, theme resolved to maximalPoster).
  Stored state and displayed selection stay in agreement.
- **No forbidden dependencies — PASS.** No `PosterRouter`, `.posterSheet`,
  `ThemePickerSheet`, or `FeaturesV10/Settings` references in the reviewed files;
  the picker is native Buttons in a `Form` `Section`, per project SwiftUI-only
  convention.
- **No regression to the rest of `SettingsView` — PASS.** `cycleSection`,
  `notifySection`, `aiSection`, `aiSpendSection`, the `dirty`/`save` flow, and the
  saved-flash overlay are unchanged in behavior. `spendText(spend:cap:)` matches
  the `Int` types of `UserDTO.aiSpendCents`/`aiSpendingCapCents` (CommonDTO.swift:10-11).
  `ForEach(ThemeOption.allOptions, id: \.self)` compiles: a no-payload enum is
  implicitly `Hashable` even though only `Equatable` is declared (verified via
  standalone `swiftc -typecheck`).

## Info

### IN-01: Theme swatch colors are hardcoded literals duplicated from V10 tokens

**File:** `ios/BudgetPlanner/Features/Management/SettingsView.swift:230-241`
**Issue:** The swatch fill colors are inline magic literals
(`Color(red: 1.0, green: 90/255, blue: 60/255)` for maximalPoster,
`242/255…` for liquidGlass, `229/255…` for iosDefault). These are independent
copies of values that conceptually belong to the V10 token enums
(`LiquidGlassTokens.bgPrimary = Color(hex: "F2F2F7")` ≈ 242/242/247, etc. in
`FeaturesV10/Common/PosterTokens.swift`). If a theme's signature color is ever
retuned in the token source, these swatches will silently drift out of sync with
the actual theme they preview. Purely cosmetic — no functional impact.
**Fix:** Source swatch colors from the per-theme token enums (or a small
`ThemeOption.swatchColor` accessor) so the preview tracks the real palette, e.g.
reference `LiquidGlassTokens.bgPrimary` instead of re-typing `242/255`. If
keeping literals, add a comment noting they must be updated alongside the token
definitions.

### IN-02: `ThemeOption` declares `Equatable` but relies on implicit `Hashable` for `id: \.self`

**File:** `ios/BudgetPlanner/Features/Management/ThemeOption.swift:13`
**Issue:** `ForEach(ThemeOption.allOptions, id: \.self)` (SettingsView.swift:198)
requires `ThemeOption: Hashable`. It compiles today because a payload-free enum
is implicitly `Hashable`, but the declared conformance list only states
`CaseIterable, Equatable`, so the `Hashable` reliance is invisible to a reader.
If an associated value is ever added to a case, the implicit synthesis disappears
and the `ForEach` breaks with a non-obvious error. No current defect.
**Fix:** Make the dependency explicit: `enum ThemeOption: CaseIterable, Hashable`
(`Hashable` refines `Equatable`, so the `Equatable` requirement is still satisfied
and the unit tests using `XCTAssertEqual` keep working).

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
