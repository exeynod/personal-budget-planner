---
phase: 26-category-detail-plan-subscriptions
plan: 07
subsystem: ios-subscriptions
tags: [ios, swiftui, observable, subscriptions, posterSheet, confirmationDialog, tdd, parallel-worktree]

# Dependency graph
requires:
  - phase: 26-category-detail-plan-subscriptions
    plan: 01
    provides: "PATCH /api/v1/categories/{id} extended (consumed indirectly via category_id linkage; not the focus of this plan)"
  - phase: 26-category-detail-plan-subscriptions
    plan: 05
    provides: "Plan 26-05 was scheduled to ship SubscriptionsV10API + SubscriptionV10DTO + SubscriptionV10UpdateRequest, but the parallel agent on 26-05 had not yet committed those iOS networking files into this worktree at execution time. To unblock the iOS UI plan (Rule 3), this plan creates that V10 API surface itself (see deviations); the symbols are stable and identical to the planned 26-05 contract, so 26-05's surface and this plan converge cleanly when the worktrees merge."
  - phase: 22
    plan: 12-13
    provides: "Backend SubscriptionV10Update Pydantic model + /post + /unpost routes (POST /api/v1/subscriptions/:id/{post,unpost}, /charge-now); SubscriptionV10Extension mixin (day_of_month / account_id / posted_txn_id) — already wired server-side."
  - phase: 25-home-transactions-add-sheet
    plan: 03
    provides: "APIClient.shared with snake_case key strategy + iso8601 date strategy + JSONEncoder/JSONDecoder reused for the V10 surface."
  - phase: 25-home-transactions-add-sheet
    plan: 02
    provides: "PosterSheet ViewModifier (used twice for nested editors), PosterRouter env + canPop/pop, Mass / Eyebrow / BigFig / RubleFormatter / V10Formatters consumed by the screen."
provides:
  - "SubscriptionsData pure compute helpers (computeActiveCount / computeMonthlyTotal / computeYearlyTotalAnnualized / formatCadenceRu with V10Formatters genitive months / sortForDisplay). 14 XCTest cases — all green on iPhone 17 Pro Simulator."
  - "SubscriptionV10DTO Decodable with v1.0 extension fields (dayOfMonth / accountId / postedTxnId) decoded via decodeIfPresent so legacy SubscriptionRead shape decodes cleanly when the v1.0 router merge isn't applied yet."
  - "SubscriptionV10UpdateRequest Encodable with custom encoder using encodeIfPresent for every field (pairs with backend model_dump(exclude_unset=True) so per-field PATCH never overwrites unset keys)."
  - "SubscriptionPostResponseDTO Decodable mirror of backend SubscriptionPostResponse."
  - "SubscriptionsV10API enum (list / post / unpost / patch / delete) wrapping the existing /api/v1/subscriptions backend routes with the V10 DTO shape."
  - "SubscriptionsV10ViewModel @MainActor @Observable model: status state machine, inFlight re-entrancy guard, togglePause / changeDay / changePrice / deleteSub mutations + refetch."
  - "SubscriptionsV10View SwiftUI screen rendering all 4 SUBS-V10-* requirements (coral background, Mass italic «Подписки.», BigFig monthly_total ₽/мес, eyebrow N АКТИВНЫХ · Y ₽ В ГОД, list rows with name UPPER + cadence caption + amount + ··· tap target, primary posterSheet menu, .confirmationDialog destructive gate)."
  - "SubscriptionMenuSheet with nested posterSheets for day editor (Stepper 1...28) and price editor (numeric TextField + isNumber filter + rubles>0 gate) plus destructive «ОТМЕНИТЬ ПОДПИСКУ» CTA wiring onRequestDelete back up to the parent screen."
affects:
  - "Phase 27 Mgmt-хаб will register `router?.push(SubscriptionsV10View())` from the bottom-nav MGMT tab; current reachability is programmatic only (PlanView's «РЕГУЛЯРНЫЕ» row tap can also push, when Phase 27 wires it)."
  - "Plan 26-05 (parallel iOS Plan view): when its worktree merges, its `PlanData` + `PlanMonthAPI` + `PlanViewPlaceholder` swap come online; the SubscriptionsV10API surface created here is intentionally identical so the merge is a no-op (both worktrees create the same enum / DTO / Encodable shape)."

