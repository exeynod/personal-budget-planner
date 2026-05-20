---
phase: 63-subscriptions-v06
verified: 2026-05-20T17:10:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Свайп влево по подписке → «Провести» → подтвердить в диалоге"
    expected: "Создаётся транзакция-списание на сервере; после reload появляется зелёный checkmark-бейдж и swipe-кнопка меняется на «Отменить проведение». Деньги списываются со счёта."
    why_human: "Денежная мутация против реального backend — нельзя проверить без живого сервера/initData; модель замокана в тестах."
  - test: "Свайп по уже проведённой подписке → «Отменить проведение» → подтвердить"
    expected: "Связанная транзакция удаляется, бейдж пропадает после reload."
    why_human: "Реальная серверная мутация (unpost) + UI-жест swipe."
  - test: "Создать monthly-подписку с выбранным счётом и днём месяца ≠ 1"
    expected: "Подписка создаётся (legacy create), затем follow-up V10 PATCH записывает day_of_month и account_id; row показывает «ежемесячно, N числа». При сбое PATCH sheet НЕ закрывается, показывается «Подписка создана, но счёт/день не сохранились…»."
    why_human: "Двухзапросный create-path (create+PATCH) и partial-failure UX требуют живого backend; код-путь проверен статически + unit (patchById)."
  - test: "Открыть legacy monthly-подписку (без day_of_month) и нажать «Сохранить» не трогая Stepper"
    expected: "day_of_month НЕ принудительно записывается в 1 (WR-03): follow-up PATCH с day=nil; caption остаётся «ежемесячно», а не «ежемесячно, 1 числа». Счёт по-прежнему пишется если выбран."
    why_human: "Зависит от того, какой day_of_month вернул backend для legacy-строки; диффинг originalDayOfMonth проверяется только на живых данных."
  - test: "Уведомление о подписке на устройстве восточнее МСК (UTC+5+)"
    expected: "Fire-date нотификации и daysUntil в row не смещаются на день (WR-05): yyyy-MM-dd декодится в Europe/Moscow."
    why_human: "Требует устройство/симулятор с восточным TZ и наблюдение запланированной нотификации; нельзя из unit-теста."
---

# Phase 63: Subscriptions расширенные (v06 native) Verification Report

**Phase Goal:** post/unpost action, day_of_month, account_id selection. Form-based редактор с DatePicker и Picker (счёт). Миграция на SubscriptionsV10API.
**Verified:** 2026-05-20T17:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (NB: SUMMARYs reflect pre-fix state; all 6 REVIEW warnings were fixed afterward and the fixes are confirmed present in current source.)

## Goal Achievement

