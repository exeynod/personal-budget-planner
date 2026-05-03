---
phase: 06-subscriptions-worker-jobs
plan: "01"
subsystem: backend-tests
tags: [tdd, red-gate, subscriptions, settings]
dependency_graph:
  requires: []
  provides: [tests/test_subscriptions.py]
  affects: [06-02, 06-03]
tech_stack:
  added: []
  patterns: [pytest-asyncio, httpx-asgi, _require_db self-skip, parametrize]
key_files:
  created:
    - tests/test_subscriptions.py
  modified: []
decisions:
  - "Settings tests included in test_subscriptions.py (not separate file) — single cohesive test module for all subscription-related behavior"
  - "notify_days_before parametrize covers -1, 31, 100, -100 (both boundary violations and far-out-of-range)"
  - "charge-now 409 test resets next_charge_date via PATCH to simulate duplicate call (realistic API-level idempotency test)"
metrics:
  duration: "~10 min"
  completed: "2026-05-03"
---

# Phase 6 Plan 01: Subscriptions RED-Gate Tests Summary

**One-liner:** TDD RED gate — 17 pytest tests for subscriptions CRUD, charge-now idempotency, and Settings.notify_days_before, all failing until 06-02/06-03 implement routes.

## What Was Built

Created `tests/test_subscriptions.py` — Wave 0 RED gate per D-87. The file contains 17 test functions (13 unique functions, one parametrized with 4 values) covering:

### Subscription CRUD Tests (SUB-01)

| Test | Description |
|------|-------------|
| `test_create_subscription` | POST /subscriptions → 200/201 with id + all fields |
| `test_create_subscription_default_notify_from_user` | omit notify_days_before → defaults from AppUser.notify_days_before (2) |
| `test_list_subscriptions_sorted_by_next_charge_date` | GET /subscriptions → ASC by next_charge_date |
| `test_update_subscription` | PATCH /subscriptions/{id} partial → fields updated |
| `test_delete_subscription` | DELETE /subscriptions/{id} → 204, item removed from list |
| `test_create_archived_category_400` | archived category_id → 400 |
| `test_subscriptions_auth_403` | no X-Telegram-Init-Data → 403 |

### charge-now Tests (SUB-04)

| Test | Description |
|------|-------------|
| `test_charge_now_creates_planned` | POST /subscriptions/{id}/charge-now → PlannedTransaction created, next_charge_date advanced |
| `test_charge_now_yearly_advance` | cycle=yearly → next_charge_date + 1 year |
| `test_charge_now_409_on_duplicate` | repeated call same original_charge_date → 409 |

### Settings Extension Tests (SET-02)

| Test | Description |
|------|-------------|
| `test_get_settings_includes_notify_days_before` | GET /settings → notify_days_before: int (default 2) |
| `test_patch_settings_notify_days_before` | PATCH {notify_days_before: 5} → persists |
| `test_patch_settings_notify_validation[-1, 31, 100, -100]` | out-of-range → 422 |
| `test_patch_settings_partial_does_not_wipe_notify` | PATCH only cycle_start_day → notify_days_before unchanged |

## RED Status Confirmation

```
17 tests collected in 0.01s
```

When run without Postgres (no live DB):
- `db_setup` fixture attempts DB connection → `OSError: Connect call failed ('127.0.0.1', 5432)` — expected RED failure

When `DATABASE_URL` not set: all tests skip with "DATABASE_URL not set" via `_require_db()`.

No tests are GREEN — routes `/api/v1/subscriptions` do not exist yet. This is the intended Wave 0 state.

## Contracts Fixed by These Tests (for 06-02/06-03 Executors)

### Endpoint Paths
- `GET /api/v1/subscriptions` — list, sorted by next_charge_date ASC
- `POST /api/v1/subscriptions` — create; body: `{name, amount_cents, cycle, next_charge_date, category_id, notify_days_before?, is_active?}`
- `PATCH /api/v1/subscriptions/{id}` — partial update
- `DELETE /api/v1/subscriptions/{id}` → 204
- `POST /api/v1/subscriptions/{id}/charge-now` → `{planned_id: int, next_charge_date: date}`

### Response Contracts
- Subscription response includes: `id, name, amount_cents, cycle, category_id, notify_days_before, is_active, next_charge_date`
- charge-now response: `{planned_id: int, next_charge_date: str (ISO date)}`
- GET /settings includes `notify_days_before: int`

### Error Codes
- Archived category → 400
- No auth → 403
- Duplicate charge same day → 409
- `notify_days_before` outside 0..30 → 422

## Deviations from Plan

None — plan executed exactly as written. Both tasks (SUB-01/SUB-04 tests + SET-02 tests) were implemented in a single `tests/test_subscriptions.py` file as specified. Task 2 was completed within the same file as Task 1 (no second commit needed since file was created with all tests in one pass).

## Self-Check: PASSED

- `tests/test_subscriptions.py` exists: FOUND
- Commit `e17d70d` exists: FOUND
- 17 tests collected: CONFIRMED
- No unintended deletions: CONFIRMED
