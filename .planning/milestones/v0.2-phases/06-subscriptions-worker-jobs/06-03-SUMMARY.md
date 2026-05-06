---
phase: 06-subscriptions-worker-jobs
plan: 03
subsystem: api
tags: [fastapi, subscriptions, settings, routes, python39-compat]

# Dependency graph
requires:
  - phase: 06-02
    provides: "app/services/subscriptions.py, app/services/settings.py, app/api/schemas/subscriptions.py"
provides:
  - "app/api/routes/subscriptions.py: subscriptions_router с 5 endpoints"
  - "app/api/router.py: subscriptions_router зарегистрирован в public API"
  - "app/api/dependencies.py: from __future__ import annotations (Python 3.9 compat)"
affects:
  - 06-04  # worker jobs used charge_subscription service (no route changes needed)
  - 06-05  # frontend can now build against /api/v1/subscriptions/*
  - 06-07  # integration tests with real DB

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "router-level Depends(get_current_user) — T-06-04 spoofing mitigation"
    - "AlreadyChargedError → HTTP 409 (T-06-05 idempotency)"
    - "from __future__ import annotations for Python 3.9 compatibility"

key-files:
  created:
    - "app/api/routes/subscriptions.py"
  modified:
    - "app/api/router.py"
    - "app/api/dependencies.py"

key-decisions:
  - "from __future__ import annotations added to dependencies.py and router.py for Python 3.9 compat (pre-existing issue)"
  - "settings.py PATCH/GET already complete from 06-02 — no changes needed in this plan"
  - "DB-backed tests fail with OSError (no local PostgreSQL) — same pre-existing environment constraint as all prior phases"

metrics:
  duration: "~6 min"
  completed: "2026-05-03"
---

# Phase 6 Plan 03: Subscriptions HTTP Routes Summary

**One-liner:** FastAPI subscriptions router (5 endpoints) + settings routes already complete + router registration — RED→GREEN gate ready for PostgreSQL.

## What Was Built

### Task 1: subscriptions_router (D-71)

Created `app/api/routes/subscriptions.py` with 5 endpoints:

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | `/api/v1/subscriptions` | `list[SubscriptionRead]` | All subs sorted by next_charge_date ASC |
| POST | `/api/v1/subscriptions` | `SubscriptionRead` | 400 on archived category |
| PATCH | `/api/v1/subscriptions/{id}` | `SubscriptionRead` | 404 on not found |
| DELETE | `/api/v1/subscriptions/{id}` | 204 | Hard delete |
| POST | `/api/v1/subscriptions/{id}/charge-now` | `ChargeNowResponse` | 409 on duplicate |

All endpoints under router-level `Depends(get_current_user)` (T-06-04 spoofing mitigation).

### Task 2: Router Registration

Added `subscriptions_router` to `app/api/router.py` after `actual_router`:
```python
from app.api.routes.subscriptions import router as subscriptions_router
public_router.include_router(subscriptions_router)
```

Settings routes (GET/PATCH `/api/v1/settings`) with `notify_days_before` were already complete from 06-02.

### Task 3: Test Run Verification

Routes import correctly. 31 total routes in `public_router` including all 5 subscription paths and 2 settings paths.

DB-backed tests fail with `OSError: Connect call failed ('127.0.0.1', 5432)` — no local PostgreSQL running, same pre-existing constraint as all phases. Tests will be GREEN in 06-07 with real DB.

Non-DB tests: 69 passed, 2 pre-existing failures (test_owner_whitelist_valid needs DB, test_all_tables_exist needs DB).

## Request/Response Shapes for Frontend (06-05)

### SubscriptionCreate (POST body)
```json
{
  "name": "Netflix",
  "amount_cents": 69900,
  "cycle": "monthly",
  "next_charge_date": "2026-06-01",
  "category_id": 1,
  "notify_days_before": 2,
  "is_active": true
}
```

### SubscriptionRead (response)
```json
{
  "id": 1,
  "name": "Netflix",
  "amount_cents": 69900,
  "cycle": "monthly",
  "next_charge_date": "2026-06-01",
  "category_id": 1,
  "notify_days_before": 2,
  "is_active": true,
  "category": {
    "id": 1,
    "name": "Подписки",
    "kind": "expense",
    "is_archived": false,
    "sort_order": 10
  }
}
```

### ChargeNowResponse (POST /charge-now response)
```json
{
  "planned_id": 42,
  "next_charge_date": "2026-07-01"
}
```

### SubscriptionUpdate (PATCH body — all optional)
```json
{
  "name": "Netflix Updated",
  "amount_cents": 99900,
  "is_active": false
}
```

### SettingsRead (GET /settings — already complete from 06-02)
```json
{
  "cycle_start_day": 5,
  "notify_days_before": 2,
  "is_bot_bound": true
}
```

### SettingsUpdate (PATCH /settings — partial)
```json
{
  "notify_days_before": 7
}
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] from __future__ import annotations missing in app/api/dependencies.py**
- **Found during:** Task 1 (attempting to verify router import)
- **Issue:** `str | None` syntax in `dependencies.py` and `router.py` not supported in Python 3.9, raises `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`
- **Fix:** Added `from __future__ import annotations` to both `app/api/dependencies.py` and `app/api/router.py` (06-02 had already fixed subscriptions.py but missed these two files)
- **Files modified:** `app/api/dependencies.py`, `app/api/router.py`
- **Commit:** `e15f16d` (Task 1 commit)

**2. [Rule 2 - Missing Critical] greenlet library not installed**
- **Found during:** Task 3 (test run)
- **Issue:** `greenlet` not installed in system Python, preventing DB connections even for fixture setup. Not introduced by this plan.
- **Fix:** `pip3 install greenlet --user`
- **Result:** DB connection errors now correctly show as `OSError: Connect call failed` (no PostgreSQL running) rather than `ValueError: greenlet library required`
- **Scope note:** Pre-existing environment issue, out of scope. Tests will run when PostgreSQL available.

---

**Settings route update:** Already completed in 06-02 (deviation Rule 2 in that plan). No changes needed in 06-03.

## Known Stubs

None — routes call real service functions from 06-02.

## Threat Flags

No new threat surface beyond what was in the plan's threat model (T-06-04, T-06-05 both mitigated).

## Self-Check: PASSED

- `app/api/routes/subscriptions.py` exists: FOUND
- 5 routes in subscriptions_router: CONFIRMED (GET, POST, PATCH, DELETE, POST charge-now)
- subscriptions_router registered in public_router: CONFIRMED (31 total routes)
- Commits `e15f16d` and `6c7079f` exist: CONFIRMED
- No unintended deletions: CONFIRMED
