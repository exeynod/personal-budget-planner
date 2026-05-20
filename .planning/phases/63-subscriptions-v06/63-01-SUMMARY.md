---
phase: 63-subscriptions-v06
plan: 01
subsystem: ios-subscriptions
tags: [ios, subscriptions, v06, v10-api, money-mutation]
requires:
  - SubscriptionsV10API (list/post/unpost/patch/delete)
  - SubscriptionV10DTO + SubscriptionV10UpdateRequest + SubscriptionPostResponseDTO
  - AccountsAPI.list, CategoriesAPI.list
provides:
  - SubscriptionsViewModel migrated to SubscriptionsV10API + post/unpost money mutations
  - SubscriptionsViewData pure helpers (6 static funcs)
affects:
  - Plan 63-02 (editor rework: day_of_month / account_id Picker, V10 patch save-path, swipe post/unpost UI + badge)
tech-stack:
  added: []
  patterns:
    - "Status state-machine {idle,loading,ready,error} + inFlight guard (Savings sibling)"
    - "submitting guard + defer + full reload on mutation success (T-63-01/04)"
    - "print() raw error + fixed RU mutationError copy (T-63-02)"
    - "Foundation-only pure helpers in *ViewData.swift namespace (unique basename)"
key-files:
  created:
    - ios/BudgetPlanner/Features/Management/SubscriptionsViewData.swift
    - ios/BudgetPlannerTests/Features/Management/SubscriptionsViewDataTests.swift
  modified:
    - ios/BudgetPlanner/Features/Management/SubscriptionsView.swift
decisions:
  - "create-path stays on legacy SubscriptionsAPI.create (V10API has no create endpoint) — CONTEXT open-question resolved; day_of_month/account_id set via follow-up PATCH in 63-02 editor"
  - "LocalNotifications.reschedule call dropped (known-gap): legacy [SubscriptionDTO] is Decodable-only with no memberwise init, cannot map V10DTO without modifying LocalNotifications/SubscriptionDTO (out of plan scope). Subscription CRUD does not regress; rescheduling is follow-up."
  - "1 error.localizedDescription remains in SubscriptionEditor.save() (View layer, legacy create/update path) — VM catch blocks have 0 (T-63-02 satisfied). Editor reworked in 63-02 per CONTEXT."
metrics:
  duration: 4min
  completed: 2026-05-20
---

# Phase 63 Plan 01: Subscriptions V10API migration + pure helpers Summary

SubscriptionsViewModel migrated off legacy `SubscriptionsAPI` onto `SubscriptionsV10API` for list/patch/post/unpost/delete, with post/unpost as money mutations (submitting guard + reload + fixed RU error copy), plus a new Foundation-only `SubscriptionsViewData` helper namespace (6 pure funcs, 18 unit tests).

## What Was Built

### Task 1 — SubscriptionsViewData pure helpers (commit f2aa5f1)
- `enum SubscriptionsViewData` (Foundation-only, no SwiftUI import).
- `computeActiveCount`, `computeMonthlyLoadCents` (monthly full + yearly /12 integer truncation, no float), `sortForDisplay` (nextChargeDate ASC), `formatCadenceRu` ("ежемесячно, N числа" / "ежемесячно" / "ежегодно"), `isPosted`, `isValidDraft`.
- File basename `SubscriptionsViewData.swift` — deliberately NOT `SubscriptionsData.swift` (taken by FeaturesV10; Swift forbids duplicate basenames in one target — Phase 62-01 lesson).
- 18 unit tests (`SubscriptionsViewDataTests`) — JSON-decode DTO fixtures, all green on iPhone 17 Pro.

### Task 2 — SubscriptionsViewModel V10 migration (commit aafcf5b)
- `Status` state-machine, `inFlight` load guard, `submitting` mutation guard.
- `load()`: parallel `SubscriptionsV10API.list()` + `CategoriesAPI.list()` + `AccountsAPI.list()`; categories filtered `!isArchived`; subs sorted via `SubscriptionsViewData.sortForDisplay`.
- `post`/`unpost`/`delete`/`patch`: submitting guard + defer, `print()` raw error, fixed RU `mutationError`, full `await load()` on success.
- Derived `activeCount`/`monthlyLoadCents` via helpers; `#if DEBUG _setStateForTesting` backdoor; `clearMutationError()`.
- View/Row/Editor retyped to `SubscriptionV10DTO`; `SubscriptionRow` resolves visual via `categoryId` → categories lookup (V10DTO has no embedded `category`). 4 load-states, `.refreshable`, submitting-disabled swipe-delete.

## Deviations from Plan

### Auto-fixed / Plan-sanctioned adjustments

**1. [Rule 3 - Blocking] LocalNotifications.reschedule call dropped (known-gap)**
- **Found during:** Task 2
- **Issue:** `LocalNotifications.reschedule(subscriptions:)` takes legacy `[SubscriptionDTO]`. VM now holds `[SubscriptionV10DTO]`. `SubscriptionDTO` is `Decodable`-only (no memberwise init), so V10DTO cannot be mapped into it without modifying `LocalNotifications.swift` / `SubscriptionDTO` — explicitly out of plan scope.
- **Fix:** Removed the reschedule call with a documented TODO comment in `load()`. Plan explicitly authorised this fallback ("временно убрать reschedule-вызов с TODO-комментом и зафиксировать в SUMMARY как known-gap"). Subscription CRUD functionality does not regress.
- **Files modified:** SubscriptionsView.swift
- **Commit:** aafcf5b
- **Follow-up:** add a V10DTO-typed reschedule overload (63-02+).

## Threat Model Compliance

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-63-01 (double-tap post) | `submitting` guard + defer on post/unpost/patch/delete | ✓ in VM |
| T-63-02 (raw error leak) | catch → print() only; fixed RU mutationError; 0 localizedDescription in VM | ✓ (1 remaining is View-layer editor, per acceptance criteria scope) |
| T-63-03 (cross-tenant) | RLS-protected at backend | accept (unchanged) |
| T-63-04 (stale UI) | full `await load()` after every successful mutation | ✓ |

## Acceptance Criteria

- [x] `grep -c SubscriptionsV10API` = 6 (≥4)
- [x] `SubscriptionsAPI.list` non-comment = 0 in VM
- [x] 0 `localizedDescription` in VM catch blocks (1 in View editor — in-scope for 63-02)
- [x] `SubscriptionsViewData.swift` Foundation-only, no basename collision
- [x] Build GREEN (iPhone 17 Pro), 18 SubscriptionsViewData tests pass
- [x] FeaturesV10/Subscriptions/* untouched

## Self-Check: PASSED
- FOUND: ios/BudgetPlanner/Features/Management/SubscriptionsViewData.swift
- FOUND: ios/BudgetPlannerTests/Features/Management/SubscriptionsViewDataTests.swift
- FOUND: commit f2aa5f1
- FOUND: commit aafcf5b
