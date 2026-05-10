---
phase: 26-category-detail-plan-subscriptions
plan: 03
subsystem: ios-category-detail
tags: [ios, swiftui, observable, category-detail, rollover-toggle, paused-toggle, tdd, zero-touch-swap]

# Dependency graph
requires:
  - phase: 26-category-detail-plan-subscriptions
    plan: 01
    provides: "PATCH /api/v1/categories/{id} extended with plan_cents/rollover/paused/parent_id (CategoryUpdate v1.0)"
  - phase: 25-home-transactions-add-sheet
    plan: 05
    provides: "HomeV10View pushes CategoryDetailPlaceholderView(categoryId:) on row tap; HomePlaceholders module owns the push target type"
  - phase: 25-home-transactions-add-sheet
    plan: 09
    provides: "Zero-touch swap pattern (TransactionsV10View rebinding inside HomePlaceholders.TransactionsViewPlaceholderView); TransactionsData.groupByDay + formatTxAmount re-used by CategoryDetailView for operations list"
  - phase: 25-home-transactions-add-sheet
    plan: 03
    provides: "CategoriesV10API.list, CategoryV10DTO with v1.0 fields, ActualV10API.list, ActualV10DTO, PeriodsAPI.current/PeriodDTO surfaces"
provides:
  - "CategoryDetailData pure compute helpers (computeOverPercent, computeUnderPercent, computeBarSegments with BarSegments struct, filterActualsForCategory, computeFactForCategory) — stateless static functions, 13 XCTest cases (16 assertions) all pass"
  - "CategoriesV10API.update(id:payload:) wraps PATCH /api/v1/categories/{id} (Phase 26-01 backend ext); accepts CategoryV10UpdateRequest with plan_cents/rollover/paused/parent_id/name/sortOrder/isArchived all optional"
  - "CategoryV10UpdateRequest Encodable struct with encodeIfPresent for every field — backend Pydantic model_dump(exclude_unset=True) only mutates set keys"
  - "CategoryRollover widened from Decodable to Codable so it can be serialised in PATCH bodies (rollover toggle)"
  - "CategoryDetailViewModel @MainActor @Observable model with parallel async-let load, status state machine, inFlight guard, toggleRollover / togglePause"
  - "CategoryDetailView SwiftUI screen rendering all 6 CAT-V10-* requirements (cobalt/red ZStack background by isOver, Mass UPPERCASE name, italic '— превышено на N%' / '— на N% плана' subtitle, BigFig count-up, 6pt progress bar with break-tick, rollover plate toggle, ‘+ ПОДНЯТЬ ЛИМИТ’ / ‘ПАУЗА’ CTA, day-grouped operations list)"
  - "Zero-touch placeholder swap: HomePlaceholders.CategoryDetailPlaceholderView body now returns CategoryDetailView(categoryId:); HomeV10View row tap push target unchanged"
affects:
  - "Phase 26-04 web Plan view (CategoryDetail '+ ПОДНЯТЬ ЛИМИТ' will push real PlanView with focus param; current placeholder push will swap to real PlanMount)"
  - "Phase 26-05 iOS Plan view (same — replace PlanViewPlaceholderView push target on iOS)"

# Tech tracking
tech-stack:
  added: []  # no new dependencies — uses existing PosterTokens / BigFig / Mass / Eyebrow / PosterButton / PosterRouter / RubleFormatter / V10Formatters / TransactionsData + Phase 25-03 DTO/API surface
  patterns:
    - "Zero-touch placeholder swap (preserve old type name, replace body): same pattern Plan 25-09 established for TransactionsViewPlaceholderView — keeps the existing `router?.push(CategoryDetailPlaceholderView(categoryId:))` callsite in HomeV10View unchanged, so this plan ships isolated to the new feature folder + a 6-line edit in HomePlaceholders.swift."
    - "Pure-compute split (CategoryDetailData.swift) sibling to web pure-compute layer (`frontend/src/screensV10/CategoryDetail/computeCategoryDetail.ts` from Plan 26-02). Both consume the same DTO shape and produce identical Equatable structures (BarSegments) — test parity achievable cross-surface."
    - "@ObservationIgnored on `var calendar: Calendar` — same Foundation type @Observable macro quirk noted in HomeV10ViewModel (Plan 25-05). Calendar only changes for tests/previews; UI does not need to react."
    - "Period 404 handled inline via local do/catch — wrap and shrug instead of failing the whole screen (mirrors HomeV10ViewModel pattern)."
    - "Custom Encodable on CategoryV10UpdateRequest with encodeIfPresent for every field (skips nil keys on the wire) — pairs with backend `model_dump(exclude_unset=True)` so per-toggle PATCH only mutates the one field the user touched."
    - "Cross-tenant id collapses to 'Категория не найдена' (T-26-03-02) — `cats.first(where:)` returns nil; we don't distinguish missing vs cross-tenant (RESTful — no existence leak)."