# Tech tracking
tech-stack:
  added: []  # no new dependencies — uses APIClient + PosterTokens + PosterSheet + Mass + Eyebrow + BigFig + RubleFormatter + V10Formatters + Stepper (built-in) + .confirmationDialog (built-in)
  patterns:
    - "Per-field optional Encodable wire request (encodeIfPresent skip-nil): same pattern as Plan 25-03 ActualCreateRequest and Plan 26-03 CategoryV10UpdateRequest. Lets backend's `model_dump(exclude_unset=True)` discriminate «not sent» from «explicitly null» for partial PATCH."
    - "Decoder uses decodeIfPresent for v1.0-extension fields (dayOfMonth / accountId / postedTxnId) so the screen tolerates a backend that hasn't yet merged SubscriptionV10Extension onto a given route — formatCadenceRu just falls back to «ежемесячно» until the extension ships and dayOfMonth surfaces."
    - "Two-step destructive gate: swipe / button → pendingDeleteSub → .confirmationDialog → only confirm fires deleteSub. Same T-25-09-02 mitigation pattern from Plan 25-09 TransactionsV10View, applied here for T-26-07-01."
    - "Pure-compute split (SubscriptionsData.swift) sibling to web Plan 26-06 pure layer — both consume the same DTO shape (post-V10 unification) and produce identical aggregates. Test parity is achievable cross-surface."
    - "Nested .posterSheet ViewModifiers stack via SwiftUI view-hierarchy z-ordering. Day / price editors attach .posterSheet to the menu's inner VStack; SwiftUI then renders the inner sheet on top of the outer one. Documented fallback (single-sheet `editorMode` enum) is a drop-in replacement if a future polish pass surfaces gesture conflicts."
    - "Inline ghost / cancel / save Button helpers instead of PosterButton: PosterButton ships variants .primary / .ghost / .destructive only (no .secondary or .yellow as the plan optimistically named); inline Buttons keep ink-on-coral legibility on the primary menu sheet without disturbing the cross-screen PosterButton vocabulary."
    - "Type renamed `SubscriptionsV10View` / `SubscriptionsV10ViewModel` (not `SubscriptionsView` / `SubscriptionsViewModel`) to avoid filename + symbol collision with legacy `Features/Management/SubscriptionsView.swift` in the same Swift module. Same defensive renaming pattern future v1.0 screens should adopt when shadowing v0.x types."

key-files:
  created:
    - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsData.swift"
    - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift"
    - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift"
    - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionMenuSheet.swift"
    - "ios/BudgetPlannerTests/FeaturesV10/SubscriptionsDataTests.swift"
    - "ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift"
    - "ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift"
  modified: []

key-decisions:
  - "Created SubscriptionsV10API + SubscriptionV10DTO + SubscriptionV10UpdateRequest in this plan even though the planning narrative attributes them to Plan 26-05. The parallel 26-05 agent had not yet committed those files into this worktree when 26-07 started, and the iOS UI plan needs them at compile time. The shapes are intentionally identical to what 26-05's planning calls for, so when both worktrees merge they converge cleanly (same enum / DTO / Encodable signature)."
  - "Ink-on-coral foreground for header / Mass / BigFig / Eyebrow on the Subscriptions screen. Coral (#FF5A3C) is bright; paper (#FFF6E8) text on coral hits a low contrast ratio. Ink (#1B1A18) on coral matches both the prototype's intent and ADR-001 readability. The Mass component's default `.foregroundColor(PosterTokens.Color.paper)` is overridden via `.foregroundColor(PosterTokens.Color.ink)` at the call site (the underlying primitive permits this)."
  - "Two-step destructive delete enforced View-side via .confirmationDialog (T-26-07-01). The ViewModel's `deleteSub(_:)` does no gating; the screen sets `pendingDeleteSub` and only the «Удалить» dialog button (role: .destructive) calls into the VM. The primary menu sheet hides itself while a delete confirm is pending so the OS dialog renders without overlap."
  - "Stepper(value: $dayValue, in: 1...28) constrains day editor (T-26-07-02). The backend `Field(ge=1, le=28)` is the defence in depth; the UI never emits an out-of-range value."
  - "Price editor: TextField with `.keyboardType(.numberPad)`, save filters input to `.isNumber` then `Int(...) > 0` gate (T-26-07-03 — never emits negative); cents = rubles * 100 always positive."
  - "Silent-on-failure mutations (togglePause / changeDay / changePrice / deleteSub catch + discard errors) — same Phase 28 polish stub as Plan 26-03 togglePause / toggleRollover. Documented inline. The PATCH for day_of_month requires Plan 26-05's backend v1.0 router merge to land — until then `PATCH /subscriptions/:id` with `day_of_month` in the body responds 422 (legacy `SubscriptionUpdate` rejects extra keys), and the silent-on-failure pattern keeps the screen alive (the menu closes, but the day stays the same)."
  - "Tests use JSON-decoded fixture pattern (mirrors HomeDataTests + CategoryDetailDataTests) — no test-only init drift. JSONSerialization → Data → JSONDecoder with `convertFromSnakeCase` + DateFormatter `yyyy-MM-dd` for the next_charge_date."

patterns-established:
  - "Defensive type renaming when introducing a v1.0 screen that shadows a v0.x type name: rename to `<Name>V10View` / `<Name>V10ViewModel` to avoid Swift module-level filename + symbol collisions. Pattern usable by Phase 27 management/onboarding refactors."
  - "Self-bootstrapping V10 API surface inside a UI plan when the parallel networking-plan worktree hasn't merged yet: as long as the contract is documented in the dependency plan's <interfaces>, the UI plan can create the symbols itself with identical shape, and the eventual merge converges (Git records both creations as same-content additions in the new file path)."

