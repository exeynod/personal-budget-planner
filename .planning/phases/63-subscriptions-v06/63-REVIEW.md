---
phase: 63-subscriptions-v06
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - ios/BudgetPlanner/Domain/LocalNotifications.swift
  - ios/BudgetPlanner/Features/Management/SubscriptionsView.swift
  - ios/BudgetPlanner/Features/Management/SubscriptionsViewData.swift
  - ios/BudgetPlannerTests/Features/Management/SubscriptionsViewDataTests.swift
  - ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift
findings:
  critical: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 63 migrates v06 Subscriptions to `SubscriptionsV10API` and adds post/unpost money
mutations, a `day_of_month` Stepper, an `account_id` Picker, and a create-path that does
legacy create + follow-up V10 PATCH. The phase-62 CR-01 class of bug (money mutation with
no `submitting` guard) is **not repeated**: post/unpost/delete/patch all run through the
view model's `submitting` guard + `defer`, are gated behind a `confirmationDialog` with
fixed RU copy, reload on success, and never leak `error.localizedDescription` (raw error
goes only to `print`). The editor's own save path correctly guards with `isSubmitting`,
disables interactive dismiss while submitting, and uses fixed RU error copy.

The MSK date claim checks out: `APIClient` encoder is `.iso8601` (would shift a MSK-midnight
`Date` back a day in UTC), and both create and edit paths correctly bypass it by sending
`nextChargeDate` as a pre-formatted `yyyy-MM-dd` String (`DateFormatters.isoDate`, MSK tz)
via the legacy create/update requests. The V10 follow-up PATCH only carries
`day_of_month`/`account_id`, never a `Date`, so no new day-shift is introduced.

No blockers. Findings are correctness-adjacent robustness gaps and quality issues: the
inherited `inFlight` reload-skip race (carried over from phase 62, still un-fixed), silent
swallowing of the create-path follow-up PATCH failure, an unintended forced write of
`day_of_month=1` when editing legacy monthly subs, and a thin VM test suite that does not
exercise any of the new mutation behavior.

## Warnings

### WR-01: Mutation reload silently skipped when a load() is already in flight

**File:** `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift:41-63, 77, 95, 111, 137`
**Issue:** `load()` early-returns when `inFlight == true`. Every mutation (`post`/`unpost`/
`delete`/`patchById`) calls `await load()` after success to refresh state (T-63-04). If a
`load()` is already running — e.g. the user pulls-to-refresh (`.refreshable`) or the initial
`.task` load is still in flight while a swipe-action mutation completes — the mutation's
reload is silently dropped. The just-posted/unposted/deleted subscription is then NOT
reflected, and notifications are not rescheduled, defeating the stated reload-on-success
mitigation. `submitting` is released by `defer` before the dropped reload, so there is no
retry; the list stays stale until the next manual refresh. This is the same defect flagged
in phase 62 (62-REVIEW WR-03) and was carried into this VM unchanged.
**Fix:** Make the mutation reload resilient to a concurrent in-flight load — e.g. set a
"reload requested" flag that `load()`'s `defer` re-checks and re-runs, or await the existing
load before issuing the mutation reload:
```swift
@ObservationIgnored private var reloadPending = false

func load() async {
    if inFlight { reloadPending = true; return }
    inFlight = true
    defer {
        inFlight = false
        if reloadPending { reloadPending = false; Task { await load() } }
    }
    // ...
}
```

### WR-02: create-path follow-up PATCH failure is silently swallowed in the editor

