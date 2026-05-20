---
phase: 64-addsheet-v06
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - ios/BudgetPlanner/Features/Transactions/AISuggestHint.swift
  - ios/BudgetPlanner/Features/Transactions/AccountPickerLogic.swift
  - ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift
  - ios/BudgetPlanner/Networking/APIClient.swift
  - ios/BudgetPlanner/Networking/DTO/TransactionDTO.swift
  - ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift
  - ios/BudgetPlannerTests/Features/Transactions/AISuggestHintTests.swift
  - ios/BudgetPlannerTests/Features/Transactions/TransactionEditorAccountTests.swift
  - ios/BudgetPlannerTests/Networking/DTO/ActualUpdateRequestTests.swift
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 64 extends `TransactionEditor` with (1) an optional account picker (actual modes only) and (2) an inline AI category hint backed by `GET /api/v1/ai/suggest-category` (Pro-gated). I focused on the security-sensitive `suppressUnauthHandler` flag, the AI debounce/cancellation race, PII exposure, the do-not-auto-apply contract, and the account picker / `encodeIfPresent` wire contract.

The critical focus areas hold up well:

- **`suppressUnauthHandler` is safe.** It defaults to `false` in all three signatures (`request`, `requestVoid`, `rawRequest`), and grep confirms the only call-site setting it `true` is `AISuggestCategoryAPI.suggest`. All existing call-sites retain the global 401/403 → logout behavior unchanged. No auth weakening.
- **Debounce/cancellation is correct.** `Task.isCancelled` is re-checked after `await self.suggest(q)` (line 58), so a slow stale response cannot overwrite a newer query. The previous Task is cancelled on every `descriptionChanged` and on `clear()`. The stale-race test (`test_fastSecondQuery_cancelsSlowFirst...`) proves it.
- **PII is a deliberate user action.** Description text is only sent on `.onChange` while typing, gated to create modes (`!mode.isEdit`) and `q.count >= 3`. No silent background leakage.
- **Do-not-auto-apply holds.** `AISuggestHint` has no API to mutate `categoryId`; the editor only sets it inside `applySuggestion`, invoked exclusively from the chip `Button` tap.
- **403 silent path** returns `nil` on any error, no banner, no crash.

Remaining findings are robustness/quality, not correctness-critical for the happy path. No blockers.

## Warnings

### WR-01: AI hint Task is never cancelled when the editor is dismissed

**File:** `ios/BudgetPlanner/Features/Transactions/AISuggestHint.swift:51-60`, `ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift:63`
**Issue:** `AISuggestHint` holds a long-lived `Task` that sleeps for the debounce duration and then awaits a network call. The editor never calls `aiHint.clear()` (or cancels the task) when the sheet disappears — there is no `.onDisappear`. If the user types ≥3 chars and then dismisses the sheet within the debounce/network window, the in-flight Task continues: it still issues (or completes) the `/ai/suggest-category` request and writes `self.suggestion` on a helper whose owning view is gone. Functionally it is harmless because the chip is no longer rendered, but it (a) leaks a network request + PII send after the user navigated away, and (b) keeps the Task alive past the view's useful lifetime. This partially contradicts the file's own header claim "cancels on … disappear" (line of the doc comment), which is not actually wired.
**Fix:** Add an explicit teardown on the editor:
```swift
// in TransactionEditor.body, on the NavigationStack / Form:
.onDisappear { aiHint.clear() }
```
`clear()` already cancels the task and resets the suggestion, satisfying the documented "cancels on disappear" contract and stopping a post-dismiss PII send.

### WR-02: 401 suppression on AI-suggest is broader than the documented "require_pro 403" intent

**File:** `ios/BudgetPlanner/Networking/APIClient.swift:158-169`
**Issue:** The 403 branch gates the logout on `if !skipAuth, !suppressUnauthHandler`, but the 401 branch gates only on `if !suppressUnauthHandler` (no `!skipAuth`). For the AI-suggest call (`skipAuth: false`, `suppressUnauthHandler: true`) this means a genuine **401 expired/invalid token** returned by this endpoint is also swallowed — the owner is not logged out on that path. The documented intent (T-64-02-02 / the comments) is specifically about suppressing the *require_pro 403*, not 401 auth failures. In practice this is low-risk: every *other* authenticated call still triggers `onUnauthenticated` on a 401, so an expired token surfaces on the next non-AI request. But the suppression is wider than its stated purpose, and the two branches are inconsistent (401 ignores `skipAuth`, 403 honors it), which is an easy footgun for a future call-site that sets `suppressUnauthHandler: true` for a different reason and unexpectedly loses 401 logout.
**Fix:** If the goal is truly "suppress only the Pro 403, still react to a real auth 401," do not suppress 401 for this endpoint — or document that AI-suggest deliberately swallows 401 too. Minimally, make the two branches consistent and narrow the AI suppression. One option: introduce a dedicated `suppressForbiddenHandler` for the require_pro case and leave 401 logout intact:
```swift
case 401:
    if !suppressUnauthHandler { onUnauthenticated?() }   // keep as global auth gate
    throw APIError.unauthorized
case 403:
    if !skipAuth, !suppressUnauthHandler { onUnauthenticated?() }
    throw APIError.forbidden(detail)
```
and have AISuggest set only the 403-scoped suppression. If swallowing 401 here is intentional, add a comment to the 401 branch stating so (it currently only references the 403 rationale).

