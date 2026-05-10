---
phase: 25-home-transactions-add-sheet
plan: 7
subsystem: ios-shell-mount
tags: [ios, swiftui, shell, posterrouter, postersheet, bottomnav, gap-closure, v10]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 5
    provides: HomeV10View / HomeV10ViewModel + HomePlaceholders (the views the shell mounts and pushes)
  - phase: 23
    plan: 8
    provides: PosterRouter / PosterNavStack / PosterSheet primitives
  - phase: 23
    plan: 7
    provides: TabBar (4-tab + FAB) and FAB component (TabId enum already excludes Транзакции)
  - phase: 24
    plan: 11
    provides: OnboardingMountView gateway (state machine + onboarded branch)
provides:
  - "iOS BottomNavV10: SwiftUI wrapper around TabBar exposing isHidden flag (T-25-07-03 mitigation — hide nav while AddSheet is open). Symmetric to web BottomNavV10."
  - "iOS V10MainShell: real ZStack composition — PosterNavStack(router=...) under BottomNavV10 chrome, AddSheet PosterSheet bound to FAB tap. Replaces the prior single-line `OnboardingMountView()` placeholder."
  - "OnboardingMountView onboarded branch now renders HomeV10View instead of the local HomePlaceholderView; HomePlaceholderView kept in-file as a fallback."
  - "V10MainShellTests: 4 smoke / type-level tests covering TXN-V10-06 (TabId enum) + ADD-V10-01 (isHidden) + V10MainShell init."
