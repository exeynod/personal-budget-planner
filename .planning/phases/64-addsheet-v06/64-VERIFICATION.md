---
phase: 64-addsheet-v06
verified: 2026-05-20T17:45:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
human_verification:
  - test: "Открыть Add-sheet из Home/Transactions (createActual). Ввести описание ≥3 символов (например «кофе»), подождать ~0.5с. Под полем описания должен появиться tappable chip «AI: <категория>». Тап по нему проставляет категорию в Picker."
    expected: "Chip появляется при наличии Pro-доступа и confidence≥0.5; тап выбирает категорию (видна в Picker «Категория»); повторный быстрый ввод заменяет подсказку, без мерцания старой."
    why_human: "Реальный сетевой ответ /ai/suggest-category, debounce-тайминг и визуальный рендер chip не воспроизводимы программно (требует live backend + Pro-аккаунт + UI)."
  - test: "В createActual/editActual проверить секцию «Счёт списания»: Picker предзаполнен primary-счётом, есть опция «Не указан». Сохранить с выбранным счётом и с «Не указан»."
    expected: "Секция видна только в actual-режимах (нет в planned), default = primary; при «Не указан» транзакция сохраняется без счёта (как раньше)."
    why_human: "Визуальное появление секции + реальный список счетов из AccountsAPI + сохранение на backend требуют live-устройства/симулятора с данными."
  - test: "Non-pro сценарий: войти под аккаунтом без Pro, ввести описание в Add-sheet. Подсказка не должна появиться, и пользователя НЕ должно выкинуть из приложения (no logout)."
    expected: "Chip не появляется (silent 403), сессия сохраняется, никакого error-banner."
    why_human: "Требует non-pro backend-аккаунт и наблюдение за тем, что глобальный logout НЕ срабатывает — поведение runtime."
---

# Phase 64: AddSheet нативный (v06) Verification Report

**Phase Goal:** Замена `TransactionEditor` modal на расширенный native Form sheet — без custom keypad, используем `keyboardType: .decimalPad`. Picker категории/счёта. Подсказка AI-категории inline.

**Verified:** 2026-05-20T17:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Scope note

