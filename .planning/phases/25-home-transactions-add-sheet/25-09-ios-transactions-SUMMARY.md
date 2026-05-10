---
phase: 25-home-transactions-add-sheet
plan: 9
subsystem: ios-transactions
tags: [ios, swiftui, observable, transactions, v10, poster, swipe-delete, gap-closure, tdd]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 3
    provides: ActualV10API.list / ActualV10DTO + AccountsAPI.list / AccountDTO + CategoriesV10API.list / CategoryV10DTO (consumed by TransactionsV10ViewModel.load)
  - phase: 25-home-transactions-add-sheet
    plan: 5
    provides: V10Formatters.formatDay / formatTimeHM (used by groupByDay labels and TxRow time column); HomePlaceholders.TransactionsViewPlaceholderView (rebound to render TransactionsV10View)
  - phase: 25-home-transactions-add-sheet
    plan: 7
    provides: V10MainShell PosterRouter + posterSheet wiring (TransactionsV10View pushed onto the same router via HomeV10View «ВСЕ ОПЕРАЦИИ →»)
  - phase: 22
    plan: BE-04+
    provides: ActualAPI.delete (existing v0.x DELETE /actual/{id} route — reused for v1.0 actuals)
provides:
  - "iOS TransactionsData pure compute layer: TransactionFilterChip enum (6 cases + label), TxTag enum, TxDayGroup struct, applyFilterChip / groupByDay / computeHeaderSummary / formatTxAmount (U+2212 minus) / tagFor — all stateless, fully unit-tested (24 cases)."
  - "iOS TransactionsV10ViewModel: @MainActor @Observable model with parallel async-let load of /accounts + /categories + /periods/current + /periods/{id}/actual, status state machine idle→loading→ready|error, inFlight guard for T-25-09-03, delete(_:) → ActualAPI.delete + reload."
  - "iOS TransactionsV10View: SwiftUI screen rendering all 5 TXN-V10-* requirements (cobalt bg, eyebrow header, italic «Реестр.», summary line, 6-chip filter bar, day-grouped sections with PT-Serif italic 28pt headers + sums, TxRow with U+2212 formatting + roundup/deposit inline plates, swipe-left → confirmationDialog → delete, row tap → posterSheet edit stub)."
  - "Zero-touch swap: HomePlaceholders.TransactionsViewPlaceholderView body now returns TransactionsV10View(); HomeV10View's «ВСЕ ОПЕРАЦИИ →» push lands on the real screen unchanged (T-T-01)."
affects:
  - 25-12-txn-tab-demote-verify (verifier scans TransactionsV10View for swipeActions / chip filter / day-group markers)
  - Phase 26 TransactionEditor poster retrofit (will replace EditPlaceholderSheet body with the real editor)

# Tech tracking
tech-stack:
  added: []  # no new dependencies — uses existing PosterTokens / Eyebrow / Mass / Chip / PosterSheet / PosterRouter / RubleFormatter / V10Formatters + Plan 25-03 DTO/API surface
  patterns:
    - "Native SwiftUI List for swipeActions support — same approach as v0.6 Features/Transactions/TransactionsView.swift. List background hidden via `.scrollContentBackground(.hidden)` + per-row `.listRowBackground(Color.clear)` so the cobalt ZStack underneath shows through; matches the prototype's edge-to-edge cobalt screen."
    - "Pure-compute split (TransactionsData.swift) sibling to web Plan 25-08 data layer — both consume the same DTO shape (Plan 25-03 unified) and produce the same TxDayGroup output. Test parity is achievable across surfaces."
    - "Filter chip mapping: enum-to-code lookup via pre-bucketed `[Int: String?]` map for O(N+M) instead of O(N*M); savings chip filters by kind (.roundup/.deposit) not by code (matches CONTEXT specifics)."
    - "Period 404 handled inline via local do/catch (PeriodsAPI.current() is non-Optional in v0.x — wrap and shrug instead of failing the whole Transactions screen). Same pattern as HomeV10ViewModel."
    - "Edit sheet is a placeholder (EditPlaceholderSheet) — Phase 26 lands the real TransactionEditor poster retrofit. Sheet wiring (PosterSheet binding + onClose) is already correct so Phase 26 only swaps the body."

