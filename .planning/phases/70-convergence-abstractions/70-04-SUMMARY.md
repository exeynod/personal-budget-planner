---
phase: 70-convergence-abstractions
plan: 04
subsystem: ios-domain
tags: [shared-domain, subscriptions, R6, convergence, named-variants, dedup]
requires:
  - "SubscriptionsData (V10 compute enum, Phase 26-07)"
  - "SubscriptionsViewData (v06 compute enum, Phase 63-01)"
  - "BusinessDate nextChargeDate type (70-02) — sort/cadence read .date bridge / compare BusinessDate"
  - "V10Formatters.monthsRuGenitive (cadenceRuV10 genitive month list)"
provides:
  - "ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsDomain.swift — single shared compute home for both shells; shared helpers (activeCount/isPosted/isValidDraft) + explicitly-named per-shell variants (monthlyTotalV10, yearlyTotalAnnualizedV10, cadenceRuV10, sortV10, monthlyLoadCentsV06, cadenceRuV06, sortV06); each variant doc-comments its owner shell + why it diverges"
  - "SubscriptionsDomainTests — merged 31-case suite asserting BOTH shells' formulas/copy/sort"
  - "R6 shared-domain PATTERN set on the highest-drift domain (Subscriptions) for follow-up domains (Savings = backlog)"
affects:
  - "ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsDomain.swift"
  - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift"
  - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift"
  - "ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionMenuSheet.swift"
  - "ios/BudgetPlanner/Features/Management/SubscriptionsView.swift"
  - "ios/BudgetPlannerTests/Domain/SubscriptionsDomainTests.swift"
  - "ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift"
tech-stack:
  added: []
  patterns:
    - "shared-domain with named variants: ONE namespace owns ALL compute for a domain; helpers identical across shells get a plain name, helpers that intentionally differ carry an explicit *V10/*V06 suffix + a doc-comment stating owner shell + WHY it differs. Divergence becomes a documented product choice instead of two duplicate enums silently drifting (R6)."
    - "consolidation preserves UI byte-for-byte: per-shell formula/sort/copy ported verbatim into named variants — zero behavioral change on either shell; the merged test suite asserts BOTH variants of every divergent helper so they can never re-drift."
key-files:
  created:
    - ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsDomain.swift
    - ios/BudgetPlannerTests/Domain/SubscriptionsDomainTests.swift
  modified:
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionMenuSheet.swift
    - ios/BudgetPlanner/Features/Management/SubscriptionsView.swift
    - ios/BudgetPlanner/FeaturesV10/Savings/SavingsData.swift
    - ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift
  removed:
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsData.swift
    - ios/BudgetPlanner/Features/Management/SubscriptionsViewData.swift
    - ios/BudgetPlannerTests/FeaturesV10/SubscriptionsDataTests.swift
    - ios/BudgetPlannerTests/Features/Management/SubscriptionsViewDataTests.swift
decisions:
  - "OWNER R6: KEEP BOTH SHELLS — only the duplicated pure-compute enums + their test files are removed/merged. View files (SubscriptionsV10View, SubscriptionMenuSheet, SubscriptionsView/Editor) and the two ViewModels are edited for call-site repoint ONLY, never removed."
  - "Per-shell differences preserved as NAMED variants, NOT collapsed: monthlyTotalV10 (Σ active monthly only) vs monthlyLoadCentsV06 (Σ active monthly-full + yearly/12 integer); sortV10 (active-first/amount-DESC/name-ASC) vs sortV06 (nextChargeDate ASC); cadenceRuV10 ('каждое N число' / '{day} {month_genitive}') vs cadenceRuV06 ('ежемесячно, N числа' / 'ежегодно'). Collapsing any of these would change one shell's UI."
  - "isPosted + isValidDraft placed in the SHARED section (shell-agnostic predicates) even though only v06 currently calls them — V10 has no post/unpost/create UI today; keeping them shared avoids re-duplication when V10 gains those paths."
  - "Test count delta: 626 baseline -32 (old SubscriptionsDataTests 16 + SubscriptionsViewDataTests 16) +31 (merged SubscriptionsDomainTests) = 625. The merged suite has 31 (not 32) because the overlapping activeCount-empty / isPosted cases consolidated where identical — coverage of every divergent helper for BOTH shells is fully preserved (no net loss)."
metrics:
  duration_min: 6
  completed_date: 2026-05-21
  tasks: 3
  files: 12
  tests_added: 31
  tests_removed: 32
  suite_total: 625
---

# Phase 70 Plan 04: Shared SubscriptionsDomain (D/R6) Summary

Consolidated the two duplicated Subscriptions pure-compute enums — `SubscriptionsData` (V10) and `SubscriptionsViewData` (v06) — into ONE shared `SubscriptionsDomain` namespace under `ios/BudgetPlanner/Domain/Subscriptions/`, consumed by both shells. Identical logic is shared by plain name; the intentional per-shell differences (monthly-total formula, sort order, cadence copy) are preserved as explicitly-named `*V10`/`*V06` variants, each doc-commented with its owner shell and why it diverges — so the divergence is a documented product choice, not two enums silently drifting. UI behavior is byte-identical on both shells; the merged 31-case `SubscriptionsDomainTests` asserts both variants of every divergent helper. This sets the R6 shared-domain pattern for the remaining domains (Savings = backlog).