key-files:
  created:
    - "ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailData.swift"
    - "ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailViewModel.swift"
    - "ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift"
    - "ios/BudgetPlannerTests/FeaturesV10/CategoryDetailDataTests.swift"
  modified:
    - "ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift  # CategoryRollover Decodable → Codable; CategoryV10UpdateRequest Encodable appended"
    - "ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift  # CategoriesV10API.update(id:payload:) appended"
    - "ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift  # CategoryDetailPlaceholderView body → CategoryDetailView(categoryId:)"

key-decisions:
  - "Reuse TransactionsData.groupByDay + formatTxAmount for the operations list (CAT-V10-06). The day-grouping semantics (Today / Yesterday / N {month_genitive}) and U+2212 minus formatting are identical to the Transactions registry, so cross-screen consistency comes for free. The plan's draft TxRow signature called `formatTxAmount(cents, kind)` — actual Plan 25-09 helper takes only `amountCents`; the View applies a local `amountColor(for: kind)` switch instead, matching the Plan 25-09 prototype line 374 convention."
  - "Subtitle text always lives below the Mass name (not as a Mass overlay). Web prototype renders «— превышено на N%» as a separate italic line; iOS does the same with `Mass(subtitle, italic: true, size: 28).opacity(0.85)`. Keeps the implementation aligned with the web Mass component contract."
  - "rolloverPlate button on a paper background uses HStack { Text + chevron «›» }; the toggle action is `Task { await model.toggleRollover() }`. Optimistic update is server-driven — VM replaces `category` with the updated DTO from PATCH response, so a network failure visually retains the previous state (T-26-03-03)."
  - "CTA row uses PosterButton variant .ghost for both buttons (matches prototype's outlined-on-cobalt aesthetic). «+ ПОДНЯТЬ ЛИМИТ» pushes `PlanViewPlaceholderView()` — Plan 26-05 will replace that placeholder type's body with the real PlanView (focus param wiring), no change to this view needed."
  - "PosterButton label = «ВКЛЮЧИТЬ» when `cat.paused`, else «ПАУЗА» — matches user mental model (action verb describes what tap will do, not current state). togglePause() flips the bit via PATCH."
  - "Mass component uppercases non-italic mode automatically — passed `cat.name` lowercase, Mass renders UPPERCASE; matches HomeV10View's category row pattern."

patterns-established:
  - "Per-field optional Encodable wire request (skip-nil-keys pattern): mirror of `ActualCreateRequest`'s custom encoder (Plan 25-03 — `accountId` field). Apply this pattern whenever PATCH bodies need to support multiple independent field mutations without overwriting unset fields."
  - "Background-color-by-state ZStack: `model.isOver ? .red : .cobalt` switched at the root ZStack level — SwiftUI's color animation between named colors interpolates smoothly, so an over-budget tip transitions visually without extra animation work."

requirements-completed:
  - CAT-V10-01  # cobalt/red bg ZStack; Mass UPPERCASE name (Archivo Black 70pt)
  - CAT-V10-02  # italic subtitle '— превышено на N%' / '— на N% плана' + BigFig count-up
  - CAT-V10-03  # 6pt progress bar with break-tick + 'из X ₽' caption
  - CAT-V10-04  # rollover plate toggle via PATCH /categories/:id body {rollover}
  - CAT-V10-05  # '+ ПОДНЯТЬ ЛИМИТ' push + 'ПАУЗА'/'ВКЛЮЧИТЬ' toggle via PATCH {paused}
  - CAT-V10-06  # operations list by category (filtered actuals, day-grouped)

# Metrics
duration: ~10m
completed: 2026-05-10
---

# Phase 26 Plan 03: iOS Category Detail Summary