key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift
    - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift
    - ios/BudgetPlannerTests/FeaturesV10/TransactionsDataTests.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift  # TransactionsViewPlaceholderView body → TransactionsV10View()

key-decisions:
  - "Native SwiftUI List instead of ScrollView+VStack. SwiftUI's `.swipeActions` modifier only works inside a `List` (or `ForEach` inside a `List`) — not inside a plain `ScrollView`. The plan suggested ScrollView but that would require building a custom drag-gesture overlay (~80 lines of GeometryReader plumbing). Using List with hidden chrome (`.scrollContentBackground(.hidden)` + per-row `.listRowBackground(Color.clear)`) gives swipeActions for free while preserving the cobalt edge-to-edge background. Same approach as v0.6 Features/Transactions/TransactionsView.swift."
  - "PT Serif Italic for day-group headers (per ADR-001 cyrillic fallback). Plan called for «DM Serif italic 28pt»; PosterTokens.Font.dmSerifItalic exists (= 'DM Serif Display'), but the bundled font file is `DMSerifDisplay-Italic.ttf` which has limited cyrillic glyph coverage. Using `posterMassItalic(size: 28)` (which resolves to PT Serif Italic per ADR-001) keeps cyrillic text rendering clean — same trade-off HomeV10View already made for its «Дневной темп —» italic. Documented as DM-Serif-vs-PT-Serif fallback in this summary."
  - "Confirmation dialog before delete (T-25-09-02 mitigation). Swipe-left fires `pendingDeleteTx = tx` rather than calling delete() directly; the confirmationDialog binding tracks `pendingDeleteTx != nil`, and only the «Удалить» button (role: .destructive) inside the dialog triggers `Task { await model.delete(tx) }`. Two-tap delete UX matches DESIGN-SYSTEM convention and prevents accidental removals."
  - "Edit sheet is an explicit placeholder. The plan flags real TransactionEditor poster retrofit for Phase 26 — implementing it inside Plan 25-09 would balloon scope and re-implement the entire form-state pattern from AddSheet. The `EditPlaceholderSheet` shows the tx id, a header, and a «ЗАКРЫТЬ» button so the sheet stack management is exercised end-to-end. Only the sheet body content is a placeholder; the binding / open / close cycle works correctly."
  - "Reused existing v0.x ActualAPI.delete (DELETE /actual/{id}) instead of adding ActualV10API.delete. The route is shared on the server (no v1.0-specific delete behavior); calling the legacy enum keeps the change small and avoids duplicating the wrapper. Documented in the ViewModel comment header."
  - "Amount color follows kind: roundup/deposit → yellow; expense/income → paper. Matches prototype line 374 (`color: isSav ? POSTER.yellow : POSTER.paper`). The U+2212 minus sign + paper colour combination keeps expense rows readable; yellow on roundup/deposit visually clusters the spec-tag and the amount as a unit."

patterns-established:
  - "iOS pure-compute layer (`TransactionsData.swift`) sibling to web pure-compute layer in `frontend/src/screensV10/Transactions/data.ts` — both consume the same DTO shape (post-Plan 25-03 unification) and produce TxDayGroup with identical semantics. Test parity is achievable cross-surface."
  - "SwiftUI List with hidden chrome as the carrier for swipeActions on a custom-themed background. Pattern usable wherever a poster-styled feed needs both swipe gestures and an edge-to-edge non-system background — the `.scrollContentBackground(.hidden)` + `.listRowBackground(Color.clear)` + `.listRowSeparator(.hidden)` trio composes cleanly."

requirements-completed:
  - TXN-V10-01
  - TXN-V10-02
  - TXN-V10-03
  - TXN-V10-04
  - TXN-V10-05

# Metrics
duration: 7m
completed: 2026-05-10
---

# Phase 25 Plan 9: iOS Transactions Summary

