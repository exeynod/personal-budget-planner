---
phase: 25-home-transactions-add-sheet
plan: 6
subsystem: ui
tags: [react, typescript, vitest, posterRouter, posterSheet, bottomNavV10, v10MainShell, gap-closure]

# Dependency graph
requires:
  - phase: 25-home-transactions-add-sheet
    plan: 2
    provides: PosterRouterProvider / PosterRouterView / usePosterRouter / PosterSheet / BottomNavV10
  - phase: 25-home-transactions-add-sheet
    plan: 4
    provides: HomeMount / _placeholders (AccountsListPlaceholder, PlanViewPlaceholder)
  - phase: 24-onboarding-4-step
    provides: OnboardingMount gateway (loading / error / OnboardingFlow / Home branch)

provides:
  - "V10MainShell — single web root composing PosterRouterProvider(root=OnboardingMount) + ShellChrome (PosterRouterView + BottomNavV10) + PosterSheet AddSheet binding"
  - "AppV10 surface='mount' branch now renders <V10MainShell /> instead of <OnboardingMount /> directly"
  - "OnboardingMount onboarded_at != null branch renders <HomeMount /> (HomePlaceholder removed)"
  - "ShellChrome tab routing contract: home → router.popToRoot; savings → AccountsListPlaceholder; ai/mgmt → PlanViewPlaceholder"
  - "AddSheet placeholder content (Eyebrow + Mass + close button) — replaced by real Add Sheet in Plan 25-10"

affects:
  - 25-10-web-add-sheet (replaces AddSheetPlaceholderContent inside V10MainShell with real keypad + category/account pickers)
  - 25-06-web-transactions-view (TransactionsViewPlaceholder still pushed from HomeMount; this plan does not touch that)
  - 27 (Phase 27 mgmt screens replace AccountsListPlaceholder + PlanViewPlaceholder in ShellChrome tab routing)

# Tech tracking
tech-stack:
  added: []   # all dependencies already present
  patterns:
    - "Two-layer shell: outer V10MainShell owns state (active tab, isAddSheetOpen) + PosterSheet portal; inner ShellChrome consumes router from context and renders viewport + nav"
    - "PosterRouter root = OnboardingMount (NOT HomeMount) — gateway logic must run before deciding whether HomeMount can mount; HomeMount lives one level deeper inside OnboardingMount's onboarded branch but is still inside the PosterRouterProvider, so usePosterRouter() resolves"
    - "Tab tap → tab id ∈ {home,savings,ai,mgmt} → router action: home pops to root, others push WIP placeholder"
    - "AddSheet hide-gate: BottomNavV10 isHidden={isAddSheetOpen} → nav unmounts while sheet open (T-N-02 contract from BottomNavV10)"
    - "Mock-the-leaf test pattern: V10MainShell tests vi.mock('../Onboarding/OnboardingMount', () => stub) so we don't fetch /me — focus is on shell composition, not gateway logic"

key-files:
  created:
    - frontend/src/screensV10/V10MainShell.tsx
    - frontend/src/screensV10/V10MainShell.module.css
    - frontend/src/screensV10/__tests__/V10MainShell.test.tsx
  modified:
    - frontend/src/AppV10.tsx                                 # render V10MainShell instead of OnboardingMount
    - frontend/src/screensV10/Onboarding/OnboardingMount.tsx  # render HomeMount instead of HomePlaceholder; removed HomePlaceholder export

key-decisions:
  - "PosterRouter root is OnboardingMount, not HomeMount — keeps the single source of truth for the onboarded gate inside OnboardingMount (which already owns /me fetch + retry + state machine). V10MainShell stays UI-only; it never reads /me."
  - "ShellChrome split out as a child of PosterRouterProvider so it can call usePosterRouter() and translate tab events into router actions. Avoids prop-drilling and keeps V10MainShell's outer shell free of router-context concerns."
  - "AddSheet placeholder content (Eyebrow «NEW ENTRY · WIP» + Mass «AddSheet —» + ZAKRYT' button) instead of an empty PosterSheet — visible WIP signal for users + e2e + manual smoke; clear handoff for Plan 25-10 to swap inner content."
  - "ai and mgmt tabs both push the same PlanViewPlaceholder (WIP — Phase 26 hint) — distinct screens are cheap to add later, identical push contract. Saves one placeholder file for now."
  - "HomePlaceholder definition removed from OnboardingMount.tsx (audit confirmed no other consumers via grep). Only mention left is in the Phase 25-06 header comment documenting the swap."
  - "BottomNav peek-through during onboarding deferred to e2e (Plan 25-10) per CONTEXT D-Defer — OnboardingFlow already has an opaque background that visually obscures the nav. Hiding the nav explicitly during onboarding would require a context flag from OnboardingMount; not worth the coupling for a visual-only concern."

