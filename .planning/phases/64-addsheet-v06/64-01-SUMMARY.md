---
phase: 64-addsheet-v06
plan: 01
subsystem: ui
tags: [ios, swiftui, transaction-editor, account-picker, dto, encodeIfPresent]

# Dependency graph
requires:
  - phase: 60-accounts-v06
    provides: AccountDTO + AccountsAPI.list (GET /api/v1/accounts, primary-first)
  - phase: 25-home-tx-add
    provides: ActualCreateRequest.accountId (encodeIfPresent) + ActualV10 wire surface
provides:
  - Optional «Счёт списания» account picker in TransactionEditor for actual modes
  - ActualUpdateRequest.accountId field (encodeIfPresent, additive wire contract)
  - AccountPickerLogic pure helpers (defaultAccountId, label) — reusable single source of truth
affects: [64-addsheet-v06 wave-2 (AI category hint), transactions, accounts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Editor-internal data load via .task (no new call-site param)"
    - "Pure-logic extraction (enum static funcs) for struct-View testability"
    - "encodeIfPresent additive wire field mirroring sibling request DTO"

key-files:
  created:
    - ios/BudgetPlanner/Features/Transactions/AccountPickerLogic.swift
    - ios/BudgetPlannerTests/Features/Transactions/TransactionEditorAccountTests.swift
    - ios/BudgetPlannerTests/Networking/DTO/ActualUpdateRequestTests.swift
  modified:
    - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
    - ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift

key-decisions:
  - "Account picker section hidden when accounts empty (graceful) — load failure does not block save"
  - "loadAccounts catch uses print() only, no error banner — account is optional (T-64-01-02 accepted)"
  - "editActual: legacy ActualDTO has no accountId → default primary ?? first; preselect-from-DTO N/A"
  - "Default-account + label logic extracted to AccountPickerLogic.swift so struct-View logic is unit-testable"

patterns-established:
  - "Pure-helper enum (AccountPickerLogic) shared between SwiftUI View and XCTest"
  - "Additive optional wire field via custom encode(to:) + encodeIfPresent (mirrors ActualCreateRequest)"

requirements-completed: [ADD-V10-04]

# Metrics
duration: 4min
completed: 2026-05-20
---

# Phase 64 Plan 01: Account Picker Summary

**Optional «Счёт списания» picker added in-place to TransactionEditor (actual modes only) loading accounts via AccountsAPI.list in .task with primary ?? first default; accountId flows to ActualCreate/UpdateRequest via encodeIfPresent — no call-site or public-API change.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-20T14:20:25Z
- **Completed:** 2026-05-20T14:24:51Z
- **Tasks:** 3
- **Files modified:** 5 (2 modified, 3 created)

## Accomplishments
- `ActualUpdateRequest` extended with `accountId: Int? = nil` + custom `encode(to:)` (encodeIfPresent) — additive, exclude_unset-safe; legacy call-sites compile unchanged.
- TransactionEditor gains a «Счёт списания» Section rendered only for `mode.isActual && !accounts.isEmpty`; «Не указан» (nil) preserves the existing no-account behaviour.
- Accounts load inside the editor via `.task { loadAccounts() }` (default = primary ?? first, graceful catch) so the 3 call-sites (HomeView/TransactionsView/TemplateView) keep the same `TransactionEditor(mode:categories:onSaved:onDelete?)` signature.
- `selectedAccountId` passed to both `ActualCreateRequest` and `ActualUpdateRequest` in `save()`; planned branches untouched.
- Default-account + label rules extracted to `AccountPickerLogic` pure helpers, used by both the editor and the tests (single source of truth).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ActualUpdateRequest with accountId** — `f26bad4` (feat, TDD: test+impl in one commit, RED→GREEN verified)
2. **Task 2: Account Picker section + load + accountId pass-through** — `d9fe553` (feat)
3. **Task 3: AccountPickerLogic unit specs** — `9383a4f` (test)

_Note: Task 1 is TDD — the failing test was authored first and verified RED (compile error "Extra argument 'accountId'"), then the DTO change made it GREEN. Both committed together as a single feat commit since the test file is part of the same logical unit._

## Files Created/Modified
- `ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift` — `ActualUpdateRequest` now has `accountId` + custom `encode(to:)` with encodeIfPresent on all fields.
- `ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift` — account picker @State, Section, `.task { loadAccounts() }`, `accountLabel`, save() pass-through; populate() doc for legacy-DTO N/A.
- `ios/BudgetPlanner/Features/Transactions/AccountPickerLogic.swift` — `defaultAccountId(_:)` (primary ?? first) and `label(_:)` (bank + " ·mask") pure helpers.
- `ios/BudgetPlannerTests/Features/Transactions/TransactionEditorAccountTests.swift` — 6 tests for default-account selection + label formatting.
- `ios/BudgetPlannerTests/Networking/DTO/ActualUpdateRequestTests.swift` — 5 tests pinning accountId presence/absence + legacy-init compat + all-nil empty object.

## Decisions Made
- Picker section hidden on empty/failed account load (graceful), so a slow/failing `GET /accounts` never blocks saving (threat T-64-01-02 accepted).
- `loadAccounts` catch uses `print()` only — no error banner — because the account is optional, not a critical path.
- For `editActual`, the legacy `ActualDTO` carries no `accountId`, so preselect-from-DTO is N/A; selection defaults to primary ?? first (documented inline).
- Default-account + label logic lives in `AccountPickerLogic` (enum static funcs) rather than inline, so the struct-View behaviour is directly unit-testable without a SwiftUI/network seam.

## Deviations from Plan

None - plan executed exactly as written.

The plan offered "add helper inline OR new file" discretion for Task 3; I chose the separate `AccountPickerLogic.swift` file (the plan's recommended option) for clean testability. Task 1 test+impl were committed together rather than as separate RED/GREEN commits — the RED state was still verified (compile failure shown) before the GREEN edit, and the test+DTO form one cohesive wire-contract unit.

## Issues Encountered
- A compound `cd ios && ... && git add ...` command failed mid-way because the Bash CWD had reset into `ios/`, making the repo-relative `git add` paths invalid. The swift-format step (first in the chain) had already succeeded; re-ran the `git add` from the repo root with absolute-relative paths. No code impact.

## Threat Surface Scan
No new security-relevant surface beyond the plan's `<threat_model>`. The only wire change is the additive `account_id` field on PATCH /actual/{id}, already covered by T-64-01-01 (encodeIfPresent — verified by `test_encode_accountIdNil_omitsKey`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 2 (inline AI category hint, ADD-V10-01..03 scope) can build on the same editor; `AccountPickerLogic` pattern available for any future pure-logic extraction.
- No blockers. Build GREEN; `TransactionEditorAccountTests` (6) + `ActualUpdateRequestTests` (5) GREEN.

## Self-Check: PASSED

All 5 created/modified source files verified present; all 3 task commits (f26bad4, d9fe553, 9383a4f) found in git history. Build GREEN; 11 unit tests (6 AccountPickerLogic + 5 ActualUpdateRequest) GREEN.

---
*Phase: 64-addsheet-v06*
*Completed: 2026-05-20*
