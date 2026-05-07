---
phase: 15
plan: "02"
subsystem: ai-spend-service
tags: [spend-cap, cachetools, rls, ttlcache, aggregation]
dependency_graph:
  requires:
    - 15-01  # RED tests for this service
  provides:
    - get_user_spend_cents  # consumed by Plans 15-03, 15-04, 15-05
    - invalidate_user_spend_cache  # consumed by Plan 15-04 PATCH cap
    - seconds_until_next_msk_month  # consumed by Plan 15-03 Retry-After
  affects:
    - app/services/spend_cap.py
    - pyproject.toml
    - tests/conftest.py
tech_stack:
  added:
    - cachetools>=5.3,<6.0  # TTLCache для per-user spend кеша
  patterns:
    - TTLCache + asyncio.Lock (thundering-herd prevention)
    - SET LOCAL app.current_user_id (RLS bypass для budget_app role)
    - ZoneInfo(Europe/Moscow) для MSK month boundary
key_files:
  created:
    - app/services/spend_cap.py  # 124 строки, 4 публичных + 3 приватных функции
  modified:
    - pyproject.toml  # cachetools>=5.3,<6.0 добавлен в project.dependencies
    - tests/conftest.py  # _clear_spend_cache autouse fixture для тест-изоляции
decisions:
  - "SET LOCAL app.current_user_id для RLS вместо ADMIN_DATABASE_URL — сервис читает только данные одного юзера, superuser избыточен"
  - "int(user_id) интерполируется напрямую в SET LOCAL (PG не поддерживает bind params в SET), безопасно т.к. user_id всегда int PK"
  - "autouse fixture _clear_spend_cache в conftest.py — тесты с RESTART IDENTITY создают одинаковые PKs, кеш не должен протекать между тестами"
metrics:
  duration: "~12 min"
  completed: "2026-05-07"
  tasks_completed: 2
  files_changed: 3
---

# Phase 15 Plan 02: Spend Cap Service Summary

Per-user AI spend aggregation с TTLCache(128, ttl=60) + asyncio.Lock, RLS-aware SELECT через SET LOCAL, MSK month boundary через ZoneInfo.

## What Was Built

- `app/services/spend_cap.py` (124 строки):
  - `_month_start_msk(now)` / `_next_month_start_msk(now)` — MSK boundary helpers
  - `seconds_until_next_msk_month(now)` — int секунд до 1-го числа MSK (Retry-After header)
  - `_spend_cache` — TTLCache(maxsize=128, ttl=60), ключ user_id (int)
  - `_cache_lock` — asyncio.Lock против thundering-herd
  - `_fetch_spend_cents_from_db(db, user_id)` — SET LOCAL RLS + SUM(est_cost_usd) + ceil*100
  - `get_user_spend_cents(db, *, user_id)` — cache-first, double-check under lock
  - `invalidate_user_spend_cache(user_id)` — TTLCache.pop для PATCH cap invalidation

- `pyproject.toml`: добавлена зависимость `"cachetools>=5.3,<6.0"` в project.dependencies

- `tests/conftest.py`: autouse fixture `_clear_spend_cache` очищает `_spend_cache` перед каждым тестом

## Test Results

7/7 тестов в `tests/test_spend_cap_service.py` GREEN (запуск через docker api container):
- test_spend_cents_zero_when_no_logs — PASSED
- test_spend_cents_aggregates_current_month — PASSED
- test_spend_cents_excludes_previous_month — PASSED
- test_spend_cents_isolated_per_user — PASSED
- test_spend_cents_cache_hits_within_ttl — PASSED
- test_seconds_until_next_msk_month_positive — PASSED
- test_invalidate_cache_drops_user_entry — PASSED

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | cachetools dep + spend_cap.py boundary helpers | b4e458c |
| 2 | get_user_spend_cents + cache + RLS fix + conftest | ad1e3db |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RLS на ai_usage_log блокировала SELECT**

- **Found during:** Task 2, при запуске тестов в docker контейнере
- **Issue:** `ai_usage_log` имеет RLS policy `user_id = current_setting('app.current_user_id')`. Budget_app роль без этого параметра получала 0 строк из SELECT SUM.
- **Fix:** Добавить `SET LOCAL app.current_user_id = '{int(user_id)}'` перед SELECT в `_fetch_spend_cents_from_db`. PostgreSQL не поддерживает bind params в SET — интерполируется int напрямую (без SQL injection риска т.к. user_id всегда int PK).
- **Files modified:** app/services/spend_cap.py
- **Commit:** ad1e3db

**2. [Rule 1 - Bug] Кеш протекал между тестами через RESTART IDENTITY**

- **Found during:** Task 2, test suite: 5/7 passing, 2 returning stale 0
- **Issue:** Тесты используют `TRUNCATE RESTART IDENTITY` — user_id=1 создаётся в каждом тесте. После первого теста `{1: 0}` в кеше. Следующий тест с другими логами получает кешированный 0.
- **Fix:** Добавить `autouse` fixture `_clear_spend_cache` в `tests/conftest.py` (best-effort, только если модуль уже импортирован).
- **Files modified:** tests/conftest.py
- **Commit:** ad1e3db

## Threat Surface Scan

Новых trust boundaries не добавлено. `SET LOCAL app.current_user_id` не является injection-вектором (user_id всегда int из ORM/auth pipeline). Кеш in-process, нет cross-request leak.

## Container Rebuild Required

Добавлен `cachetools` в `pyproject.toml`. Для применения в Docker контейнерах необходимо пересобрать образы:

```bash
docker compose build api bot worker && docker compose up -d api bot worker
```

(Per feedback-restart-services.md: `--build`, не `restart`)

## Self-Check: PASSED

- [x] `app/services/spend_cap.py` exists (124 строки)
- [x] `pyproject.toml` содержит `cachetools>=5.3,<6.0`
- [x] Commits b4e458c и ad1e3db существуют в git log
- [x] 7/7 тестов GREEN (подтверждено через docker exec)
