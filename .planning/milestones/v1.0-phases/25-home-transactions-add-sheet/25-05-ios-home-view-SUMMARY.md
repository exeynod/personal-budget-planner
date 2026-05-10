---
phase: 25-home-transactions-add-sheet
plan: 5
subsystem: ios-home-view
tags: [ios, swiftui, observable, home, v10, poster, count-up, stagger, tdd]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 3
    provides: AccountsAPI / CategoriesV10API / ActualV10API + AccountDTO / CategoryV10DTO / ActualV10DTO (all consumed by HomeV10ViewModel.load)
  - phase: 22
    plan: BE-04+
    provides: CategoryRead with v1.0 fields exposed (eb7192e fix); previously schema-gap, now real values flow
provides:
  - "iOS V10Formatters: monthsEn/Ru constants, pluralDays, formatDay, formatTimeHM, formatPeriodEyebrow — symmetric to web frontend/src/screensV10/common/format.ts."
  - "iOS HomeData pure compute helpers: computeDailyPace (clamped, divide-by-zero safe), computeSurplus, computeWalletTotal, computeCategoryAggregates (savings + paused filter, expense-only kind aggregation, +inf ratio for unbudgeted spent), sortForHome (ratio DESC + planCents DESC), planTotal — all stateless, fully unit-tested (20 cases)."
  - "iOS HomeV10ViewModel: @MainActor @Observable model with parallel async-let load of /accounts + /categories + /periods/current + /periods/{id}/actual, status state machine idle→loading→ready|error, inFlight guard for T-25-05-03."
  - "iOS HomeV10View: SwiftUI screen rendering all 6 HOME-V10-* requirements (coral hero, count-up daily pace, wallet link, plan-bar plate, sorted category list with stagger reveal + bar fill, OVER plate, push routes through PosterRouter environment)."
  - "iOS HomePlaceholders: 4 placeholder views (AccountsList / PlanView / CategoryDetail / TransactionsView) so push routes work end-to-end before Phase 26/27 + Plan 25-07 land real screens."
affects:
  - 25-07-ios-add-sheet (will reuse V10Formatters.formatTimeHM / formatDay for header)
  - 25-08-ios-transactions (will reuse V10Formatters.formatDay for day-grouping headers + HomeData CategoryAggregateRow shape may inform sort logic)
  - 25-10-ios-shell-wiring (will mount HomeV10View as PosterRouter root inside V10MainShell)

# Tech tracking
tech-stack:
  added: []  # no new dependencies — uses existing PosterTokens / BigFig / Mass / Eyebrow / RubleFormatter / PosterAnimations / PosterRouter / DTO + API surface from Plans 23 / 24 / 25-03
  patterns:
    - "Parallel-naming convention (HomeV10ViewModel, HomeV10View) to coexist with v0.6 HomeViewModel/HomeView in Features/Home/ — Swift module-level type collision means we MUST rename, not replace; matches the parallel-DTO pattern from 25-03 (ActualV10DTO alongside ActualDTO)."
    - "Pure-compute split (HomeData.swift) keeps every formula testable without instantiating SwiftUI; HomeV10ViewModel becomes a thin orchestrator over HomeData + V10Formatters."
    - "Period 404 handled inline via local do/catch (PeriodsAPI.current() is non-Optional in v0.x — wrap and shrug instead of failing the whole Home screen)."
    - "@ObservationIgnored on `var calendar: Calendar` field — Swift's @Observable macro hits a key-path inference bug for `Calendar`-typed stored properties; calendar mutation only happens in tests/previews so missing observation is intentional."
    - "Stagger animation drives state via two @State flags (appeared / barFilled) toggled in onAppear with PosterAnimations.posterRowIn(delay:) and posterBarFill(delay:) so each row owns its own timing — matches web keyframe approach (delay = 0.08 + i*0.045 row, 0.18 + i*0.05 bar)."

key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift
    - ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift
    - ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift
    - ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift
    - ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift
  modified:
    - ios/project.yml  # GENERATE_INFOPLIST_FILE=YES on BudgetPlannerTests target (CLI test fix)