**Built the iOS Transactions registry (cobalt push-stack screen with eyebrow «SECTION II», italic «Реестр.», summary line, 6-chip single-select filter, day-grouped sections with day-sums, time-mono / name / category / amount rows with U+2212 minus and inline yellow «↻ ОКРУГЛ.» / paper «→ КОПИЛКА» spec-tag plates, swipe-left → confirmationDialog → DELETE /actual/{id}, row tap → posterSheet edit stub) and rebound HomePlaceholders.TransactionsViewPlaceholderView to render the real screen — closing TXN-V10-01..05 on iOS by adding pure-compute helpers (TransactionsData), an @Observable data loader (TransactionsV10ViewModel), and a SwiftUI screen (TransactionsV10View) that consumes both.**

## Performance

- **Duration:** ~7 min wall-clock (this agent only — three parallel agents committing into the same worktree branch concurrently for web Tx (25-08) / web AddSheet (25-10) / iOS AddSheet (25-11))
- **Started:** 2026-05-10T16:10:07Z
- **Completed:** 2026-05-10T16:17:03Z
- **Tasks:** 3 of 3 (Task 1 TDD red/green, Tasks 2 & 3 atomic feat commits)
- **Files created:** 4 (3 production swift + 1 test swift)
- **Files modified:** 1 (HomePlaceholders.swift — TransactionsViewPlaceholderView body swap)
- **Commits (this plan only):** 4
  - `ed7b6b0` test(25-09): RED — TransactionsDataTests for filter/group/format/tag helpers
  - `d8cfb6c` feat(25-09): GREEN — TransactionsData pure helpers (24 tests pass)
  - `b29cb9e` feat(25-09): add TransactionsV10ViewModel — fetch + filter state + delete
  - `88e12d8` feat(25-09): TransactionsV10View SwiftUI screen + zero-touch placeholder swap
- **Test count:** 24 new XCTest cases (TransactionsDataTests). HomeDataTests (20) + V10MainShellTests (4) re-run — no regressions, all 48 tests pass on iPhone 17 Pro Simulator.

## Accomplishments

- **`TransactionsData` (~210 lines)**: pure compute layer.
  - `TransactionFilterChip` enum (`.all/.cafe/.food/.transit/.subs/.savings`) + `var label: String` returning Russian label («Все»/«Кафе»/«Продукты»/«Транспорт»/«Подписки»/«Копилка»).
  - `TxTag` enum (`.roundup` / `.deposit`) for inline spec-tag plates.
  - `TxDayGroup` struct (Identifiable + Equatable) with `id` = `dateKey` (yyyy-MM-dd), `dateLabel` (from V10Formatters.formatDay), rows DESC by `createdAt ?? txDate`, `sumCents` = Σ |amountCents|.
  - `applyFilterChip` with hardcoded enum-to-code mapping (T-25-09-01 mitigation): `.cafe → "cafe"`, `.food → "food"`, `.transit → "transit"`, `.subs → "subs"`. `.savings` filters by kind (`.roundup` or `.deposit`) — code-independent. Pre-bucketed `[Int: String?]` lookup gives O(N+M) instead of O(N*M).
  - `groupByDay` buckets by `yyyy-MM-dd` key in the supplied calendar's TZ; sorts groups by max txDate DESC; sorts rows within a group by `createdAt ?? txDate` DESC; `sumCents` is Σ |amountCents|.
  - `computeHeaderSummary` returns `(count, sumCents)` where `sumCents` = Σ |amountCents|.
  - `formatTxAmount` uses U+2212 (MINUS SIGN, the proper typographic glyph — NOT ASCII '-' = U+002D) for negatives, `+` for positives, `"0 ₽"` for zero. Reuses `RubleFormatter.format(cents:)` for U+202F (NNBSP) thousands grouping.
  - `tagFor` enum-dispatches on `ActualKindV10`: `.roundup → .roundup`, `.deposit → .deposit`, `.expense / .income → nil`.