**Built the iOS Category Detail screen (CAT-V10-01..06): cobalt-default / red-when-over ZStack background, Mass UPPERCASE category name, italic «— превышено на N%» / «— на N% плана» subtitle, BigFig fact count-up, 6pt progress bar with break-tick at plan/fact for over-budget rows, paper rollover plate that flips «ОСТАТОК → ПРОЧЕЕ» ↔ «ОСТАТОК → НАКОПЛЕНИЯ» via PATCH /api/v1/categories/:id (Phase 26-01 backend ext), ghost CTA row with «+ ПОДНЯТЬ ЛИМИТ» (pushes PlanViewPlaceholder for now — Plan 26-05 will swap to real PlanView with focus param) and «ПАУЗА» / «ВКЛЮЧИТЬ» toggling `category.paused` via the same PATCH endpoint, and a day-grouped operations list filtered to this category — symmetric to web Plan 26-02 — by adding pure-compute helpers (CategoryDetailData) with TDD coverage (13 XCTests, 16 assertions, all green), an @Observable VM, a SwiftUI view, and a 6-line zero-touch placeholder swap in HomePlaceholders.swift so HomeV10View's existing row-tap push lands on the real screen without any further wiring.**

## Performance

- **Duration:** ~10 min wall-clock (this agent only — parallel web 26-02 + 26-03 backend already complete)
- **Started:** 2026-05-10T18:02:42Z
- **Completed:** 2026-05-10T18:11:40Z
- **Tasks:** 3 of 3 (Task 1 TDD red/green, Tasks 2 & 3 atomic feat commits)
- **Files created:** 4 (3 production swift + 1 test swift)
- **Files modified:** 3 (CategoryV10DTO.swift, CategoriesV10API.swift, HomePlaceholders.swift)
- **Commits (this plan only):** 4
  - `f2f83aa` test(26-03): add failing CategoryDetailDataTests (RED)
  - `c3ba2cd` feat(26-03): GREEN — CategoryDetailData + CategoriesV10API.update + CategoryV10UpdateRequest
  - `9604946` feat(26-03): CategoryDetailViewModel + CategoryDetailView SwiftUI screen
  - `8ec9751` feat(26-03): zero-touch swap CategoryDetailPlaceholderView → CategoryDetailView
- **Test count:** 13 new XCTest cases / 16 assertions (CategoryDetailDataTests). HomeDataTests (20) + V10MainShellTests (4) re-run — no regressions.

## Accomplishments

- **`CategoryDetailData` (~95 lines)**: pure compute layer.
  - `computeOverPercent(factCents:planCents:)` — rounded percent over plan when fact > plan; 0 when fact ≤ plan or plan ≤ 0.
  - `computeUnderPercent(factCents:planCents:)` — rounded percent of plan used; 0 when plan ≤ 0.
  - `BarSegments` Equatable struct with `fillRatio: Double` (0..1) + `tickAt: Double?` (0..1 or nil).
  - `computeBarSegments(factCents:planCents:)` — fact ≤ 0 → empty; plan ≤ 0 && fact > 0 → full + tick at 0 (anomaly signal); fact ≤ plan → fill=fact/plan, no tick; fact > plan → fill=1.0, tick at plan/fact.
  - `filterActualsForCategory(_:categoryId:)` — O(N) filter on categoryId.
  - `computeFactForCategory(_:categoryId:)` — Σ |amount_cents| where category matches AND kind == .expense (roundup / deposit / income excluded — matches HomeData.computeCategoryAggregates expense-only convention).

- **`CategoryV10UpdateRequest` Encodable (~55 lines added in DTO file)**: all seven fields (name, sortOrder, isArchived, planCents, rollover, paused, parentId) optional with default `nil`. Custom `encode(to:)` uses `encodeIfPresent` for every key — backend's `model_dump(exclude_unset=True)` then only mutates fields explicitly set. `CategoryRollover` widened from `Decodable` to `Codable` so it can be serialised in the body (was Decodable-only — only the list path needed to read it).

- **`CategoriesV10API.update(id:payload:)` (~15 lines added)**: `try await APIClient.shared.request("PATCH", "/categories/\(id)", body: payload)`. Returns `CategoryV10DTO` (the updated row). Errors: 404 cross-tenant or missing id (RESTful, no existence leak), 422 invalid value (e.g. negative plan_cents), 400 domain-specific (Phase 26-01 may add overflow checks server-side in the future).

