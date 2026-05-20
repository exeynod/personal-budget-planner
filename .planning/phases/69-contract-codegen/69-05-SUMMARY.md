---
phase: 69-contract-codegen
plan: 05
subsystem: ios-networking
tags: [ios, dto, contract, codegen, migration, test-fixtures]
requires: [69-03]
provides:
  - ios-read-dtos-aligned-to-generated-wire-contract
  - category-actual-tag-field
  - userdto-income-cents
affects:
  - ios/BudgetPlanner/Networking/DTO/*
  - ios/BudgetPlannerTests/**
tech-stack:
  added: []
  patterns:
    - "iOS read-DTOs mirror the generated Gen.* wire contract field-for-field; required/optional split follows the OpenAPI required set"
key-files:
  created: []
  modified:
    - ios/BudgetPlanner/Networking/DTO/CategoryV10DTO.swift
    - ios/BudgetPlanner/Networking/DTO/AccountDTO.swift
    - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
    - ios/BudgetPlanner/Networking/DTO/CommonDTO.swift
    - ios/BudgetPlanner/FeaturesV10/AddSheet/AccountPickerSheet.swift
    - ios/BudgetPlannerTests/FeaturesV10/PlanDataTests.swift
    - ios/BudgetPlannerTests/FeaturesV10/AnalyticsDataTests.swift
    - ios/BudgetPlannerTests/FeaturesV10/HomeDataTests.swift
    - ios/BudgetPlannerTests/FeaturesV10/AccountsDataTests.swift
    - ios/BudgetPlannerTests/FeaturesV10/TransactionsDataTests.swift
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorViewModelTests.swift
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorDataTests.swift
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanRowEditorViewModelTests.swift
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorIntegrationTests.swift
    - ios/BudgetPlannerTests/Features/Accounts/AccountDetailViewModelTests.swift
    - ios/BudgetPlannerTests/Features/Accounts/AccountsViewModelTests.swift
    - ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift
    - ios/BudgetPlannerTests/Features/Transactions/TransactionEditorAccountTests.swift
    - ios/BudgetPlannerTests/Features/Savings/SavingsViewModelTests.swift
    - ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift
decisions:
  - "Per-DTO lower-churn migration: rewrote handwritten read-DTOs to mirror Gen.* field-for-field (required/optional corrected, tag/incomeCents added, stubs removed) rather than typealias-to-Gen — a raw typealias would force massive consumer churn (nested enums, defaulted-field optionality, Identifiable) and violate the zero-regression gate."
  - "Required vs optional follows the OpenAPI required set: Category code/ord/createdAt and Account createdAt -> non-optional; Category planCents/rollover/paused kept non-optional-with-default (consumer ergonomics, drift-report-blessed); Actual createdAt kept Optional (consumers depend on createdAt ?? txDate)."
metrics:
  duration: ~40m
  completed: 2026-05-21
---

# Phase 69 Plan 05: iOS read-DTO migration onto generated contract Summary

iOS read-DTOs (Category/Account/Actual/User) realigned to the generated `Gen.*` wire contract — pending-Phase-22 stubs removed, `tag`/`incomeCents` added, and 14 test-fixture files fixed to satisfy the now-required fields; full iOS suite stays 609/0.

## What was built

- **CategoryV10DTO** rewritten to mirror `Gen.CategoryRead`: `code`/`ord`/`createdAt` are now non-optional (plain `decode`, stubs + `?? default` fallbacks removed); `planCents`/`rollover`/`paused` stay non-optional with a server-default decode fallback; `parentId` stays optional; **`tag` added** (new `CategoryTag` enum: personal|business|mixed). Obsolete "pending Phase 22 schema / not yet on the wire" doc comments deleted. `CategoryV10UpdateRequest` (write payload) + `CategoryRollover` enum untouched.
- **AccountDTO.createdAt** → non-optional (required on `AccountRead`; no consumer reads it as optional).
- **ActualV10DTO**: added `tag: CategoryTag?` (Phase 36). `createdAt` kept Optional intentionally — every list/sort consumer falls back via `createdAt ?? txDate`; documented as the drift-report "keep" choice.
- **UserDTO**: added `incomeCents: Int?` (BE-01). `MeV10Response` already carried `incomeCents` + `String? onboardedAt`, so it needed no change.
- **SubscriptionV10DTO**: kept flat (`categoryId` only, no nested `category`) — matches `Gen.SubscriptionReadV10` minus the nested object; adopting the nested `category` would break the "v10-ext-missing" decode test and all flat-id consumers. No stub comments existed to remove.
- **14 test-fixture files** updated to supply valid values for now-required fields (`created_at` → `"2026-05-09"` + a `yyyy-MM-dd` date strategy where missing; `code` → slug default `"food"`; `ord` → `"01"`), plus 5 `AccountDTO(...)` memberwise call sites changed from `createdAt: nil` to a real `Date`.

## Migration strategy decision (must_have #1 nuance)

The plan allowed "typealias OR delete-and-point-consumers — pick the lower-churn option per DTO and document it." A raw `typealias CategoryV10DTO = Gen.CategoryRead` was rejected because the generated type uses nested enums (`Gen.CategoryRead.Kind/Rollover/Tag`) and keeps `planCents`/`rollover`/`paused` Optional (fixture-safety, per drift-report) — consumers across ~20 files use `cat.planCents` (Int math), `!cat.paused` (Bool), `c.rollover == .misc` (non-optional). A typealias would force that churn into write-deferred consumers and risk regression. Instead each read-DTO was rewritten to mirror `Gen.*` field-for-field with the correct required/optional split, reusing the shared `CategoryKind`/`CategoryRollover`/`ActualKindV10` enums, and each file doc-links the canonical `Gen.*` type. This satisfies the intent (one wire-truth, stubs killed, transport intact) with zero behavioral regression.

## Verification

- `xcodegen generate`: clean (no file add/remove; `project.pbxproj` unchanged).
- iOS **build**: Build Succeeded (iPhone 17 Pro). No warnings in any touched file.
- iOS **test**: `Executed 609 tests, with 0 failures` — exact Phase 68 baseline, zero regression.
- Gate `grep -niE 'pending|schema update|not yet on the wire' CategoryV10DTO.swift` → 0. (A broad cross-file grep surfaced 2 matches; both are false positives — the substring "pending" inside `aiS`**`pending`**`CapCents`, not stub comments.)
- `tag` present on Category + Actual; `incomeCents` on UserDTO — confirmed.
- APIClient transport + custom JSONDecoder: untouched (not in the diff).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 9 additional fixture/init sites beyond the plan's flagged 5**
- **Found during:** Task 2/Task 3 (zero-regression scan + build).
- **Issue:** The plan flagged 5 fixture files, but the now-stricter DTOs are decoded/constructed in more sites that would throw or fail to compile: `PlanEditorViewModelTests`, `PlanEditorDataTests`, `PlanRowEditorViewModelTests`, `PlanEditorIntegrationTests`, `AccountDetailViewModelTests`, `AccountsViewModelTests`, `TransactionsViewModelTests`, `TransactionEditorAccountTests`, plus 4 `AccountDTO(... createdAt: nil)` memberwise inits (`AccountPickerSheet` preview, `SavingsViewModelTests`, `SubscriptionsViewModelTests`, `TransactionEditorAccountTests`).
- **Fix:** Applied the same required-field rule (valid `created_at`/`code`/`ord` + date strategy) to all fixtures; changed memberwise `createdAt: nil` to `Date(timeIntervalSince1970: 0)`. The plan blocker explicitly anticipated "and any others the drift-report flags" — the zero-regression gate mandates fixing all.
- **Files modified:** the 14 test files + `AccountPickerSheet.swift` listed above.
- **Commit:** 16dcef7

### Documented choices (not deviations)

- **ActualV10DTO.createdAt kept Optional** (not tightened): consumers use `createdAt ?? txDate`; tightening would force wide consumer churn + regression. The drift-report explicitly permits "keep or tighten." Its `created_at: null` fixtures therefore need no change.
- **SubscriptionV10DTO kept flat** (no nested `category`): preserves all flat-`categoryId` consumers and the ext-missing decode test.

## Known Stubs

None. The "pending Phase 22 schema" stubs targeted by this plan were removed; no new placeholder data introduced.

## Self-Check: PASSED

- Files exist: CategoryV10DTO.swift, AccountDTO.swift, TransactionDTO.swift, CommonDTO.swift — all present and modified.
- Commits exist: e2271af (Task 1), 16dcef7 (Task 2/3) — both in `git log`.
- iOS build + 609/0 test suite green.