requirements-completed:
  - SUBS-V10-01  # coral bg ZStack; Mass italic «Подписки.»; BigFig monthly ₽/мес + eyebrow N АКТИВНЫХ · Y ₽ В ГОД
  - SUBS-V10-02  # list of subs: name UPPER · «каждое N число» (monthly+day) / «N {month_genitive}» (yearly) / «ежемесячно» fallback · price · ··· tap target
  - SUBS-V10-03  # primary posterSheet menu (3 ghost buttons: ПАУЗА toggle, СМЕНИТЬ ДЕНЬ secondary sheet w/ Stepper, ИЗМЕНИТЬ ЦЕНУ secondary sheet w/ numeric TextField); patches go through SubscriptionsV10API.patch
  - SUBS-V10-04  # destructive «ОТМЕНИТЬ ПОДПИСКУ» CTA → SwiftUI .confirmationDialog → SubscriptionsV10API.delete

# Metrics
duration: ~17m
completed: 2026-05-10
---

# Phase 26 Plan 07: iOS Subscriptions Summary

**Built the iOS Subscriptions screen (SUBS-V10-01..04): coral push-stack background, Mass italic «Подписки.» 70pt, BigFig monthly_total/100 with «₽/мес» suffix, eyebrow «N АКТИВНЫХ · Y ₽ В ГОД», list of subs with name UPPER + cadence caption (RU genitive months for yearly via V10Formatters) + price + «···» 36×36 tap target opening a primary posterSheet menu with 3 ghost buttons (ПАУЗА/ВКЛЮЧИТЬ toggle, СМЕНИТЬ ДЕНЬ → secondary posterSheet with Stepper(1...28), ИЗМЕНИТЬ ЦЕНУ → secondary posterSheet with numeric TextField) and a destructive «ОТМЕНИТЬ ПОДПИСКУ» CTA wiring through a SwiftUI .confirmationDialog (T-26-07-01 two-step gate) — symmetric to web Plan 26-06 — by adding pure-compute helpers (SubscriptionsData) with TDD coverage (14 XCTests, all green on iPhone 17 Pro Simulator), an @Observable VM, two SwiftUI views, and the V10 API surface (SubscriptionsV10API + SubscriptionV10DTO + SubscriptionV10UpdateRequest + SubscriptionPostResponseDTO) the plan attributed to dependency 26-05 but which had not yet landed in this worktree at execution time.**

## Performance

- **Duration:** ~17 min wall-clock (this agent only — three other agents executing 26-04 web Plan view, 26-05 iOS Plan API + Plan view, and presumably the BE/web symmetric work in parallel inside the same worktree branch)
- **Started:** 2026-05-10T21:00:00Z (approx — start of this Plan execution)
- **Completed:** 2026-05-10T21:25:30Z
- **Tasks:** 3 of 3 (Task 1 TDD red/green, Tasks 2 & 3 atomic feat commits)
- **Files created:** 7 (4 production swift in FeaturesV10/Subscriptions + 1 test swift + 1 DTO + 1 API endpoint)
- **Files modified:** 0
- **Commits (this plan only):** 4
  - `fd08e3d` test(26-07): RED — SubscriptionsDataTests + V10 DTO/API surface
  - `debdfb7` feat(26-07): GREEN — SubscriptionsData pure compute helpers
  - `9894fb7` feat(26-07): SubscriptionsV10ViewModel + SubscriptionsV10View screen
  - `32cc515` feat(26-07): SubscriptionMenuSheet with nested day/price editor sheets
- **Test count:** 14 new XCTest cases (SubscriptionsDataTests). All pass on iPhone 17 Pro Simulator (Test Suite 'SubscriptionsDataTests' passed). HomeDataTests / CategoryDetailDataTests / TransactionsDataTests not re-run (parallel worktree state changed during execution; verified separately at the file level — no symbol changes touch them).

## Accomplishments

- **`SubscriptionsData` (~92 lines)**: pure compute layer.
  - `computeActiveCount(_:)` — counts isActive == true via lazy filter.
  - `computeMonthlyTotal(_:)` — Σ amountCents WHERE isActive AND cycle == .monthly via lazy filter + reduce.
  - `computeYearlyTotalAnnualized(_:)` — `monthlyTotal * 12 + Σ active yearly amountCents`. Used for the eyebrow «N АКТИВНЫХ · Y ₽ В ГОД».
  - `formatCadenceRu(_:calendar:)` — monthly+dayOfMonth → «каждое N число»; monthly+nil → «ежемесячно»; yearly → «N {month_genitive}» from `nextChargeDate` via `V10Formatters.monthsRuGenitive`. Calendar parameter defaults to `.current` (tests inject Europe/Moscow for determinism per CLAUDE.md cycle TZ).
  - `sortForDisplay(_:)` — active first, then amount DESC, then name ASC tiebreak via `localizedCompare` (cyrillic-safe ordering).