- **`CategoryDetailViewModel` (~155 lines)**: @MainActor @Observable class.
  - Status state machine (`Status: Equatable` — idle / loading / ready / error(String)).
  - `load()` opens `async let categoriesTask = CategoriesV10API.list()` in parallel with `PeriodsAPI.current()` (wrapped in local `do/catch` to fall back to nil on 404 — same pattern as HomeV10ViewModel for mid-onboarding users). Categories list filtered to `id == categoryId`; cross-tenant returns nil → `.error("Категория не найдена")` (T-26-03-02 mitigation). If a period resolves, fetches `ActualV10API.list(periodId:)`; otherwise actuals = [].
  - `inFlight` guard returns immediately on re-entrant calls (T-26-03-04).
  - `toggleRollover()` — picks the opposite `CategoryRollover` and PATCHes via `CategoriesV10API.update(id:payload:)`; updates `self.category` from server response.
  - `togglePause()` — same, flipping `paused`.
  - Derived computed properties (`factCents`, `isOver`, `barSegments`, `dayGroups`) delegate to `CategoryDetailData` + `TransactionsData.groupByDay` — re-evaluated automatically when actuals / category observers fire.

- **`CategoryDetailView` (~280 lines)**: SwiftUI surface.
  - ZStack with background = `model.isOver ? PosterTokens.Color.red : PosterTokens.Color.cobalt` — switches on the over-budget signal. SwiftUI interpolates between named colors so the transition reads smoothly without explicit animation work.
  - Loading state: ProgressView + «ЗАГРУЗКА» eyebrow.
  - Error state: «ОШИБКА» eyebrow + Mass message + «ПОПРОБОВАТЬ →» retry button (on paper background with cobalt text).
  - Ready state composition (top-down in ScrollView with 22pt horizontal / 56pt top / 90pt bottom padding):
    - `headerRow`: optional «← НАЗАД» button (visible when `router?.canPop`) + Eyebrow «CATEGORY · NN» (uses `cat.ord ?? "00"`).
    - `Mass(cat.name, size: 70)` — Mass component uppercases automatically in non-italic mode (Archivo Black at 70pt).
    - `Mass(subtitle, italic: true, size: 28).opacity(0.85)` — PT Serif Italic per ADR-001 (iOS cyrillic fallback); text = «— превышено на N%» when `isOver`, «— на N% плана» otherwise.
    - `BigFig(value: factCents / 100, sup: "₽", size: 88, color: PosterTokens.Color.paper)` — built-in count-up via PosterAnimations.easeOut over 0.9s.
    - `barView(segments:)`: GeometryReader-driven ZStack with 6pt height — `paper.opacity(0.18)` track + `paper` fill (width = `geo.size.width * fillRatio`) + optional `paper.opacity(0.6)` tick (1pt wide, 10pt tall, offset y: -2) for over-budget rows.
    - «из X ₽» caption (JetBrains Mono, 11pt, paper opacity 0.6) — `RubleFormatter.format(cents:)`.
    - `rolloverPlate`: full-width paper button with `cat.rollover == .savings ? "ОСТАТОК → НАКОПЛЕНИЯ" : "ОСТАТОК → ПРОЧЕЕ"` (Archivo Black 11pt tracked) + chevron «›». Tap → `Task { await model.toggleRollover() }`.
    - `ctaRow`: HStack of two ghost PosterButtons — «+ ПОДНЯТЬ ЛИМИТ» (pushes `PlanViewPlaceholderView()`) + «ПАУЗА»/«ВКЛЮЧИТЬ» (toggles paused).
    - Eyebrow «ОПЕРАЦИИ ПО КАТЕГОРИИ» (opacity 0.65) + `operationsSection(groups:)` — either italic «Операций пока нет» when empty or VStack of `daySection(_:)` entries.
    - `daySection`: PT-Serif italic 28pt date label + JetBrains Mono day-sum on the right; rows iterate `group.rows` via `txRow(_:)` (time-mono column 50pt wide + description + amount).
    - `amountColor(for:)` switch: roundup / deposit → yellow; expense / income → paper (matches Plan 25-09 convention).

