---
phase: 70-convergence-abstractions
verified: 2026-05-21T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none (initial verification)
---

# Phase 70: Convergence & Abstractions (R3/R6/R7) Verification Report

**Phase Goal:** Поверх стабильного codegen-контракта — свести legacy/V10 API (R3), извлечь общий доменный слой iOS чтобы два шелла не дрейфовали (R6), ввести инъектируемые cross-cutting абстракции (R7). Решение владельца R6: ОСТАВИТЬ ОБА ШЕЛЛА — извлечь общий слой, схождение на уровне API/DTO, НЕ шеллов.
**Verified:** 2026-05-21
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Legacy enums `@available(*, deprecated)`; equivalent call-sites migrated to V10; non-equivalent ticketed; debt-registry in `.planning/`; both shells work; build w/o new warnings-as-errors | ✓ VERIFIED | All 5 legacy targets carry `@available(*, deprecated, message:)` pointing at canonical V10 + DEBT ticket; registry exists (97 lines, 5 tickets); no shell/View deleted; `** BUILD SUCCEEDED **`; no warnings-as-errors flags |
| 2 | ≥1 iOS domain (Subscriptions) on shared VM/Data layer consumed by BOTH shells; behavior identical; pattern set | ✓ VERIFIED | `Domain/Subscriptions/SubscriptionsDomain.swift` (177L) + `SubscriptionsStore.swift` (244L) consumed by v06 VM (in `SubscriptionsView.swift`) and V10 VM (`SubscriptionsV10ViewModel.swift`); per-shell variants doc-commented; UI byte-identical per tests |
| 3 | APIClient has NO per-call auth flags (error-policy injectable); date-decode has NO format heuristic (BusinessDate introduced) | ✓ VERIFIED | `suppressForbidden` GONE; `errorPolicy: ErrorHandling` injected (init-param); bare `yyyy-MM-dd` heuristic branch removed from decoder; `BusinessDate.swift` exists; GeneratedDTO has 27 BusinessDate fields |
| 4 | Full test-suites of affected stacks green | ✓ VERIFIED | `Executed 639 tests, with 0 failures` → `** TEST SUCCEEDED **`; all affected suites green |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/LEGACY-V10-DEBT-REGISTRY.md` | Per-route audit + tickets | ✓ VERIFIED | 97 lines; audit summary table + 5 DEBT-70-* tickets (ME/CAT/ACT/SUB/CATW) + comment-debt index |
| `AuthAPI.swift` | `@available(deprecated)` on MeAPI + CategoriesAPI | ✓ VERIFIED | Both enums deprecated, messages name MeV10API/CategoriesV10API + ticket id |
| `ManagementAPI.swift` | deprecated SubscriptionsAPI | ✓ VERIFIED | `enum SubscriptionsAPI` deprecated (DEBT-70-SUB) |
| `TransactionsAPI.swift` | deprecated ActualAPI.create/.update + CategoriesWriteAPI; `.delete` kept | ✓ VERIFIED | `.create`+`.update` deprecated; `.delete` intentionally NOT deprecated (canonical-shared, doc-commented); CategoriesWriteAPI deprecated |
| `Domain/Subscriptions/SubscriptionsDomain.swift` | shared compute | ✓ VERIFIED | 177L; activeCount/isPosted/isValidDraft + named *V10/*V06 variants |
| `Domain/Subscriptions/SubscriptionsStore.swift` | shared @Observable store + injectable seam | ✓ VERIFIED | 244L; `API.live` seam → SubscriptionsV10API |
| `Networking/ErrorHandling.swift` | injectable error policy | ✓ VERIFIED | exists; ErrorDecision/ErrorHandling |
| `Networking/BusinessDate.swift` | MSK-pinned wire-DATE type | ✓ VERIFIED | exists |
| `Generated/GeneratedDTO.swift` | date fields → BusinessDate | ✓ VERIFIED | 27 BusinessDate fields (txDate/periodStart/periodEnd/nextChargeDate) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| v06 SubscriptionsViewModel | SubscriptionsStore + Domain | `private let store`, `store.load/post/...`, `SubscriptionsDomain.*` | ✓ WIRED | thin adapter, delegates to store |
| V10 SubscriptionsV10ViewModel | SubscriptionsStore + Domain | `private let store`, `SubscriptionsDomain.sortV10/...` | ✓ WIRED | thin adapter (loadsCategoriesAccounts: false) |
| APIClient | errorPolicy | `errorPolicy.map(http.statusCode, data, skipAuth, ...)` | ✓ WIRED | injectable, side-effect-free |
| AppRouter | both shells | `MainShell()` / `V10MainShell()` | ✓ WIRED | theme toggle selects shell |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| SubscriptionsStore | subscriptions/categories/accounts | `API.live` → `SubscriptionsV10API.list/...` | Yes (real V10 endpoint calls) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| iOS app builds (both shells, single target) | `xcodebuild build -scheme BudgetPlanner` | `** BUILD SUCCEEDED **` | ✓ PASS |
| Full iOS suite green | `xcodebuild test -scheme BudgetPlanner` | `Executed 639 tests, with 0 failures` → `** TEST SUCCEEDED **` | ✓ PASS |
| Auth regression gate | APIClientForbiddenTests (unmodified) | 4/4 passed (401 logout / 403!skipAuth logout / 403 skipAuth no-logout / 200 no-logout) | ✓ PASS |
| Error-policy matrix | ErrorPolicyTests | 11/11 passed incl. live 402-require_pro-no-logout | ✓ PASS |
| BusinessDate contract | BusinessDateTests | passed | ✓ PASS |
| Shared compute/store | SubscriptionsDomainTests + SubscriptionsStoreTests + SubscriptionsViewModelTests (unmodified) | all passed | ✓ PASS |
| Contract sync guard | `bash contract/check_contract_sync.sh --dump=skip` | `OK — generated contract types are in sync`; exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| R3 | 70-01 | API convergence: deprecate legacy enums, ticket non-equivalent | ✓ SATISFIED | 5 deprecations + registry |
| R6 | 70-04, 70-05 | Shared iOS domain layer for Subscriptions, both shells | ✓ SATISFIED | SubscriptionsDomain + SubscriptionsStore consumed by both VMs |
| R7 | 70-02, 70-03 | ErrorHandling injection (E1) + BusinessDate (E2) | ✓ SATISFIED | errorPolicy injected; BusinessDate type + de-heuristified decoder |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (test logs) | — | `StubError()` log lines | ℹ️ Info | Intentional negative-path test stubs (SubscriptionsStore/Savings); all owning tests pass — NOT a stub of production code |

### Notes on judgment calls

- **`skipAuth` parameter retained:** Criterion 3 says "NO per-call auth flags". The root-fix target named in the spec was the `suppressForbiddenHandler`/`suppressForbidden` class — that is GONE. `skipAuth` survives as a single transport parameter the (side-effect-free) policy reads to decide 403 logout vs no-logout; it is documented in-code as the deliberate seam and exercised by APIClientForbiddenTests + ErrorPolicyTests. This matches the spec's literal check ("no `suppressForbidden`") and the plan's stated scope. Not a gap.
- **Residual `"yyyy-MM-dd'T'HH:mm:ss"` formatter:** This is a TIMESTAMP no-zone fallback branch, not the date-only heuristic. The bare `"yyyy-MM-dd"` business-date heuristic (WR-05 band-aid) was removed; wire DATE fields now self-decode via `BusinessDate`. Spec's check ("bare yyyy-MM-dd branch GONE") satisfied — `grep '"yyyy-MM-dd"'` returns nothing.
- **v06 `SubscriptionsViewModel`:** Lives co-located in `Features/Management/SubscriptionsView.swift` (class `SubscriptionsViewModel`), not a standalone `SubscriptionsViewModel.swift`. Spec referenced it by class path; class exists and consumes the shared layer. Not a gap.
- **Deletions:** `git log --diff-filter=D` for the phase shows exactly the 2 duplicate compute files (SubscriptionsViewData, SubscriptionsData) + 2 old test files — no shell or View deleted, honoring the keep-both-shells decision.

### Gaps Summary

None. All four roadmap success criteria are met with hard gate evidence: iOS build succeeds for the single target carrying both MainShell + V10MainShell with no warnings-as-errors; the full 639-test suite passes (incl. the auth-regression and error-policy gates); legacy enums are deprecated with a 5-ticket debt registry while both shells remain intact; the Subscriptions domain runs on a shared Domain+Store consumed by both shells' VMs; APIClient has no `suppressForbidden` flag (injectable errorPolicy) and the date heuristic is replaced by `BusinessDate`; and the contract sync guard passes.

---

_Verified: 2026-05-21_
_Verifier: Claude (gsd-verifier)_