### WR-03: `applySuggestion` can set a `categoryId` that the kind-filtered Picker cannot display

**File:** `ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift:230-239`
**Issue:** `applySuggestion` handles the case where the suggested category exists in `categories` (aligning `kind` for actual modes, lines 232-234). But the `else` branch (line 235-236) sets `categoryId = sid` even when no matching `CategoryDTO` is found locally (e.g., a stale/archived/foreign id returned by the backend). The category Picker binds to `$categoryId` and only renders `filteredCategories` (non-archived, matching `kind`). Setting `categoryId` to an id absent from `filteredCategories` leaves the Picker with a selection it cannot display — the user sees no selected category, yet `canSave` is `true` (`categoryId != nil`), so they can submit a transaction whose category is invisible/unverifiable in the UI, or that the backend may reject. The chip is only shown when `sug.categoryId != nil`, but nothing guarantees that id is a currently-valid local category.
**Fix:** Only apply when the id resolves to a local non-archived category; otherwise clear the hint without mutating selection:
```swift
private func applySuggestion(_ sug: SuggestCategoryDTO) {
    guard let sid = sug.categoryId,
          let cat = categories.first(where: { $0.id == sid }),
          !cat.isArchived else {
        aiHint.clear()
        return
    }
    if mode.isActual, cat.kind != kind { kind = cat.kind }
    categoryId = sid
    aiHint.clear()
}
```

## Info

### IN-01: `print()` of raw error in AI-suggest may log PII / token-adjacent detail

**File:** `ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift:46`, `ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift:259`
**Issue:** `print("AISuggest silent fail: \(error)")` and `print("TransactionEditor.loadAccounts failed: \(error)")` write raw errors to the console. For a networking error the description can include the request URL with the `q=` query parameter (the user's description text → PII) and other request metadata. These survive in device/Console logs. The "silent" contract is about the UI; logs are a separate surface.
**Fix:** Drop the interpolated error or log only a static message / a coarse error category in release builds. E.g. guard behind `#if DEBUG`, or log `error.localizedDescription` of a sanitized case rather than the full `error` (which can embed the URL/query).

### IN-02: `label` appends a bare separator for an empty (non-nil) mask

**File:** `ios/BudgetPlanner/Features/Transactions/AccountPickerLogic.swift:28-30`
**Issue:** `a.mask.map { " ·\($0)" }` produces `"Bank ·"` when `mask == ""` (empty but non-nil), as the test `test_label_emptyMask_appendsDotEmpty` documents. A trailing " ·" with no digits is a minor UI artifact. The test pins it as "current behaviour," so it is intentional/documented, hence Info not Warning.
**Fix:** Treat empty mask as no mask if a dangling separator is undesirable:
```swift
a.bank + (a.mask.flatMap { $0.isEmpty ? nil : " ·\($0)" } ?? "")
```

### IN-03: Editor never preselects an account from an existing actual transaction

**File:** `ios/BudgetPlanner/Features/Transactions/TransactionEditor.swift:271-279`
**Issue:** In `editActual`, the editor cannot preselect the transaction's existing account because the legacy `ActualDTO` has no `accountId` field (the v1.0 `ActualV10DTO` does, but the editor takes `ActualDTO`). The code comments this as N/A and falls back to default (primary ?? first). The consequence: editing an existing actual that was charged to account B, then saving, will send `accountId` = primary (account A) via `ActualUpdateRequest`, potentially re-pointing the transaction's account to the default rather than preserving B. With `encodeIfPresent` and a non-nil default selection, `account_id` *is* emitted on edit. This is a latent data-correctness concern but is bounded by the current legacy DTO surface (the editor was wired to `ActualDTO`, not `ActualV10DTO`), so flagged Info pending the editor migrating to the v1.0 actual surface.
**Fix:** When the editor adopts `ActualV10DTO` (which carries `accountId`), set `selectedAccountId = dto.accountId` in `populate()` before `loadAccounts()` runs, and keep the existing `if selectedAccountId == nil` guard in `loadAccounts` so the default does not clobber a real preselection. Until then, document that edit-actual may reassign the account to the default.

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