- **`HomePlaceholders.swift` modification** (~6 lines): `CategoryDetailPlaceholderView`'s body changed from a 5-arg PosterPlaceholder render to `CategoryDetailView(categoryId: categoryId)`. Type name kept identical so the existing `router?.push(CategoryDetailPlaceholderView(categoryId: row.id))` callsite from HomeV10View (Plan 25-05's category row tap) continues to work without modification — same zero-touch swap pattern Plan 25-09 established for TransactionsViewPlaceholderView.

- **Tests**: 13 XCTest cases (16 assertions, since BarSegments tests check fillRatio AND tickAt) covering every code path:
  - `computeOverPercent` — 4 cases (50%, fact==plan → 0, 15%, plan==0 → 0).
  - `computeUnderPercent` — 4 cases (75%, fact==0 → 0, fact==plan → 100, plan==0 → 0).
  - `computeBarSegments` — 4 cases (under, over with tick at plan/fact, plan==0 with fact > 0 → full+tick@0, fact==0 → empty).
  - `filterActualsForCategory` — 2 cases (returns matching, returns empty for no match).
  - `computeFactForCategory` — 3 cases (sums abs for expense-only, abs handles negatives, returns 0 for non-matching category).

## SwiftUI patterns chosen for this plan

### Background-color-by-state ZStack
The cobalt → red over-budget cue is the screen's primary affordance for «вы вышли за лимит». Rather than animate a per-element colour, the root ZStack's background is set to `model.isOver ? .red : .cobalt`. SwiftUI's implicit animation across the next view-tree diff smoothly interpolates between the two named colors — no manual transaction wrapping required. When the user toggles `paused` or fact ticks past the plan via a new transaction, the screen background shifts cleanly without rebuilding subviews.

### Custom Encodable per-field skip-nil pattern
`CategoryV10UpdateRequest` follows the same custom-encoder approach `ActualCreateRequest` (Plan 25-03) established for `accountId`: every key is wrapped in `c.encodeIfPresent(_:forKey:)` so unset fields are absent from the wire, not encoded as `"key": null`. This lets the backend's `model_dump(exclude_unset=True)` discriminate «didn't send» from «explicitly null», which matters for partial PATCH where two clients might race a `paused` toggle and a `rollover` toggle on the same category — neither should clobber the other's mutation.

### Re-use TransactionsData for the per-category operations list
CAT-V10-06's operations list shares all visual conventions with the global Transactions registry (Plan 25-09): same day grouping (Today / Yesterday / N мая), same U+2212 minus formatting, same yellow-on-roundup / paper-on-expense amount colouring. So CategoryDetailView calls `TransactionsData.groupByDay` and `TransactionsData.formatTxAmount` directly — only the day-section UI is custom-rendered (a stripped-down version of TxRow without the swipe / sheet wiring, since CategoryDetail is a read-only drill-down for v1.0).

The plan's draft TxRow body referenced `formatTxAmount(cents, kind)` but the actual Plan 25-09 helper takes only `amountCents`. The View handles the kind-dependent amount colour via a local `amountColor(for: kind)` switch (matches Plan 25-09 prototype line 374 convention) — same visual result, fewer helper-signature changes.

### CategoryRollover Codable promotion
The DTO previously declared `enum CategoryRollover: String, Decodable` — only the list path needed to read it. PATCH needs to write it back, so the enum widens to `Codable` (= Decodable + Encodable). Single-character change, no behavioural impact on existing decode paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's `formatTxAmount(cents, kind)` signature does not match Plan 25-09 helper**
- **Found during:** Task 2 (Writing CategoryDetailView)
- **Issue:** The plan's draft TxRow body calls `TransactionsData.formatTxAmount(tx.amountCents, kind: tx.kind)` — but Plan 25-09's helper takes only `amountCents` (no `kind` parameter). The kind-dependent amount colour was handled in Plan 25-09 at the View layer via `amountColor(for kind:)` switch, not inside `formatTxAmount`.
- **Fix:** Apply the same Plan 25-09 pattern in CategoryDetailView — call `TransactionsData.formatTxAmount(tx.amountCents)` for the string, and `amountColor(for: tx.kind)` for the colour switch. Both are local to CategoryDetailView's `txRow(_:)`.
- **Files modified:** ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift (initial implementation already used the corrected approach — no rework commit needed).
- **Commit:** `9604946` (Task 2)

