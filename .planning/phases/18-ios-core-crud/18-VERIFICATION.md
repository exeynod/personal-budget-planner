---
phase: 18
status: human_needed
date: 2026-05-09
---

# Phase 18 Verification: iOS Core CRUD

## Code Status — все компилируется

**BUILD SUCCEEDED** на iPhone 17 Pro Simulator со всеми новыми файлами:
- `Domain/Period.swift` + `Domain/DateFormatters.swift`
- `Networking/DTO/TransactionDTO.swift` (Actual/Planned/Settings/Category Create/Update DTOs)
- `Networking/Endpoints/TransactionsAPI.swift` (ActualAPI, PlannedAPI, CategoriesWriteAPI, SettingsAPI)
- `Features/Transactions/TransactionsView.swift` (sub-tabs History/Planned + FAB + grouped lists + swipe Delete)
- `Features/Transactions/TransactionEditor.swift` (bottom-sheet с amount/category/date/description, kind segmented control)
- `Features/Management/CategoriesView.swift` (CRUD + archive/restore + NewCategoryForm sheet)
- `Features/Management/SettingsView.swift` (cycle_start_day picker + notify_days_before stepper + AI toggle + logout)
- `Features/Management/ManagementView.swift` (хаб NavigationStack + 5 sub-screens)
- `BudgetPlannerTests/PeriodTests.swift` (5 cases: mid-period, before-cycle, exact-cycle, day-31-Jan, year-boundary)
- `BudgetPlannerTests/MoneyTests.swift` (9 cases для парсера + 5 для форматтера)

## E2E Smoke Verified

После reinstall + autologin приложение делает реальные запросы:
- POST /auth/dev-exchange → 200
- GET /me → 200
- GET /periods/current → 200
- GET /periods/1/balance → 200

И Home показывает реальные данные (баланс 239 292 ₽, top-3 категории с дельтами).

## Human UAT Required

Простые UI tap-проверки на симуляторе (программный tap через simctl на iOS не работает):

1. **Транзакции tab → History:** список actual-транзакций сгруппирован по дням, swipe-delete работает
2. **Транзакции tab → Plan:** список plan-категорий, inline редактирование через тап
3. **FAB (+):** открывает TransactionEditor; ввод суммы через MoneyParser, выбор категории, save → транзакция в History и баланс пересчитан
4. **Меню → Категории:** список с архив/восстановить через context menu; FAB создаёт новую через NewCategoryForm
5. **Меню → Настройки:** picker cycle_start_day, stepper notify_days_before, toggle AI, кнопка "Выйти" (logout)
6. **Logout:** возврат на DevTokenSetupView

## Tests

XCTest файлы готовы. Запуск:
```
cd ios
xcodebuild test -project BudgetPlanner.xcodeproj -scheme BudgetPlanner \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

(не запускал автоматически в этом сеансе — конфликт с running app instance.)

## Acceptance per REQ

| REQ | Status |
|---|---|
| IOS-08 (period_for) | ✓ ported, XCTest cases written |
| IOS-09 (MoneyParser/Formatter) | ✓ XCTest cases written |
| IOS-12 (TransactionsView) | ✓ code, ⏳ manual UAT |
| IOS-13 (TransactionEditor) | ✓ code, ⏳ manual UAT |
| IOS-14 (Categories + Settings) | ✓ code, ⏳ manual UAT |