patterns-established:
  - "Two-layer shell pattern: outer-state + inner-router-consumer split. Reusable for any future shell that needs both a portal sheet (state at outer) and tab→router translation (consumer at inner)."
  - "Mock-the-leaf for shell tests: shell tests vi.mock the data-fetching root so the test focuses on composition + interaction, not data plumbing. Mirrors React Testing Library philosophy («test behaviour, not implementation»)."
  - "WIP-placeholder routing contract: when a real screen ships, swap the import in ShellChrome's handleTab — no other shell changes needed. Same swap pattern HomeMount uses for its push targets (Plan 25-04)."

requirements-completed:
  - HOME-V10-01    # mounted (was built but unreferenced)
  - HOME-V10-02    # mounted
  - HOME-V10-03    # mounted (count-up daily pace visible)
  - HOME-V10-04    # mounted (wallet + plan badges + category list)
  - HOME-V10-05    # mounted (5-tab + FAB layout — actually 4-tab + FAB per TXN-V10-06)
  - HOME-V10-06    # mounted (coral background)
  - TXN-V10-06     # 4-tab + FAB layout, no Transactions tab in nav (acceptance: grep returns 0 in non-comment lines)
  - ADD-V10-01     # FAB visible on every screen except inside AddSheet (BottomNavV10.isHidden gate)

# Metrics
duration: ~5m
completed: 2026-05-10
---

# Phase 25 Plan 6: Web Shell Mount Summary

**Wired Wave-1/Wave-2/Wave-3 web primitives (HomeMount + PosterRouterProvider + BottomNavV10 + PosterSheet) into a single V10MainShell so Home actually appears on screen after onboarding completes — replaces the AppV10 → OnboardingMount → HomePlaceholder stub path with AppV10 → V10MainShell → PosterRouterProvider(OnboardingMount → HomeMount) + BottomNavV10 + AddSheet PosterSheet binding.**

## Performance

- **Duration:** ~5 min (303s wall-clock from `git log`)
- **Started:** 2026-05-10T15:57:44Z
- **Completed:** 2026-05-10T16:02:47Z
- **Tasks:** 2 of 2 (3 commits — TDD RED/GREEN for Task 1; Task 2 atomic)
- **Files created:** 3 (V10MainShell.tsx + V10MainShell.module.css + V10MainShell.test.tsx)
- **Files modified:** 2 (AppV10.tsx + OnboardingMount.tsx)

## Accomplishments

- **V10MainShell.tsx (~165 LOC)** — single web root composing PosterRouterProvider, ShellChrome (consumes router context), and a portal PosterSheet bound to `isAddSheetOpen` state. AddSheetPlaceholderContent is local to the file and exported via render-tree only (no public API surface).
- **ShellChrome subcomponent** lives inside the PosterRouterProvider so it can call `usePosterRouter()` and translate BottomNav tab events into router actions:
  - `home` → `router.popToRoot()` (return to OnboardingMount/HomeMount root)
  - `savings` → `router.push(<AccountsListPlaceholder />)` (Phase 27 swap target)
  - `ai` / `mgmt` → `router.push(<PlanViewPlaceholder />)` (Phase 26 swap target)
- **AppV10.tsx** now renders `<V10MainShell />` for the `surface !== 'preview'` branch — preview branch unchanged. Header comments updated to document the Phase 25-06 wiring.
- **OnboardingMount.tsx** onboarded_at != null branch now returns `<HomeMount />`. The `HomePlaceholder` component definition is removed entirely (audit via `grep -rn HomePlaceholder` confirmed OnboardingMount.tsx was the only consumer). Header comment updated.
- **10 component tests** pass: shell renders + onboarding-mount stub visible; BottomNav home active by default; 4-tab + FAB layout (NO Transactions tab — TXN-V10-06); FAB → AddSheet open + BottomNav hide; Escape closes sheet; close button closes sheet; Savings/AI/Mgmt tabs push WIP placeholders; Home tab pops to root.
- **Full project test suite 242/242 pass** (regression-clean against the 232-test baseline before this plan; the +10 tests are all new V10MainShell coverage).
- **tsc strict clean; vite build succeeds** (~216ms, 197 KiB gz main bundle, no AppV10 size change beyond the +5KB shell composition).