Согласно 64-CONTEXT scope-correction, editor УЖЕ был native Form sheet с `.decimalPad` (custom keypad'а не существовало — выполнено в Phase 17-21/25). Net-new фазы 64 = (1) account Picker, (2) inline AI category hint. Фаза НЕ оценивается на «удаление keypad'а» — удалять было нечего. Pre-existing `.decimalPad` + category Picker проверены на отсутствие регрессии.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Account Picker «Счёт списания» в actual-режимах (createActual/editActual) | ✓ VERIFIED | TransactionEditor.swift:133-142 — Section gated `mode.isActual, !accounts.isEmpty`; Picker selection `$selectedAccountId` |
| 2  | Default = primary ?? first | ✓ VERIFIED | AccountPickerLogic.swift:22-24 + editor:265-267 `if selectedAccountId == nil { = defaultAccountId(list) }`; тест test_defaultAccountId_primaryPresent_returnsPrimaryNotFirst |
| 3  | Опция «Не указан» (nil) → accountId=nil сохраняет «без счёта» | ✓ VERIFIED | editor:136 `Text("Не указан").tag(Int?.none)`; encodeIfPresent в DTO опускает ключ при nil — тест test_encode_accountIdNil_omitsKey |
| 4  | В planned-режимах секция счёта отсутствует | ✓ VERIFIED | editor:133 gated `mode.isActual`; planned-ветки save() (createPlanned/editPlanned) не передают accountId |
| 5  | Accounts пусты/не загрузились → секция скрыта, save с accountId=nil | ✓ VERIFIED | editor:133 `!accounts.isEmpty`; loadAccounts():268-275 catch graceful (no banner), accountId остаётся nil |
| 6  | accountId передаётся в ActualCreateRequest + ActualUpdateRequest | ✓ VERIFIED | editor:326 (create) и :346 (update) `accountId: selectedAccountId`; DTO TransactionDTO.swift:117,151 encodeIfPresent |
| 7  | Inline AI hint: debounce-запрос GET /ai/suggest-category?q= при ≥3 символах | ✓ VERIFIED | AISuggestHint.swift:44-61 (minChars=3, debounce=.milliseconds(500)); AISuggestCategoryAPI.swift:36-41 GET «/ai/suggest-category» query q |
| 8  | Cancellable: новый ввод отменяет старый; stale-ответ не перетирает новый | ✓ VERIFIED | AISuggestHint.swift:45 task.cancel(), :54+:58 Task.isCancelled до и ПОСЛЕ await suggest; тест test_fastSecondQuery_cancelsSlowFirst (AsyncGate) PASS |
| 9  | Tappable chip при category_id != nil, tap проставляет categoryId (не авто) | ✓ VERIFIED | editor:162-169 chip gated `!mode.isEdit, suggestion.categoryId != nil`; applySuggestion только из Button tap; helper не мутирует categoryId (AISuggestHint без такого API) |
| 10 | 403/error → silent (no banner, NO logout) | ✓ VERIFIED | APIClient.swift:173 403 gated `!suppressForbiddenHandler`; AISuggest:41 ставит true; suggest() non-throwing → nil; тест test_closureReturnsNil_suggestionStaysNil |
| 11 | Public API + 3 call-site неизменны | ✓ VERIFIED | HomeView:72, TemplateView:144, TransactionsView:326/333 все используют `TransactionEditor(mode:categories:onSaved:)` без accountId/новых параметров |

**Score:** 11/11 truths verified

### Review Warnings (WR-01/02/03) + IN-01 — Fixed

| ID | Fix | Status | Evidence |
| -- | --- | ------ | -------- |
| WR-01 | `.onDisappear { aiHint.clear() }` отменяет in-flight Task при dismiss (no post-dismiss PII) | ✓ VERIFIED | editor:210; тест test_clearWhileInFlight_cancelsTask_suggestionStaysNil PASS |
| WR-02 | 401 ВСЕГДА логаутит; suppression только для 403 (renamed → suppressForbiddenHandler) | ✓ VERIFIED | APIClient.swift:158-165 (401 безусловный onUnauthenticated), :166-174 (403 gated). Default false; единственный true-call-site = AISuggest |
| WR-03 | applySuggestion применяет categoryId ТОЛЬКО если резолвится в локальную non-archived категорию | ✓ VERIFIED | AISuggestApply.resolve (AccountPickerLogic.swift:60-74) guard present+!archived; editor:243-250 делегирует; тесты test_resolve_unknownId/archivedCategory_ignored PASS |
| IN-01 | Логи без интерполяции raw error (PII в URL); только #if DEBUG со статической категорией | ✓ VERIFIED | AISuggestCategoryAPI.swift:51-53 `#if DEBUG print(... type(of: error))`; editor:272-274 то же для loadAccounts |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `TransactionEditor.swift` | Account Picker + AI chip + WR-fixes | ✓ VERIFIED | Все секции, .onDisappear, applySuggestion via resolver, .decimalPad pre-existing intact |
| `AISuggestHint.swift` | @Observable debounce helper, injectable seam | ✓ VERIFIED | @MainActor @Observable; init с suggest closure default; cancellable Task |
| `AccountPickerLogic.swift` | pure default/label + AISuggestApply.resolve | ✓ VERIFIED | Два enum: AccountPickerLogic (default/label) + AISuggestApply (WR-03 resolver) |
| `AISuggestCategoryAPI.swift` | wrapper GET suggest-category, silent, suppressForbiddenHandler | ✓ VERIFIED | SuggestCategoryDTO + suggest(q:) non-throwing → nil |
| `APIClient.swift` | suppressForbiddenHandler default false | ✓ VERIFIED | request/requestVoid/rawRequest все имеют параметр default false |
| `TransactionDTO.swift` | ActualUpdateRequest.accountId encodeIfPresent | ✓ VERIFIED | :135 var accountId=nil, :151 encodeIfPresent |
| Test files (4) | unit-тесты | ✓ VERIFIED | AISuggestHintTests(6), AISuggestApplyTests(6), TransactionEditorAccountTests(6), ActualUpdateRequestTests(5) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| editor .task | AccountsAPI.list() | async load | ✓ WIRED | editor:262 |
| editor save() | ActualCreate/UpdateRequest.accountId | selectedAccountId | ✓ WIRED | :326, :346 |
| description TextField | AISuggestHint.descriptionChanged | .onChange | ✓ WIRED | editor:153-155 gated `!mode.isEdit` |
| AISuggestHint | AISuggestCategoryAPI.suggest | injectable closure default | ✓ WIRED | AISuggestHint.swift:33-35 |
| chip tap | categoryId | applySuggestion via resolver | ✓ WIRED | editor:163-164,243-249 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 64 tests green | xcodebuild test (4 targets) | Executed 23 tests, 0 failures | ✓ PASS |
| Build compiles | (implied by TEST SUCCEEDED) | TEST SUCCEEDED | ✓ PASS |
| Only AISuggest sets suppressForbiddenHandler:true | grep -rn | 1 call-site (AISuggestCategoryAPI:41) | ✓ PASS |
| 3 call-sites unchanged signature | grep TransactionEditor( | mode:categories:onSaved: only | ✓ PASS |

Note: ran the 4 phase-specific test targets (23 tests). The full-suite "554 tests" claim was not re-run end-to-end, but the phase-scoped subset is green and the project compiles.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| AccountPickerLogic.swift | 29 | empty-mask → trailing " ·" | ℹ️ Info | IN-02, documented by test as intentional current behaviour |
| TransactionEditor.swift | editActual | legacy ActualDTO has no accountId → edit may default account | ℹ️ Info | IN-03, bounded by legacy DTO surface; deferred (editor migration out of scope) |

No blocker or warning-level anti-patterns. `selectedAccountId = nil` / `accounts = []` are initial state overwritten by loadAccounts — not stubs.

### Gaps Summary

No gaps. All 11 must-have truths verified in source; all 3 review warnings + IN-01 fixed and confirmed; phase-scoped tests green (23/23); build compiles. The pre-existing `.decimalPad` and category Picker are intact (no regression).

Status is `human_needed` (not `passed`) solely because three behaviors require live-device/backend smoke that cannot be verified programmatically: (1) AI chip appearance + tap with real Pro backend, (2) account Picker visual render + save round-trip, (3) non-pro 403 silent-no-logout runtime behavior. These are smoke-confirmations of already-correct code, not gaps.

---

_Verified: 2026-05-20T17:45:00Z_
_Verifier: Claude (gsd-verifier)_
