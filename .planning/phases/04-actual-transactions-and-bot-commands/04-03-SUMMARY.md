---
phase: "04-actual-transactions-and-bot-commands"
plan: "03"
subsystem: "backend"
tags: ["rest-routes", "fastapi", "actual-transactions", "internal-bot", "wave-2"]
dependency_graph:
  requires:
    - "04-02 (service layer + schemas)"
  provides:
    - "app/api/routes/actual.py — actual_router (5 public endpoints)"
    - "app/api/routes/internal_bot.py — internal_bot_router (3 internal endpoints)"
    - "app/api/router.py — registration of both new sub-routers"
  affects:
    - "04-04 (bot commands call /api/v1/internal/bot/* via HTTP)"
    - "04-05 (frontend calls /api/v1/actual and /api/v1/actual/balance)"
tech_stack:
  added: []
  patterns:
    - "Router-level Depends(get_current_user) — covers all public actual endpoints (T-04-20)"
    - "Sub-router inheritance pattern — internal_bot_router inherits verify_internal_token from parent (D-54)"
    - "URL declaration order — /actual/balance declared BEFORE /actual/{actual_id} to prevent path collision (T-04-25)"
    - "D-53: source=ActualSource.mini_app forced server-side in POST /actual (schema has no source field)"
    - "Exception cascade pattern — domain exceptions mapped to HTTPException per route"
key_files:
  created:
    - "app/api/routes/actual.py"
    - "app/api/routes/internal_bot.py"
  modified:
    - "app/api/router.py"
decisions:
  - "GET /actual/balance declared before PATCH/DELETE /actual/{actual_id} — FastAPI first-match routing; otherwise 'balance' parsed as int path param → 422 (T-04-25)"
  - "internal_bot_router has no dependencies= declaration — inherits verify_internal_token from parent internal_router to avoid double-execution (same pattern as internal_telegram_router)"
  - "POST /actual status_code=200 (consistent with Phase 3 planned.py pattern — not 201)"
metrics:
  duration: "20 minutes"
  completed_date: "2026-05-03"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 4 Plan 03: REST Routes (Wave 2) Summary

**One-liner:** 2 новых route-модуля (actual_router с 5 public endpoints + internal_bot_router с 3 internal endpoints) зарегистрированы в app/api/router.py, завершая backend Phase 4 — Wave 0 тесты собираются без import-ошибок.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create app/api/routes/actual.py with 5 endpoints | 4019bb6 | app/api/routes/actual.py |
| 2 | Create app/api/routes/internal_bot.py with 3 endpoints | e258c10 | app/api/routes/internal_bot.py |
| 3 | Register both routers in app/api/router.py | 8b318ac | app/api/router.py |

## What Was Built

### app/api/routes/actual.py — actual_router (5 endpoints)

Public router under `Depends(get_current_user)` at router-level (T-04-20):

- `GET /periods/{period_id}/actual` — list actual rows with optional `kind` / `category_id` filters; returns `[]` for unknown period_id (consistent with planned.py).
- `POST /actual` — create actual transaction; `source=ActualSource.mini_app` forced server-side (D-53, T-04-21). `ActualCreate` schema has no `source` field.
- `GET /actual/balance` — returns `BalanceResponse` for active period; 404 if no active period. **Declared BEFORE** `/actual/{actual_id}` to prevent FastAPI routing collision (T-04-25).
- `PATCH /actual/{actual_id}` — partial update; service re-resolves `period_id` if `tx_date` changes (ACT-05).
- `DELETE /actual/{actual_id}` — hard delete; returns deleted row state.

Exception mapping:
| Exception | HTTP Code |
|-----------|-----------|
| ActualNotFoundError | 404 |
| CategoryNotFoundError | 404 |
| InvalidCategoryError | 400 |
| KindMismatchError | 400 |
| FutureDateError | 400 |

### app/api/routes/internal_bot.py — internal_bot_router (3 endpoints)

