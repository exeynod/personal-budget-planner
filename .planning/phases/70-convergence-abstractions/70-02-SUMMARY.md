---
phase: 70-convergence-abstractions
plan: 02
subsystem: ios-networking
tags: [business-date, msk-timezone, decoder, wire-date, R7, E2]
requires:
  - "APIClient .custom dateDecodingStrategy (the prior yyyy-MM-dd MSK heuristic / WR-05 band-aid)"
  - "APIClientDateDecodeTests MSK-midnight regression lock (Phase 67-07)"
provides:
  - "ios/BudgetPlanner/Networking/BusinessDate.swift — distinct wire-DATE value type carrying MSK-midnight semantics as a property of the type"
  - "All 6 wire-DATE DTO fields (+DepositResponseDTO.txDate) retyped to BusinessDate; audit timestamps stay Date"
  - "De-heuristified shared decoder (bare yyyy-MM-dd branch removed; ISO-8601 timestamp branches kept for audit Date)"
affects:
  - "ios/BudgetPlanner/Networking/BusinessDate.swift"
  - "ios/BudgetPlanner/Networking/APIClient.swift"
  - "ios/BudgetPlanner/Networking/DTO/{GoalDTO,SubscriptionV10DTO,TransactionDTO,CommonDTO,ManagementDTO,SavingsDTO}.swift"
  - "16 consumer files across both shells (Features/* + FeaturesV10/* + Domain/LocalNotifications)"
tech-stack:
  added: []
  patterns:
    - "domain value type over decoder heuristic: MSK-midnight semantics live in BusinessDate (self-decodes via singleValueContainer, unaffected by JSONDecoder.dateDecodingStrategy) instead of a format-detection branch in the shared decoder"
    - "Hashable keyed on MSK-midnight instant → stable Dictionary(grouping:by:) one-bucket-per-MSK-day analytics key (no fragmentation)"
    - ".date bridge for the audit-Date side of any mixed expression; direct BusinessDate Comparable/Equatable for same-type sorts/filters (no Date round-trip)"