- **`TransactionsV10ViewModel` (~130 lines)**: @MainActor @Observable class.
  - `load()` opens three parallel `async let` calls (categories / accounts / period); period 404 falls back to nil → empty actuals (registry renders empty state instead of error). Pattern matches HomeV10ViewModel.
  - Computed views: `filteredActuals` / `dayGroups` / `headerSummary` delegate to TransactionsData pure helpers and re-evaluate when chip / actuals / categories observers change.
  - `chip` is the only mutable observed property — written from the View on chip-bar tap, drives all three computed views automatically.
  - `delete(_:)` calls existing v0.x `ActualAPI.delete(id:)` then `await load()` to refetch; no local splice (avoids drift with concurrent changes from bot / other clients).
  - `inFlight` guard for T-25-09-03 (re-entrant load/delete protection).
  - `@ObservationIgnored` on calendar field — same Foundation type @Observable macro quirk noted in HomeV10ViewModel SUMMARY (Plan 25-05 key-decisions).

- **`TransactionsV10View` (~330 lines)**: SwiftUI surface.
  - ZStack with `PosterTokens.Color.cobalt.ignoresSafeArea()` background + state-switched content.
  - Loading state: centered ProgressView + «ЗАГРУЗКА» eyebrow.
  - Error state: «ОШИБКА» eyebrow + Mass message + «ПОПРОБОВАТЬ →» retry button.
  - Ready state stacks header section → day-grouped registry inside a List.
  - Header section composition:
    - HStack: optional «← НАЗАД» button (visible when `router?.canPop`) + Eyebrow «SECTION II».
    - Mass italic «Реестр.» at size 70 (matches prototype line 332).
    - Eyebrow «N ЗАПИСЕЙ · X ₽» summary line (opacity 0.6).
    - Horizontal-scroll chip-bar with 6 `Chip(label, active:)` instances bound to `model.chip`.
  - Day-grouped sections (`ForEach(model.dayGroups) { group in Section { ... } header: { dayHeader(group) } }`):
    - `dayHeader`: PT-Serif italic 28pt label + JetBrains-Mono summary on the right.
    - `TxRow`: time-mono column (52pt wide, opacity 0.55) · name (Manrope semibold, lineLimit 2) · meta line («КАТЕГОРИЯ · BANK MASK» + optional spec-tag plate) · amount (mono semibold 16pt, yellow on roundup/deposit, paper otherwise).
    - 1pt top divider (paper opacity 0.18) on each row.
  - Empty state: italic «Реестр пуст —» + mono hint «добавьте первую трату через FAB» (rendered when `dayGroups.isEmpty`).
  - List background hidden via `.scrollContentBackground(.hidden)` + per-row `.listRowBackground(Color.clear)` + `.listRowSeparator(.hidden)` so the cobalt ZStack shows through edge-to-edge.
  - Tap row → `editingTx = tx` → opens `posterSheet(EditPlaceholderSheet)`.
  - Swipe-left → `pendingDeleteTx = tx` → triggers `.confirmationDialog("Удалить операцию?", ...)` with destructive «Удалить» / cancel «Отмена» buttons; only confirm calls `Task { await model.delete(tx) }` (T-25-09-02).
  - `EditPlaceholderSheet`: paper-bg sheet with eyebrow «РЕДАКТИРОВАТЬ · #N», Mass italic «Editor —», WIP note, and a black «ЗАКРЫТЬ» CTA. Frame max-height 360pt, top-leading aligned. Phase 26 will replace the body wholesale.

- **`HomePlaceholders.swift` modification**: TransactionsViewPlaceholderView body changed from a 6-arg PosterPlaceholder render to `TransactionsV10View()`. Type name kept identical so the existing `router?.push(TransactionsViewPlaceholderView())` callsite from HomeV10View («ВСЕ ОПЕРАЦИИ →» tap) and from V10MainShell.handleTabChange(_:) (savings-tab fallback) continues to work without modification — zero-touch swap.

- **Tests**: 24 XCTest cases covering every code path called out in the plan must-haves: filter chip metadata (count + label), 6 filter chip cases, day-grouping (empty / mixed-day / sort by max txDate DESC / row sort by createdAt DESC / fallback to txDate / sum), header summary (empty + non-empty), formatTxAmount (negative U+2212 + suffix, positive +, zero, large 1M+ with NNBSP grouping), tagFor (4 kind dispatches).