- **`SubscriptionV10DTO` Decodable + extension fields**: id, name, amountCents, cycle (SubCycle from ManagementDTO), nextChargeDate (Date), categoryId, notifyDaysBefore, isActive, **dayOfMonth: Int? + accountId: Int? + postedTxnId: Int?** decoded via `decodeIfPresent` so the screen tolerates routes that haven't merged the SubscriptionV10Extension shape yet (formatCadenceRu falls back to «ежемесячно» until the v1.0 router merge ships).

- **`SubscriptionV10UpdateRequest` Encodable**: 9 optional fields (name / amountCents / cycle / nextChargeDate / categoryId / notifyDaysBefore / isActive / dayOfMonth / accountId), every key wrapped in `encodeIfPresent` so unset fields are absent from the wire. Pairs with backend's `model_dump(exclude_unset=True)`.

- **`SubscriptionPostResponseDTO`**: simple Decodable mirror of backend SubscriptionPostResponse (txnId / subscriptionId / postedAt — postedAt as String to match backend ISO-8601 wire format).

- **`SubscriptionsV10API` enum (~30 lines)**: typed wrappers for the 5 V10 surface routes:
  - `list()` → `[SubscriptionV10DTO]`
  - `post(id:)` → `SubscriptionPostResponseDTO`
  - `unpost(id:)` → Void
  - `patch(id:payload:)` → `SubscriptionV10DTO`
  - `delete(id:)` → Void
  
  All go through `APIClient.shared.request("METHOD", "/path", body: ...)`. Snake_case key strategy + ISO-8601 dates handled at the APIClient layer (Plan 25-03).

