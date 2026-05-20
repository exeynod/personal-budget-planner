---
phase: 63-subscriptions-v06
plan: 02
subsystem: ios-subscriptions
tags: [ios, subscriptions, v06, v10-api, editor, post-unpost, money-mutation]
requires:
  - SubscriptionsViewModel (post/unpost/patch/delete on V10API) — 63-01
  - SubscriptionsViewData pure helpers — 63-01
  - SubscriptionsV10API.patch, SubscriptionsAPI.create/update (legacy)
  - AccountsAPI.list, SubscriptionV10UpdateRequest
provides:
  - SubscriptionEditor with «Счёт списания» Picker + «День месяца» Stepper(1...28) monthly-only
  - create-path (legacy create + follow-up V10 PATCH) + edit-path (legacy update + V10 PATCH)
  - Row posted badge + leading swipe post/unpost + confirmationDialog + 4 load-state body
  - LocalNotifications.reschedule(subscriptionsV10:) overload (63-01 known-gap closed)
  - SubscriptionsViewModelTests (9 tests)
affects:
  - Phase 63 verification (feature-complete subscriptions v06 surface)
tech-stack:
  added: []
  patterns:
    - "Editor follow-up V10 PATCH for extension fields (day_of_month/account_id) after legacy create/update"
    - "Date stays on String yyyy-MM-dd legacy path (avoid .iso8601 UTC day-shift on DATE field)"
    - "confirmationDialog + submitting guard before money mutation (post/unpost)"
    - "4-state body switch + mutation-error banner with dismiss (Savings sibling)"
key-files:
  created:
    - ios/BudgetPlannerTests/Features/Subscriptions/SubscriptionsViewModelTests.swift
  modified:
    - ios/BudgetPlanner/Features/Management/SubscriptionsView.swift
    - ios/BudgetPlanner/Domain/LocalNotifications.swift
decisions:
  - "Edit-path keeps name/amount/cycle/date/category/notify/isActive on legacy SubscriptionsAPI.update (String yyyy-MM-dd date) and only routes day_of_month/account_id through V10 PATCH. Rationale: APIClient encoder = .iso8601 (UTC); sending nextChargeDate as a Date for a DATE-typed field would day-shift (e.g. MSK midnight → previous-day UTC). Symmetric to create-path (legacy + follow-up PATCH). Resolves the 63-01/plan open question on Date encoding."
  - "VM gains patchById(id:payload:) — create-path knows the new id only after legacy create returns; patch(_:payload:) delegates to it. Both keep submitting guard + reload."
  - "Test layout: ViewModel suite added under Features/Subscriptions/; existing 18-test ViewData suite stays at Features/Management/SubscriptionsViewDataTests.swift. Swift forbids duplicate file basenames in one target, so a second SubscriptionsViewDataTests.swift was NOT created. ≥4 ViewData + ≥6 VM requirement met across both files (27 Subscriptions tests)."
  - "LocalNotifications.reschedule(subscriptionsV10:) overload added — restores the 63-01 dropped rescheduling cleanly (all needed fields exist on SubscriptionV10DTO). Legacy SubscriptionDTO overload untouched."
metrics:
  duration: ~25min
  completed: 2026-05-20
---

# Phase 63 Plan 02: Subscriptions editor + post/unpost UI + tests Summary

Расширен v06 native SubscriptionEditor секциями «Счёт списания» (Picker, default = primary) и «День месяца» (Stepper 1...28, только monthly) с create-path через legacy create + follow-up V10 PATCH; master-list получил бейдж проведения, leading swipe «Провести»/«Отменить проведение» с confirmationDialog, 4 load-state и mutation-error banner; добавлен ViewModel-тест-сьют (9 тестов), полный suite 521 зелёный.

## What Was Built

### Task 1 — Editor + create-path (commit 3aa6a9a)
- `SubscriptionEditor`: новые поля `dayOfMonth: Int`, `accountId: Int?`; параметры `accounts: [AccountDTO]` + `onPatchV10` seam.
- Секция «День месяца» — `Stepper(value:$dayOfMonth, in: 1...28)`, рендерится только `if cycle == .monthly`. Для yearly остаётся DatePicker `nextChargeDate`.
- Секция «Счёт списания» — `Picker` с «Не указан».tag(Int?.none) + `ForEach(accounts)` (label = bank + ·mask), default в `.create` = primary ?? first.
- `canSave` теперь делегирует `SubscriptionsViewData.isValidDraft(...)`.
- `save()`:
  - `.create`: `SubscriptionsAPI.create(...)` (legacy, String date) → `created.id` → follow-up `onPatchV10(id, V10UpdateRequest(dayOfMonth:accountId:))` если есть что писать.
  - `.edit`: `SubscriptionsAPI.update(...)` (скаляры+дата) → follow-up V10 PATCH для day/account.
  - `error.localizedDescription` убран → фиксированная RU-копия + `print()` (T-63-02).
- VM: добавлен `patchById(_:payload:)`; `patch(_:payload:)` делегирует.
- `LocalNotifications.reschedule(subscriptionsV10:)` overload + вызов в `load()` (63-01 known-gap закрыт).

