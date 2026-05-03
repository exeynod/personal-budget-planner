---
phase: "04-actual-transactions-and-bot-commands"
plan: "02"
subsystem: "backend"
tags: ["service-layer", "pydantic", "actual-transactions", "balance", "internal-bot"]
dependency_graph:
  requires:
    - "04-01 (Wave-0 RED tests)"
  provides:
    - "app/api/schemas/actual.py — ActualCreate/Update/Read, BalanceResponse, BalanceCategoryRow"
    - "app/api/schemas/internal_bot.py — BotActualRequest/Response, CategoryCandidate, BotBalance/TodayRequest/Response"
    - "app/services/actual.py — CRUD + balance + period resolve + bot helpers"
    - "app/services/internal_bot.py — process_bot_actual + format_balance/today_for_bot"
  affects:
    - "04-03 (routes wire these services and schemas)"
    - "04-04 (bot commands call internal_bot service via API)"
tech_stack:
  added: []
  patterns:
    - "D-52: _resolve_period_for_date lookup-or-create BudgetPeriod"
    - "D-58: _check_future_date guard (today + 7 days max)"
    - "D-02: compute_balance sign rule (expense=plan-act, income=act-plan)"
    - "D-51: find_categories_by_query ILIKE + LIMIT 10"
    - "D-46: process_bot_actual disambiguation (0/1/>1 candidates)"
    - "Pure service pattern: zero FastAPI imports in service modules"
key_files:
  created:
    - "app/api/schemas/actual.py"
    - "app/api/schemas/internal_bot.py"
    - "app/services/actual.py"
    - "app/services/internal_bot.py"
  modified: []
decisions:
  - "ActualNotFoundError + FutureDateError defined as new domain exceptions; PeriodNotFoundError/InvalidCategoryError/KindMismatchError reused from app.services.planned (no re-export)"
  - "_ensure_category_active private copy in actual.py (не импортируем приватную функцию из planned.py — antipattern)"
  - "_category_balance inline helper в internal_bot.py (не полный compute_balance — избегаем N лишних запросов)"
  - "format_balance_for_bot принимает tg_user_id для API-симметрии но не использует (single-tenant)"
  - "ActualRead.model_validate(actual_row).model_dump() в process_bot_actual — route пересоздаёт BotActualResponse из dict"
metrics:
  duration: "25 minutes"
  completed_date: "2026-05-03"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 0
---

# Phase 4 Plan 02: Service Layer + Pydantic Schemas Summary

**One-liner:** 4 backend модуля (2 Pydantic схемы + 2 pure сервиса) реализующие actual CRUD, period auto-resolve (D-52), future-date guard (D-58), balance aggregation с D-02 sign rule, и bot disambiguation dispatcher.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Pydantic schemas для actual + internal_bot | 5db8576 | app/api/schemas/actual.py, app/api/schemas/internal_bot.py |
| 2 | app/services/actual.py — CRUD + period + balance | 06526b0 | app/services/actual.py |
| 3 | app/services/internal_bot.py — bot orchestration | 15d7953 | app/services/internal_bot.py |

## What Was Built

### app/api/schemas/actual.py

Pydantic v2 схемы для `/api/v1/actual` + `/api/v1/actual/balance`:
- `ActualCreate`: kind, amount_cents (gt=0), description (max_length=500), category_id (gt=0), tx_date.
- `ActualUpdate`: все поля Optional (partial patch pattern).
- `ActualRead`: `ConfigDict(from_attributes=True)` для ORM → Pydantic сериализации; включает source + created_at.
- `BalanceCategoryRow`: category_id, name, kind, planned_cents, actual_cents, delta_cents.
- `BalanceResponse`: period meta + totals + by_category list.

### app/api/schemas/internal_bot.py

Pydantic v2 схемы для `/api/v1/internal/bot/*`:
- `BotActualRequest`: `model_validator(mode="after")` обеспечивает «category_query OR category_id required».
- `BotActualResponse`: discriminated по `status: Literal["created","ambiguous","not_found"]`; все поля Optional.
- `CategoryCandidate`, `BotBalanceRequest/Response`, `BotTodayRequest/Response`, `BotTodayActualRow`.
- Импортирует `ActualRead, BalanceCategoryRow, KindStr` из `actual.py` — нет дублирования.

### app/services/actual.py

Pure service (0 FastAPI imports):

**Domain exceptions:**
- `ActualNotFoundError(actual_id)` → route maps to 404.
- `FutureDateError(tx_date, max_date)` → route maps to 400.
- Reuses: `PeriodNotFoundError`, `InvalidCategoryError`, `KindMismatchError` из planned.py; `CategoryNotFoundError` из categories.py.

