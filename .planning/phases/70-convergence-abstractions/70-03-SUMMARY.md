---
phase: 70-convergence-abstractions
plan: 03
subsystem: ios-networking
tags: [error-handling, auth-policy, injectable-strategy, R7, E1, regression-gate]
requires:
  - "APIClient.rawRequest hardcoded status->domain-error + logout switch (pre-70-03)"
  - "APIClientForbiddenTests 67-03/67-05 auth-semantics regression lock (Phase 67-07)"
  - "AISuggestCategoryAPI silent-nil contract (402 require_pro swallowed to nil, 67-05)"
provides:
  - "ios/BudgetPlanner/Networking/ErrorHandling.swift — injectable status->(APIError, logout:Bool) strategy; ErrorDecision enum; default policy byte-equivalent to the old switch; composable tolerating(_:) example"
  - "APIClient.errorPolicy (var, init-injectable, default .default); inline switch removed; 429 Retry-After kept inline upstream; onUnauthenticated fired only on logout==true"
  - "ErrorPolicyTests — full status->error+logout matrix (401/402/403/404/409/422/default + 2xx, no 429) + live-client 402-no-logout assertion"
affects:
  - "ios/BudgetPlanner/Networking/ErrorHandling.swift"
  - "ios/BudgetPlanner/Networking/APIClient.swift"
  - "ios/BudgetPlannerTests/Networking/ErrorPolicyTests.swift"
tech-stack:
  added: []
  patterns:
    - "injectable error-policy strategy: a typed ErrorHandling struct (status,data,skipAuth,decodeDetail)->ErrorDecision replaces the inline switch + the per-call auth-Bool class of bug (suppressForbiddenHandler). One typed surface owns the logout decision."
    - "429-split: the 429 Retry-After read stays in APIClient (needs the HTTPURLResponse header the policy signature deliberately omits); the policy is header-free and never sees 429 — keeps the auth matrix exact + unit-testable in isolation."
    - "side-effect-free policy: ErrorHandling returns logout:Bool; APIClient owns the onUnauthenticated callback invocation (policy is a pure mapping)."
key-files:
  created:
    - ios/BudgetPlanner/Networking/ErrorHandling.swift
    - ios/BudgetPlannerTests/Networking/ErrorPolicyTests.swift
  modified:
    - ios/BudgetPlanner/Networking/APIClient.swift
decisions:
  - "402-no-logout live-client assertion added to ErrorPolicyTests (NOT to APIClientForbiddenTests) so the 67-03/67-05 regression lock stays byte-identical UNMODIFIED while still gaining explicit live-client 402 coverage."
  - "ErrorDecision custom Equatable compares APIError.errorDescription + logout (APIError is not Equatable; it carries Error/associated payloads) — sufficient to pin the matrix."
  - "tolerating(_:) composable variant added as an illustrative example only; deliberately NOT wired anywhere this phase (AISuggest needs no custom policy — default 402->serverError(no logout) already yields the correct silent-nil)."
metrics:
  duration_min: 3
  completed_date: 2026-05-21
  tasks: 3
  files: 3
  tests_added: 11
  suite_total: 626
---

# Phase 70 Plan 03: ErrorHandling Injection (E1/R7) Summary

Extracted APIClient's hardcoded status→domain-error + logout switch into an injectable `ErrorHandling` strategy (`ErrorDecision` enum + `map` closure), killing the per-call auth-Bool (`suppressForbiddenHandler`) class of bug at the root while preserving the 67-03/67-05 auth semantics byte-for-byte — APIClientForbiddenTests passed UNMODIFIED.

## What Was Built

- **`ErrorHandling.swift`** — `ErrorDecision { case success; case fail(APIError, logout: Bool) }` and `struct ErrorHandling { var map: (status, data, skipAuth, decodeDetail) -> ErrorDecision }`. `static let default` reproduces the old switch exactly. `static func tolerating(_:)` is an illustrative composable variant (not wired). The policy is a pure mapping — it returns `logout: Bool` and never invokes `onUnauthenticated` itself.
- **`APIClient`** — gained `var errorPolicy: ErrorHandling = .default` (init-injectable). `rawRequest` now handles **429 inline first** (Retry-After off the HTTPURLResponse), then delegates every other status to `errorPolicy.map(...)`; on `.fail(error, logout)` it fires `onUnauthenticated?()` only when `logout == true`, then throws. `skipAuth` is passed through as the single transport parameter the policy reads.
- **`ErrorPolicyTests`** — pins the full matrix (2xx, 401×skipAuth, 403×skipAuth, 402, 404, 409, 422, 500, tolerating) + one **live-client** 402-no-logout assertion through the real APIClient via URLProtocolStub.

## ErrorHandling Design (as implemented)

Default policy mapping (byte-equivalent to the pre-70-03 switch):

| status | decision | logout |
|--------|----------|--------|
| 2xx | `.success` | — |
| 401 | `.unauthorized` | **true** (always, even skipAuth — WR-02) |
| 403 `!skipAuth` | `.forbidden(detail)` | **true** (67-03 strict) |
| 403 `skipAuth` | `.forbidden(detail)` | false (AI-path) |
| 402 (require_pro) | `.serverError(402, detail)` (default branch) | false (67-05 silent-nil) |
| 404 | `.notFound` | false |
| 409 | `.conflict(detail)` | false |
| 422 | `.unprocessable(detail)` | false |
| default | `.serverError(status, detail)` | false |
| **429** | **handled inline in APIClient — never reaches the policy** | — |

## Regression Gate — confirmed

- **APIClientForbiddenTests ran UNMODIFIED** (git status: 0 changes) and green: 401 logout=1, 403 !skipAuth logout=1, 403 skipAuth logout=0, 200 logout=0. Byte-equivalence of the default policy proven.
- **New 402-no-logout assertion** (`test_live_402_requirePro_serverError_doesNotLogOut`) green: live APIClient maps 402→`.serverError(402, _)` with `logoutCount == 0`. Placed in ErrorPolicyTests so the 67-03 lock stays byte-identical.
- **429 split**: 429 Retry-After parsing stays inline in APIClient (before delegation); the policy owns only 2xx + 401/402/403/404/409/422/default. Grep gate confirmed `errorPolicy` present, `rateLimited/Retry-After/retryAfter` present, `suppressForbidden` absent.

## Build + Test Results

- App shell `xcodebuild build`: **Build Succeeded** (dual shell — MainShell + V10MainShell share the one BudgetPlanner app target).
- Full iOS suite: **626 tests, 0 failures** (615 baseline + 10 ErrorPolicyTests + 1 live-402).
- AISuggest silent-nil path unaffected (402→serverError→swallowed to nil; no logout).

## Deviations from Plan

None — plan executed exactly as written. The 402 live assertion was placed in ErrorPolicyTests (the plan explicitly permitted "in ErrorPolicyTests or a small addition here") to keep APIClientForbiddenTests UNMODIFIED.

## Commits

- `4adada6` feat(70-03): add injectable ErrorHandling strategy + policy-matrix tests
- `be7b172` refactor(70-03): delegate APIClient status mapping to injectable errorPolicy
- `01d092e` test(70-03): live-client 402-no-logout assertion (67-05 require_pro gate)

## Self-Check: PASSED

- FOUND: ios/BudgetPlanner/Networking/ErrorHandling.swift
- FOUND: ios/BudgetPlanner/Networking/APIClient.swift
- FOUND: ios/BudgetPlannerTests/Networking/ErrorPolicyTests.swift
- FOUND commits: 4adada6, be7b172, 01d092e
- APIClientForbiddenTests UNMODIFIED (git status: 0 changes); full suite 626 green.
