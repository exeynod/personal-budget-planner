---
phase: 70-convergence-abstractions
reviewed: 2026-05-21T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - ios/BudgetPlanner/Networking/ErrorHandling.swift
  - ios/BudgetPlanner/Networking/APIClient.swift
  - ios/BudgetPlanner/Networking/BusinessDate.swift
  - ios/BudgetPlanner/Networking/APIError.swift
  - ios/BudgetPlanner/Networking/Generated/GeneratedDTO.swift
  - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
  - ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift
  - ios/BudgetPlanner/Networking/DTO/CommonDTO.swift
  - ios/BudgetPlanner/Networking/DTO/GoalDTO.swift
  - ios/BudgetPlanner/Networking/DTO/ManagementDTO.swift
  - ios/BudgetPlanner/Networking/Endpoints/TransactionsAPI.swift
  - ios/BudgetPlanner/Networking/Endpoints/ManagementAPI.swift
  - ios/BudgetPlanner/Networking/Endpoints/AuthAPI.swift
  - ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsStore.swift
  - ios/BudgetPlanner/Domain/Subscriptions/SubscriptionsDomain.swift
  - ios/BudgetPlanner/Domain/LocalNotifications.swift
  - ios/BudgetPlanner/FeaturesV10/Analytics/AnalyticsData.swift
  - ios/BudgetPlanner/FeaturesV10/Transactions/TransactionsData.swift
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** deep
**Files Reviewed:** 18 (plus cross-checks against deleted files, both shell entry points, and the contract generator)
**Status:** issues_found (2 warnings, 3 info — no blockers)

## Summary

Phase 70 is a convergence/abstraction refactor across the iOS codebase: deprecating
legacy enum-APIs onto V10 canonical (70-01), introducing a `BusinessDate` wire-DATE
type (70-02), extracting an injectable `ErrorHandling` strategy (70-03), merging
duplicated pure-compute enums into `SubscriptionsDomain` (70-04), and lifting load +
mutation logic into a shared `SubscriptionsStore` (70-05).

I traced every regression-risk area called out for this phase against the actual code
and against the pre-phase baseline (`e299064~1`). The headline results:

- **R6 (both shells intact):** CONFIRMED. No shell or View file appears in the
  phase-70 diff. `git diff --name-status` shows exactly four deletions — two
  pure-compute data enums (`SubscriptionsViewData.swift`, `SubscriptionsData.swift`)
  and their two test files. `V10MainShell.swift` and the v06 shell are untouched on
  disk and not in the diff. Both VMs (`SubscriptionsViewModel`,
  `SubscriptionsV10ViewModel`) survive as thin adapters. No shell/View loss.
- **E1 (auth semantics):** CONFIRMED byte-equivalent. `ErrorHandling.default`
  reproduces the old switch exactly (401 always logout; 403 logout iff `!skipAuth`;
  402→serverError no-logout; 404/409/422 no-logout; 2xx success). 429 Retry-After is
  handled inline upstream and never reaches the policy. `APIClientForbiddenTests.swift`
  diff across the phase is EMPTY (unmodified, as required). The new `ErrorPolicyTests`
  covers the full matrix including both 403 `skipAuth` branches and the 402 case.
- **70-02 (BusinessDate):** CONFIRMED correct. The retype is sound, encode/decode is
  MSK-pinned, and the MSK-midnight decode test still holds. The reported analytics
  `groupByWeek` UTC→MSK fix is a **genuine bug fix** (see analysis under WR-01 context
  below — the old UTC `.day` read against an MSK-midnight instant was a latent
  off-by-one-day defect). Create/update request date fields stayed `String`
  (caller-formatted), so no wire-format change.
- **70-05 (toast / reloadPending):** The V10 toast simplification is not a regression —
  it is a corrective change. The OLD V10 toast surfaced `error.localizedDescription`,
  which for `APIError` interpolates server-supplied `detail` (forbidden/conflict/
  serverError) — i.e. the exact server-detail leak that 67-05's `userFacingRu` policy
  forbids. Fixed RU copy is consistent with the 67-03/67-05 no-leak policy. The V10
  `reloadPending` adoption (coalesce instead of drop) is safe for an idempotent list
  refetch.