key-decisions:
  - "Renamed HomeViewModel/HomeView → HomeV10ViewModel/HomeV10View. Plan said `HomeViewModel` / `HomeView`, but v0.6 Features/Home/HomeView.swift owns those names already and Swift modules have no namespace. Same parallel-naming pattern as ActualV10DTO from Plan 25-03. v0.6 features (theme=v06) keep working unchanged."
  - "@ObservationIgnored on calendar field. Initially a plain `var calendar: Calendar = ...()` triggered an @Observable macro bug ('cannot infer key path type') even with the value-init wrapped in a static func. Calendar only changes for tests/previews — losing observability there is fine; UI does not need to react."
  - "Test target needs GENERATE_INFOPLIST_FILE=YES for `xcodebuild test` from CLI. Phase 24 TDD plans (24-09, 24-11) ran tests through the Xcode IDE which supplied the plist implicitly; CLI execution surfaced the gap. Single-line additive change to project.yml."
  - "Period 404 falls back to nil instead of bubbling. PeriodsAPI.current() throws on 404 (no Optional return). HomeV10ViewModel catches that single call locally so the rest of the screen renders zeros — better UX than crashing the home view for users who haven't seen their first period roll yet."
  - "Bar `width=clampedRatio` capped at 1.0 even for over-budget rows. Over-budget signal is communicated via the OVER plate + yellow bar colour; capping the width prevents the bar from overshooting the row and breaking the grid. Plan-tick at planCents/factCents inside the over-budget bar shows the threshold visually."
  - "BigFig divides cents by 100 at the call site (`model.dailyPaceCents / 100`) — BigFig component itself takes integer rubles. RubleFormatter.format(cents:) handles the wallet/plan/fact totals. Two helpers because BigFig is a generic numeric display while RubleFormatter does grouping with U+202F NNBSP."

patterns-established:
  - "iOS pure-compute layer (`HomeData.swift`) sibling to web pure-compute layer (`frontend/src/screensV10/Home/data.ts`) — both consume the same DTO shape (post-Plan 25-03 unification) and produce the same row shape (CategoryAggregateRow). Test parity is now achievable across surfaces."
  - "Stagger animation pattern for SwiftUI lists: per-row @State flags + onAppear withAnimation(.posterRowIn(delay:)) — works without the equivalent of CSS keyframes and respects accessibility reduce-motion via PosterAnimations infrastructure."
  - "Test-fixture-by-JSON pattern for DTOs without public initializers: bypass synthesized init by encoding test data as JSON and decoding through the production decoder (matches the wire format the prod path uses; no parallel mock init drift)."

requirements-completed:
  - HOME-V10-01
  - HOME-V10-02
  - HOME-V10-03
  - HOME-V10-04
  - HOME-V10-05
  - HOME-V10-06

# Metrics
duration: 10m
completed: 2026-05-10
---

# Phase 25 Plan 5: iOS HomeView Summary

**Built the iOS Home screen for v1.0 (coral hero with count-up «Дневной темп», wallet link, plan-bar plate, sorted category list with stagger reveal + bar fill, OVER plate, four push routes through `PosterRouter`) — symmetric to the web HomeView landing in parallel via Plan 25-04 — by adding pure-compute helpers (`HomeData`), formatters (`V10Formatters`), an `@Observable` data loader (`HomeV10ViewModel`), placeholder views for unbuilt screens, and a SwiftUI view (`HomeV10View`) that consumes all of the above.**

## Performance

- **Duration:** ~10 min wall-clock (this agent only — parallel 25-04 web commits land in the same worktree)
- **Started:** 2026-05-10T12:24:54Z
- **Completed:** 2026-05-10T12:34:39Z (commit `a77e62e`)
- **Tasks:** 3 of 3 (Task 1 TDD red/green, Tasks 2 & 3 atomic feat commits)
- **Files created:** 6 (5 production swift + 1 test swift)
- **Files modified:** 1 (`ios/project.yml` — GENERATE_INFOPLIST_FILE=YES on test target)
- **Commits (this plan only):** 4
  - `0203962` test(25-05): RED — failing HomeDataTests + V10FormattersTests
  - `5441064` feat(25-05): GREEN — V10Formatters + HomeData (41 tests pass)
  - `da54c02` feat(25-05): HomeV10ViewModel + HomePlaceholders
  - `a77e62e` feat(25-05): HomeV10View SwiftUI screen