key-files:
  created:
    - ios/BudgetPlanner/Networking/BusinessDate.swift
    - ios/BudgetPlannerTests/Networking/BusinessDateTests.swift
  modified:
    - ios/BudgetPlanner/Networking/APIClient.swift
    - ios/BudgetPlanner/Networking/DTO/GoalDTO.swift
    - ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift
    - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
    - ios/BudgetPlanner/Networking/DTO/CommonDTO.swift
    - ios/BudgetPlanner/Networking/DTO/ManagementDTO.swift
    - ios/BudgetPlanner/Networking/DTO/SavingsDTO.swift
    - ios/BudgetPlanner/Domain/LocalNotifications.swift
    - ios/BudgetPlanner/Features/Savings/{GoalDetailView,SavingsView,SavingsViewModel}.swift
    - ios/BudgetPlanner/Features/Management/{AnalyticsView,CategoryDetailScreen,SubscriptionsView}.swift
    - ios/BudgetPlanner/Features/Transactions/{TransactionsView,TransactionEditor}.swift
    - ios/BudgetPlanner/Features/Accounts/AccountDetailView.swift
    - ios/BudgetPlanner/FeaturesV10/Savings/{SavingsV10View,SavingsV10ViewModel}.swift
    - ios/BudgetPlanner/FeaturesV10/Accounts/{AccountDetailV10View,AccountDetailV10ViewModel,AccountsData}.swift
    - ios/BudgetPlanner/FeaturesV10/Analytics/{AnalyticsData,AnalyticsV10ViewModel}.swift
    - ios/BudgetPlanner/FeaturesV10/CategoryDetail/CategoryDetailView.swift
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsData.swift
    - ios/BudgetPlanner/FeaturesV10/Transactions/{TransactionsData,TransactionsV10View}.swift
    - ios/BudgetPlannerTests/Networking/APIClientDateDecodeTests.swift
    - ios/BudgetPlannerTests/Networking/DTO/GoalCreateRequestTests.swift
    - ios/BudgetPlannerTests/Features/Savings/{SavingsViewDataTests,SavingsViewModelTests}.swift
    - ios/BudgetPlannerTests/Features/Accounts/AccountDetailViewModelTests.swift
    - ios/BudgetPlannerTests/Features/PlanEditor/PlanEditorDataTests.swift
    - ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift
    - ios/BudgetPlannerTests/FeaturesV10/{AccountsDataTests,AnalyticsDataTests,TransactionsDataTests}.swift
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - "MSK-midnight is the canonical stored instant: BusinessDate.date == Europe/Moscow midnight of the represented calendar day; Comparable/Equatable/Hashable all derive from it, so two BusinessDates for the same MSK day are equal AND hash-equal (the property hotspot-b grouping depends on)."
  - "BusinessDate self-decodes from its own singleValueContainer string and self-encodes the MSK yyyy-MM-dd — it is independent of the shared JSONDecoder.dateDecodingStrategy, so removing the decoder's bare-date heuristic cannot change BusinessDate behavior."
  - "DepositResponseDTO.txDate retyped too (Rule 2): it is the same wire-DATE class but was absent from the plan's enumerated field list; left as Date it would have hit the now-removed decoder branch and failed to decode."
  - "Hotspot (b) read the day-of-month/label in UTC before (groupByWeek + barRows day label). Against a MSK-midnight instant a UTC read returns the PREVIOUS calendar day; switched both to Europe/Moscow so the label matches the MSK day the bucket represents. This is the one place where 'preserve exact behavior' meant fixing a latent UTC-vs-MSK skew that only surfaced once the day became explicitly MSK-anchored — the analytics grouping is now self-consistent."
  - "AccountsData.sumPeriodOps + AnalyticsData.groupByDay period bounds retyped to BusinessDate (not bridged to Date): the inclusive [periodStart, periodEnd] day-boundary is clearer and TZ-unambiguous as a same-type BusinessDate comparison."
metrics:
  duration: ~75m
  completed: 2026-05-21
  tasks: 3
  files: 38
---

# Phase 70 Plan 02: BusinessDate type for wire DATE fields (de-heuristify the decoder) Summary

Introduced a distinct `BusinessDate` value type for the iOS client's wire `DATE` (yyyy-MM-dd) business-date fields, separating them from audit-time `Date` timestamps and moving Europe/Moscow midnight semantics out of a decoder format-heuristic and into a property of the type. All 6 enumerated wire-DATE fields (plus one unenumerated `DepositResponseDTO.txDate`) are retyped, the shared `APIClient` decoder's `yyyy-MM-dd → MSK` band-aid (WR-05) is removed, and every mixed `Date`/`BusinessDate` site across both shells (~98 references / 27 files) is reconciled. Both shells build; the full iOS suite is 615 green (609 baseline + 6 `BusinessDateTests`); the WR-05 MSK-midnight contract is preserved.

## BusinessDate design

`struct BusinessDate: Codable, Equatable, Hashable, Comparable`:
- Canonical stored instant `let date: Date` = **MSK (Europe/Moscow) midnight** of the represented calendar day (e.g. `2027-01-01` → `2027-01-01 00:00 MSK` == `2026-12-31 21:00 UTC`).
- `init(from:)` decodes from a **singleValueContainer** `String` via a DateFormatter pinned to Europe/Moscow + en_US_POSIX `yyyy-MM-dd` — so it is **unaffected by `JSONDecoder.dateDecodingStrategy`**.
- `encode(to:)` symmetrically writes the MSK `yyyy-MM-dd` string (replaces the old `GoalCreateRequest` hand-roll).
- `var date: Date` bridge for SwiftUI `DatePicker` / `Calendar` reads; `init(_ date: Date)` normalizes a picked Date to its MSK calendar-day midnight for encode.
- `Comparable` / `Equatable` / `Hashable` all derive from the MSK-midnight instant → same-MSK-day instances are equal and hash-equal (the stable `Dictionary(grouping:by:)` key hotspot (b) needs).