affects:
  - 25-09-ios-transactions (TransactionsV10View will be pushed onto the same PosterRouter from HomeV10View's «ВСЕ ОПЕРАЦИИ →»)
  - 25-11-ios-addsheet (replaces AddSheetPlaceholderBody inside posterSheet content closure with the real AddSheet UI)
  - 25-12-txn-tab-demote-verify (V10MainShellTests asserts the 4-tab + FAB layout — Plan 25-12 verifier scans for TXN-V10-06 acceptance)

# Tech tracking
tech-stack:
  added: []  # no new dependencies — uses existing PosterRouter / PosterNavStack / PosterSheet / TabBar / FAB / Eyebrow / Mass / PosterTokens
  patterns:
    - "Borrowed-router PosterNavStack: V10MainShell owns @State PosterRouter so handleTabChange(_) can call router.popToRoot / router.push from outside the nav stack — symmetric to React's hoisting the router context above the tab bar."
    - "PosterRouter created with OnboardingMountView as its bottom-of-stack root (mount: PosterRouter(root: mount) inside @MainActor init). No EmptyView placeholder hack — Swift's main-actor isolation lets us instantiate the gateway view in init."
    - "BottomNavV10 isHidden gate uses an `if isHidden { EmptyView() } else { TabBar(...) }` switch with `.transition(.opacity)` — SwiftUI handles the implicit fade through the parent's posterAnimation context; matches the web BottomNavV10 behaviour without needing a separate display:none equivalent."
    - "Shell-level @State for activeTab + isAddSheetOpen — single source of truth, both bound into the same chrome layer. Tab → push routing centralized in handleTabChange so child views never reach into the router themselves for navigation events emitted by the chrome."

key-files:
  created:
    - ios/BudgetPlanner/FeaturesV10/Common/BottomNavV10.swift
    - ios/BudgetPlannerTests/FeaturesV10/V10MainShellTests.swift
  modified:
    - ios/BudgetPlanner/App/V10MainShell.swift
    - ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift

key-decisions:
  - "PosterRouter rooted at OnboardingMountView via @MainActor init (no EmptyView placeholder). PosterRouter.init(root:) requires a View, and the gateway view itself is the perfect bottom-of-stack — popToRoot from any pushed screen brings the user back to the onboarding-aware root which then renders HomeV10View. Cleaner than the plan's task-reset pattern."
  - "Borrowed-router init for PosterNavStack — the ViewBuilder root: parameter is unused (PosterNavStack.body iterates router.stack instead) but required by the generic signature; passing Color.clear satisfies the type checker without committing a second copy of the root view."
  - "BottomNavV10 lives at file scope as a top-level View struct (not nested inside V10MainShell) so V10MainShellTests can construct it standalone for the isHidden smoke check. Symmetric to TabBar / FAB / PosterSheet which are all file-scope structs."
  - "AddSheetPlaceholderBody is a private struct inside V10MainShell.swift, max-height 480pt and pinned top-leading inside the sheet — keeps the placeholder footprint visible without obscuring the entire screen behind black. Plan 25-11 will replace the body wholesale; the file-private scope means no public API leaks from this throwaway."
  - "HomePlaceholderView left in OnboardingMountView.swift but no longer referenced — it stays as a documented fallback for tests/previews that don't want to spin up the full HomeV10ViewModel + networking stack. The onboarded branch now returns HomeV10View() instead. CONTEXT D-Defer 'graceful fallback for tests/previews' applied verbatim."

patterns-established:
  - "Shell composes router primitives at root level; child views push by reading @Environment(\\.posterRouter). Symmetric to web V10MainShell (Plan 25-06): both wrap the gateway view in a router-aware navigation primitive and overlay chrome (BottomNav + FAB) at the shell layer."
  - "SwiftUI smoke tests for shell composition: rather than instrumenting the SwiftUI render graph (which needs ViewInspector or XCUI), tests verify enum acceptance + initializer non-crash + body-touch as the type-level guarantee. Heavier UI assertions deferred to Plan 25-12 / Phase 28 acceptance suite."

requirements-completed:
  - HOME-V10-01
  - HOME-V10-02
  - HOME-V10-03
  - HOME-V10-04
  - HOME-V10-05
  - HOME-V10-06
  - TXN-V10-06
  - ADD-V10-01

# Metrics
duration: 6m
completed: 2026-05-10
---

# Phase 25 Plan 7: iOS Shell Mount Summary

**Wired the iOS V10 root shell — `V10MainShell` now composes `PosterNavStack(router=…) { OnboardingMountView }` under a `BottomNavV10` chrome with the FAB-driven `posterSheet` AddSheet binding, and `OnboardingMountView`'s onboarded branch renders the real `HomeV10View` instead of the local placeholder — closing HOME-V10-01..06 (built-but-not-mounted), TXN-V10-06 (4-tab + FAB nav with no Транзакции tab), and ADD-V10-01 (FAB visible everywhere except inside the open AddSheet) on iOS.**

## Performance

- **Duration:** ~6 min wall-clock (this agent only — parallel Plan 25-06 web shell mount commits land in the same worktree concurrently)
- **Started:** 2026-05-10T15:58:32Z
- **Completed:** 2026-05-10T16:05:06Z (commit `9561db5`)
- **Tasks:** 4 of 4 (all `type=auto`, no TDD gates)
- **Files created:** 2 (1 production swift + 1 test swift)
- **Files modified:** 2 (`V10MainShell.swift` major rewrite, `OnboardingMountView.swift` 2-line branch swap + comment refresh)
- **Commits (this plan only):** 4
  - `8299095` feat(25-07): add BottomNavV10 wrapper with isHidden gate
  - `274c4e3` feat(25-07): mount HomeV10View in OnboardingMountView onboarded branch
  - `accf144` feat(25-07): compose V10MainShell with PosterNavStack + BottomNavV10 + AddSheet
  - `9561db5` test(25-07): smoke tests for V10MainShell composition + TabId acceptance
- **Test count:** 4 new XCTests (V10MainShellTests), all pass under iPhone 17 Pro Simulator. HomeDataTests (20) + OnboardingMountTests (8) re-run — no regressions.

## Final shell composition

```
V10MainShell                                            (struct V10MainShell)
└── ZStack
    ├── PosterNavStack(router: router) { Color.clear }  ← borrowed-router init
    │     • body iterates router.stack and renders each entry
    │     • root entry is OnboardingMountView (set in init via PosterRouter(root: mount))
    │       • OnboardingMountView's onboarded branch → HomeV10View
    │       • HomeV10View reads @Environment(\.posterRouter) — provided by PosterNavStack.body
    │     • pushed entries: AccountsListPlaceholderView, PlanViewPlaceholderView (per tab)
    │     • environment(\.posterRouter, router) injected by PosterNavStack.body
    │
    └── VStack { Spacer; BottomNavV10(active, isHidden, dark, onFab) }
          • isHidden bound to isAddSheetOpen → nav fades out under sheet (T-25-07-03)
          • onFab: { isAddSheetOpen = true }   → opens posterSheet
          • dark: false (Home is coral; dark/light per-screen polish deferred — see below)

.posterSheet(isPresented: $isAddSheetOpen) {
    AddSheetPlaceholderBody(onClose: { isAddSheetOpen = false })   ← Plan 25-11 replaces
}
.preferredColorScheme(.dark)
.onChange(of: activeTab) { _, newTab in handleTabChange(newTab) }
```

## Tab → push routing matrix

| Tab     | Action                                          | Real screen lands in |
| ------- | ----------------------------------------------- | -------------------- |
| home    | `router.popToRoot()` (back to root → HomeV10View) | this plan            |
| savings | `router.push(AccountsListPlaceholderView())`    | Phase 27             |
| ai      | `router.push(PlanViewPlaceholderView())`        | Phase 27             |
| mgmt    | `router.push(PlanViewPlaceholderView())`        | Phase 27             |
| (FAB)   | `isAddSheetOpen = true` → posterSheet opens     | Plan 25-11           |

## AddSheet placeholder body

A `private struct AddSheetPlaceholderBody` lives in `V10MainShell.swift` so the FAB tap has something visible to land on while Plan 25-11 is still in flight. Composition:

- Black background (PosterTokens.Color.black).
- Top row: `Eyebrow("NEW ENTRY · WIP", opacity: 0.7)` + a `×` close button on the right (Archivo Black 28pt).
- `Mass("AddSheet —", italic: true, size: 36)` headline.
- Mono caption: «WIP — Real AddSheet ships in Plan 25-11.» (JetBrains Mono 11pt, 0.6 opacity paper).
- Frame max-height 480pt, top-leading aligned — keeps the panel readable without obscuring the entire screen so the user still sees the home content peek through PosterSheet's drag-to-close gesture.

When Plan 25-11 ships, only `AddSheetPlaceholderBody` is replaced (or the closure body in `.posterSheet { ... }` is swapped for the real `AddSheetView`); shell composition stays unchanged.

## Workaround / wiring notes

### Borrowed-router init choice
`PosterNavStack` ships two inits:
1. Owning: `init(@ViewBuilder root: () -> Root)` — creates a fresh router internally.
2. Borrowed: `init(router: PosterRouter, @ViewBuilder root: () -> Root)` — caller owns the router.

The shell uses (2) so `handleTabChange(_)` can mutate the router from outside the nav stack. The plan suggested an EmptyView placeholder + `.task { router.popToRoot(); router.push(OnboardingMountView()) }` reset pattern — the actual code took a cleaner path: instantiate `OnboardingMountView` once in `@MainActor init`, pass it as the router's root in `PosterRouter(root: mount)`. The `@ViewBuilder root: () -> Root` parameter in the borrowed-router init is required by the generic signature but unused by `PosterNavStack.body` (which iterates `router.stack`); `Color.clear` satisfies the type checker without instantiating a second copy of the gateway.

### Dark / light variants for BottomNav across screens
The plan called out that BottomNavV10 needs a dark variant for cobalt screens (Transactions, etc.) and a light variant for coral (Home). For now the shell hard-codes `dark: false` because:
- Home (the only mounted screen on the root) is coral, which TabBar's light variant matches.
- Push destinations are placeholders (cream / paper backgrounds) — also light variant.
- Plan 25-09 lands the real cobalt Transactions screen, at which point per-screen dark/light detection can be added via either a Preference key from each pushed view or a model.activeBackground state on the shell. Both approaches require the real screens to exist first; deferred to Plan 25-12 polish.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Filename collision: HomeView.swift exists in both Features/Home and FeaturesV10/Home**
- **Found during:** Task 2 (after editing OnboardingMountView, the build emitted: «error: Filename "HomeView.swift" used twice — Features/Home/HomeView.swift and FeaturesV10/Home/HomeView.swift»). XcodeGen surfaced this only after regenerating the project, because the same-name files were tolerated until both became part of the active compilation unit.
- **Issue:** Xcode requires unique source filenames within a target for private-declaration disambiguation. The v0.6 `Features/Home/HomeView.swift` (declares `struct HomeView`) collided with the v1.0 `FeaturesV10/Home/HomeView.swift` (declares `struct HomeV10View`).
- **Fix:** `git mv ios/BudgetPlanner/FeaturesV10/Home/HomeView.swift ios/BudgetPlanner/FeaturesV10/Home/HomeV10View.swift`. Filename now matches the type it declares, and the v0.6 path stays byte-identical.
- **Files modified:** rename only.
- **Note:** A parallel agent working Plan 25-06 (web shell mount) made the same rename concurrently; both renames produced the identical R100 commit `b7769bd`, so the local rename was redundant and the commit graph stayed linear. No conflict.

### Out-of-scope discoveries

None. Every blocker found during this plan was caused by the new wiring this plan adds.

## Authentication Gates

None. `OnboardingMountView` already pulls `MeV10API.shared` for its `/me` fetch; the shell does no additional networking.

## Issues Encountered

- **Pre-existing warning in HomeV10View.swift Preview** (`initialization of immutable value 'm' was never used`). Out-of-scope — the file is owned by Plan 25-05; flagged here but not fixed (deviation Rule scope boundary).

## Threat Flags

None — this plan does not introduce any new attack surface beyond what 25-05 / 25-06 already accounted for. The three threats called out in this plan's `<threat_model>` are all mitigated:

| Threat ID | Mitigation | Where enforced |
|-----------|------------|----------------|
| T-25-07-01 | Onboarding gate is single source of truth for HomeV10View visibility | OnboardingMountView.content (line 134); HomeV10View only constructed when me.onboardedAt != nil. |
| T-25-07-02 | posterSheet(isPresented:) is a single Boolean binding | V10MainShell.body — `isAddSheetOpen` flips once; second tap while open is a no-op. |
| T-25-07-03 | BottomNavV10.isHidden bound to isAddSheetOpen | V10MainShell.body — same state drives FAB-open and nav-hide. |

## Known Stubs

- **AddSheetPlaceholderBody**: explicit WIP — Plan 25-11 replaces it with the real AddSheet (3×4 keypad, category picker, account picker, etc.). The placeholder still satisfies ADD-V10-01 acceptance («FAB visible on every screen except Add Sheet itself») because the FAB → sheet → close cycle works end-to-end; only the sheet body content is a placeholder. Documented in the file's doc comment and in this plan's must-haves («real AddSheet ships in Plan 25-11»).
- **HomePlaceholderView in OnboardingMountView.swift**: kept as a fallback for tests/previews per CONTEXT D-Defer; no longer referenced by the gateway. Marked with a Phase 25-07 deprecation comment.

## Self-Check: PASSED

**Files exist:**
- FOUND: `ios/BudgetPlanner/FeaturesV10/Common/BottomNavV10.swift`
- FOUND: `ios/BudgetPlannerTests/FeaturesV10/V10MainShellTests.swift`
- FOUND: `ios/BudgetPlanner/App/V10MainShell.swift` (modified)
- FOUND: `ios/BudgetPlanner/FeaturesV10/Onboarding/OnboardingMountView.swift` (modified)

**Commits exist (this plan only):**
- FOUND: `8299095` feat(25-07): add BottomNavV10 wrapper with isHidden gate
- FOUND: `274c4e3` feat(25-07): mount HomeV10View in OnboardingMountView onboarded branch
- FOUND: `accf144` feat(25-07): compose V10MainShell with PosterNavStack + BottomNavV10 + AddSheet
- FOUND: `9561db5` test(25-07): smoke tests for V10MainShell composition + TabId acceptance

**Verification gates from PLAN <verification>:**

| Gate | Required | Actual |
|------|----------|--------|
| 1. `make build` | succeeds | ✓ Build Succeeded after Task 1 / 2 / 3 / 4 |
| 2. `xcodebuild test -only-testing:BudgetPlannerTests/V10MainShellTests` | passes | ✓ 4/4 tests pass |
| 3. `xcodebuild test -only-testing:BudgetPlannerTests/HomeDataTests` | passes (no regression) | ✓ 20/20 pass |
| 4. `grep -c 'HomeV10View' OnboardingMountView.swift` | ≥ 1 | 8 (1 call site + 7 doc/comment refs) |
| 5. `grep -c 'BottomNavV10\|PosterNavStack\|posterSheet' V10MainShell.swift` | ≥ 3 | 6 |
| 6. `grep -c 'case transactions\|case Транзакции' TabBar.swift` | == 0 | 0 (TabId enum has only home/savings/ai/mgmt + FAB) |

**No accidental file deletions** in any of this plan's 4 commits:
- `git diff 8299095^..HEAD --diff-filter=D --name-only`: empty.

## Next Phase Readiness

- **Plan 25-09 (iOS Transactions)**: HomeV10View's «ВСЕ ОПЕРАЦИИ →» tap currently pushes `TransactionsViewPlaceholderView` (cobalt placeholder); Plan 25-09 swaps it for the real `TransactionsV10View`. The PosterRouter chain established here means no shell changes are needed.
- **Plan 25-11 (iOS AddSheet)**: replace `AddSheetPlaceholderBody` (or the closure body inside `.posterSheet { ... }`) with the real `AddSheetView`. Shell composition stays unchanged.
- **Plan 25-12 (TXN-tab demote verify)**: V10MainShellTests already asserts `TabId.allCases.count == 4` and absence of «transactions» — verifier can grep for those XCTAssert lines as the iOS-side acceptance signal.
- **Future polish pass**: per-screen dark/light TabBar variant detection (currently hard-coded `dark: false`); dashed-underline cleanup (carried forward from Plan 25-05); per-tab badge/dot for unread / pending states.

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 07*
*Completed: 2026-05-10*