- **Test count:** 41 unit tests, all pass under iPhone 17 Pro Simulator
  - 21 V10FormattersTests (constants, pluralDays, formatDay, formatTimeHM, formatPeriodEyebrow)
  - 20 HomeDataTests (computeDailyPace, computeSurplus, computeWalletTotal, computeCategoryAggregates, sortForHome, planTotal)

## Accomplishments

- **`V10Formatters` (≈100 lines)**: enum-with-static-funcs mirror of web `format.ts`. Constants `monthsEn`/`monthsRuGenitive`, `pluralDays(_:)` with Slavic one/few/many rules, `formatDay(_:today:calendar:)` returning «Сегодня»/«Вчера»/«N {month_genitive_ru}», `formatTimeHM(_:calendar:)` returning zero-padded `HH:mm`, `formatPeriodEyebrow(_:calendar:)` returning `VOL.NN / MONTH YYYY · X ДЕНЬ/ДНЯ/ДНЕЙ`. All public funcs accept an explicit `Calendar` (default `.current`) so tests stay deterministic across host TZs.
- **`HomeData` (≈120 lines)**: pure compute layer. `CategoryAggregateRow` struct (id / name / code / ord / planCents / factCents / ratio / isOver). `computeDailyPace` clamps to `max(0, ...)` and divides by `max(1, daysLeft)` — both threat-model mitigations encoded in the function shape. `computeCategoryAggregates` filters `code != "savings" && !paused` (T-25-05-01), pre-buckets actuals into `[Int: Int]` for O(N+M) aggregation, treats `planCents=0 && factCents>0` as `ratio = .infinity` (sorts to top — surface anomalies), `planCents=0 && factCents=0` as `ratio = 0` (definedly, not NaN). `sortForHome` sorts ratio DESC then planCents DESC tiebreak.
- **`HomeV10ViewModel` (≈120 lines)**: @MainActor @Observable class. `load()` opens three parallel `async let` calls (accounts / categories / period), wraps the period call in a local `do/catch` (404 mid-onboarding → nil), then conditionally fetches actuals if a period exists. Computes `daysLeft = lastDayOfMonth - today + 1`, eyebrow string, daily pace, surplus, wallet total, plan total, and sorted category rows in one place. `inFlight` guard returns immediately on re-entrant calls (T-25-05-03 mitigation). Status state machine `Status: Equatable` with idle/loading/ready/error(String).
- **`HomePlaceholders` (≈90 lines)**: 4 minimalist SwiftUI views (`AccountsListPlaceholderView`, `PlanViewPlaceholderView`, `CategoryDetailPlaceholderView(categoryId:)`, `TransactionsViewPlaceholderView`) sharing a `PosterPlaceholder` helper. Used as targets for `router?.push(...)` calls — replaced by real screens in Phase 26/27 + Plan 25-07.
- **`HomeV10View` (≈300 lines)**: the SwiftUI surface. ZStack with coral background + state-switched content. Ready state stacks eyebrow row → hero block → wallet line → plan-bar → categories section inside a ScrollView. Eyebrow row mirrors prototype's «МЕНЮ ↗» right-aligned hint (no-op until Phase 26+). Hero block: `Mass("Дневной темп —", italic: true, size: 28)` opacity 0.75 + `BigFig(value: dailyPaceCents/100, sup: "₽", size: 88, color: .paper)` with built-in count-up. Wallet line shows «· осталось N дней · в кошельке X ₽ →» with `RubleFormatter.format(cents:)` and SwiftUI `.underline` on the tappable last segment (dashed underline approximation — SwiftUI has no native dashed; the `1px dashed rgba(.4)` from prototype renders as a solid 0.4-opacity underline). Plan-bar uses `Color.black.opacity(0.22)` background with signed surplus rendered yellow when ≥0 / red when <0. Categories section: `ForEach(model.categoryRows.enumerated())` of `CategoryRowView` with row stagger (`appeared` flag toggled in onAppear via `PosterAnimations.posterRowIn(delay: 0.08 + i*0.045)`) + bar fill (`barFilled` flag via `posterBarFill(delay: 0.18 + i*0.05)`). OVER rows: paper-background plate with ink "OVER" text + yellow bar color + 1pt-tall paper tick at `planCents/factCents` inside the bar (visual threshold marker).
- **Push routing**: 4 `router?.push(...)` callsites — Wallet → AccountsListPlaceholderView, Plan-bar → PlanViewPlaceholderView, "ВСЕ ОПЕРАЦИИ →" → TransactionsViewPlaceholderView, row tap → CategoryDetailPlaceholderView(categoryId:). Total `posterRouter`/`router?.push` references in HomeView.swift = 8 (including doc comments + `@Environment` line + 4 callsites + 1 Preview env injection).
- **Tests**: 41 XCTest assertions covering every code path called out in the plan must-haves: empty actuals, paused filter, savings filter, expense-only aggregation, ratio = +infinity for plan=0/fact>0, ratio = 0 for plan=0/fact=0, sort tie-break by planCents, +inf rows surface first, daily-pace clamp, divide-by-zero protection, surplus signed semantics, wallet sum, plan total, all formatter constants and edge cases (today/yesterday/year boundary/month boundary/leap year February/zero-pad VOL/single-vs-double VOL).