### Task 2 — Row badge + swipe post/unpost (commit a27605e)
- `SubscriptionsView.body` → 4-state `switch viewModel.status` (idle/loading → ProgressView, error → ContentUnavailableView, ready+empty → ContentUnavailableView, ready+content → Сводка + Подписки).
- `mutationErrorBanner` Section с dismiss-кнопкой (читает VM fixed RU копию).
- Leading swipe: «Провести» (когда `!isPosted`, tint .green) / «Отменить проведение» (когда `isPosted`, tint .orange, role .destructive) → ставит `postSubject`/`postIsUnpost` → `confirmationDialog` (titleVisibility .visible, message объясняет денежную мутацию) → `viewModel.post`/`unpost`.
- Trailing swipe «Удалить» сохранён; всё `.disabled(viewModel.submitting)`.
- `SubscriptionRow`: зелёный `checkmark.circle.fill` badge рядом с именем при `isPosted`.

### Task 3 — Unit tests (commit 31acc6d)
- `SubscriptionsViewModelTests` (9 тестов): initial idle state, derived getters (empty + withState), status equatable, clearMutationError, submitting initial false, `_setStateForTesting` populatesAll + error status, posted-state reflection.
- JSON-decode фабрики для `SubscriptionV10DTO`/`CategoryDTO` (через `convertFromSnakeCase`), `AccountDTO` через memberwise init.
- ViewData ≥4 покрыто существующим 18-тестовым сьютом (Features/Management/SubscriptionsViewDataTests.swift, 63-01).
- Итого Subscriptions: 27 тестов; полный suite 521 зелёный (iPhone 17 Pro).

## Deviations from Plan

### Auto-fixed / Plan-sanctioned adjustments

**1. [Rule 1 - Bug avoidance] Edit-path date stays on legacy String path (not full V10 patch)**
- **Found during:** Task 1
- **Issue:** Plan suggested edit-path could send full `SubscriptionV10UpdateRequest` incl. `nextChargeDate: Date?`. APIClient encoder uses `.iso8601` (UTC), and `next_charge_date` is a DATE field — a Date at MSK midnight would serialize to the previous calendar day in UTC (day-shift bug). Plan explicitly flagged this ("проверить как сериализует Date; если требует String — адаптировать").
- **Fix:** Edit-path sends scalars+date via legacy `SubscriptionsAPI.update` (String `yyyy-MM-dd` via `DateFormatters.isoDate`, no shift) and only `day_of_month`/`account_id` via V10 PATCH. Symmetric with create-path.
- **Files modified:** SubscriptionsView.swift
- **Commit:** 3aa6a9a

**2. [Rule 2 - Restore critical functionality] LocalNotifications.reschedule restored via V10 overload**
- **Found during:** Task 1 (invited by prior-wave context)
- **Issue:** 63-01 dropped the reschedule call (legacy `SubscriptionDTO` had no init for V10DTO mapping). `SubscriptionV10DTO` carries all fields reschedule reads (id/name/amountCents/notifyDaysBefore/nextChargeDate/isActive).
- **Fix:** Added `reschedule(subscriptionsV10:)` overload (legacy one untouched); VM `load()` calls it after fetch. Notifications now reschedule on every load.
- **Files modified:** LocalNotifications.swift, SubscriptionsView.swift
- **Commit:** 3aa6a9a

**3. [Test-layout] Second test file NOT created at planned path (basename collision)**
- **Found during:** Task 3
- **Issue:** Plan frontmatter listed `Features/Subscriptions/SubscriptionsViewDataTests.swift`, but a `SubscriptionsViewDataTests.swift` already exists at `Features/Management/` (63-01, 18 tests). Swift forbids two source files sharing a basename in one target ("Filename used twice" — Phase 62-01 lesson).
- **Fix:** Added only the ViewModel suite under `Features/Subscriptions/`; left the existing ViewData suite in place. Combined ≥4 ViewData + ≥6 VM holds (27 tests).
- **Commit:** 31acc6d

## Threat Model Compliance

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-63-01 (swipe double-trigger post) | confirmationDialog + VM submitting guard; swipe `.disabled(submitting)` | ✓ |
| T-63-02 (error surface leak) | banner reads VM fixed RU copy; editor save catch → fixed RU + print(); 0 localizedDescription (non-comment) | ✓ |
| T-63-05 (accidental post/unpost) | confirmationDialog titleVisibility .visible + explanatory message before money mutation | ✓ |
| T-63-06 (create + PATCH partial failure) | accept: legacy create succeeds → sub exists; PATCH failure → mutationError + load() shows real state; user can reopen editor | ✓ (documented) |

## Acceptance Criteria

- [x] Editor «Счёт списания» Picker (default primary) + «День месяца» Stepper(1...28) monthly-only + yearly DatePicker
- [x] `grep -c "1...28"` = 2 (≥1)
- [x] create-path = legacy `SubscriptionsAPI.create` + follow-up V10 patch; edit-path = legacy update + V10 patch
- [x] 0 `error.localizedDescription` non-comment in editor save
- [x] Leading swipe «Провести»/«Отменить проведение» → confirmationDialog → viewModel.post/unpost
- [x] Posted badge (checkmark) in row when isPosted
- [x] 4 load-state body switch + mutation-error banner
- [x] `grep -c "confirmationDialog"` = 3 (≥2)
- [x] ≥10 tests (27 Subscriptions); full suite 521 GREEN (iPhone 17 Pro)
- [x] FeaturesV10/Subscriptions/* untouched

## Self-Check: PASSED