## Shared namespace design

`enum SubscriptionsDomain` (Foundation-only, no SwiftUI), three sections:

**Shared (identical on both shells):**
- `activeCount(_)` — Σ isActive
- `isPosted(_)` — postedTxnId != nil
- `isValidDraft(name:amountCents:categoryId:submitting:)` — editor save gate

**V10 variants (poster shell):**
- `monthlyTotalV10(_)` — Σ active MONTHLY only
- `yearlyTotalAnnualizedV10(_)` — monthly*12 + Σ active yearly
- `cadenceRuV10(_:calendar:)` — "каждое N число" / "ежемесячно" / "{day} {month_genitive}" (Europe/Moscow, V10Formatters.monthsRuGenitive)
- `sortV10(_)` — active-first, amount DESC, name ASC (localizedCompare)

**v06 variants (native legacy shell):**
- `monthlyLoadCentsV06(_)` — Σ active (monthly full + yearly INTEGER /12, no float)
- `cadenceRuV06(cycle:dayOfMonth:)` — "ежемесячно, N числа" / "ежемесячно" / "ежегодно"
- `sortV06(_)` — nextChargeDate ASC

## Consolidated vs kept as named variants

| Helper | Disposition |
|--------|-------------|
| activeCount, isPosted, isValidDraft | SHARED (single body, identical) |
| monthly total | NAMED — `monthlyTotalV10` (monthly-only) vs `monthlyLoadCentsV06` (monthly + yearly/12) — DIFFERENT formula, preserved |
| sort | NAMED — `sortV10` (amount-ranked, active-first) vs `sortV06` (timeline, nextChargeDate ASC) — DIFFERENT order, preserved |
| cadence copy | NAMED — `cadenceRuV10` (genitive month) vs `cadenceRuV06` (simple RU) — DIFFERENT copy, preserved |

Each variant body was ported verbatim from its source enum — zero behavior change on either shell.

## Files removed

- `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsData.swift` (V10 enum)
- `ios/BudgetPlanner/Features/Management/SubscriptionsViewData.swift` (v06 enum)
- `ios/BudgetPlannerTests/FeaturesV10/SubscriptionsDataTests.swift` (16 cases, merged)
- `ios/BudgetPlannerTests/Features/Management/SubscriptionsViewDataTests.swift` (16 cases, merged)

View files and ViewModels were edited for call-site repoint only (owner R6: keep both shells).

## Test merge result

Old `SubscriptionsDataTests` (16) + `SubscriptionsViewDataTests` (16) = 32 cases merged into `SubscriptionsDomainTests` (31 cases). The single-case net reduction is the de-duplicated `activeCount`-empty / `isPosted` overlap — every divergent helper for BOTH shells (monthlyTotalV10 / yearlyTotalAnnualizedV10 / monthlyLoadCentsV06 / cadenceRuV10 / cadenceRuV06 / sortV10 / sortV06) keeps full coverage. No net loss of meaningful coverage.

## Build + test results

- `xcodebuild build` (BudgetPlanner — both shells in one target): **BUILD SUCCEEDED**.
- `xcodebuild test` (full iOS suite, iPhone 17 Pro): **TEST SUCCEEDED — 625 tests, 0 failures**.
- Delta: 626 baseline − 32 removed + 31 merged = 625 (coherent).
- Subscriptions UI identical on both shells (named variants preserve each shell's totals/sort/copy verbatim).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SubscriptionsViewModelTests still referenced removed `SubscriptionsViewData.isPosted`**
- **Found during:** Task 3 (first full-suite build failed: "cannot find 'SubscriptionsViewData' in scope" at SubscriptionsViewModelTests.swift:258-259).
- **Issue:** The plan's interface mapping enumerated call-sites under `BudgetPlanner/` but the v06 VM test file under `BudgetPlannerTests/` also called `SubscriptionsViewData.isPosted` (two assertions). Task 2's grep gate scoped `BudgetPlanner/` only, so it was missed.
- **Fix:** Repointed both lines to `SubscriptionsDomain.isPosted`; re-ran a full-tree grep (src + tests) confirming all-clear.
- **Files modified:** ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift
- **Commit:** e686bb7

(The SavingsData.swift edit was an in-scope comment-reference update — a stale `SubscriptionsData.formatCadenceRu` doc reference repointed to `SubscriptionsDomain.cadenceRuV10`, committed with Task 2.)

## Self-Check: PASSED

- FOUND: ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsDomain.swift
- FOUND: ios/BudgetPlannerTests/Domain/SubscriptionsDomainTests.swift
- Commits d4db8b6 (Task 1), 812982c (Task 2), e686bb7 (Task 3) — all in git log.