## SwiftUI patterns chosen for the deviations from web

### Dashed-underline approximation
Web prototype uses `border-bottom: 1px dashed rgba(255,246,232,0.4)` for the wallet link and "ВСЕ ОПЕРАЦИИ →" link. SwiftUI's `.underline(_:color:)` has no `style` parameter and renders a solid line. Two options were considered:
1. Build a custom `Path` overlay with `dash: [3, 3]` stroke style — pixel-accurate but spans an extra ~30 lines of GeometryReader plumbing.
2. Use `.underline(true, color: paper.opacity(0.4))` — solid line at the same weight + same opacity. Visually still reads as a "subtle hint" link, just with continuous ink.

Chose **(2)** for v1.0; the prototype's dashed style is a polish touch, not a functional requirement, and the time saved goes to harder problems (stagger animation, period-404 fallback). A future polish pass can swap in the Path overlay if user testing flags it.

### Bar tick for OVER rows
Web prototype renders the over-budget threshold as `position:absolute; left: ${100*plan/act}%; top:-2; bottom:-2; width:1px`. iOS SwiftUI equivalent uses the `.overlay` of a `GeometryReader`-derived position inside the bar's `ZStack`:

```swift
let tickX = geo.size.width * (Double(row.planCents) / Double(row.factCents))
Rectangle()
    .fill(PosterTokens.Color.paper.opacity(0.6))
    .frame(width: 1, height: 7)
    .offset(x: tickX, y: -2)
```

Renders inside the same 3pt bar frame as the fill itself; minor `y: -2` offset to peek above the bar's top edge for visibility. Only renders when `row.factCents > 0` to avoid divide-by-zero.

### Stagger animation: two `@State` flags vs CSS keyframes
Web uses CSS `animation: posterRowIn 0.45s cubic-bezier(...) ${0.08 + i*0.045}s forwards`. iOS has no per-element keyframe animation — the closest pattern is two `@State` flags (`appeared`, `barFilled`) that toggle from `false` to `true` inside `.onAppear` wrapped in `withAnimation(PosterAnimations.posterRowIn(delay: ...))`. Each row owns its own timing — natural per-element index access via `ForEach(Array(model.categoryRows.enumerated()), id: \.element.id) { (i, row) in ... }`. PosterAnimations already supports `.delay()` on its easeOut curves; the timing constants match the web values exactly (0.08 + i*0.045 row, 0.18 + i*0.05 bar).