## Architecture (final)

```
AppV10
  ├── ?preview=1 → <PreviewApp />            (unchanged)
  └── ?preview≠1 → <V10MainShell>
                     ├── <PosterRouterProvider root={<OnboardingMount />}>
                     │     └── <ShellChrome>            (consumes router via usePosterRouter)
                     │           ├── <PosterRouterView />   (renders top of stack)
                     │           │     └── (root) <OnboardingMount>
                     │           │             ├── status=loading  → spinner
                     │           │             ├── status=error    → retry button
                     │           │             ├── me.onboarded_at == null → <OnboardingFlow>
                     │           │             └── me.onboarded_at != null → <HomeMount>
                     │           │                                              (push targets:
                     │           │                                               AccountsListPlaceholder,
                     │           │                                               PlanViewPlaceholder,
                     │           │                                               CategoryDetailPlaceholder,
                     │           │                                               TransactionsViewPlaceholder)
                     │           └── <BottomNavV10 isHidden={isAddSheetOpen}>   (4 tabs + FAB)
                     └── <PosterSheet isOpen={isAddSheetOpen} bg="#0E0E0E">
                           └── <AddSheetPlaceholderContent />        (Plan 25-10 swap target)
```

Key contract: PosterRouter root = OnboardingMount (not HomeMount) so the gateway state machine remains the single source of truth for the onboarded decision. HomeMount renders one level deeper, but it's still inside PosterRouterProvider, so its `usePosterRouter()` calls resolve correctly.

## Tab routing matrix (ShellChrome.handleTab)

| Tab id   | Action                                       | Replacement plan        |
|----------|----------------------------------------------|-------------------------|
| `home`   | `router.popToRoot()`                         | Stable                  |
| `savings`| `router.push(<AccountsListPlaceholder />)`   | Phase 27 (mgmt screens) |
| `ai`     | `router.push(<PlanViewPlaceholder />)`       | Phase 27 (AI screen)    |
| `mgmt`   | `router.push(<PlanViewPlaceholder />)`       | Phase 27 (mgmt screen)  |

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1 RED: failing tests for V10MainShell composition** — `37edff5` (test)
2. **Task 1 GREEN: implement V10MainShell composing PosterRouter + BottomNav + AddSheet** — `b7769bd` (feat)
3. **Task 2: wire V10MainShell into AppV10 + replace HomePlaceholder with HomeMount** — `8137cb6` (feat)

## Files Created/Modified

### Created

- `frontend/src/screensV10/V10MainShell.tsx` (~165 LOC) — V10MainShell + ShellChrome + AddSheetPlaceholderContent. Doc-comment block at top explains architecture decisions (PosterRouter root = OnboardingMount, ShellChrome split, AddSheet hide-gate, tab routing matrix).
- `frontend/src/screensV10/V10MainShell.module.css` (~56 LOC) — `.shellRoot` viewport, `.content` (90px bottom-reserve for nav), `.navWrap` absolute-bottom, `.sheetPlaceholder` + `.sheetHint` + `.closeBtn` for the AddSheet placeholder content.
- `frontend/src/screensV10/__tests__/V10MainShell.test.tsx` (~131 LOC, 10 tests) — mocks `OnboardingMount` to a stub; asserts shell composition, 4-tab layout, FAB → AddSheet open, Escape/close button restore nav, tab → push placeholder, home → popToRoot.

### Modified

- `frontend/src/AppV10.tsx` — replaced `import { OnboardingMount }` with `import { V10MainShell }`; replaced `<OnboardingMount />` render with `<V10MainShell />`; updated header comment to document Phase 25-06 wiring (preview branch unchanged).
- `frontend/src/screensV10/Onboarding/OnboardingMount.tsx` — added `import { HomeMount } from '../Home'`; replaced `<HomePlaceholder />` render with `<HomeMount />`; removed the `HomePlaceholder` function definition (no other consumers); updated header comment to document the swap.

## Decisions Made

(See `key-decisions` in frontmatter.)

Highlights:

- **PosterRouter root = OnboardingMount.** This is the load-bearing decision. The naive read of Task 1 would put `HomeMount` as the root, but Task 2's resolution made clear: OnboardingMount must be inside PosterRouterProvider so that when it switches to its onboarded branch and renders HomeMount, HomeMount finds `usePosterRouter()` in context. Putting HomeMount directly as root would force AppV10 to re-implement the /me gateway, breaking the single-source-of-truth invariant from Plan 24-10.

- **ShellChrome split out as a child of PosterRouterProvider.** Two reasons: (1) `usePosterRouter()` requires being inside the provider; (2) keeps V10MainShell's outer layer free of router-context concerns (it owns `active` and `isAddSheetOpen` state + the PosterSheet portal — pure layout). ShellChrome reads the router only — no state of its own.

- **AddSheet placeholder content with explicit close button.** Per CONTEXT decisions, AddSheet (real, Plan 25-10) renders a custom 3×4 keypad. For now we render an Eyebrow «NEW ENTRY · WIP» + Mass «AddSheet —» + a yellow «× ЗАКРЫТЬ» button so users get clear signal that this is unfinished + a way out that doesn't depend on Escape (which iOS users may not have on a touch device). Plan 25-10 swaps this entire content function — V10MainShell shape is stable.

- **HomePlaceholder fully removed.** Audit (`grep -rn HomePlaceholder frontend/src/`) confirmed OnboardingMount.tsx was the only consumer (no test imports, no other component imports). Removing it is cleaner than `@deprecated` JSDoc — there's nothing to deprecate after this plan.

- **BottomNav peek-through during onboarding deferred to e2e.** OnboardingFlow renders its own opaque full-screen background that visually obscures the BottomNav, so the nav being technically mounted-but-covered is acceptable. Adding an explicit `isOnboarding` hide-flag would require a context bridge from OnboardingMount → V10MainShell — not worth the coupling for a visual-only concern. Plan 25-10's e2e will catch any actual visible peek-through.

## Deviations from Plan

### Auto-fixed Issues

**None.** Plan executed as written. The only nuance was that Task 1's draft snippet showed `root={<HomeMount />}` while Task 2's resolution corrected it to `root={<OnboardingMount />}` — I followed Task 2's final resolution from the start (the plan itself documented this correction in the `Resolution refinement` block at the end of Task 2's `<action>`).

---

