---
phase: 70-convergence-abstractions
plan: 05
subsystem: ios-domain
tags: [R6, subscriptions, shared-store, convergence, ios]
requires:
  - "70-04 SubscriptionsDomain (shared compute: sortV06/sortV10, activeCount, monthly totals)"
  - "70-03 ErrorHandling injection (APIClient root error policy)"
provides:
  - "SubscriptionsStore — shared @Observable domain store (load + mutations + injectable API seam) consumed by BOTH shells"
  - "R6 store-extraction pattern proven on Subscriptions (compute via 70-04 + store via 70-05)"
affects:
  - "ios/BudgetPlanner/Features/Management/SubscriptionsView.swift (v06 VM now thin adapter)"
  - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift (V10 VM now thin adapter)"
tech-stack:
  added: []
  patterns:
    - "Shared @Observable store with injectable closure-struct API seam (WR-04 lifted to domain layer)"
    - "Per-shell VMs as thin adapters: domain logic in store, presentation (banner vs toast/menu) per-VM"
    - "loadsCategoriesAccounts flag + injectable sort closure parameterize per-shell load/order without forking logic"
key-files:
  created:
    - "ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsStore.swift"
    - "ios/BudgetPlannerTests/Domain/SubscriptionsStoreTests.swift"
  modified:
    - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift"
    - "ios/BudgetPlanner/Features/Management/SubscriptionsView.swift"
decisions:
  - "OWNER R6: KEEP BOTH SHELLS — only the load+mutation+seam logic is extracted; VMs + Views stay per-shell"
  - "Store reports outcome via Bool only (T-70-05-03); presentation copy (v06 fixed-RU banner / V10 toast) stays in each VM"
  - "V10 adopts the v06 superset reloadPending re-entrancy — strictly safer, behaviourally inert under V10's already-serialised load"
  - "Store holds subs in an injectable sort order (v06=sortV06, V10=identity+own sortedSubs getter) so both shells' displayed order is byte-identical"
metrics:
  duration: "~7min"
  completed: "2026-05-21"
  tasks: 3
  files: 4
  tests-added: 14
  suite-total: 639
---

# Phase 70 Plan 05: D/R6 Shared SubscriptionsStore Summary

Extracted the duplicated Subscriptions load + mutation logic + the injectable network API seam into a shared `@Observable SubscriptionsStore` consumed by BOTH shells; the v06 and V10 ViewModels became thin adapters that keep only shell-specific presentation state. R6 store-extraction pattern now proven on Subscriptions (compute via 70-04 + store via 70-05).

## What shipped

### Shared store design + injectable seam
`SubscriptionsStore` (`@MainActor @Observable`, `Domain/Subscriptions/`) owns:
- **State:** `private(set) subscriptions/categories/accounts/status/submitting`; `Status` enum (`idle/loading/ready/error`); `inFlight` + `reloadPending` re-entrancy flags.
- **Injectable `API` seam** — the v06 WR-04 closure struct lifted verbatim (`listSubs/listCategories/listAccounts/reschedule/post/unpost/delete/patch`), with `static let live` proxying `SubscriptionsV10API`/`CategoriesAPI`/`AccountsAPI`/`LocalNotifications`. Tests inject stub closures → zero network.
- **`init(api:loadsCategoriesAccounts:sort:)`** — `loadsCategoriesAccounts` gates whether `load()` fetches cats/accounts + reschedules (v06 `true`, V10 `false`); `sort:` is an injectable order projection (v06 passes `SubscriptionsDomain.sortV06`; V10 passes identity and keeps its own `sortedSubs` derived getter calling `sortV10`).
- **`load()`**, **`post/unpost/delete(_ id:) -> Bool`**, **`patch(id:payload:) -> Bool`** — all delegate-friendly; mutation result reported as `Bool` only.

### Behaviors ported VERBATIM (the v06 superset)
- **submitting-guard (T-63-01):** `guard !submitting else { return false }` on every mutation.
- **reload-on-success (T-63-04):** every mutation calls `load()` on success.
- **WR-06 stale-4xx reload:** `post`/`unpost` ALSO reload on failure (preserves the v06 distinction: `delete`/`patch` do NOT reload on failure — ported exactly).
- **reloadPending re-entrancy (WR-01):** a `load()` arriving while one is in flight sets `reloadPending`, re-invoked in the in-flight `load()`'s `defer`.