**2. [Rule 2 - Missing critical functionality] CategoryRollover was Decodable-only**
- **Found during:** Task 1 GREEN (adding CategoryV10UpdateRequest)
- **Issue:** `CategoryV10UpdateRequest` needs to encode `rollover?: CategoryRollover` — but the enum was declared `Decodable`-only (consumer-side only, since only `GET /categories` needed to read it before Phase 26). Compiler complained when `encodeIfPresent(rollover, forKey: .rollover)` tried to invoke Encodable on a Decodable-only type.
- **Fix:** Widened the enum to `Codable` (= Decodable + Encodable). Single-token change. The list decode path is unchanged — it still uses the rawValue-driven synthesis.
- **Files modified:** ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
- **Commit:** `c3ba2cd` (GREEN)

### Out-of-scope discoveries

None — every blocker found during this plan was directly caused by the new files added.

## Authentication Gates

None. All API calls go through the existing `APIClient.shared` flow which carries the dev/Telegram token established by AuthAPI in earlier phases. The PATCH /categories/:id endpoint is owner-scoped via the existing `get_current_user` + `require_onboarded` dependencies (Phase 26-01).

## Issues Encountered

- **Git lock contention with parallel agent**: Task 2 commit hit `fatal: Unable to create '.git/index.lock': File exists` because the web 26-02 agent committed at the same instant. Waited for lock to clear (~2s) and retried successfully. No code-side resolution needed — the worktree pattern handles this for cross-agent serialisation.
- **Project regen invalidates xcodeproj path-relative**: After `xcodegen generate` picks up the new `FeaturesV10/CategoryDetail/` folder, the `.xcodeproj` is ignored by git per `.gitignore` (verified `git add ios/BudgetPlanner.xcodeproj` returns "ignored"). Per project convention this is the right call — the project file is regenerated locally from `project.yml` whenever new files appear.
- **`async let` capture restriction noted by HomeV10ViewModel SUMMARY also applies here**: tried briefly to extract `PeriodsAPI.current()` into a helper, hit the same "capturing 'async let' variables is not supported" error noted in Plan 25-05; resolved inline with `let per: PeriodDTO?; do { per = try await ... } catch { per = nil }`.

## Threat Flags

None — this plan does not introduce any new attack surface beyond what 26-01 already accounted for at the backend. The four threats called out in this plan's `<threat_model>` are all mitigated:

| Threat ID | Mitigation | Where enforced |
|-----------|------------|----------------|
| T-26-03-01 | Type-safe CategoryV10UpdateRequest Encodable + encodeIfPresent skips nil keys | ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift (custom `encode(to:)` block) |
| T-26-03-02 | `cats.first(where: { $0.id == categoryId })` returns nil → "Категория не найдена" | ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailViewModel.swift:78-85 |
| T-26-03-03 | toggle methods catch errors silently for v1.0 — Phase 28 polish adds toast | ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailViewModel.swift:111-122 (documented inline) |
| T-26-03-04 | `inFlight` re-entrancy guard in load(); toggle methods serialise via @MainActor | ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailViewModel.swift:62-66 |

## Known Stubs

- **«+ ПОДНЯТЬ ЛИМИТ» pushes `PlanViewPlaceholderView()`** — intentional. Plan 26-05 will rebind that placeholder type's body to render the real PlanView (focus param wiring); zero-touch swap pattern means no change to CategoryDetailView is needed when Plan 26-05 ships. Visible to the user as a placeholder card stating "WIP — Plan view (Phase 26)" — Plan 26-05 swaps the body wholesale.
- **Toggle failures are silent** (T-26-03-03 accepted disposition) — `toggleRollover` / `togglePause` catch errors and discard them; the UI remains in the previous state until the next `.load()` call refreshes it. Phase 28 polish wires a toast/banner. Documented inline in CategoryDetailViewModel and in this SUMMARY's Threat Flags table.

## Self-Check: PASSED

**Files exist:**

- FOUND: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailData.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/CategoryDetailDataTests.swift`
- FOUND: `ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift` (modified)
- FOUND: `ios/BudgetPlanner/Networking/Endpoints/CategoriesV10API.swift` (modified)
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` (modified)

**Commits exist (this plan only — verified via `git log --oneline`):**