- **GeneratedDTO deferred item:** CONFIRMED deferred-safe. No live code decodes `Gen.*`
  DTOs (only doc-comment references exist). See WR-02 for the follow-up.
- **Money/secrets/RLS:** Clean. No float money, no secrets, no RLS surface in iOS code.

**Verdict: SAFE TO SHIP.** No blockers. Two warnings are latent-risk / follow-up
items that do not affect current runtime behavior; three info items are documentation
and minor consistency notes.

## Warnings

### WR-01: APIClient date decoder will throw on bare `yyyy-MM-dd` if a future `Gen.*` DTO is wired

**File:** `ios/BudgetPlanner/Networking/APIClient.swift:42-67`
**Issue:** The 70-02 cleanup removed the bare-date (`yyyy-MM-dd`) branch from the
shared `dateDecodingStrategy` closure. That closure now handles only ISO-8601
timestamps plus a no-zone `yyyy-MM-dd'T'HH:mm:ss` fallback, and otherwise throws
`Unrecognized date`. This is correct for current production because every wire
business-date field was retyped to `BusinessDate` (which self-decodes and bypasses the
strategy). However, the generated `Gen.*` DTOs (`GeneratedDTO.swift`) still type
`format: date` fields as `Date` (see WR-02). The moment any consumer decodes a `Gen.*`
DTO that carries a bare DATE field, that field routes through this strategy and throws
at runtime. The defense is "nothing decodes `Gen.*` today" — true, but the trap is now
armed where before it was not (the old strategy tolerated bare dates, albeit with the
MSK heuristic). This is a latent footgun, not a current bug.
**Fix:** Tie the two halves together so the trap cannot spring silently. Either (a)
make the generator emit `BusinessDate` for `format: date` (WR-02 fix, closes the gap at
the source), or (b) keep a defensive bare-date branch in the closure that decodes to
MSK-midnight, mirroring `BusinessDate`'s formatter, so a stray `Gen.*` DATE field
decodes consistently instead of throwing:
```swift
// Defensive: a bare yyyy-MM-dd reaching the audit-time strategy is a wire
// business-date that escaped BusinessDate typing (e.g. an un-migrated Gen.* DTO).
// Decode it to MSK-midnight to match BusinessDate rather than throwing.
let bare = DateFormatter()
bare.locale = Locale(identifier: "en_US_POSIX")
bare.timeZone = TimeZone(identifier: "Europe/Moscow")
bare.dateFormat = "yyyy-MM-dd"
if let d = bare.date(from: str) { return d }
```
Prefer (a). Track under the existing E2/R7 follow-up.

### WR-02: Contract generator emits `Date` for both `date` and `date-time`; should emit `BusinessDate` for `format: date`

**File:** `contract/gen_swift_dto.py:160-161`
**Issue:** `swift_base_type` maps `fmt in ("date", "date-time")` → `"Date"`,
collapsing the very distinction 70-02 introduced by hand in the handwritten DTOs. The
generated `GeneratedDTO.swift` therefore still has `Date`-typed wire-DATE fields. The
phase intentionally deferred this (no live code decodes `Gen.*`), so it is safe today,
but the generator is now the single source of future drift: regenerating
`GeneratedDTO.swift` and wiring it would reintroduce the exact UTC/MSK day-shift class
of bug that `BusinessDate` was created to eliminate (and, per WR-01, would now throw at
decode). The header comment in `GeneratedDTO.swift:6` ("MSK-pinned date strategy") is
also stale — the strategy no longer pins MSK for bare dates.
**Fix:** Split the format mapping in the generator and refresh the stale header:
```python
if fmt == "date":
    return "BusinessDate"
if fmt == "date-time":
    return "Date"
```
And update `GeneratedDTO.swift`'s header comment (line ~6) to drop "MSK-pinned date
strategy" and state that business dates are `BusinessDate`-typed and self-decoding.
Regenerate and confirm `Gen.*` DATE fields become `BusinessDate?`/`BusinessDate`.

## Info

### IN-01: V10 toast copy is bespoke literals rather than routing through `APIError.userFacingRu`

