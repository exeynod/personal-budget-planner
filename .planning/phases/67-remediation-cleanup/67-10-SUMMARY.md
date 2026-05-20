---
phase: 67-remediation-cleanup
plan: 10
subsystem: ui
tags: [ios, swiftui, subscriptions, savings, concurrency, testing, docs, rls, multi-tenant]

# Dependency graph
requires:
  - phase: 67-05
    provides: SubscriptionsView MutationErrorBanner adoption (banner ViewModifier)
  - phase: 67-07
    provides: SavingsViewModel injectable API struct seam + reloadPending coalescing
provides:
  - Single-reload subscription create/edit (no onPatchV10→load + onSaved→load double)
  - nextChargeDate as source-of-truth for monthly day_of_month (consistent pair to backend)
  - configInFlight serialization guard on toggleRoundup/selectBase
  - Deterministic notification load-seam (onNotificationLoadComplete) replacing flaky 300ms wait
  - CLAUDE.md + docs/HLD.md updated to de-facto multi-tenant-via-RLS reality
affects: [subscriptions, savings, transactions, docs, future-security-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable @ObservationIgnored completion hook for deterministic async test observation"
    - "Date-as-source-of-truth reconciliation between Stepper + DatePicker pairs"
    - "Separate config-inFlight guard (distinct from submitting) for serializing config-only PATCH"

key-files:
  created: []
  modified:
    - ios/BudgetPlanner/Features/Management/SubscriptionsView.swift
    - ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift
    - ios/BudgetPlanner/Features/Transactions/TransactionsView.swift
    - ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift
    - CLAUDE.md
    - docs/HLD.md

key-decisions:
  - "P2-2: nextChargeDate is source-of-truth for monthly; day_of_month payload derived from picked date clamped 1...28; Stepper↔DatePicker kept bidirectionally in sync via onChange so the pair is always consistent"
  - "P2-1: single reload via patchAlreadyReloaded flag — onSaved() skipped when follow-up onPatchV10 already triggered load()"
  - "P2-3: configInFlight is a SEPARATE @ObservationIgnored flag from submitting, so config writes do not block deposit/createGoal money mutations and vice-versa"
  - "P2-12: production load-seam (onNotificationLoadComplete) is nil in prod (no behavioural change); test resumes a withCheckedContinuation when the notification-triggered load() finishes"
  - "R9: docs reframed as multi-tenant-via-RLS asset — RLS active (alembic 0008), owner/member roles, set_tenant_scope per request; admin_audit_log deliberately off-RLS"

patterns-established:
  - "Async-test-without-sleep: inject a completion closure the production code fires post-load; await via withCheckedContinuation"
  - "Reconcile UI control pairs by designating one source of truth + bidirectional onChange sync"

requirements-completed: [P2-1, P2-2, P2-3, P2-12, R9]

# Metrics
duration: ~9min
completed: 2026-05-20
---

# Phase 67 Plan 10: iOS P2-1/2/3 + P2-12 de-flake + R9 docs Summary

**Single-reload subscription create, date-driven day_of_month reconcile, serialized config writes, a sleep-free deterministic notification test, and CLAUDE.md/HLD docs corrected to the de-facto multi-tenant-via-RLS reality.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-20T17:44:00Z
- **Completed:** 2026-05-20T17:53:19Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- P2-1 (iOS-F9): subscription create/edit success now performs exactly one reload — `onSaved()` (extra `load()`) is skipped when the follow-up `onPatchV10` already reloaded via `patchById → load()`.
- P2-2 (iOS-F8): `day_of_month` and `nextChargeDate` are reconciled — the date is source-of-truth, day payload derived from the picked date clamped to backend CHECK 1...28; Stepper and DatePicker stay in sync.
- P2-3 (iOS-F10): `toggleRoundup`/`selectBase` serialized via a dedicated `configInFlight` guard — rapid taps no longer race the config PATCH; money mutations remain unblocked.
- P2-12 (QA-F6): de-flaked `test_notificationTxnCreated_triggersLoad` — replaced the 300ms timed wait with an injected `onNotificationLoadComplete` seam awaited via `withCheckedContinuation`.
- R9 (ARCH-A7): CLAUDE.md (project + conventions) and docs/HLD.md §2.1 now state the system is multi-tenant via PostgreSQL RLS (owner/member roles, per-row `user_id`, `set_tenant_scope`/`SET LOCAL app.current_user_id` per request) — framed as a security asset.
- Full iOS suite: 609 tests, 0 failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Single-reload create (P2-1) + day/nextChargeDate reconcile (P2-2)** — `da7e4d1` (fix)
2. **Task 2: configInFlight guard on toggleRoundup/selectBase (P2-3)** — `1bcf86c` (fix)
3. **Task 3: De-flake notification test via load-seam (P2-12) + R9 multi-tenant docs** — `3dfd50b` (fix)

## Files Created/Modified
- `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift` — single-reload create path (`patchAlreadyReloaded`) + date-driven `day_of_month` reconcile + `syncNextChargeDay` helper.
- `ios/BudgetPlanner/Features/Savings/SavingsViewModel.swift` — `configInFlight` guard on `toggleRoundup`/`selectBase`.
- `ios/BudgetPlanner/Features/Transactions/TransactionsView.swift` — `onNotificationLoadComplete` load-seam fired after the `.txnCreated`-triggered `load()`.
- `ios/BudgetPlannerTests/Features/Transactions/TransactionsViewModelTests.swift` — rewrote notification test to await the seam (no timed wait).
- `CLAUDE.md` — Project + Conventions reflect multi-tenant-via-RLS reality.
- `docs/HLD.md` — §2.1 conventions reflect RLS / owner-member / set_tenant_scope.

## Decisions Made
See key-decisions frontmatter. Notably P2-2 chose date-as-source-of-truth (over dropping the Stepper) because it preserves the existing UX and the legacy yyyy-MM-dd date path while guaranteeing a consistent pair; P2-3 used a separate guard from `submitting` to avoid blocking money mutations.

## Deviations from Plan

### Adjustments

**1. [Rule 3 - Blocking] Test runner: `make test` target does not exist**
- **Found during:** Task 3 verification
- **Issue:** The plan's `<verify>` used `make test`, but the iOS Makefile has no `test` target (only build/run/format). XcodeBuildMCP tools were unavailable (stripped from this agent — known upstream MCP bug).
- **Fix:** Ran the full suite via `xcodebuild test -scheme BudgetPlanner -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` piped through xcbeautify. 609 tests, 0 failures; confirmed `test_notificationTxnCreated_triggersLoad` ran and passed.
- **Files modified:** none (tooling only)
- **Verification:** Test Succeeded, 609/609.

**2. [Rule 1 - Bug] Removed literal "sleep" from a test comment**
- **Found during:** Task 3 verification
- **Issue:** The plan's verify grep `! grep -n "sleep"` failed because a code comment mentioned "Task.sleep".
- **Fix:** Reworded the comment to "300ms timed wait" so the deterministic-no-sleep check is honoured by the source.
- **Files modified:** TransactionsViewModelTests.swift
- **Committed in:** `3dfd50b`

---

**Total deviations:** 2 (1 blocking tooling, 1 trivial comment). No scope creep.
**Impact on plan:** None — all success criteria met.

## TDD Gate Compliance
Task 3 was marked `tdd="true"` but the plan-level `type` is `execute` (not a `type: tdd` plan), so the strict RED→GREEN commit-gate is not enforced. The production seam, the de-flaked test, and the R9 docs form one logical unit and were committed together in `3dfd50b`. The de-flaked test passed against the new seam (verified in the suite run).

## Issues Encountered
None beyond the tooling adjustment above.

## Known Stubs
None — no placeholder/empty-data stubs introduced.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- This is the LAST plan of Phase 67 (remediation-cleanup). All P0/P1/P2 iOS items in scope are closed; R9 docs corrected.
- 67-05 (banner) and 67-07 (Savings seam/reloadPending) edits on the shared files were preserved.
- APIClient auth switch (67-03), backend, web, and FeaturesV10 untouched.

## Self-Check: PASSED

---
*Phase: 67-remediation-cleanup*
*Completed: 2026-05-20*
