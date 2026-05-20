---
phase: 67-remediation-cleanup
plan: 05
subsystem: ios-networking-ui
tags: [ios, security, error-handling, sse-auth, dedup, P1-3, P1-5, R1]
wave: 2
depends_on: [67-03]
requires:
  - "67-03 final APIClient 401/403 semantics (strict logout, no per-call suppression)"
provides:
  - "APIError.userFacingRu + Error.userFacingRu — fixed-RU error mapper (no detail leak)"
  - "SSEClient split 401→logout / 403→logout mirroring REST"
  - "MutationErrorBanner — single shared dismissible banner (Section view + View modifier)"
  - "AccountPickerLogic.label as the single account-label source across editors"
  - "LocalNotifications single reschedule(subscriptionsV10:) helper"
affects:
  - "Any future view needing a user-facing error string (use userFacingRu)"
  - "67-07 (SavingsViewModel/GoalDetailViewModel — dead lastCreatedGoalId removal deferred there)"
tech-stack:
  added: []
  patterns:
    - "Fixed-RU-copy error mapping (raw error → #if DEBUG print only; IN-01 PII rule)"
    - "Shared SwiftUI ViewModifier/Section view for cross-screen banner dedup"
key-files:
  created:
    - ios/BudgetPlanner/Features/Common/MutationErrorBanner.swift
    - ios/BudgetPlannerTests/Networking/APIErrorMapperTests.swift
  modified:
    - ios/BudgetPlanner/Networking/APIError.swift
    - ios/BudgetPlanner/Networking/SSEClient.swift
    - ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift
    - ios/BudgetPlanner/Features/Management/SettingsView.swift
    - ios/BudgetPlanner/Features/Home/HomeView.swift
    - ios/BudgetPlanner/Features/Management/TemplateView.swift
    - ios/BudgetPlanner/Features/Management/CategoriesView.swift
    - ios/BudgetPlanner/Features/Management/AnalyticsView.swift
    - ios/BudgetPlanner/Features/Management/CategoryDetailScreen.swift
    - ios/BudgetPlanner/Features/AI/AIChatView.swift
    - ios/BudgetPlanner/Features/Savings/SavingsView.swift
    - ios/BudgetPlanner/Features/Savings/GoalDetailView.swift
    - ios/BudgetPlanner/Features/Savings/SavingsDepositSheet.swift
    - ios/BudgetPlanner/Features/Management/SubscriptionsView.swift
    - ios/BudgetPlanner/Domain/LocalNotifications.swift
decisions:
  - "SSE 403 also calls onUnauthenticated() — the AI chat stream is always authed (no skipAuth path), so 403 there is a genuine auth failure exactly like REST !skipAuth; mirrors 67-03."
  - "userFacingRu is intentionally distinct from errorDescription: errorDescription still interpolates detail for logs/dev; userFacingRu never does (UI-only)."
  - "Dead lastCreatedGoalId/clearLastCreatedGoalId left in place — they live on SavingsViewModel which 67-07 owns; removing here would create same-file ownership conflict (plan-directed defer)."
metrics:
  tasks_completed: 3
  files_created: 2
  files_modified: 15
  tests_total: 581
  tests_added: 14
  completed: 2026-05-20
---

# Phase 67 Plan 05: iOS Error-Leak + SSE Auth + Dedup Summary

Closed the iOS error-leak/auth/dedup cluster: an `APIError.userFacingRu` mapper that returns fixed Russian copy (never server detail), a split SSE 401/403 handler that logs out on both (mirroring the post-67-03 REST semantics), a single shared `MutationErrorBanner`, a unified account-label source, and a single `LocalNotifications.reschedule` helper.

## What Shipped