## SwiftUI patterns chosen for this plan

### Native List for swipeActions support
SwiftUI's `.swipeActions(edge:)` modifier is List-only — it does not work inside a plain `ScrollView { VStack { ForEach { ... } } }` arrangement. The plan listed ScrollView but called for swipeActions; I went with native List + hidden chrome:

```swift
List {
    Section { headerSection.listRowBackground(Color.clear) ... }
    ForEach(model.dayGroups) { group in
        Section {
            ForEach(group.rows) { tx in
                TxRow(...)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .swipeActions(edge: .trailing) { ... }
            }
        } header: { dayHeader(group: group) }
    }
}
.listStyle(.plain)
.scrollContentBackground(.hidden)   // iOS 16+ — kills List's default UIBlurEffect
.background(Color.clear)
```

Result: swipe-to-delete works natively; the cobalt ZStack underneath renders edge-to-edge; row separators / inset are zeroed; no custom drag-gesture infrastructure needed. Same approach as v0.6 Features/Transactions/TransactionsView.swift.

### DM Serif vs PT Serif fallback for day-group headers
Plan called for «DM Serif italic 28pt» day-group headers per CONTEXT (matches web prototype line 355). PosterTokens defines `dmSerifItalic` = "DM Serif Display" but the bundled `.ttf` (Resources/Fonts/DMSerifDisplay-Italic.ttf) ships limited cyrillic glyph coverage — Russian month names («7 мая», «31 декабря») render with mixed-font fallback that breaks the typographic line.

ADR-001 explicitly documents PT Serif Italic as the iOS pragmatic cyrillic fallback for italic serif display copy. `posterMassItalic(size: 28)` resolves to PT Serif Italic. Same trade-off HomeV10View already made for its «Дневной темп —» hero italic at 28pt; consistency wins. No font swap needed when DM Serif Display gets a wider cyrillic subset in a future polish pass — the helper is already routed correctly.

### Two-flag delete UX (swipe + confirm)
T-25-09-02 (Repudiation: swipe-left fires DELETE without confirm) is mitigated entirely in the View — the ViewModel's `delete(_:)` does no gating; the View handles the UX:

```swift
.swipeActions(edge: .trailing) {
    Button(role: .destructive) {
        pendingDeleteTx = tx                      // 1. mark as pending
    } label: { Label("Удалить", systemImage: "trash") }
}
// At the screen root:
.confirmationDialog("Удалить операцию?", isPresented: ..., titleVisibility: .visible) {
    Button("Удалить", role: .destructive) {
        if let tx = pendingDeleteTx { Task { await model.delete(tx) } }   // 2. confirm → API call
        pendingDeleteTx = nil
    }
    Button("Отмена", role: .cancel) { pendingDeleteTx = nil }
}
```

Two taps required (swipe → trash button → «Удалить» in dialog). Matches DESIGN-SYSTEM convention; prevents accidental removals.

### Stagger animation choice — omitted
Plan output spec asked about «Stagger animation choice for rows (or omitted if SwiftUI swipeActions interferes)». Stagger animations were omitted on List rows because SwiftUI's swipeActions internally manages row layout and per-row scale/offset modifiers can fight with the swipe gesture's own transforms. Day-group `Section`s do not currently animate in either; the registry feels stable and predictable rather than flashy. If a future polish pass wants stagger, a non-List arrangement (custom drag overlay) would be the unblocker — out of scope for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ScrollView + swipeActions incompatibility**
- **Found during:** Task 3 (planning the body composition before writing code)
- **Issue:** Plan specified `ScrollView { VStack { ForEach { ... .swipeActions(edge: .trailing) { ... } } } }`. SwiftUI's `.swipeActions` modifier only works inside a `List` (or `ForEach` inside a `List`); attaching it to a row inside a `ScrollView { VStack }` is silently a no-op — the swipe gesture never registers.
- **Fix:** Switched to native `List { Section { ForEach { ... } header: { ... } } }` with hidden chrome (`.scrollContentBackground(.hidden)` + per-row `.listRowBackground(Color.clear)` + `.listRowSeparator(.hidden)` + zero-inset `.listRowInsets`). The cobalt ZStack background under the List shows through edge-to-edge.
- **Files modified:** TransactionsV10View.swift (initial implementation already used the corrected approach — no rework commit needed).
- **Note:** Same approach as v0.6 Features/Transactions/TransactionsView.swift; matches the plan's intent (swipe-to-delete on rows) without rebuilding gesture infrastructure from scratch.