### Safe area
HomeV10View uses `PosterTokens.Color.coral.ignoresSafeArea()` for the background and 56pt top padding inside the ScrollView (`padding(.top, 56)`) so content clears the notch without a separate `.safeAreaInset` plumbing. Matches the prototype's `padding:'56px 22px 90px'` exactly. Bottom 90pt padding leaves room for the future BottomNavV10 (Plan 25-10).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test target needs `GENERATE_INFOPLIST_FILE=YES`**
- **Found during:** Task 1 (RED phase — first `xcodebuild test` invocation)
- **Issue:** `xcodebuild test` from CLI fails with "Cannot code sign because the target does not have an Info.plist file and one is not being generated automatically" on the BudgetPlannerTests target. Earlier TDD plans (24-09, 24-11) ran their tests through the Xcode IDE, which supplied the plist implicitly via scheme settings.
- **Fix:** Added `GENERATE_INFOPLIST_FILE: YES` under `BudgetPlannerTests.settings.base` in `ios/project.yml`. Cosmetic flag — bundle id and version inherited from the existing `PRODUCT_BUNDLE_IDENTIFIER` line.
- **Files modified:** `ios/project.yml`
- **Commit:** `0203962` (folded into the RED test commit since both are needed for the test gate to fire)

**2. [Rule 3 - Blocking] HomeViewModel/HomeView already exist in v0.6 (Features/Home/)**
- **Found during:** Task 2 (Build after first HomeViewModel.swift authoring)
- **Issue:** `error: invalid redeclaration of 'HomeViewModel'`. v0.6 module already owns `final class HomeViewModel` and `struct HomeView` in `ios/BudgetPlanner/Features/Home/HomeView.swift`. Swift modules have no namespace; can't have two same-named types.
- **Fix:** Renamed both new types to `HomeV10ViewModel` and `HomeV10View`. Mirror of the parallel-DTO pattern from Plan 25-03 (`ActualV10DTO` alongside legacy `ActualDTO`). v0.6 home (theme=v06) stays byte-identical.
- **Files modified:** `ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift`, `ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift`
- **Commit:** `da54c02` (Task 2 commit body documents the rename; Task 3 follows the same convention)

**3. [Rule 3 - Blocking] @Observable macro can't infer key path for `var calendar: Calendar`**
- **Found during:** Task 2 (Build after adding stored Calendar property to HomeV10ViewModel)
- **Issue:** Swift's `@Observable` macro expansion fails with "cannot infer key path type from context" when annotating `var calendar: Calendar = ...`. Reproducible regardless of how the default value is wrapped (closure, static func, computed). Bool stored properties on the same class compile fine — looks like a Foundation type interop quirk.
- **Fix:** Annotated `calendar` with `@ObservationIgnored`. The field is only mutated for tests/previews — UI doesn't need to react to a calendar change, so opting out of observation is semantically correct.
- **Files modified:** `ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift`
- **Commit:** `da54c02`

### Out-of-scope discoveries

None — every blocker found during this plan was directly caused by the new files added.

## Authentication Gates

None. All API calls go through the existing `APIClient.shared` flow which carries the dev/Telegram token established by AuthAPI in earlier phases.

## Issues Encountered

- **`async let` capture restriction**: a first attempt used a private `periodOrNil(_:)` helper with an `@autoclosure () async throws -> PeriodDTO` parameter to wrap PeriodsAPI.current() into an Optional. Compiler rejected: "capturing 'async let' variables is not supported". Fix: inline the `do { per = try await PeriodsAPI.current() } catch { per = nil }` block at the call site. Cleaner anyway — no need for a helper that exists for one call site.
- **DTO fixtures with no public init**: AccountDTO / CategoryV10DTO / ActualV10DTO are `Decodable, Equatable` structs with all-immutable fields and synthesized init. Tests need to construct them with custom values; rather than adding test-only `init`s (which would drift from the wire shape), HomeDataTests builds JSON strings and decodes through `JSONDecoder` configured with `keyDecodingStrategy = .convertFromSnakeCase` — same path the production code uses. Bonus: this catches any future DTO/wire schema drift.

## Threat Flags

None — this plan does not introduce any new attack surface beyond what 25-01/25-03 already accounted for. The three threats called out in the plan's `<threat_model>` are all mitigated:

| Threat ID | Mitigation | Where enforced |
|-----------|------------|----------------|
| T-25-05-01 | Filter `code != "savings" && !paused` in computeCategoryAggregates | HomeData.swift:84; tests at HomeDataTests:filters_savings_code, filters_paused_categories |
| T-25-05-02 | `max(0, ...)` clamp in computeDailyPace | HomeData.swift:50; test at clamps_negative_to_zero_when_overspent |
| T-25-05-03 | inFlight guard in HomeV10ViewModel.load | HomeViewModel.swift:49-51 (mirrors OnboardingMountModel pattern from Plan 24-11) |