**File:** `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift:726-731`
**Issue:** In the `.create` branch, the legacy create succeeds, then
`_ = await onPatchV10(created.id, v10Payload)` is fired and its `Bool` result is discarded.
If the PATCH fails (T-63-06), the editor still falls through to `await onSaved()` and
`dismiss()` — so the sheet closes "successfully" while `day_of_month`/`account_id` were
never persisted. The only signal is `viewModel.mutationError` set behind the now-dismissed
sheet, plus a `load()` that shows the subscription created but mislabeled (e.g. cadence
falls back to «ежемесячно» with no day). The user is told the create succeeded with no
indication the account/day silently dropped. The plan documents this as "accept", but the
UX is a partial-success that reads as full success.
**Fix:** Check the PATCH result and keep the sheet open on partial failure so the user can
retry, instead of dismissing:
```swift
if needsFollowUpPatch, let onPatchV10 {
    let ok = await onPatchV10(created.id, v10Payload)
    if !ok {
        errorMessage = "Подписка создана, но счёт/день не сохранились. Откройте её и сохраните ещё раз."
        await onSaved()   // reflect the partial state
        return            // do NOT dismiss
    }
}
```

### WR-03: editing a legacy monthly subscription force-writes day_of_month = 1

**File:** `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift:686, 706, 709, 746-748`
**Issue:** `populate()` sets `dayOfMonth = s.dayOfMonth ?? 1` for the edit path. On save,
`dayPayload = (cycle == .monthly) ? dayOfMonth : nil`, and `needsFollowUpPatch` is true
whenever `dayPayload != nil`. So opening any pre-existing monthly subscription that has no
`day_of_month` (legacy rows decode it as `nil`) and tapping "Сохранить" without touching the
Stepper will PATCH `day_of_month = 1` onto it — a silent data mutation the user never
requested. After save the row caption flips from «ежемесячно» to «ежемесячно, 1 числа».
**Fix:** Only include `day_of_month` in the follow-up PATCH when the value actually changed
(track the original), or treat `dayOfMonth == 1` default on a previously-nil field as "no
change". Distinguish "user picked day 1" from "field was never set".

### WR-04: ViewModel test suite does not exercise any new mutation behavior

**File:** `ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift:79-168`
**Issue:** The suite only covers initial state, derived getters, `Status` equality, the
`clearMutationError` helper, and the `_setStateForTesting` backdoor. None of the behavior
introduced by this phase is verified: the `submitting` guard preventing double-submit on
post/unpost/delete/patch (T-63-01), `mutationError` being set on failure / cleared on
success (T-63-02), or reload-on-success (T-63-04). `test_submitting_initialFalse` only
asserts the initial value — not the guard. The riskiest code in the phase (real money
mutations) ships unverified. Same gap noted in phase 62 (62-REVIEW WR-06).
**Fix:** Introduce an injectable API seam (the `*V10API` enums are `@MainActor` with `static`
methods — wrap them behind a protocol/closure the VM holds) and assert: a re-entrant
`post`/`unpost`/`delete` while `submitting == true` returns `false`/no-ops without a second
network call; a failing mutation sets the fixed RU `mutationError` and leaves it set; a
succeeding mutation clears `mutationError`.

### WR-05: nextChargeDate "yyyy-MM-dd" decodes in device-local timezone, not MSK

**File:** `ios/BudgetPlanner/Domain/LocalNotifications.swift:29-47` (consumes the value);
decode site `ios/BudgetPlanner/Networking/APIClient.swift:44-48`
**Issue:** While the *encode* side correctly avoids the UTC day-shift, the *decode* side is
asymmetric. The APIClient `yyyy-MM-dd` fallback `DateFormatter` (APIClient.swift:44-48) sets
no `timeZone`, so a bare date like `2026-05-15` decodes to midnight in the **device's**
timezone. `reschedule(subscriptionsV10:)` then extracts `[.year,.month,.day]` from that
`Date` using a **Europe/Moscow** calendar. On a device east of MSK (e.g. UTC+5 or later), the
MSK-calendar interpretation of a device-local-midnight instant can land on the previous
calendar day, shifting the notification fire date and `SubscriptionRow.daysUntil` by one.
This is inherited APIClient behavior (the legacy `reschedule(subscriptions:)` overload has
the identical issue), so it is not introduced by Phase 63 — but Phase 63's restored
rescheduling re-activates it. The phase convention is explicitly "MSK, no UTC day-shift".
**Fix:** Pin the `yyyy-MM-dd` decode path to a fixed timezone so DATE fields are timezone-
stable (ideally MSK, matching the encode side and the worker job):
```swift
let df = DateFormatter()
df.locale = Locale(identifier: "en_US_POSIX")
if fmt == "yyyy-MM-dd" { df.timeZone = TimeZone(identifier: "Europe/Moscow") }
df.dateFormat = fmt
```
(If APIClient is out of scope for this phase, file as a follow-up; the Phase 63 reschedule
remains correct only on MSK-or-west devices.)

