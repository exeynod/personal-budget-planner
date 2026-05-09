# Phase 18: iOS Core CRUD — Context

**Mode:** Auto-generated (autonomous workflow). Спирается на Phase 17 foundation.

## Scope (REQs IOS-08, IOS-09, IOS-12, IOS-13, IOS-14)

- IOS-08: `period_for` Swift port + XCTest cases (точный порт `app/core/period.py`)
- IOS-09: MoneyFormatter / MoneyParser XCTest
- IOS-12: TransactionsView с sub-tabs History / Planned + swipe Edit/Delete
- IOS-13: TransactionEditor bottom-sheet (amount/category/date/description)
- IOS-14: CategoriesView CRUD + SettingsView

## Decisions

- **Period.swift:** `Calendar` с `TimeZone(identifier: "Europe/Moscow")`. Порт точный, edge cases (cycle 31 + Feb) тестируются.
- **Tests target:** XCTest через xcodebuild test. Простой smoke без UI.
- **TransactionEditor:** `.sheet` с `.presentationDetents([.medium, .large])`.
- **FAB (центральная +):** добавляется в TransactionsView как overlay.
- **Inline plan editor (CapEditSheet):** упрощённая форма из Phase 18, в Phase 19 расширим.

## Plan breakdown

1. 18-01: Period.swift + XCTest (IOS-08)
2. 18-02: MoneyParser/Formatter XCTest (IOS-09)
3. 18-03: Transactions DTO/API + TransactionsView shell (IOS-12)
4. 18-04: TransactionEditor bottom-sheet (IOS-13)
5. 18-05: CategoriesView + Categories API write methods (IOS-14)
6. 18-06: SettingsView + Settings API (IOS-14)
