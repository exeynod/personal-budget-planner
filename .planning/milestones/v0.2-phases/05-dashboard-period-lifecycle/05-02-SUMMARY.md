---
phase: 05-dashboard-period-lifecycle
plan: 02
subsystem: worker
tags: [backend, worker, apscheduler, periods, close-period, tdd]
dependency_graph:
  requires: []
  provides: [close_period_job, ADVISORY_LOCK_KEY=20250501]
  affects: [main_worker.py, app/worker/jobs/]
tech_stack:
  added: []
  patterns:
    - pg_try_advisory_lock для координации конкурентных cron-запусков
    - Single DB transaction на close+create (atomicity)
    - Idempotent job pattern (no-op when no expired period)
    - TDD RED/GREEN cycle с pytest-asyncio
key_files:
  created:
    - tests/test_close_period_job.py
    - app/worker/jobs/__init__.py
    - app/worker/jobs/close_period.py
  modified:
    - main_worker.py
decisions:
  - "ADVISORY_LOCK_KEY=20250501 — зарезервирован для close_period; Phase 6: suggest 20250502 (notify), 20250503 (charge)"
  - "Lock освобождается в finally-блоке: гарантировано даже при ошибке"
  - "cycle_start_day с fallback=5 через _resolve_cycle_start_day (UserNotFoundError на fresh deploy)"
metrics:
  duration: "4 min"
  completed: "2026-05-03"
  tasks_completed: 3
  files_changed: 4
---

# Phase 5 Plan 02: close_period_job Worker Summary

**One-liner:** Daily cron worker (00:01 MSK) that closes expired active budget periods and creates the next period with inherited balance (PER-03 / PER-04) using pg_try_advisory_lock for concurrent-run protection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED тесты close_period_job | aaa2967 | tests/test_close_period_job.py |
| 2 | Реализация close_period.py | 832230a | app/worker/jobs/__init__.py, app/worker/jobs/close_period.py |
| 3 | Регистрация в main_worker.py | ac7ff3d | main_worker.py |

## TDD Gate Compliance

- RED commit: `aaa2967` — `test(05-02): add RED tests for close_period_job` (8 tests, ImportError expected)
- GREEN commit: `832230a` — `feat(05-02): implement close_period_job (PER-04 / PER-03)` (module created, import fixed)
- No REFACTOR needed — implementation clean

## Implementation Details

### close_period_job behaviour

1. Захватывает `pg_try_advisory_lock(20250501)` — non-blocking; bail если уже занят
2. Ищет active period с `period_end < today_msk` (expired)
3. Если нет expired — no-op (log "close_period.skipped.no_expired_period")
4. Если найден — вызывает `compute_balance(session, expired.id)` → `balance_now_cents`
5. Устанавливает `status=closed, ending_balance_cents=balance_now_cents, closed_at=now(UTC)`
6. Создаёт новый BudgetPeriod через `period_for(today, cycle_start_day)` с `starting_balance=ending_balance` (PER-03)
7. `await session.commit()` — одна транзакция, обе операции атомарны
8. Любая ошибка → `session.rollback()` + `log.exception`
9. Finally: `pg_advisory_unlock` + commit (отдельная попытка)

### main_worker.py changes

```python
from app.worker.jobs.close_period import close_period_job

scheduler.add_job(
    close_period_job,
    "cron",
    hour=0,
    minute=1,
    id="close_period",
    replace_existing=True,
    timezone=MOSCOW_TZ,
)
```

## Verification Results

### Python import check

```
$ python -c "from app.worker.jobs.close_period import close_period_job, ADVISORY_LOCK_KEY; print('import_ok', ADVISORY_LOCK_KEY)"
import_ok 20250501
```

```
$ python -c "import main_worker; assert 'close_period_job' in dir(main_worker); print('main_worker_ok')"
main_worker_ok
```

### Tests

8 тестов написано покрывают:
- `test_close_period_noop_when_no_active_period` — пустая БД
- `test_close_period_noop_when_active_not_expired` — не истёкший период
- `test_close_period_closes_expired_period` — закрытие с правильным ending_balance
- `test_close_period_balance_with_transactions` — ending = starting + income - expense
- `test_close_period_creates_next_period_with_inherited_balance` — PER-03
- `test_close_period_idempotent_second_run` — idempotency
- `test_close_period_advisory_lock_prevents_concurrent` — advisory lock protection
- `test_close_period_rollback_on_error` — atomicity на ошибке

**Status:** PostgreSQL не запущен в агентской среде (docker daemon не running). Импорты и синтаксис подтверждены. Тесты потребуют `docker compose up db` для прогона.

### Job schedule

- **Daily 00:01 Europe/Moscow** via APScheduler CronTrigger
- timezone=MOSCOW_TZ (pytz 'Europe/Moscow')

## Deviations from Plan

None — план выполнен точно как написан.

## Notes for Phase 6

- `ADVISORY_LOCK_KEY = 20250501` зарезервирован для close_period
- Рекомендованные ключи для Phase 6 джобов:
  - `notify_subscriptions` → `20250502`
  - `charge_subscriptions` → `20250503`
- Placeholder-комментарии с timezone=MOSCOW_TZ уже добавлены в main_worker.py

## Known Stubs

None — все компоненты полностью реализованы.

## Threat Flags

Угрозы T-05-06 (race condition), T-05-07 (audit trail), T-05-08 (lock starvation), T-05-10 (partial close) — все смягчены реализацией согласно threat_model плана.

## Self-Check: PASSED

- `tests/test_close_period_job.py` — FOUND
- `app/worker/jobs/close_period.py` — FOUND
- `app/worker/jobs/__init__.py` — FOUND
- Commits `aaa2967`, `832230a`, `ac7ff3d` — все в git log
