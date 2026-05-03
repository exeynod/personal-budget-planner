---
phase: 06-subscriptions-worker-jobs
plan: "04"
subsystem: worker
tags: [worker, scheduler, subscriptions, push-notifications, advisory-lock]
dependency_graph:
  requires: [06-03]
  provides: [notify_subscriptions_job, charge_subscriptions_job, worker-cron-registration]
  affects: [main_worker.py, docker-worker-container]
tech_stack:
  added: []
  patterns:
    - pg_try_advisory_lock per cron job (keys 20250502, 20250503)
    - aiogram Bot as HTTP API client (no dispatcher, pure send_message)
    - per-subscription commit isolation in charge job
    - AlreadyChargedError catch for idempotent duplicate protection
key_files:
  created:
    - app/worker/jobs/notify_subscriptions.py
    - app/worker/jobs/charge_subscriptions.py
    - tests/test_worker_charge.py
  modified:
    - main_worker.py
decisions:
  - "Separate DB session per subscription in charge_subscriptions_job — one failure does not rollback others"
  - "Bot API client (no dispatcher) for notify job — worker only needs send_message, not full dispatcher lifecycle"
  - "Advisory lock released in finally block even on error — mirrors close_period.py pattern exactly"
  - "Tests follow _require_db() self-skip pattern (consistent with existing test_close_period_job.py behavior)"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-03"
  tasks_completed: 3
  files_created: 3
  files_modified: 1
---

# Phase 6 Plan 4: Worker Cron Jobs (notify + charge subscriptions) Summary

**One-liner:** Two APScheduler cron jobs — `notify_subscriptions_job` (09:00 MSK, advisory lock 20250502) and `charge_subscriptions_job` (00:05 MSK, advisory lock 20250503) — registered in `main_worker.py` with idempotency via unique constraint and AlreadyChargedError.

## What Was Built

### notify_subscriptions_job (SUB-03, D-78, D-79)

**File:** `app/worker/jobs/notify_subscriptions.py`

**Schedule:** Daily 09:00 Europe/Moscow

**Advisory lock key:** 20250502

**Algorithm:**
1. `pg_try_advisory_lock(20250502)` — bail if False (prevents concurrent runs, T-06-07)
2. Fetch `AppUser.tg_chat_id` — skip job with INFO log if None
3. Query active subscriptions where `(next_charge_date - today).days == notify_days_before`
4. For each due subscription: format push text and call `bot.send_message(chat_id, text)`
   - Per-subscription exception handling: one failed send does not abort the rest
5. Release lock in finally; close bot session in finally

**Push text format:**
```
🔔 Подписка «{name}»
   Спишется {amount_rub} ₽ через {N} дн. ({dd.MM})
```

**Threat mitigations:**
- T-06-07: `pg_try_advisory_lock` prevents concurrent runs
- T-06-09: `BOT_TOKEN` never appears in logs — only `chat_id` and `sub_id` logged

### charge_subscriptions_job (SUB-04, D-80)

**File:** `app/worker/jobs/charge_subscriptions.py`

**Schedule:** Daily 00:05 Europe/Moscow

**Advisory lock key:** 20250503

**Algorithm:**
1. `pg_try_advisory_lock(20250503)` — bail if False
2. Fetch `AppUser` — skip if no user found
3. Query active subscriptions where `next_charge_date == today_msk`
4. For each subscription ID (isolated session per sub):
   - Call `charge_subscription(db, sub_id, cycle_start_day=cycle_start)` — shared service from 06-02
   - COMMIT per subscription (isolation: one failure doesn't affect others)
   - `AlreadyChargedError` → log warning + skip (idempotency via `uq_planned_sub_charge_date`, T-06-08)
   - Other exceptions → `log.exception` + skip
5. Release lock in finally

### main_worker.py Registration (D-81)

Both jobs registered with `replace_existing=True`:
- `notify_subscriptions_job` → `cron hour=9 minute=0 timezone=MOSCOW_TZ`
- `charge_subscriptions_job` → `cron hour=0 minute=5 timezone=MOSCOW_TZ`

Worker now has 3 cron jobs: `close_period` (00:01), `charge_subscriptions` (00:05), `notify_subscriptions` (09:00) + `heartbeat` interval every 5 minutes.

### Worker Unit Tests (D-88)

**File:** `tests/test_worker_charge.py` (name fixed per D-88 — referenced by 06-07 Task 1)

**TestChargeSubscriptionsJob:**
- `test_monthly_advance` — PlannedTransaction created, `next_charge_date` advances +1 month
- `test_yearly_advance` — PlannedTransaction created, `next_charge_date` advances +1 year
- `test_idempotency` — second run on same original date → `AlreadyChargedError` caught, no duplicate created
- `test_inactive_skipped` — `is_active=False` subscription not processed

**TestNotifySubscriptionsJob:**
- `test_send_called` — `Bot.send_message` called with correct `chat_id`, text contains subscription name and charge date
- `test_no_chat_id_skip` — `AppUser.tg_chat_id=None` → `send_message` never called (job exits early)

Both test classes use `_require_db()` self-skip pattern consistent with `test_close_period_job.py`. Notify tests additionally use `unittest.mock.AsyncMock` to patch `aiogram.Bot` — no real Telegram API needed.

## Deployment Notes

After merging this plan, the worker container requires restart to pick up new job registrations:
```bash
docker-compose restart worker
```

First cron runs after deploy:
- `charge_subscriptions` at 00:05 MSK next day
- `notify_subscriptions` at 09:00 MSK next day

No DB migrations needed — this plan only adds Python files and registers jobs.

## Deviations from Plan

None — plan executed exactly as written. Advisory lock pattern mirrors `close_period.py` exactly.

## Self-Check: PASSED

All files created and committed:
- `app/worker/jobs/notify_subscriptions.py` — commit fdf3f73
- `app/worker/jobs/charge_subscriptions.py` — commit 4d2ba8f
- `main_worker.py` (modified), `tests/test_worker_charge.py` — commit 659afd6