ROADMAP Phase 63 has no explicit `success_criteria` block — only a Goal line. Must-haves merged from the two PLAN frontmatters (63-01: 6 truths, 63-02: 7 truths) + ROADMAP goal + CONTEXT decisions. The post-REVIEW fix pass (WR-01..06) was treated as part of the deliverable and verified against current source, not the SUMMARYs.

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | VM грузит через `SubscriptionsV10API.list()` (не legacy `SubscriptionsAPI.list`) | ✓ VERIFIED | `API.live.listSubs` → `SubscriptionsV10API.list()` (SubscriptionsView.swift:42); `grep SubscriptionsAPI.list` in file = NONE |
| 2 | Список показывает 4 load-state (loading/error/empty/content) | ✓ VERIFIED | `switch viewModel.status` body:246-257 → loadingSection / errorSection / ready(empty→ContentUnavailableView) / ready(content) |
| 3 | post создаёт транзакцию, postedTxnId после reload | ✓ VERIFIED | `post()` → `api.post` → `load()` (118-135); `live.post` → `SubscriptionsV10API.post(id:)`; reload refreshes DTO incl. postedTxnId. Live confirm = human |
| 4 | unpost отменяет проведение | ✓ VERIFIED | `unpost()` 138-156 → `api.unpost` → reload; `live.unpost` → `SubscriptionsV10API.unpost(id:)` |
| 5 | post/unpost: submitting-guard + full reload on success | ✓ VERIFIED | `guard !submitting`...`defer{submitting=false}`...`await load()` (119-125); unit `test_post_submittingGuard_blocksSecondCall`, `test_post_success_clearsErrorAndReloads` |
| 6 | На failure post/unpost/delete — фикс. RU-копия, raw error не утекает | ✓ VERIFIED | catch → `print(...)` + fixed RU `mutationError`; 0 `localizedDescription` non-comment in file; unit `test_post_failure_setsFixedRuCopy...`, `test_delete_failure...` |
| 7 | Бейдж проведения (checkmark) в row при isPosted | ✓ VERIFIED | SubscriptionRow:484-489 `if isPosted → checkmark.circle.fill .green`; unit `test_postedState_reflectedInSubscriptions` |
| 8 | post/unpost через leading swipe + confirmationDialog | ✓ VERIFIED | `.swipeActions(edge:.leading)` 406-426 (Провести/Отменить проведение) → `postSubject` → `.confirmationDialog` 271-296 → `viewModel.post/unpost` |
| 9 | Редактор: Picker «Счёт списания» (AccountsAPI.list, default primary) | ✓ VERIFIED | Section «Счёт списания» 635-648 Picker «Не указан».tag(nil)+ForEach(accounts); populate default `accounts.first(where:\.primary)?.id ?? first` (730); accounts из `api.listAccounts`=AccountsAPI.list |
| 10 | Редактор: Stepper «День месяца» (1...28) ТОЛЬКО для monthly | ✓ VERIFIED | `if cycle == .monthly { Stepper(value:$dayOfMonth, in:1...28) }` 618-630 |
| 11 | Для yearly — DatePicker nextChargeDate (без day_of_month) | ✓ VERIFIED | DatePicker «Следующее списание» 631-634 безусловный; Stepper скрыт при yearly |
| 12 | create-path: legacy create + follow-up V10 PATCH; partial-failure surfaces error (WR-02) | ✓ VERIFIED | save() .create 783-810: `SubscriptionsAPI.create` → `onPatchV10`; `if !ok { onSaved(); errorMessage="Подписка создана, но счёт/день не сохранились…"; return }` (НЕ dismiss) |
| 13 | ≥10 unit-тестов на VM-мутации + pure-helpers зелёные | ✓ VERIFIED | 19 VM + 18 ViewData = 37 Subscriptions tests; full suite 531/531 GREEN (iPhone 17 Pro), 0 failures |

**Score:** 13/13 truths verified

### Post-REVIEW Fix Verification (WR-01..06, IN-01)

| Warning | Fix claimed | Status | Evidence |
| ------- | ----------- | ------ | -------- |
| WR-01 mutation reload dropped when load in-flight | reloadPending flag | ✓ VERIFIED | `reloadPending` 75-76; load() sets it on skip + re-runs in defer (81-92); unit `test_load_coalescesPendingReload_whenInFlight` |
| WR-02 create follow-up PATCH failure swallowed | check result, keep sheet open | ✓ VERIFIED | save():796-810 (create) + 825-837 (edit): `if !ok { errorMessage=...; return }` no dismiss |
| WR-03 edit force-writes day_of_month=1 | track originalDayOfMonth, PATCH only if changed | ✓ VERIFIED | `originalDayOfMonth` 569-572; populate sets it (736,746); save: `dayChanged = (cycle==.monthly)&&(dayOfMonth != originalDayOfMonth)` 774; dayPayload nil unless changed |
| WR-04 VM tests don't exercise mutations | injectable API seam + behavior tests | ✓ VERIFIED | `struct API` seam 31-51 (`.live` default); APISpy in tests; 8 mutation/guard/coalesce tests pass |
| WR-05 yyyy-MM-dd decodes device-local TZ | pin decode to Europe/Moscow | ✓ VERIFIED | APIClient.swift:53-55 `if fmt=="yyyy-MM-dd" { df.timeZone = Europe/Moscow }`; encode side DateFormatters.isoDate also MSK |
| WR-06 post/unpost no reload on failure | reload in catch branch | ✓ VERIFIED | post catch:132 + unpost catch:153 `await load()`; unit `test_post_failure...andReloads_WR06` asserts listCalls==1 |
| IN-01 dead `cal` local | remove throwaway | ✓ VERIFIED | LocalNotifications.swift:26 `var moscowCal = Calendar(identifier:.gregorian)` directly (V10 overload) |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `Features/Management/SubscriptionsView.swift` | VM on V10API + post/unpost + editor + swipe + badge | ✓ VERIFIED | 848 lines, substantive; V10API ×4+, injectable seam, all editor sections, swipe+dialog |
| `Features/Management/SubscriptionsViewData.swift` | enum + 6 pure helpers, Foundation-only | ✓ VERIFIED | enum SubscriptionsViewData, 6 funcs, `import Foundation` only |
| `BudgetPlannerTests/.../SubscriptionsViewModelTests.swift` | ≥6 VM tests | ✓ VERIFIED | 19 tests incl. mutation/guard/coalesce |
| `BudgetPlannerTests/.../SubscriptionsViewDataTests.swift` | ≥4 ViewData tests | ✓ VERIFIED | 18 tests |
| `Domain/LocalNotifications.swift` | reschedule(subscriptionsV10:) overload | ✓ VERIFIED | V10 overload 20-68, MSK calendar; legacy overload untouched |
| `Networking/APIClient.swift` | yyyy-MM-dd MSK decode | ✓ VERIFIED | decode pinned to Europe/Moscow |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| VM.load | SubscriptionsV10API.list | API.live.listSubs | ✓ WIRED | parallel async let subs/cats/accs |
| VM.post/unpost | SubscriptionsV10API.post/unpost | API.live | ✓ WIRED | submitting guard → load() |
| Swipe action | viewModel.post/unpost | postSubject → confirmationDialog | ✓ WIRED | leading swipe → dialog → Task{post/unpost} |
| Editor account Picker | viewModel.accounts | sheet passes accounts:, default primary | ✓ WIRED | populate primary?.id ?? first |
| Editor create | SubscriptionsAPI.create + onPatchV10 | save() .create | ✓ WIRED | legacy create → follow-up patchById |
| VM.load | LocalNotifications.reschedule(subscriptionsV10:) | api.reschedule | ✓ WIRED | called after fetch (105) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| SubscriptionsView list | viewModel.subscriptions | api.listSubs → SubscriptionsV10API.list (live HTTP) | Yes (live API) | ✓ FLOWING |
| Editor account Picker | accounts | viewModel.accounts ← AccountsAPI.list | Yes | ✓ FLOWING |
| Row posted badge | sub.postedTxnId | V10 DTO from server, refreshed via load() after post | Yes | ✓ FLOWING |