- FOUND: `f2f83aa` test(26-03): add failing CategoryDetailDataTests (RED)
- FOUND: `c3ba2cd` feat(26-03): GREEN — CategoryDetailData + CategoriesV10API.update + CategoryV10UpdateRequest
- FOUND: `9604946` feat(26-03): CategoryDetailViewModel + CategoryDetailView SwiftUI screen
- FOUND: `8ec9751` feat(26-03): zero-touch swap CategoryDetailPlaceholderView → CategoryDetailView

**Verification gates from PLAN <verification>:**

| Gate | Required | Actual |
|------|----------|--------|
| 1. `xcodebuild test -only-testing:BudgetPlannerTests/CategoryDetailDataTests` | 12+ pass | ✓ 13/13 cases (16 assertions) pass on iPhone 17 Pro Simulator |
| 2. `xcodebuild build` | succeeds | ✓ Build Succeeded after each task (exit 0) |
| 3. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` (no regression) | passes | ✓ 20/20 pass |
| 4. `xcodebuild test -only-testing:BudgetPlannerTests/V10MainShellTests` (no regression) | passes | ✓ All pass |
| 5. `grep -c "static func compute" .../CategoryDetailData.swift` | ≥ 4 | 4 (computeOverPercent / computeUnderPercent / computeBarSegments / computeFactForCategory) |
| 6. `grep -c "Codable\|Encodable" .../CategoryV10DTO.swift` | ≥ 2 | 2 (CategoryRollover Codable + CategoryV10UpdateRequest Encodable) |
| 7. `grep -c "static func update" .../CategoriesV10API.swift` | ≥ 1 | 1 |
| 8. `grep -c "@Observable\|@MainActor" .../CategoryDetailViewModel.swift` | ≥ 2 | 2 |
| 9. `grep -c "ZStack\|BigFig\|Mass\|Eyebrow" .../CategoryDetailView.swift` | ≥ 6 | ≫6 (multiple uses each) |
| 10. `grep -c "ОСТАТОК\|ПОДНЯТЬ ЛИМИТ\|ПАУЗА\|ВКЛЮЧИТЬ" .../CategoryDetailView.swift` | ≥ 4 | 5 (ОСТАТОК × 2 + ПОДНЯТЬ + ПАУЗА + ВКЛЮЧИТЬ) |
| 11. `grep -c "CategoryDetailView(categoryId" .../HomePlaceholders.swift` | ≥ 1 | 1 |

**No accidental file deletions** in any of this plan's 4 commits:
- `git diff f2f83aa^..8ec9751 --diff-filter=D --name-only` (filtered to plan files): empty.

## TDD Gate Compliance

- **RED gate:** `f2f83aa` test(26-03): add failing CategoryDetailDataTests (RED) — verified failing build (`Cannot find 'CategoryDetailData' in scope` × 11) before GREEN.
- **GREEN gate:** `c3ba2cd` feat(26-03): GREEN — CategoryDetailData + CategoriesV10API.update + CategoryV10UpdateRequest — verified test pass after via `xcodebuild test -only-testing:BudgetPlannerTests/CategoryDetailDataTests`.
- **REFACTOR gate:** not used (Tasks 2-3 are non-TDD per plan; first-pass implementations didn't need a separate refactor commit).

## Next Phase Readiness

- **Plan 26-05 (iOS Plan view)** can rebind `PlanViewPlaceholderView`'s body to render the real `PlanView()` with focus param wiring. CategoryDetailView's `«+ ПОДНЯТЬ ЛИМИТ»` button calls `router?.push(PlanViewPlaceholderView())` — that callsite will then land on the real Plan screen without any change to CategoryDetailView (zero-touch swap pattern). If Plan 26-05 needs to pass `focus: categoryId`, the placeholder will need a `categoryId: Int?` parameter; CategoryDetailView's CTA call can be updated locally if/when that signature ships.
- **Phase 28 polish** can wire toast/banner for `toggleRollover` / `togglePause` failure surfaces (T-26-03-03). The error catch sites in CategoryDetailViewModel are marked with a comment so the wiring site is easy to find.
- **iOS smoke verification** is best done on the simulator (XcodeBuildMCP screenshot) since the verification involves real PATCH calls landing on the dev backend — outside the scope of the headless `xcodebuild test` gate. Per the plan, build + unit tests are the automated gates, and the visual / functional smoke is documented but not blocking for SUMMARY-write.

---
*Phase: 26-category-detail-plan-subscriptions*
*Plan: 03*
*Completed: 2026-05-10*