### V10 reloadPending safety confirmation (VERIFIED)
The plan asserted adopting the v06 `reloadPending` is safe for V10 because it only fires under a concurrent `load()` — a path V10 already serialised. Confirmed by inspection: the old V10 `load()` did `if inFlight { return }`, i.e. it **dropped** a concurrent second load silently. The superset instead **remembers and re-runs** it. There is no V10 caller that depends on the second load being dropped (V10's `.task { load() }` + per-mutation `load()` never overlap by design; the only overlap source — `.refreshable` racing the initial `.task` — benefits from coalescing). So V10 behaviour is unchanged for all real call paths and strictly safer (no lost reload). No V10 unit test asserted the old drop semantics (V10 VM was never unit-tested), so nothing regressed. `SubscriptionsStoreTests.test_load_coalescesPendingReload_whenInFlight` now locks the coalesce behaviour for both shells.

### Per-shell VMs as thin adapters (presentation stays per-shell)
- **v06 `SubscriptionsViewModel`** (in `SubscriptionsView.swift`): holds `SubscriptionsStore(loadsCategoriesAccounts: true, sort: sortV06)`. Public surface unchanged — `API` is now a `typealias SubscriptionsStore.API`, `Status` a typealias, computed pass-throughs for `subscriptions/categories/accounts/status/submitting`, same `load/post/unpost/delete/patch/patchById/clearMutationError` + derived `activeCount/monthlyLoadCents` + `_setStateForTesting` backdoor (delegates to a new store DEBUG backdoor). Maps store `Bool` outcomes to the fixed-RU `mutationError` banner (T-70-05-03 — no raw-error interpolation).
- **V10 `SubscriptionsV10ViewModel`:** holds `SubscriptionsStore(loadsCategoriesAccounts: false)`. Keeps `menuSub/pendingDeleteSub/toastMessage`; `togglePause/changeDay/changePrice -> store.patch(...)`, `deleteSub -> store.delete(...)`, toast set on `false`. Derived getters (`sortedSubs/activeCount/monthlyTotal/yearlyTotalAnnualized`) keep calling `SubscriptionsDomain.*V10` (from 70-04).
- **View bindings unchanged on both shells** — `SubscriptionsV10View` and the v06 `SubscriptionsView` body compile untouched.

## SubscriptionsViewModelTests ran UNMODIFIED (confirmed)
`git status` shows zero changes to `BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift`. The suite (19 tests, incl. the WR-04 spy harness asserting submitting-guard, reload-on-success, WR-06 reload, reloadPending coalesce, fixed-RU copy) passed **unmodified** against the delegated VM. The test references `SubscriptionsViewModel.API` and `_setStateForTesting` — both kept stable via the typealias + delegated backdoor.

## Build + test results
- **Both shells build:** `** BUILD SUCCEEDED **` (iPhone 17 Pro).
- **Full iOS suite:** `** TEST SUCCEEDED **` — **639 tests, 0 failures**. Baseline 625 + 14 new `SubscriptionsStoreTests` = 639 (exact, no coverage loss/regression).
- **Grep gate:** both VMs reference `SubscriptionsStore` (5 refs each).

## Deviations from Plan

### Auto-fixed / plan-directed adjustments

**1. [Rule 2 - plan-directed] V10 failure-toast detail text simplified to fixed RU copy**
- **Found during:** Task 2.
- **Issue:** The old V10 VM interpolated the backend error string into the toast (`errMessage(error, fallback:)`, DEBT-04). The shared store reports mutation outcome as `Bool` only (per plan interfaces line 83 + `togglePause/changeDay/changePrice -> store.patch(...) and set toastMessage on false`), so the raw backend detail is no longer available to the VM.
- **Resolution:** Toast now shows a fixed RU message on failure (`"Не удалось обновить · статус/день/цена не сохранён(а)"`, `"Не удалось удалить · подписка не удалена"`). This is the plan's explicit design (Bool outcome + per-shell copy) and aligns with T-70-05-03 (no raw-error leak). The `errMessage` helper was removed. The toast still appears on every failure with a clear message — only the trailing backend-specific detail string is gone. No test asserted the old interpolated text (V10 VM had no unit tests), so the suite is unaffected. The user-visible behavior (a toast on failure) is preserved; the detail granularity is a deliberate downgrade matching the shared-Bool contract.

## Threat surface
No new trust boundaries. T-70-05-01/02/03 mitigations satisfied: superset ported verbatim + asserted by `SubscriptionsStoreTests` (guard + reload + WR-01) and the unmodified `SubscriptionsViewModelTests`; the single guarded store path is shared by both shells (no double-submit); v06 fixed-copy mapping preserves the 67-05 IN-01 no-leak contract.

## R6 pattern status
Subscriptions is now fully on the shared layer: **compute** (70-04 `SubscriptionsDomain`) + **store** (70-05 `SubscriptionsStore`), Views + presentation per-shell. The R6 store-extraction pattern is proven. **Savings is the next D backlog domain** to receive the same compute+store treatment.

## Commits
- `f8a0522` — feat(70-05): shared SubscriptionsStore + behavioral tests via injected seam
- `f0f45d0` — refactor(70-05): delegate both shells' VMs to SubscriptionsStore

## Self-Check: PASSED
- FOUND: ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsStore.swift
- FOUND: ios/BudgetPlannerTests/Domain/SubscriptionsStoreTests.swift
- FOUND commit f8a0522, f0f45d0
- Full suite 639 green; SubscriptionsViewModelTests unmodified (git 0 changes) + green.