**Total deviations:** 0 — plan executed exactly as written (per Task 2's final architecture resolution).

## Issues Encountered

- **Stderr noise from `usePosterRouter outside Provider` test:** Plan 25-02's posterRouter test deliberately produces a benign jsdom uncaught-error log. This noise persists in the full test run output but does not affect pass/fail. Documented in 25-02 SUMMARY (`Issues Encountered`) — not a 25-06 regression.
- **Shared-branch parallel commits:** While I executed this plan in a worktree, another parallel executor (Plan 25-07 iOS) committed `8299095` and `274c4e3` to the same `v1.0-maximal-poster` branch between my Task 1 and Task 2 commits. My commits cleanly contain only my files (verified via `git show --stat`). One git rename detection (`HomeView.swift → HomeV10View.swift`) appeared in my Task 1 GREEN commit's stat output — that was a working-tree state inherited at worktree creation, not a deletion I introduced; the file exists under the new name, no work lost.

## Threat Flags

None — implementation matches `<threat_model>` mitigations:

- **T-25-06-01 (race between OnboardingMount.refetch and V10MainShell mount):** mitigated. OnboardingMount remains the SOLE owner of the /me fetch + state machine; V10MainShell never reads /me. The «refetch as single source of truth» invariant from Plan 24-10 is preserved unchanged. Asserted by the unchanged Onboarding test suite (10 tests under `Onboarding/__tests__/`).
- **T-25-06-02 (PosterSheet stack growth from FAB spam):** mitigated. AddSheet is bound to single boolean `isAddSheetOpen`; FAB clicks while open are no-ops because the FAB is unmounted (BottomNavV10.isHidden=true). PosterSheet itself is single-instance (one portal at a time). Asserted by the «FAB tap opens AddSheet and hides BottomNav» test.
- **T-25-06-03 (Preview surface leaking V10 mount state):** accepted (preview branch returns BEFORE V10MainShell mount — physically separated paths in `AppV10.tsx`).

No new security surface introduced — V10MainShell only renders existing components and binds router actions.

## Known Stubs

- **AddSheetPlaceholderContent inside V10MainShell.tsx** — intentional WIP. Content is `Eyebrow «NEW ENTRY · WIP»` + `Mass «AddSheet —»` + WIP hint + close button. Plan 25-10 will replace the entire content function; V10MainShell shape (the PosterSheet binding, the open/close gate, the BottomNav.isHidden flag) is stable and does not change.
- **AccountsListPlaceholder + PlanViewPlaceholder** pushed by Savings/AI/Mgmt tabs — these are the same placeholders HomeMount already pushes for its wallet/plan/all-ops links (defined in `frontend/src/screensV10/_placeholders.tsx`, Plan 25-04). Phase 27 will replace them in both call sites simultaneously by swapping the inner imports.

These stubs do NOT block the HOME-V10-01..06 / TXN-V10-06 / ADD-V10-01 acceptance — Home renders, BottomNav has the correct 4-tab + FAB layout, FAB opens (placeholder) AddSheet, all four tabs are reachable.

## Next Phase Readiness

- **Plan 25-10 (web Add Sheet):** swap `AddSheetPlaceholderContent` inside `V10MainShell.tsx` for the real `AddSheet` (custom 3×4 keypad + amount input + category picker + account picker + save handler). V10MainShell's PosterSheet binding (`isOpen`, `onClose`, `backgroundColor='#0E0E0E'`) is the contract — Plan 25-10 only edits the component rendered inside.
- **Plan 25-06 web Transactions registry (different plan, same phase):** swap `TransactionsViewPlaceholder` import in `HomeMount.tsx` (Plan 25-04 already wired the push). V10MainShell does not need to change.
- **Phase 26 (plan editor / category detail):** swap `PlanViewPlaceholder` and `CategoryDetailPlaceholder` imports inside `_placeholders.tsx` consumers (HomeMount + ShellChrome) — same single-import-edit pattern.
- **Phase 27 (mgmt / Savings / AI):** swap `AccountsListPlaceholder` and `PlanViewPlaceholder` imports inside ShellChrome's `handleTab` for Savings / AI / Mgmt tabs.

## Self-Check: PASSED

**Files exist:**
- FOUND: frontend/src/screensV10/V10MainShell.tsx
- FOUND: frontend/src/screensV10/V10MainShell.module.css
- FOUND: frontend/src/screensV10/__tests__/V10MainShell.test.tsx
- FOUND: frontend/src/AppV10.tsx (modified — V10MainShell now mounted)
- FOUND: frontend/src/screensV10/Onboarding/OnboardingMount.tsx (modified — HomeMount replaces HomePlaceholder)

**Commits exist:**
- FOUND: 37edff5 (test: V10MainShell RED)
- FOUND: b7769bd (feat: V10MainShell GREEN)
- FOUND: 8137cb6 (feat: AppV10 + OnboardingMount wire)

**Verification gates:**
- `cd frontend && npx tsc --noEmit`: clean (no output)
- `cd frontend && npm test -- screensV10 --run`: 12 files, 204/204 pass
- `cd frontend && npm test -- --run`: 15 files, 242/242 pass (full project; +10 new tests, no regressions)
- `cd frontend && npm run build`: succeeds (~216 ms; 197 KiB gz main bundle, 38 KB gz AppV10 chunk)
- `grep -c "V10MainShell" frontend/src/AppV10.tsx`: 3 (≥1 required)
- `grep -c "HomeMount" frontend/src/screensV10/Onboarding/OnboardingMount.tsx`: 8 (≥1 required)
- `grep -v '^//' frontend/src/screensV10/V10MainShell.tsx | grep -c "Транзакции\|Реестр\|TransactionsPlaceholder"`: 0 (TXN-V10-06 — no transactions tab in non-comment code)
- `grep -c "PosterRouterProvider\|BottomNavV10\|PosterSheet\|HomeMount\|OnboardingMount" frontend/src/screensV10/V10MainShell.tsx`: 27 (≥4 required)

**No accidental file deletions** in any of my task commits (`git diff ccb1494..HEAD --diff-filter=D --name-only -- frontend/`: empty for files I touched; `OnboardingMount.tsx` lost the `HomePlaceholder` function — intentional, audit-confirmed no consumers).

---
*Phase: 25-home-transactions-add-sheet*
*Plan: 06*
*Completed: 2026-05-10*