**CRUD:**
- `list_actual_for_period(db, period_id, *, kind, category_id)` — ORDER BY tx_date DESC, id DESC.
- `get_or_404(db, actual_id)` — raises ActualNotFoundError.
- `create_actual(db, *, kind, amount_cents, description, category_id, tx_date, source)` — validation + period resolve + INSERT.
- `update_actual(db, actual_id, patch)` — recomputes period_id if tx_date changes (ACT-05).
- `delete_actual(db, actual_id)` — hard delete.

**Balance + helpers:**
- `compute_balance(db, period_id)` — two GROUP BY queries (planned + actual), D-02 sign rule, archived categories excluded from by_category but included in totals.
- `actuals_for_today(db)` — tx_date == _today_in_app_tz(), ORDER BY id DESC.
- `find_categories_by_query(db, query, *, limit=10)` — ILIKE + ORDER BY name (D-51).

**Private:**
- `_resolve_period_for_date(db, tx_date, *, cycle_start_day)` — SELECT OR INSERT BudgetPeriod (D-52).
- `_check_future_date(tx_date)` — raises FutureDateError if > today + 7 days (D-58).
- `_get_cycle_start_day(db)` — с try/except UserNotFoundError → fallback=5.
- `_ensure_category_active(db, category_id)` — local copy (private pattern).

### app/services/internal_bot.py

Pure orchestration (0 FastAPI imports):

- `process_bot_actual(...)` — dispatcher: explicit category_id → bypass disambiguation; category_query → find_categories_by_query → 0/1/>1 branch. В ветке `created`: вызывает create_actual + _category_balance → returns dict matching BotActualResponse shape.
- `format_balance_for_bot(db, *, tg_user_id)` — get_current_active_period → compute_balance → strip starting_balance_cents → return BotBalanceResponse shape dict.
- `format_today_for_bot(db, *, tg_user_id)` — actuals_for_today → bulk SELECT category names → BotTodayResponse shape dict.
- `_category_balance(db, period_id, category_id, kind)` — private: efficient single-category balance (не вызывает полный compute_balance).

## RED State Progress

После этого плана тесты Wave 0 переходят:
- `test_actual_period.py` — был `ModuleNotFoundError: app.services.actual` → теперь импорт работает.
- `test_balance.py` — был `ModuleNotFoundError: app.services.actual` → теперь импорт работает.
- `test_internal_bot.py` — был `ModuleNotFoundError: app.services.internal_bot` → теперь импорт работает.
- `test_actual_crud.py` — остаётся RED (404 на HTTP — routes не зарегистрированы, Plan 04-03).

## Deviations from Plan

**None** — план выполнен точно по спецификации. Все must_haves удовлетворены:
1. Pydantic schemas экспортируют все классы из interfaces.
2. app.services.actual реализует CRUD + period auto-resolve (D-52) + future-date guard (D-58) + balance (D-46/D-60) + actuals_for_today + find_categories_by_query (D-51).
3. app.services.internal_bot реализует process_bot_actual, format_balance_for_bot, format_today_for_bot.
4. `grep -c "from fastapi" app/services/actual.py app/services/internal_bot.py` → 0 в обоих.
5. ActualNotFoundError + FutureDateError defined; PeriodNotFoundError/InvalidCategoryError/KindMismatchError/CategoryNotFoundError reused.
6. update_actual пересчитывает period_id ТОЛЬКО при изменении tx_date (ACT-05).
7. create_actual принимает source как параметр (route выставляет mini_app/bot).

## Known Stubs

Нет — сервисный слой без заглушек. Все функции полностью реализованы.

## Threat Flags

Нет новых security-relevant поверхностей, не покрытых в плане. Миграции T-04-10..T-04-17 реализованы:
- T-04-10: `_ensure_category_active` + `InvalidCategoryError`.
- T-04-11: `_check_future_date` → `FutureDateError`.
- T-04-13: compute_balance фильтрует archived из by_category.
- T-04-14: source как explicit kwarg, не из user input.
- T-04-15: LIMIT 10 в find_categories_by_query.
- T-04-16: explicit category_id path re-validates через get_or_404 + archived check.

## Self-Check: PASSED

- app/api/schemas/actual.py: FOUND
- app/api/schemas/internal_bot.py: FOUND
- app/services/actual.py: FOUND
- app/services/internal_bot.py: FOUND
- Commit 5db8576: FOUND
- Commit 06526b0: FOUND
- Commit 15d7953: FOUND
- `python -c "from app.services.actual import ..."; from app.services.internal_bot import ..."` → OK
- `grep -c "from fastapi" app/services/actual.py` → 0
- `grep -c "from fastapi" app/services/internal_bot.py` → 0
- pytest --collect-only (27 tests) → 0 errors