### P1-3 / R1 — APIError → fixed RU mapper (Task 1)
- Added `APIError.userFacingRu` (computed) returning fixed Russian copy per case, plus an `Error.userFacingRu` extension that routes `APIError` through it and collapses any other error to the generic «Что-то пошло не так».
- `.forbidden` / `.conflict` / `.unprocessable` / `.serverError` / `.decoding` map to generic/category copy and **never** surface the embedded server detail string (IN-01 / T-67-05-01).
- Replaced `error.localizedDescription` in all 8 in-scope views (TransactionEditor:save, SettingsViewModel:load/save, HomeView, TemplateView×2, CategoriesView×5, AnalyticsView, CategoryDetailScreen, AIChatView×4 incl. aligning the inline `.unauthorized` copy). Raw errors are now emitted only under `#if DEBUG print()`.
- Added `APIErrorMapperTests.swift` (14 tests): RU mapping per case + explicit assertions that forbidden/conflict/unprocessable/serverError detail strings do NOT leak, plus the non-APIError → generic path.

### P1-5 — SSE 401/403 split (Task 2)
- `SSEClient.AIChatAPI.stream` previously collapsed `401 || 403` into `.unauthorized` and never called `onUnauthenticated` → an expired token in chat failed silently with no re-auth.
- Now: **401** → `APIClient.shared.onUnauthenticated?()` + `throw .unauthorized`; **403** → `onUnauthenticated?()` + `throw .forbidden("")`. Both log out, mirroring the final post-67-03 REST `APIClient` (the AI stream is always authed, equivalent to REST `!skipAuth`). 429 branch unchanged.
- `APIClient.swift` was **not** touched (owned by 67-03).

### R1 — dedup (Task 3)
- **Account-label:** `SubscriptionEditor` (was `" · "` with trailing space — the drift) and `SavingsDepositSheet` now call `AccountPickerLogic.label(_:)`, the canonical `" ·<mask>"` source (TransactionEditor already did).
- **Mutation banner:** new `Features/Common/MutationErrorBanner.swift` (a `Section` view + `View.mutationErrorBanner(_:onDismiss:)` convenience). Adopted in SavingsView, GoalDetailView, SubscriptionsView; the 3 byte-identical local `mutationErrorBanner(_:)` methods deleted. Dismiss action injected so the shared view stays decoupled from the 67-07-owned view-models.
- **LocalNotifications:** deleted the dead legacy `reschedule(subscriptions: [SubscriptionDTO])` (grep confirmed zero callers); kept `reschedule(subscriptionsV10:)` with MSK / 09:00 fire logic intact. File now has exactly one `reschedule` func.

## Deviations from Plan

None — plan executed as written. All Rules 1–4 untriggered; no auth gates.

The only plan-directed *non-action* is the dead `lastCreatedGoalId` / `clearLastCreatedGoalId()` on `SavingsViewModel`: the plan (action step 4) explicitly defers their removal to **67-07** to avoid same-file ownership conflict. Confirmed still present and untouched here.

## Verification

- grep gate: 8 in-scope views → **0** `error.localizedDescription` assignments to UI. ✅
- `LocalNotifications` has exactly **1** `func reschedule`. ✅
- SSEClient: `401` and `403` branches both present, both call `onUnauthenticated`. ✅
- `APIClient.swift` diff vs HEAD~3 = empty (not modified). ✅
- Build + **full test suite GREEN**: 581 tests, 0 failures (includes new APIErrorMapperTests, run via `xcodebuild test` on iPhone 17 Pro sim). ✅
- swift-format applied to all touched/created files; `xcodegen generate` run after adding the 2 new files.

## Threat Surface

All three registered threats addressed:
- **T-67-05-01 (Info Disclosure):** userFacingRu fixed copy + DEBUG-only raw print; detail never surfaced. ✅
- **T-67-05-02 (EoP):** SSE 401/403 now invalidate session via onUnauthenticated. ✅
- **T-67-05-03 (Tampering, accepted):** pure refactors; behaviour preserved, covered by build + existing view tests.

No new threat surface introduced.

## Known Stubs

None.

## Self-Check: PASSED

- Created files exist: MutationErrorBanner.swift, APIErrorMapperTests.swift, APIError.swift (modified) ✅
- Commits exist: d2b907f (T1), 896815c (T2), 9489212 (T3) ✅