## Fields retyped

| DTO field | Was | Now | File |
|---|---|---|---|
| `GoalDTO.due` / `GoalCreateRequest.due` | `Date?` | `BusinessDate?` | GoalDTO.swift |
| `SubscriptionV10DTO.nextChargeDate` / `SubscriptionV10UpdateRequest.nextChargeDate` | `Date` / `Date?` | `BusinessDate` / `BusinessDate?` | SubscriptionV10DTO.swift |
| `SubscriptionDTO.nextChargeDate` | `Date` | `BusinessDate` | ManagementDTO.swift |
| `ActualDTO.txDate` / `ActualV10DTO.txDate` | `Date` | `BusinessDate` | TransactionDTO.swift |
| `PlannedDTO.plannedDate` | `Date?` | `BusinessDate?` | TransactionDTO.swift |
| `PeriodDTO` / `BalanceResponse` / `TrendPoint` `.periodStart/.periodEnd` | `Date` | `BusinessDate` | CommonDTO.swift, ManagementDTO.swift |
| `DepositResponseDTO.txDate` (Rule 2 — unenumerated) | `Date` | `BusinessDate` | SavingsDTO.swift |

Audit timestamps (`createdAt`, `closedAt`, `onboardedAt`, `generatedAt`, `lastSeenAt`) and String-typed legacy/request fields (`SubscriptionCreate/Update.nextChargeDate`, `ActualCreate/Update.txDate`, `Planned*.plannedDate`, `OnboardingGoal.due`) left untouched.

`APIClient.swift`: the `.custom` `dateDecodingStrategy` lost the bare `yyyy-MM-dd → MSK` branch; kept the 3 timestamp branches (`withFractionalSeconds`, plain ISO-8601, no-zone `yyyy-MM-dd'T'HH:mm:ss` fallback) that audit `Date` still needs.

## Mixed-type fixes (esp. the two hotspots)

- **Hotspot (a) — TransactionsView.swift:158** (and V10 twins in TransactionsData / CategoryDetailView / AccountDetailView / TransactionsV10View / AccountDetailV10View): `lhs.createdAt ?? lhs.txDate` mixes audit `Date?` with `BusinessDate`. Bridged to `lhs.createdAt ?? lhs.txDate.date`. The bridged instant is the same MSK midnight the decoder produced → sort order unchanged.
- **Hotspot (b) — AnalyticsData.swift groupByDay/groupByWeek + AnalyticsV10ViewModel barRows**:
  - Range filter + `Dictionary(grouping:by:{ $0.txDate })`: `periodStart/periodEnd` retyped to `BusinessDate`, grouping key is `BusinessDate` (Hashable on MSK day) → one bucket per MSK day, no fragmentation, inclusive boundary unchanged.
  - `cal.component(.day, from: txDate)` in `groupByWeek` and the `"d"` day-label formatter in `barRows`: switched from **UTC → Europe/Moscow** so the day read matches the MSK day (a UTC read against a MSK-midnight instant returns the previous calendar day).
  - Behaviorally covered by the existing `AnalyticsDataTests` groupByDay/groupByWeek cases (now wired through BusinessDate) — buckets land on the expected MSK days and weeks 1..5 partition unchanged.
- **LocalNotifications.swift:34** (threat T-70-02-01, fire-dates): `nextChargeDate.date` feeds the Moscow-calendar trigger computation — fire-date arithmetic unchanged.
- DatePicker/Calendar/formatter reads bridged with `.date` (SavingsView, GoalDetailView, SavingsV10View, SubscriptionsView/Data, CategoryDetailScreen, AnalyticsView, AccountDetailV10ViewModel, TransactionEditor). DatePicker → wire `due` flows wrap with `BusinessDate(init)` (SavingsViewModel, SavingsV10ViewModel).

## Build + test results