**File:** `ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift:73-101`
**Issue:** The post-refactor V10 toast strings ("Не удалось обновить · статус не
сохранён", etc.) are hard-coded per call site because the store now returns only a
`Bool`. They are fixed, non-leaking RU copy (so the 67-05 contract is honored — this is
NOT the leak that the change fixed), but they bypass the central `APIError.userFacingRu`
copy table. This is a minor consistency nit, not a defect: with a `Bool` outcome the VM
no longer has the `APIError` to route. Acceptable as-is.
**Fix:** Optional — if you want a single copy table, have the store expose the last
mutation error (or its `userFacingRu`) for shells that want it, while keeping the `Bool`
fast-path. Low priority.

### IN-02: `SubscriptionV10UpdateRequest.nextChargeDate` retyped to `BusinessDate?` but never populated on the V10 path

**File:** `ios/BudgetPlanner/Networking/DTO/SubscriptionV10DTO.swift:79`
**Issue:** `nextChargeDate` on the V10 update request was retyped to `BusinessDate?`,
but all real V10 call sites construct the request with `isActive` / `dayOfMonth` /
`amountCents` / `accountId` only — `nextChargeDate` is never set on this path (the V10
shell drives the day via `dayOfMonth`; the v06 legacy create uses a separate `String`
field). The retype is harmless (encode would correctly emit MSK `yyyy-MM-dd` via
`encodeIfPresent` if ever used) but the field is effectively dead on this request type.
**Fix:** No action required for correctness. If desired, document the field as
"reserved / not currently sent by either shell" to prevent a future caller from
assuming it is wired.

### IN-03: `ErrorHandling.tolerating(_:)` is dead code (illustrative, wired nowhere)

**File:** `ios/BudgetPlanner/Networking/ErrorHandling.swift:100-108`
**Issue:** The `tolerating(_:)` factory is explicitly documented as illustrative and is
not used anywhere this phase. It is well-commented and demonstrates the strategy
pattern, but it is unreferenced code that will not be exercised by tests of real call
paths.
**Fix:** Acceptable to keep as documented intent. If you prefer zero dead code, move
the example into a doc comment or a test, or delete until a real tolerating-policy
consumer lands.

---

## Cross-file verification notes (deep pass)

- **Analytics `groupByWeek` UTC→MSK fix is correct (was a latent bug).**
  `AnalyticsData.swift:124-140`. `BusinessDate.date` is MSK-midnight, e.g.
  `2027-01-01` → `2026-12-31 21:00 UTC`. The old code set the calendar to UTC and read
  `cal.component(.day, from: t.txDate)`, yielding day `31` (previous calendar day) for a
  transaction the user filed on the 1st — wrong week bucket. The new code reads `.day`
  in `Europe/Moscow` against `txDate.date`, yielding `1`. The fix is sound and the
  old UTC read was a genuine off-by-one-day defect.
- **`TransactionsData.groupByDay` day-key consistency:** the key formatter uses the
  passed calendar's timezone (`keyFormatter.timeZone = calendar.timeZone`); production
  passes a `Europe/Moscow` calendar (`TransactionsV10ViewModel.defaultCalendar()`), so
  the day key reads MSK against MSK-midnight `txDate.date` — consistent. Sort fallbacks
  (`createdAt ?? txDate.date`) preserved. No regression.
- **`LocalNotifications` fire-date:** `nextChargeDate.date` bridges to the same
  MSK-midnight instant the old `Date` decode produced; trigger computation unchanged.
- **`SubscriptionsDomain` merged compute fns** are byte-equivalent to the deleted
  `SubscriptionsData` / `SubscriptionsViewData` originals (verified against
  `e299064~1` copies): `monthlyTotalV10`, `yearlyTotalAnnualizedV10`, `sortV10`,
  `activeCount`, `monthlyLoadCentsV06`, `sortV06`, both cadence variants.
- **`SubscriptionsStore` mutation structure** matches the old v06 VM exactly:
  submitting-guard, reload-on-success, WR-06 reload-on-catch for post/unpost,
  delete with NO reload-on-catch, and the `reloadPending` re-entrancy. v06 keeps
  identical behavior; V10 gains coalescing (strictly safer for an idempotent refetch).
- **Deprecation annotations (70-01)** are doc-only `@available(*, deprecated)` markers
  with debt-registry references; they do not change runtime behavior. `ActualAPI.delete`
  is intentionally NOT deprecated (no V10 counterpart) — correct.

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