Sub-router with `prefix="/bot"`, no `dependencies=` (inherits `verify_internal_token` from parent `internal_router`, D-54, T-04-22):

- `POST /bot/actual` → `/api/v1/internal/bot/actual` — ACT-03 disambiguation dispatcher; returns `BotActualResponse` with `status: "created" | "ambiguous" | "not_found"`.
- `POST /bot/balance` → `/api/v1/internal/bot/balance` — ACT-04 balance summary; `PeriodNotFoundError` → 404.
- `POST /bot/today` → `/api/v1/internal/bot/today` — ACT-04 today transactions; never 404 (empty list OK).

### app/api/router.py — Updated

- Added Phase 4 imports: `actual_router`, `internal_bot_router`.
- `public_router.include_router(actual_router)` — after Phase 3 planned includes.
- `internal_router.include_router(internal_bot_router)` — after Phase 2 internal_telegram include.
- Updated header docstring with Phase 4 route listing.

## Route Registration Verification

```
actual paths: ['/api/v1/periods/{period_id}/actual', '/api/v1/actual',
               '/api/v1/actual/balance', '/api/v1/actual/{actual_id}',
               '/api/v1/actual/{actual_id}', '/api/v1/internal/bot/actual']
bot paths: ['/api/v1/internal/bot/actual', '/api/v1/internal/bot/balance',
            '/api/v1/internal/bot/today']
register OK
```

## RED → GREEN Progress

- `test_actual_crud.py` (14 tests) — import OK; DB-backed, require live PostgreSQL.
- `test_actual_period.py` (3 tests) — import OK; 1 service-only test PASSES, 2 DB-backed.
- `test_balance.py` (4 tests) — import OK; DB-backed.
- `test_internal_bot.py` (6 tests) — import OK; DB-backed.
- Total: 27 tests collected, 0 import errors. 1 passed (service unit test), 26 require DB.

## Deviations from Plan

None — план выполнен точно по спецификации.

All must_haves satisfied:
1. `actual_router` зарегистрирован в `public_router` с router-level `Depends(get_current_user)`.
2. `POST /actual` force-устанавливает `source=ActualSource.mini_app`.
3. `GET /actual/balance` объявлен ДО `/actual/{actual_id}` (URL conflict avoidance).
4. `internal_bot_router` зарегистрирован в `internal_router` без своих dependencies (наследование).
5. Все domain exceptions → HTTPException mapping реализован по спецификации.
6. 27 Phase 4 тестов собираются без import-ошибок (коллекция проходит за 0.01s).

## Known Stubs

Нет — все endpoints полностью реализованы и делегируют в service-layer.

## Threat Flags

Нет новых security-relevant поверхностей за пределами плана.

Реализованные mitigations из threat register:
- T-04-20 (Spoofing): router-level `Depends(get_current_user)` → 403.
- T-04-21 (Elevation): `ActualCreate` schema без `source`; route force-устанавливает `mini_app`.
- T-04-22 (Spoofing): inherited `verify_internal_token` → 403 на /internal/bot/*.
- T-04-25 (Tampering): `/actual/balance` декларирован перед `/actual/{actual_id}`.
- T-04-24 (Info Disclosure): exception messages используют `str(exc)` без secrets.

## Self-Check: PASSED

- app/api/routes/actual.py: FOUND
- app/api/routes/internal_bot.py: FOUND
- app/api/router.py: MODIFIED
- Commit 4019bb6: FOUND
- Commit e258c10: FOUND
- Commit 8b318ac: FOUND
- `python -c "from app.api.routes.actual import actual_router; print(len(actual_router.routes))"` → 5
- `python -c "from app.api.routes.internal_bot import internal_bot_router; print(len(internal_bot_router.routes))"` → 3
- `python -c "from app.main_api import app; ...assert actual paths >=4...bot paths >=3"` → register OK
- `pytest --collect-only` (27 tests) → 0 import errors, 0 collection errors