- App target: **BUILD SUCCEEDED** (both shells).
- Full suite: **615 tests, 0 failures** (609 baseline + 6 BusinessDateTests). MSK-midnight `APIClientDateDecodeTests` + `GoalCreateRequestTests` MSK-encode green; analytics grouping/sort/notification fire-date paths green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] DepositResponseDTO.txDate retyped to BusinessDate**
- **Found during:** Task 2 (Networking-wide field audit beyond the enumerated set).
- **Issue:** `DepositResponseDTO.txDate` (POST /savings/deposit response) is the same wire-DATE class as the enumerated fields but was not in `files_modified`. Left as `Date`, it would have routed through the now-removed decoder branch and failed to decode at runtime.
- **Fix:** retyped to `BusinessDate`.
- **Files modified:** ios/BudgetPlanner/Networking/DTO/SavingsDTO.swift
- **Commit:** 0f671df

**2. [Rule 1 - Behavioral correctness] groupByWeek + analytics day-label read switched UTC → MSK**
- **Found during:** Task 2 hotspot (b) behavioral audit.
- **Issue:** `groupByWeek` pinned its calendar to UTC and `barRows` formatted the day label in UTC. Once `txDate` is an explicit MSK-midnight `BusinessDate`, a UTC day-component read returns the previous calendar day — a latent UTC-vs-MSK skew. Left unfixed, weeks/day-labels would shift by one day.
- **Fix:** read the day component / format the label in Europe/Moscow so analytics grouping is self-consistent at the MSK day; verified by the existing groupByWeek week-1..5 assertions staying green.
- **Files modified:** AnalyticsData.swift, AnalyticsV10ViewModel.swift
- **Commit:** 0f671df

**3. [Rule 1 - Test fidelity] tx_date test fixtures emit the real wire shape (bare MSK yyyy-MM-dd)**
- **Found during:** Task 3 full-suite run (TransactionsViewModelTests fatal decode error).
- **Issue:** Several fixtures formatted `tx_date` as a **full ISO timestamp**, which the old timestamp-tolerant decoder accepted but the real backend never emits (`tx_date` is Pydantic `date` → bare `yyyy-MM-dd`). BusinessDate correctly rejects timestamp strings.
- **Fix:** fixtures now format `tx_date` as bare MSK `yyyy-MM-dd` (`created_at` stays an ISO timestamp). The `groupByDay` nil-`createdAt` fallback test was rewritten to reflect real wire semantics: `tx_date` has no time, so same-day nil-`createdAt` rows tie — distinct days are used to exercise the day-level txDate fallback ordering.
- **Files modified:** TransactionsViewModelTests, TransactionsDataTests, AccountDetailViewModelTests, PlanEditorDataTests
- **Commit:** ec833e9

## Deferred Issues

- **GeneratedDTO.swift header comment is stale.** The Phase-69 codegen output (`ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift`) carries ~26 `Date`-typed wire-DATE fields and a header claiming it decodes through "the existing APIClient ... MSK-pinned date strategy" — which no longer exists. No live code decodes any `Gen.*` DTO with a bare-date field (verified: zero `decode(Gen.…)` sites; `Gen.*` is referenced only as type-alias/comment anchors until the 69-05 consumer migration). It is regenerated by `make gen-dto` and is explicitly out of this plan's hand-edit scope, so it was left untouched. When 69-05 migrates consumers onto `Gen.*`, the codegen template should emit `BusinessDate` for wire-DATE fields (and the header comment should drop the MSK-strategy claim).

## Threat Flags

None — no new network endpoints, auth paths, file access, or trust-boundary schema changes. The change is a pure client-side type refinement; the same `yyyy-MM-dd` strings cross the wire (T-70-02-02 accept). T-70-02-01 (timezone tampering) and T-70-02-03 (grouping fragmentation) are mitigated as planned: MSK pinned in one type + regression-locked by APIClientDateDecodeTests/BusinessDateTests, grouping keyed on MSK-midnight Hashable and covered by AnalyticsDataTests.

## Self-Check: PASSED