**2. [Rule 3 - Blocking] PosterTokens.Font.dmSerifItalic = "DM Serif Display" but cyrillic glyph coverage is limited**
- **Found during:** Task 3 (selecting the day-header font helper)
- **Issue:** Plan specified «DM Serif italic 28pt» for day-group headers, mirroring the web prototype which uses `fontFamily:'DM Serif Display'` at line 355. The bundled `DMSerifDisplay-Italic.ttf` ships limited cyrillic glyphs — Russian month names («7 мая») render with mixed-font fallback that breaks the typographic line.
- **Fix:** Used `Font.posterMassItalic(size: 28)` which resolves to PT Serif Italic per ADR-001 (the iOS pragmatic cyrillic fallback for italic serif copy). HomeV10View already made the same trade-off for its «Дневной темп —» 28pt italic hero.
- **Files modified:** TransactionsV10View.swift (no rework; correct resolution applied at first authoring).
- **Note:** Documented as «DM Serif vs PT Serif fallback» in this summary's SwiftUI-patterns section.

### Out-of-scope discoveries

- **Parallel-agent files in worktree**: `xcodegen generate` picked up `ios/BudgetPlanner/FeaturesV10/AddSheet/AddSheetView.swift` (and siblings) authored by the parallel iOS AddSheet agent (Plan 25-11). Those files compiled cleanly into my build — no fixes needed. Pre-existing parallel state per the spawn note («Three other agents … run in parallel») — not a deviation.
- **No regression**: Re-ran HomeDataTests + V10MainShellTests after every commit; all 48 pre-existing + new tests pass.

## Authentication Gates

None. All API calls go through the existing `APIClient.shared` flow which carries the dev/Telegram token established by AuthAPI in earlier phases.

## Issues Encountered

- **`async let` capture restriction on `per`**: same restriction noted in HomeV10ViewModel — `async let` variables can't be passed to helper funcs in current Swift concurrency. Resolved by inlining the `do { per = try await PeriodsAPI.current() } catch { per = nil }` block at the call site (cleaner anyway).
- **`UInt8` literals in date formatter**: ISO-8601 date encoding/decoding for the test fixture (createdAt timestamp comparison test) needed a custom `dateDecodingStrategy` — the project's APIClient uses `convertFromSnakeCase` for keys but no global date strategy, so each test's JSONDecoder reinitializes both. Added a `.custom` decoder that tries ISO-8601 first then falls back to plain `yyyy-MM-dd`. Test-only — production decoding paths are unchanged.

## Threat Flags

None — this plan does not introduce any new attack surface beyond what 25-03 / 25-05 / 25-07 already accounted for. The three threats called out in this plan's `<threat_model>` are all mitigated:

| Threat ID | Mitigation | Where enforced |
|-----------|------------|----------------|
| T-25-09-01 | Hardcoded enum-to-code mapping in TransactionsData.applyFilterChip | TransactionsData.swift:88-118; tests assert each chip yields expected dataset (test_applyFilterChip_*). |
| T-25-09-02 | Swipe-left → pendingDeleteTx → confirmationDialog → only confirm calls model.delete | TransactionsV10View.swift:53-69 (`.confirmationDialog`) + 152-159 (`.swipeActions`). |
| T-25-09-03 | inFlight guard in TransactionsV10ViewModel.load (and delete reuses load) | TransactionsV10ViewModel.swift:69-72. |

## Known Stubs