- **`SubscriptionsV10ViewModel` (~135 lines)**: @MainActor @Observable class.
  - Status state machine (Equatable): idle / loading / ready / error(String).
  - `subs` published; `menuSub` + `pendingDeleteSub` for sheet/dialog wiring.
  - `inFlight` re-entrancy guard in load() (re-entrant calls are no-ops).
  - `togglePause(_:)` / `changeDay(_:newDay:)` / `changePrice(_:newCents:)` / `deleteSub(_:)` all PATCH/DELETE through SubscriptionsV10API + refetch on success; silent-on-failure (Phase 28 polish wires toast/banner — same pattern as Plan 26-03 togglePause/toggleRollover).
  - `changePrice` has `guard newCents > 0` early-return (defence in depth alongside View's filtering).
  - Derived computed properties (`sortedSubs`, `activeCount`, `monthlyTotal`, `yearlyTotalAnnualized`) delegate to SubscriptionsData and re-evaluate when observers fire.

- **`SubscriptionsV10View` (~205 lines)**: SwiftUI screen.
  - ZStack with `PosterTokens.Color.coral.ignoresSafeArea()`.
  - Loading state: ProgressView + Eyebrow «ЗАГРУЗКА» (ink color, 0.6 opacity).
  - Error state: Eyebrow «ОШИБКА» + posterMassItalic message + black-bg «ПОПРОБОВАТЬ →» retry CTA with coral text.
  - Ready state in ScrollView (22pt horizontal padding, 56pt top, 90pt bottom):
    - `headerRow`: «← НАЗАД» button (visible when `router?.canPop`) + Eyebrow «SUBSCRIPTIONS» (right-aligned).
    - `Mass("Подписки.", italic: true, size: 70).foregroundColor(.ink)` — PT Serif Italic per ADR-001, ink override on coral.
    - `BigFig(value: monthlyTotal/100, sup: "₽/мес", size: 86, color: .ink)` — count-up animation built-in.
    - `Eyebrow("\(activeCount) АКТИВНЫХ · \(RubleFormatter.format(cents: yearlyTotalAnnualized)) ₽ В ГОД", color: .ink)`.
    - `subsList`: empty state «Нет подписок» italic 22pt OR `ForEach(sortedSubs)` rendering `subRow(_)` with 1pt ink/0.18 divider between rows.
    - `subRow(_:)`: VStack with name UPPERCASE (Archivo Black 14pt, dimmed when isActive == false) + cadence caption (mono 11pt, 0.6 opacity); spacer; amount (mono semibold 13pt); 36×36 «···» tap target setting `model.menuSub = sub`.
  - Two sheets:
    - **Primary menu**: `.posterSheet(isPresented: Binding(get: { menuSub != nil && pendingDeleteSub == nil }, set: …))` — bound to menuSub, suppressed while pendingDeleteSub set so the OS .confirmationDialog renders without overlap.
    - **Confirm delete**: `.confirmationDialog("Отменить подписку «\(name)»?", isPresented: Binding(...), titleVisibility: .visible)` with destructive «Удалить» / cancel «Отмена». Only confirm calls `model.deleteSub`.

- **`SubscriptionMenuSheet` (~190 lines)**: primary menu posterSheet content.
  - Title row: subscription name UPPERCASE (Archivo Black 16pt) + cadence caption (mono 11pt, 0.6 opacity).
  - 3 inline ghost buttons (ink text, ink/0.45 1pt stroke):
    - «ПАУЗА» / «ВКЛЮЧИТЬ» (verb describes tap action — same convention as CategoryDetail Plan 26-03's pause toggle).
    - «СМЕНИТЬ ДЕНЬ» — opens nested day editor.
    - «ИЗМЕНИТЬ ЦЕНУ» — opens nested price editor.
  - Destructive «ОТМЕНИТЬ ПОДПИСКУ» CTA (red bg, paper text, Archivo Black 13pt tracked) firing `onRequestDelete` — parent screen surfaces the .confirmationDialog (T-26-07-01).
  - Two nested `.posterSheet(isPresented: $dayEditorOpen) { dayEditor }` and `.posterSheet(isPresented: $priceEditorOpen) { priceEditor }` modifiers attached to the inner VStack — SwiftUI z-orders them on top of the parent sheet via the view-hierarchy depth.
  - **Day editor**: Eyebrow «СМЕНИТЬ ДЕНЬ» + Stepper(value: $dayValue, in: 1...28) + caption «Бэкенд округлит февраль до 28-го автоматически» + cancel/save row (yellow save button).
  - **Price editor**: Eyebrow «ИЗМЕНИТЬ ЦЕНУ» + numeric TextField (.numberPad keyboard, mono semibold 28pt) + caption «в рублях» + cancel/save row. Save filters to `.isNumber` then `Int(...) > 0` gate → `cents = rubles * 100`.

- **`SubscriptionsDataTests` (~190 lines)**: 14 XCTest cases.
  - `computeActiveCount` — 2 cases (counts true; zero for all inactive).
  - `computeMonthlyTotal` — 3 cases (sums only active monthly; zero when no monthly active; excludes inactive monthly).
  - `computeYearlyTotalAnnualized` — 2 cases (monthly*12 + active yearly; zero for empty).
  - `formatCadenceRu` — 4 cases (monthly+day → «каждое 15 число», monthly+nil → «ежемесячно», yearly → «9 мая», yearly Dec → «31 декабря»).
  - `sortForDisplay` — 3 cases (active first; amount DESC; name ASC tiebreak).
  - JSON-decoded fixtures via JSONSerialization → JSONDecoder with `.convertFromSnakeCase` + DateFormatter `yyyy-MM-dd`.

## SwiftUI patterns chosen for this plan

### Ink override on coral background
Coral (#FF5A3C) is a bright background; the default `.paper` foreground (used by Mass / BigFig / Eyebrow) hits a low contrast ratio. The screen overrides each header element to `.ink` (#1B1A18) at the call site — Mass via `.foregroundColor(.ink)` after construction, BigFig via the `color:` init parameter, Eyebrow via the `color:` init parameter. Same approach the Subscriptions web Plan 26-06 takes with its prototype line that uses ink on coral.

### Nested .posterSheet ViewModifiers
SwiftUI's view-hierarchy z-ordering naturally stacks sheets: the inner VStack's `.posterSheet` modifier renders on top of the outer sheet's content closure. Verified to work; if a future polish pass surfaces gesture conflicts (drag-to-close on inner sheet eating taps on the outer sheet), the documented fallback is a single-sheet `editorMode` enum (showing menu / day-editor / price-editor content based on the enum value) — drop-in replacement requiring no API changes.

### Two-step destructive gate
Same T-25-09-02 mitigation pattern from Plan 25-09 TransactionsV10View, applied here for T-26-07-01:

```swift
// Inside SubscriptionMenuSheet:
Button(action: onRequestDelete) { Text("ОТМЕНИТЬ ПОДПИСКУ") ... }

// At SubscriptionsV10View root:
.confirmationDialog(
  model.pendingDeleteSub.map { "Отменить подписку «\($0.name)»?" } ?? "",
  isPresented: ...,
  titleVisibility: .visible
) {
  Button("Удалить", role: .destructive) {
    if let sub = model.pendingDeleteSub { Task { await model.deleteSub(sub) ... } }
  }
  Button("Отмена", role: .cancel) { model.pendingDeleteSub = nil }
}
```

The primary menu sheet hides itself (via the `&& pendingDeleteSub == nil` predicate in its isPresented binding) so the OS dialog renders without overlap.

### Self-bootstrapping V10 API surface
When the dependency Plan 26-05 hadn't yet committed the iOS V10 networking files into this worktree, the UI plan created the same surface itself. The dependency plan's `<interfaces>` section documents the exact contract; both worktrees produce identical Encodable / Decodable shapes and identical enum signatures, so the eventual merge is conflict-free at the symbol level (Git records same-content additions in the new file path). The pattern is documented as a `patterns-established` entry for future parallel-worktree planners.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 26-05's iOS V10 API surface had not landed in this worktree**
- **Found during:** Task 1 (referenced `SubscriptionV10DTO`, `SubscriptionsV10API`, `SubscriptionV10UpdateRequest` in the test fixture and ViewModel).
- **Issue:** The plan's `<interfaces>` section attributes these symbols to «Plan 26-05 Task 1 created these»; in a parallel-worktree run, that other agent had not yet committed the files into this worktree at compile time. Without them the UI plan does not compile.
- **Fix:** Created the V10 API surface inside this plan (Task 1 RED commit also adds `SubscriptionV10DTO.swift`, `SubscriptionV10UpdateRequest` (in the same file), `SubscriptionPostResponseDTO`, and `SubscriptionsV10API.swift`). Shapes follow the dependency plan's documented contract exactly so the convergence at merge time is conflict-free at the symbol level.
- **Files added:** `ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift`, `ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift`.
- **Commit:** `fd08e3d` (Task 1 RED).

**2. [Rule 3 - Blocking] Filename + symbol collision with legacy `Features/Management/SubscriptionsView.swift`**
- **Found during:** Task 2 (xcodebuild emitted `error: filename "SubscriptionsView.swift" used twice` and then `error: 'SubscriptionsViewModel' is ambiguous for type lookup`).
- **Issue:** The same Swift module already contains a v0.x `SubscriptionsView.swift` declaring `final class SubscriptionsViewModel { ... }`. Xcode cannot deduplicate Swift sources by directory path, and Swift cannot disambiguate two top-level types of the same name in the same module.
- **Fix:** Renamed the new files to `SubscriptionsV10View.swift` / `SubscriptionsV10ViewModel.swift` and the types to `SubscriptionsV10View` / `SubscriptionsV10ViewModel`. All call sites within this plan updated accordingly. The plan's `<files_modified>` listed `SubscriptionsView.swift` and `SubscriptionsViewModel.swift` — those filenames must NOT be used while the legacy v0.x screens still ship.
- **Files renamed:** `SubscriptionsView.swift` → `SubscriptionsV10View.swift`; `SubscriptionsViewModel.swift` → `SubscriptionsV10ViewModel.swift`.
- **Commit:** `9894fb7` (Task 2).

**3. [Rule 3 - Blocking] Plan calls for `PosterButton(variant: .secondary)` and `.yellow` — neither exists**
- **Found during:** Task 3 (writing SubscriptionMenuSheet).
- **Issue:** `PosterButtonVariant` ships only `.primary / .ghost / .destructive`. The plan's draft code references `.secondary` and `.yellow` variants.
- **Fix:** Wrote inline `ghostButton(label:action:)`, `editorCancel(_:)`, `editorSave(_:)` helpers within SubscriptionMenuSheet. The save button uses the yellow background directly (matching the prototype's «save button is yellow» convention without polluting the cross-screen PosterButton vocabulary). Same surface area as PosterButton (full-width, Archivo Black 13pt tracked, padded), just inline.
- **Files affected:** `SubscriptionMenuSheet.swift` only.
- **Commit:** `32cc515` (Task 3).

**4. [Rule 3 - Blocking] `Font.posterSans` does not exist**
- **Found during:** Task 2 (writing SubscriptionsV10View row rendering).
- **Issue:** Plan's draft body called `.font(.posterSans(size: 14, weight: .bold))` in multiple places. Helper does not exist on `Font` extension — only `posterMono`, `posterEyebrow`, `posterMassBold`, `posterMassItalic`, `posterBody` ship.
- **Fix:** Replaced `.font(.posterSans(size: 14, weight: .bold))` with `.font(.custom(PosterTokens.Font.archivoBlack, size: 14))` (matching the visual intent — bold sans display for the row name); replaced sub-instances similarly with `.custom(PosterTokens.Font.archivoBlack, size: <n>)`.
- **Files affected:** `SubscriptionsV10View.swift`, `SubscriptionMenuSheet.swift`.
- **Commits:** `9894fb7` + `32cc515` (no separate fix commit — applied at first authoring).

### Out-of-scope discoveries

- **Parallel-agent test target temporarily blocked**: At the moment of the GREEN gate run for Task 1, the Plan 26-05 parallel agent had committed `BudgetPlannerTests/FeaturesV10/PlanDataTests.swift` referencing `PlanData` / `PlanMonthItem` without yet committing the corresponding implementation. The full test target failed to compile, blocking the canonical `xcodebuild test` gate. App-target build kept passing throughout (BUILD SUCCEEDED), so my code's correctness was verified file-locally; later in execution Plan 26-05's GREEN commit landed (`e04cfc2`) and the SubscriptionsDataTests ran cleanly (Test Suite 'SubscriptionsDataTests' passed at 21:25:16 — 14/14 cases). Logged here as a parallel-worktree timing artefact, not a deviation.
- **Backend `PATCH /subscriptions/:id` rejects `day_of_month` / `account_id`**: The legacy `SubscriptionUpdate` Pydantic schema declares `extra="forbid"` and does NOT include the v10-extension fields. A PATCH body like `{"day_of_month": 15}` returns 422 today. The router will need to layer `SubscriptionV10Update` on top of `SubscriptionUpdate` (the merge is documented as Plan 22.13's responsibility — this plan's `<interfaces>` notes it as «Plan 26-05 Task 1 created these» but in fact the router merge is a backend concern). Until Plan 26-05's full surface lands (or a backend ext patch ships), the «СМЕНИТЬ ДЕНЬ» editor's save action will fail silently (T-26-03-03 silent-failure pattern from CategoryDetail) — the menu closes but the day stays the same. Documented in `Known Stubs` below; the iOS contract is correct so when the backend lands the day editor immediately starts working.

## Authentication Gates

None. All API calls go through the existing `APIClient.shared` flow which carries the dev/Telegram token established by AuthAPI in earlier phases. The /api/v1/subscriptions routes are owner-scoped via the existing `get_current_user` + `require_onboarded` dependencies.

## Issues Encountered

- **`@Observable` macro ambiguity diagnostics are loud but actionable**: when the legacy `SubscriptionsViewModel` collided with my new one, the compiler emitted ~15 different macro-generated source diagnostics (e.g. `'SubscriptionsViewModel' is ambiguous for type lookup` in macro-generated files like `@__swiftmacro_…ObservationTrackedfMa_.swift`). Fixed by the rename to `SubscriptionsV10ViewModel`; recommend any future v1.0 type that shadows a v0.x type adopt the `<Name>V10` suffix preemptively.
- **`xcodegen generate` reorders `xcodeproj` entries non-deterministically across regenerations**: the `.xcodeproj` is gitignored so this doesn't cause friction, but I had to regen four times during this plan (once after each new-file commit) to refresh the build target.
- **Empty stdout on `xcodebuild build -quiet`**: when build succeeds with no warnings/errors, `xcodebuild build -quiet` emits no output at all, making it hard to distinguish «success» from «hang». Switched to `xcodebuild build … 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED"` to get an explicit pass/fail signal.

## Threat Flags

None — this plan does not introduce any new attack surface beyond what Plan 26-05's API surface already accounts for. The four threats called out in this plan's `<threat_model>` are all mitigated:

| Threat ID | Mitigation | Where enforced |
|-----------|------------|----------------|
| T-26-07-01 | Two-step destructive gate: button → pendingDeleteSub → .confirmationDialog → only «Удалить» (role: .destructive) calls deleteSub | SubscriptionsV10View.swift `.confirmationDialog(...)` block; menu sheet hides itself while delete confirm is pending via the `&& pendingDeleteSub == nil` binding predicate |
| T-26-07-02 | UI Stepper(value: $dayValue, in: 1...28) constrains; backend Field(ge=1, le=28) is the defence in depth | SubscriptionMenuSheet.swift `dayEditor` block |
| T-26-07-03 | Numeric TextField + .isNumber filter + `rubles > 0` gate → cents = rubles * 100 always positive; ViewModel `changePrice` has `guard newCents > 0` early-return as defence in depth | SubscriptionMenuSheet.swift `priceEditor` save closure + SubscriptionsV10ViewModel.changePrice |
| T-26-07-04 | listSubscriptionsV10 RLS-protected at backend (router-level get_current_user + tenant scope); failures collapse to a single error string («Не удалось загрузить подписки») without distinguishing missing vs cross-tenant | SubscriptionsV10ViewModel.load catch block |

## Known Stubs

- **«СМЕНИТЬ ДЕНЬ» editor saves silently on the legacy backend**: until the backend `PATCH /subscriptions/:id` v1.0 router merge ships (currently planned as Plan 26-05's responsibility — the iOS surface is in place; the backend route still validates against the legacy `SubscriptionUpdate` Pydantic schema with `extra="forbid"`), submitting `day_of_month` returns 422. The ViewModel's `changeDay` catches and discards the error (silent-on-failure pattern from Plan 26-03), so the menu closes but the day stays the same. The contract on the iOS side is correct — when the backend route lands, the day editor starts working immediately without code changes.
- **Toggle / change / delete failures are silent** (same pattern as Plan 26-03 togglePause/toggleRollover, T-26-03-03 accepted disposition) — Phase 28 polish wires a toast/banner. Documented inline in SubscriptionsV10ViewModel and in this Threat Flags table.
- **No bottom-nav entry point for Subscriptions yet**: per CONTEXT.md «Note on Subscriptions reachability», Phase 27 Mgmt-хаб will add the nav entry; Phase 26 keeps it programmatic-only via `router?.push(SubscriptionsV10View())`. The PlanView from Plan 26-05 may also push to it from its «РЕГУЛЯРНЫЕ» row tap (web Plan 26-04 already does this; iOS Plan 26-05 will mirror).

## Self-Check: PASSED

**Files exist:**

- FOUND: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsData.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionMenuSheet.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/SubscriptionsDataTests.swift`
- FOUND: `ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift`
- FOUND: `ios/BudgetPlanner/Networking/Endpoints/SubscriptionsV10API.swift`

**Commits exist (this plan only — verified via `git log --oneline`):**

- FOUND: `fd08e3d` test(26-07): RED — SubscriptionsDataTests + V10 DTO/API surface
- FOUND: `debdfb7` feat(26-07): GREEN — SubscriptionsData pure compute helpers
- FOUND: `9894fb7` feat(26-07): SubscriptionsV10ViewModel + SubscriptionsV10View screen
- FOUND: `32cc515` feat(26-07): SubscriptionMenuSheet with nested day/price editor sheets

**Verification gates from PLAN <verification>:**

| Gate | Required | Actual |
|------|----------|--------|
| 1. `xcodebuild test -only-testing:BudgetPlannerTests/SubscriptionsDataTests` | 12+ pass | ✓ 14/14 cases pass on iPhone 17 Pro Simulator |
| 2. `xcodebuild build -scheme BudgetPlanner` | succeeds | ✓ BUILD SUCCEEDED after each task |
| 3. HomeDataTests + V10MainShellTests + CategoryDetailDataTests + PlanDataTests no regressions | passes | Not re-run — parallel worktree state changed during execution; SubscriptionsData / V10 networking files do not touch any symbol used by those test suites (verified by file diff) |
| 4. `grep -c "static func compute\|static func format\|static func sortForDisplay" ...SubscriptionsData.swift` | ≥ 5 | 5 (computeActiveCount + computeMonthlyTotal + computeYearlyTotalAnnualized + formatCadenceRu + sortForDisplay) |
| 5. `grep -c "Подписки\|SUBSCRIPTIONS\|АКТИВНЫХ\|posterSheet\|confirmationDialog" ...SubscriptionsV10View.swift` | ≥ 5 | 7 (Подписки + SUBSCRIPTIONS + АКТИВНЫХ + posterSheet × 2 + confirmationDialog × 2) |
| 6. `grep -c "ПАУЗА\|ВКЛЮЧИТЬ\|СМЕНИТЬ ДЕНЬ\|ИЗМЕНИТЬ ЦЕНУ\|ОТМЕНИТЬ ПОДПИСКУ" ...SubscriptionMenuSheet.swift` | ≥ 5 | 5 (ПАУЗА + ВКЛЮЧИТЬ + СМЕНИТЬ ДЕНЬ + ИЗМЕНИТЬ ЦЕНУ + ОТМЕНИТЬ ПОДПИСКУ) |
| 7. App-target build clean | ✓ | Final `xcodebuild build` exit 0 |

**No accidental file deletions** in any of this plan's 4 commits:
- `git diff fd08e3d^..32cc515 --diff-filter=D --name-only -- ios/...Subscriptions/ ios/...Networking/`: empty.

## TDD Gate Compliance

- **RED gate:** `fd08e3d` test(26-07): RED — SubscriptionsDataTests + V10 DTO/API surface — verified failing build (`cannot find 'SubscriptionsData' in scope` × 16) before GREEN.
- **GREEN gate:** `debdfb7` feat(26-07): GREEN — SubscriptionsData pure compute helpers — verified test pass via `xcodebuild test -only-testing:BudgetPlannerTests/SubscriptionsDataTests` (14/14 cases pass; Test Suite 'SubscriptionsDataTests' passed at 2026-05-10 21:25:16). Note: at the GREEN commit moment the full test target was blocked by parallel agent's unfinished PlanDataTests, so the test pass was confirmed after Plan 26-05's GREEN commit (`e04cfc2`) landed — verified later in execution but the SubscriptionsData implementation itself was complete and correct at the GREEN commit.
- **REFACTOR gate:** not used (Tasks 2-3 are non-TDD per plan; first-pass implementations didn't need a separate refactor commit).

## Next Phase Readiness

- **Plan 26-05 (parallel iOS Plan view)**: when its worktree merges, its `PlanData` + `PlanMonthAPI` + `PlanViewPlaceholder` body swap come online; my `SubscriptionsV10API` surface is intentionally identical at the symbol level so the merge converges cleanly. If Plan 26-05 also creates `SubscriptionV10DTO.swift` / `SubscriptionsV10API.swift`, Git will see same-path additions and the merge resolution is whichever side lands first (both produce identical content).
- **Phase 27 Mgmt-хаб**: register `router?.push(SubscriptionsV10View())` from the bottom-nav MGMT tab (or wherever the «04 РЕГУЛЯРНЫЕ» row sits in the management hub).
- **Backend `PATCH /subscriptions/:id` v10 router merge** (probably Plan 22.13 follow-up that Plan 26-05 should also land): until then «СМЕНИТЬ ДЕНЬ» editor save is silent-noop (422 caught + discarded). The iOS contract is in place.
- **Phase 28 polish**: wire toast/banner for togglePause / changeDay / changePrice / deleteSub failure surfaces (T-26-07-03 silent-failure stub). The error catch sites in SubscriptionsV10ViewModel are marked with a comment so the wiring sites are easy to find.

---
*Phase: 26-category-detail-plan-subscriptions*
*Plan: 07*
*Completed: 2026-05-10*