### WR-06: post/unpost confirmation lets the underlying swipe-target change while dialog is open

**File:** `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift:216, 217-242, 388-393`
**Issue:** `.refreshable { await viewModel.load() }` can re-fetch and replace
`viewModel.subscriptions` while the post/unpost `confirmationDialog` is open. The dialog
captures `postSubject` (a value-type `SubscriptionV10DTO` snapshot) which is good, but the
confirm action mutates by `id` against whatever the server now holds. If a background
reschedule/refresh changed the subscription's posted state between dialog-open and confirm,
the user may confirm "Провести" against a sub that is now already posted (or vice-versa),
producing a confusing 4xx that surfaces only as the generic "Не удалось провести подписку".
The `submitting` guard prevents double-fire but not stale-target confirmation.
**Fix:** Re-validate the target's posted state at confirm time before issuing the mutation,
or disable pull-to-refresh while `postSubject != nil`. At minimum, after a failed
post/unpost, `load()` already runs (via the success path only) — ensure the failure path
also reloads so the row reflects reality. Currently `post`/`unpost` do NOT reload on the
`catch` branch (SubscriptionsView.swift:79-83, 97-101), so a 409/stale-state failure leaves
the row showing the old (wrong) posted badge until manual refresh.

## Info

### IN-01: Dead `cal` local in legacy reschedule overload

**File:** `ios/BudgetPlanner/Domain/LocalNotifications.swift:79-81`
**Issue:** `let cal = Calendar(identifier: .gregorian); var moscowCal = cal` — the `cal`
binding exists only to be copied into `moscowCal`. The V10 overload (line 26-27) constructs
`moscowCal` directly without the throwaway. Minor inconsistency / dead local.
**Fix:** `var moscowCal = Calendar(identifier: .gregorian)` and drop `cal`.

### IN-02: Two near-identical reschedule implementations risk divergence

**File:** `ios/BudgetPlanner/Domain/LocalNotifications.swift:20-68` and `73-122`
**Issue:** The V10 and legacy `reschedule` overloads are line-for-line duplicates apart from
the DTO type. Any future fix (e.g. WR-05 timezone handling, or the notification body copy)
must be applied in two places or they silently drift. The legacy overload appears to have no
remaining caller in the reviewed scope (the VM uses the V10 overload).
**Fix:** Extract the shared scheduling body into a private helper taking the minimal fields
`(id, name, amountCents, notifyDaysBefore, nextChargeDate, isActive)`, and have both
overloads (or just the V10 one, if legacy is now dead) delegate to it. Confirm whether the
legacy overload is still referenced anywhere; if not, delete it.

### IN-03: `accountLabel` separator differs from sibling account UIs

**File:** `ios/BudgetPlanner/Features/Management/SubscriptionsView.swift:526-528`
**Issue:** `a.bank + (a.mask.map { " ·\($0)" } ?? "")` produces `Bank ·1234` (no space after
the middle-dot). This is a cosmetic inconsistency with other account-picker labels in the
app and reads slightly off. Not a correctness issue.
**Fix:** `" · \($0)"` for consistent spacing, or reuse the shared account-label helper if one
exists.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