- **EditPlaceholderSheet body**: explicit WIP — Phase 26 ships the real TransactionEditor poster retrofit. The placeholder still satisfies TXN-V10-05 acceptance («Tap row → edit sheet via PosterSheet») because the sheet open/close cycle works end-to-end; only the editor form fields are absent. Documented in the file's struct doc-comment and in this plan's must-haves as a Phase 26 follow-up.

## Self-Check: PASSED

**Files exist:**

- FOUND: `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10ViewModel.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsV10View.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/TransactionsDataTests.swift`
- FOUND: `ios/BudgetPlanner/FeaturesV10/Home/HomePlaceholders.swift` (modified — TransactionsViewPlaceholderView body swap)

**Commits exist (this plan only):**

- FOUND: `ed7b6b0` test(25-09): RED — TransactionsDataTests for filter/group/format/tag helpers
- FOUND: `d8cfb6c` feat(25-09): GREEN — TransactionsData pure helpers (24 tests pass)
- FOUND: `b29cb9e` feat(25-09): add TransactionsV10ViewModel — fetch + filter state + delete
- FOUND: `88e12d8` feat(25-09): TransactionsV10View SwiftUI screen + zero-touch placeholder swap

**Verification gates from PLAN <verification>:**

| Gate | Required | Actual |
|------|----------|--------|
| 1. `make build` | succeeds | ✓ Build Succeeded after Task 2 / Task 3 |
| 2. `xcodebuild test -only-testing:BudgetPlannerTests/TransactionsDataTests` | passes | ✓ 24/24 cases pass on iPhone 17 Pro Simulator |
| 3. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` | passes (no regression) | ✓ 20/20 pass |
| 4. `grep -c "TransactionsV10View" HomePlaceholders.swift` | ≥ 1 | 2 (1 type usage + 1 doc-comment ref) |
| 5. `grep -c "swipeActions" TransactionsV10View.swift` | ≥ 1 | 2 (call site + doc-comment) |
| 6. `grep -c "↻ ОКРУГЛ.\|→ КОПИЛКА" TransactionsV10View.swift` | ≥ 2 | 3 (2 inline plates + 1 doc-comment) |
| 7. `grep -c "swipeActions\|posterSheet\|confirmationDialog" TransactionsV10View.swift` | ≥ 3 | 6 |

**No accidental file deletions** in any of this plan's 4 commits:
- `git diff ed7b6b0^..88e12d8 --diff-filter=D --name-only` (filtered to plan files): empty.

## TDD Gate Compliance

- **RED gate:** `ed7b6b0` test(25-09): RED — TransactionsDataTests for filter/group/format/tag helpers — verified failing build (`type 'Equatable' has no member 'roundup'`, `cannot find 'TransactionsData' in scope`) before GREEN.
- **GREEN gate:** `d8cfb6c` feat(25-09): GREEN — TransactionsData pure helpers (24 tests pass) — verified test pass after via `xcodebuild test -only-testing:BudgetPlannerTests/TransactionsDataTests`.
- **REFACTOR gate:** not used (Tasks 2-3 are non-TDD per plan; first-pass implementations didn't need a separate refactor commit).

## Next Phase Readiness

- **Plan 25-12 (TXN-tab demote verify)**: verifier can grep `swipeActions`, `confirmationDialog`, `↻ ОКРУГЛ.`, `→ КОПИЛКА`, `TransactionFilterChip.allCases` as the iOS-side acceptance signal for TXN-V10-01..05. All gates pass per the table above.
- **Phase 26 TransactionEditor poster retrofit**: replace `EditPlaceholderSheet` body in TransactionsV10View.swift (or swap the `posterSheet { ... }` content closure) with the real editor. Sheet binding (`editingTx` Optional + open/close) is already correct; only the body content swaps.
- **Future polish pass**: stagger animation for rows / sections (currently omitted to avoid swipeActions interference); dashed-underline for the «← НАЗАД» button (carried forward from HomeV10View polish list); dark/light TabBar variant detection when on cobalt screens (carried forward from Plan 25-07 polish list).

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 09*
*Completed: 2026-05-10*