No hardcoded empty props at call sites: `.sheet` passes `viewModel.categories`/`viewModel.accounts` (populated by load()).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Subscriptions test suites green | xcodebuild test -only-testing SubscriptionsViewModelTests/ViewDataTests | 37 tests, 0 failures | ✓ PASS |
| Full suite no regression | xcodebuild test (all) | 531 tests, 0 failures | ✓ PASS |
| VM uses no legacy list | grep SubscriptionsAPI.list | NONE | ✓ PASS |
| No raw error leak | grep localizedDescription (non-comment) | NONE | ✓ PASS |
| confirmationDialog present | grep -c confirmationDialog | 3 (post/unpost + delete editor + delete row) | ✓ PASS |

### Requirements Coverage

REQUIREMENTS.md tracks no IDs for milestone v1.1.2 (CONTEXT-derived scope). PLAN frontmatter cites SUBS-V10-01..04 but these are not in REQUIREMENTS.md; scope verified against ROADMAP goal + CONTEXT decisions instead. No orphaned requirements.

### Anti-Patterns Found

None blocking. Scanned SubscriptionsView.swift / SubscriptionsViewData.swift / LocalNotifications.swift / APIClient.swift:
- No TODO/FIXME/placeholder in shipped code (the 63-01 reschedule TODO was closed in 63-02).
- `return false`/`= nil` matches are legitimate guard returns and optional defaults overwritten by load(), not stubs.
- IN-02 (duplicate reschedule overloads) and IN-03 (label separator) from REVIEW are cosmetic Info-level; IN-03 separator was actually fixed (`" · \($0)"` at line 585). Not gaps.

### Human Verification Required

5 items (see frontmatter): live post/unpost money mutations, create-path partial-failure UX, WR-03 legacy-row day_of_month behavior on real data, WR-05 notification fire-date on east-of-MSK device. All require a live backend + initData and/or specific device timezone — they are live-smoke, NOT code gaps.

### Gaps Summary

No gaps. All 13 must-haves verified in current source. All 6 REVIEW warnings fixed and confirmed present (not just claimed in SUMMARY — SUMMARYs predate the fixes and show 521 tests; current source shows the fixes and 531 tests pass). FeaturesV10/Subscriptions/* untouched (last commit Phase 53 — coexistence intact). Build green, 531/531 tests pass. Remaining items are live-device smoke (human_needed), per phase instruction to classify live-smoke as human_verification rather than gaps.

---

_Verified: 2026-05-20T17:10:00Z_
_Verifier: Claude (gsd-verifier)_