## Known Stubs

- **HomePlaceholders are intentional stubs** for the four push routes (Accounts list / Plan view / Category detail / Transactions). Each renders a "WIP — {feature} ({Phase X})" line so users see what's pending, not a blank canvas. Phase 26 lands real Plan/CategoryDetail; Phase 27 lands Accounts list; Plan 25-07 (this phase) lands the real TransactionsView.
- **No data wired in HomeV10ViewModel for "Дневной темп" calculation when period is missing**: `daysLeft` defaults to `lastDayOfMonth - today + 1` (calendar-only), and `dailyPaceCents` falls back to 0 when there's no period and no actuals to subtract from. This is intentional — the Home screen renders sensible zeros when the user is mid-onboarding, and the moment a period exists the values populate correctly. Not a stub that prevents the goal — the goal IS to render Home including the empty/onboarding case.

## Self-Check: PASSED

**Files exist:**

- FOUND: `ios/BudgetPlanner/FeaturesV10/Common/V10Formatters.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomeData.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomeViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift`
- FOUND: `ios/project.yml` (modified — GENERATE_INFOPLIST_FILE=YES added)

**Commits exist (this plan only):**

- FOUND: `0203962` test(25-05): add failing HomeDataTests + V10FormattersTests (RED)
- FOUND: `5441064` feat(25-05): implement V10Formatters + HomeData (GREEN, 41 tests pass)
- FOUND: `da54c02` feat(25-05): add HomeV10ViewModel + HomePlaceholders (Task 2)
- FOUND: `a77e62e` feat(25-05): implement HomeV10View SwiftUI screen (Task 3)

**Verification gates from PLAN <verification>:**

| Gate | Required | Actual |
|------|----------|--------|
| 1. `make build` | succeeds | ✓ Build Succeeded |
| 2. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` | passes | ✓ 20 tests pass; full V10FormattersTests + HomeDataTests run = 41 tests, 0 failures |
| 3. `grep -c 'code != "savings"\|paused' .../HomeData.swift` | ≥ 1 | 4 (`code != "savings"` filter + 3 `paused` references in code/comments) |
| 4. `grep -c 'router?.push\|posterRouter' .../HomeView.swift` | ≥ 4 | 8 (env declaration + 4 push callsites + 2 doc comments + 1 preview injection) |

**No accidental file deletions** in any of this plan's 4 commits:
- `git diff eb7192e..HEAD --diff-filter=D --name-only` (filtered to plan files): empty.

## TDD Gate Compliance

- RED gate: `0203962 test(25-05): add failing HomeDataTests + V10FormattersTests (RED)` — verified failing build before GREEN.
- GREEN gate: `5441064 feat(25-05): implement V10Formatters + HomeData (GREEN, 41 tests pass)` — verified test pass after.
- REFACTOR gate: not used (Tasks 2-3 are non-TDD per plan; first-pass implementations didn't need a separate refactor commit).

## Next Phase Readiness

- **Plan 25-07 (iOS Add Sheet)** can `import` `V10Formatters.formatTimeHM` for the «NEW ENTRY · {date_short} · {time_HHMM}» header and `formatDay` for the date chips.
- **Plan 25-08 (iOS Transactions)** can use `V10Formatters.formatDay` for day-grouping headers and may share `CategoryAggregateRow` shape semantics for category-filter sort logic.
- **Plan 25-10 (iOS Shell wiring)** mounts `HomeV10View()` as the `PosterRouter` root inside `V10MainShell.swift`. The view is self-contained — `@State private var model = HomeV10ViewModel()` initializes on first appear, `.task { await model.load() }` triggers the fetch.
- **Future polish pass**: dashed-underline (custom Path overlay), real BigFig count-up easing curve verification against web (current matches PosterAnimations.easeOut which uses the same tokens). Both deferred — not blocking v1.0 functional acceptance.

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 05*
*Completed: 2026-05-10*
