# worker

APScheduler-воркер: фоновые cron-джобы (закрытие периода, подписки, purge
удалённых пользователей). Отдельный контейнер, тот же Python-образ.

## Назначение

Планировщик на `AsyncIOScheduler` (TZ `Europe/Moscow`). Гоняет 4 бизнес-джобы

- heartbeat. Каждая бизнес-джоба — per-tenant: берёт список активных юзеров,
  ставит `set_tenant_scope` на каждого и работает в изоляции (падение одного
  юзера не валит остальных). Гонки между запусками исключаются через
  `pg_try_advisory_lock`.

## Стек

- Python 3.12, APScheduler (`AsyncIOScheduler`), pytz
- SQLAlchemy 2.x async + asyncpg
- aiogram `Bot` как чистый HTTP-клиент (только в `notify_subscriptions` для push)
- structlog

## Точка входа

- `main_worker.py` → `main()`: `validate_production_settings` → создаёт
  `AsyncIOScheduler(timezone=MOSCOW_TZ)`, регистрирует джобы, `scheduler.start()`,
  держит loop живым. CMD контейнера при `SERVICE=worker`:
  `uv run python main_worker.py`.

## Расписание джоб

| Джоба                  | Триггер                           | Назначение                                                        | Advisory key |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------- | ------------ |
| `heartbeat`            | interval 5 мин (+сразу на старте) | upsert `app_health(service='worker')`                             | —            |
| `close_period`         | cron 00:01 MSK                    | закрыть истёкший период, создать новый, перенести шаблон+подписки | 20250501     |
| `charge_subscriptions` | cron 00:05 MSK                    | провести подписки, списываемые сегодня                            | 20250503     |
| `notify_subscriptions` | cron 09:00 MSK                    | push-напоминания за `notify_days_before` дней                     | 20250502     |
| `purge_deleted_users`  | cron 02:00 MSK                    | hard-delete юзеров с `deleted_at < now()-30д` + аудит             | 20260101     |

`close_period` использует session-scoped `pg_try_advisory_lock` (+ ручной
unlock); `notify_subscriptions` — transaction-scoped
`pg_try_advisory_xact_lock` (авто-release на commit). Ключи дизъюнктны.

## Зависимости

- **db** — состояние + advisory-локи. **api** (`depends_on: service_healthy`) —
  чтобы alembic создал таблицы (в т.ч. `app_health`) до первого heartbeat.
- Env: `DATABASE_URL`/`ADMIN_DATABASE_URL`/`BUDGET_APP_PASSWORD`, `BOT_TOKEN` +
  `OWNER_TG_ID` (нужны `notify_subscriptions` для push), `INTERNAL_TOKEN`,
  `API_BASE_URL`, `APP_TZ=Europe/Moscow`, `DEV_MODE`, `LOG_*`.

## Как раскатать

**Локально:** поднимается со стеком
(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build worker`).
Прогнать джобу вручную из контейнера, не дожидаясь cron:

```bash
docker compose exec -T worker /app/.venv/bin/python -c \
  "import asyncio; from app.worker.jobs.close_period import close_period_job; asyncio.run(close_period_job())"
```

(аналогично для `charge_subscriptions_job` / `notify_subscriptions_job` /
`purge_deleted_users_job`).

**Production:** push в `master` → CI → авто-деплой.

## Где какие модули

- `app/worker/jobs/close_period.py` — закрытие/создание периода (`period_for`,
  `compute_balance`, `apply_template_to_period`, перенос подписок).
- `app/worker/jobs/charge_subscriptions.py` — проведение подписок
  (`charge_subscription`; `AlreadyChargedError` = идемпотентный no-op).
- `app/worker/jobs/notify_subscriptions.py` — push-напоминания (aiogram Bot).
- `app/worker/jobs/purge_deleted_users.py` — каскадный hard-delete + `pdn_audit_log`.
- `main_worker.py` — `heartbeat_job` + регистрация cron-триггеров.

## Тесты

- `tests/jobs/` — pytest на джобы (интеграционные через
  `./scripts/run-integration-tests.sh`).

## Подводные камни

- **JobStore — MemoryJobStore (дефолт).** PostgreSQL-jobstore НЕ используется:
  расписание фиксировано в коде (`replace_existing=True`), персистить состояние
  джоб не требуется. Рестарт контейнера просто перерегистрирует джобы.
- **Advisory-локи против гонок.** Каждая бизнес-джоба под своим дизъюнктным
  ключом; при занятом локе — `skip`. Не переиспользуй ключи между джобами.
- **Per-tenant RLS.** Перед запросами по доменным таблицам обязателен
  `set_tenant_scope(session, user.id)` — иначе RLS вернёт 0 строк. Изоляция
  per-user: try/except на юзера.
- **Идемпотентность.** Повторный запуск в тот же день — no-op (нет истёкшего
  активного периода / уникальные ключи на проведённые подписки).
- **Бот как HTTP-клиент.** `notify_subscriptions` создаёт `Bot` лениво и
  закрывает сессию в `finally`; `BOT_TOKEN` не логируется.

**Держать актуальным:** при изменении поведения этого сервиса обнови этот файл в том же коммите (см. docs-drift правило в CLAUDE.md).
