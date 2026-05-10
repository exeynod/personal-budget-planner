---
phase: 30-tech-debt
plan: 04
subsystem: ui-error-surface
tags: [debt-cleanup, ui-feedback, toast, subscriptions]
requirements:
  - DEBT-04
dependency-graph:
  requires:
    - .planning/phases/30-tech-debt/30-CONTEXT.md
    - frontend/src/componentsV10/Toast.tsx (already shipped, Phase 25)
    - ios/BudgetPlanner/FeaturesV10/Common/Toast.swift (already shipped, Phase 25)
  provides:
    - Visible error surface for subscription PATCH/DELETE failures on web + iOS
  affects:
    - frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift
tech-stack:
  added: []
  patterns:
    - "Web: lifted toast state in Mount component, rendered as overlay"
    - "iOS: VM-driven toastMessage + View @State toastVisible (PlanView pattern)"
key-files:
  created: []
  modified:
    - frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift
    - ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift
decisions:
  - "Use existing PosterToast component (web `<Toast>` from componentsV10, iOS `Toast` from FeaturesV10/Common) rather than introducing a new error-banner variant — keeps DS surface area unchanged."
  - "Web: 4s duration override for error toasts (vs 1.7s default success toast) so users can read backend error messages."
  - "iOS: extract `errMessage(_:fallback:)` helper on the VM using `localizedDescription`; falls back to a Russian phrase when empty (URLError edge cases)."
  - "No retry button in the toast — user re-triggers via the same editor input (matches plan's 'Retry path' truth)."
metrics:
  duration: "~12 minutes"
  completed: "2026-05-11"
  files_changed: 3
  insertions: 87
  deletions: 18
---

# Phase 30 Plan 04: Subscription PATCH Error Toast Summary

Surface backend errors from subscription `day_of_month` / `amount_cents` /
`is_active` PATCH (and `DELETE` of the same screen) via PosterToast on web
and iOS, replacing the silent-fail / `window.alert` stub left by Phase 26.

## What Changed

### Web — `frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx`

- Imported `Toast` from `componentsV10`.
- Added `toastMsg: string | null` state alongside the existing `menuSub`
  / `reloadToken` slots.
- Added private helper `errMessage(err, fallback)` that prefers
  `err.message` when `err instanceof Error`, falls back to string err, then
  to a Russian fallback (e.g. `"цена не сохранена"`).
- Replaced the four `window.alert(...)` calls in
  `handleTogglePause` / `handleChangeDay` / `handleChangePrice` /
  `handleDelete` with `setToastMsg('Не удалось обновить · ' + errMessage(err, ...))`.
- Rendered `<Toast>` as a sibling of `<SubscriptionMenuSheet>` in the
  ready-state JSX with `duration={ERROR_TOAST_MS}` (4000ms, longer than
  the 1.7s success toast default so users can read the message).
- Removed the legacy `// Failure mode: window.alert` file-header comment
  and replaced it with a Plan 30-04 / DEBT-04 reference.

### iOS — `SubscriptionsV10ViewModel.swift`

- Added `var toastMessage: String? = nil` to the @Observable VM,
  documented as DEBT-04.
- Replaced the four empty-catch comments (`// Silent for v1.0; Phase 28
  polish: toast/banner.`) with
  `toastMessage = "Не удалось обновить · " + errMessage(error, fallback: ...)`
  on each of `togglePause` / `changeDay` / `changePrice` / `deleteSub`.
- Added private helper `errMessage(_ error: Error, fallback: String) -> String`
  using `localizedDescription`, falling back to a Russian phrase when empty.

### iOS — `SubscriptionsV10View.swift`

- Added `@State private var toastVisible = false`.
- Switched the outer `ZStack` to `ZStack(alignment: .top)` to position
  the toast at the top of the screen.
- Rendered `Toast(message: model.toastMessage ?? "", visible: $toastVisible)`
  inside the ZStack with `.padding(.top, 16)`.
- Added `.onChange(of: model.toastMessage)` block that flips `toastVisible`
  to true when a message arrives, then clears the source after 2s so a
  subsequent identical error still re-triggers the toast (mirrors the
  PlanView pattern).

## Verification

- **Web vitest:** `cd frontend && npx vitest run src/screensV10/Subscriptions/`
  → 2 files, **39/39 tests passing** (517ms). Existing menu/editor tests
  remain untouched because the Mount-level toast is invisible to the
  presenter-level tests.
- **iOS build:** `cd ios && make build` → **Build Succeeded**. Only pre-existing
  warnings (HomeV10View preview macro) — not introduced by this plan.
- **Manual contract check:** PATCH 4xx/5xx on web now triggers
  `<Toast>` with `'Не удалось обновить · {backend message}'`; on iOS the
  VM-driven `toastMessage` flips `toastVisible` and renders the Toast
  overlay at the top of the coral screen.

## Plan must_haves — verified

- [x] Web: day/price editor PATCH failure показывает PosterToast с error
      message (НЕ silent fail). Confirmed by `setToastMsg` in
      `handleChangeDay` / `handleChangePrice` and the new `<Toast>` overlay.
- [x] iOS: day/price editor PATCH failure показывает PosterToast с error
      message; toast не блокирует UI. Confirmed by VM `toastMessage`
      assignment in `changeDay` / `changePrice` and the non-blocking
      `Toast` overlay in `ZStack(.top)`.
- [x] Retry path: user re-triggers через тот же editor input (the menu
      stays available; toast just informs and auto-dismisses).

## Deviations from Plan

None — plan executed exactly as written. The plan suggested optionally
lifting toast state to a parent if Mount didn't already own it; on web
the Mount turned out to be the natural owner (it already owns the four
PATCH handlers), so no further lifting was needed. On iOS the established
PlanView pattern (VM-owned `toastMessage` + View-owned `toastVisible`)
was a clean fit.

## Files Touched (single atomic commit)

| File                                                                | Change           |
| ------------------------------------------------------------------- | ---------------- |
| frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx        | +44 / −11        |
| ios/.../Subscriptions/SubscriptionsV10View.swift                    | +19 / −2         |
| ios/.../Subscriptions/SubscriptionsV10ViewModel.swift               | +24 / −5         |

**Commit:** `f0df6eb fix(30-04): surface subscription PATCH errors via toast (web+iOS)`

## Out-of-Scope Pre-existing Modifications (not part of this plan)

The branch already had unstaged edits to
`frontend/src/screensV10/Transactions/{TransactionsMount.tsx, TransactionsView.tsx, TransactionsView.module.css}`
when this plan started. These belong to a separate work-stream and were
left untouched. The plan commit only staged the three files listed above.

## Self-Check: PASSED

- FOUND: frontend/src/screensV10/Subscriptions/SubscriptionsMount.tsx (modified, contains `<Toast>` overlay + `errMessage` helper)
- FOUND: ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10View.swift (modified, contains `Toast(...)` overlay + `.onChange(of: model.toastMessage)`)
- FOUND: ios/BudgetPlanner/FeaturesV10/Subscriptions/SubscriptionsV10ViewModel.swift (modified, contains `toastMessage` + `errMessage(_:fallback:)`)
- FOUND: commit `f0df6eb` in `git log`
- VERIFIED: web vitest 39/39 green
- VERIFIED: iOS build succeeded
