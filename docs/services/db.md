# db

PostgreSQL 16 (pgvector): единственный источник состояния. Multi-tenant через
Row-Level Security. Две роли: `budget_app` (рантайм) и `budget` (admin/alembic).

## Назначение

Хранит весь домен бюджета + AI-таблицы. Изоляция данных между пользователями —
PostgreSQL RLS по `user_id` (а не приложением). Advisory-локи координируют
воркер-джобы.

## Стек

- Образ `pgvector/pgvector:pg16` (PostgreSQL 16 + расширение `vector`)
- Миграции — Alembic (`alembic/versions/`, ревизии 0001…0031)

## Роли БД (D-11-07-02)

| Роль         | Атрибуты                          | Кто использует                                                        |
| ------------ | --------------------------------- | --------------------------------------------------------------------- |
| `budget`     | SUPERUSER                         | alembic (DDL, CREATE/ALTER ROLE, GRANT) через `ADMIN_DATABASE_URL`    |
| `budget_app` | LOGIN NOSUPERUSER **NOBYPASSRLS** | рантайм api/bot/worker через `DATABASE_URL` — RLS реально применяется |

`budget_app` создаётся миграцией `0007_postgres_role_split`. Именно
`NOBYPASSRLS` гарантирует, что политики не обходятся в рантайме.

## Таблицы

Доменные (несут `user_id` + RLS): `app_user`, `category`, `budget_period`,
`plan_template_item`, `plan_template_line`, `period_category_plan`,
`planned_transaction`, `actual_transaction`, `subscription`, `account`.
AI/служебные: `ai_conversation`, `ai_message`, `category_embedding`,
`ai_usage_log`, `auth_token`, `app_health`, `payment`, `subscription_billing`,
`pdn_audit_log`. ERD и индексы — `docs/HLD.md` §2.

Soft delete — только `category` (`is_archived`). Транзакции и подписки —
hard delete. Деньги — `BIGINT` копейки (`*_cents`). Бизнес-даты — `DATE`,
аудит-времена — `TIMESTAMPTZ` UTC.

## RLS-политики

- Включены/форсированы миграцией `0006_multitenancy` (9 таблиц), добиты в
  `0015_v10_rls_finalize` (goal/savings_config — позже выпилены в 0031).
- Шаблон политики:
  `USING (user_id = coalesce(NULLIF(current_setting('app.current_user_id', true), '')::bigint, -1))`
  (то же в `WITH CHECK`). Без выставленного GUC → `-1` → 0 строк.
- GUC ставится приложением:
  `set_config('app.current_user_id', <id>, is_local=true)` (transaction-scoped,
  `app/db/session.py::set_tenant_scope`).
- `pdn_audit_log` намеренно вне RLS (owner-only под отдельным доступом).

## Как раскатать

**Локально:** сервис `db` из compose, образ `pgvector/pgvector:pg16`, том
`postgres_data`, healthcheck `pg_isready`. Порт наружу не публикуется — доступ
только из `budget_net` (api/bot/worker).

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml up -d db
# Миграции применяет api-контейнер на старте (entrypoint.sh: alembic upgrade head)
```

Прогнать миграции вручную: `docker compose exec -T api uv run alembic upgrade head`
(под `ADMIN_DATABASE_URL`). `down -v` стирает том.

**Production:** push в `master` → CI → деплой; api прогоняет
`alembic upgrade head` на каждом старте.

## Тестовые данные

См. сервис `api`: `app/dev_seed.py` (авто при старте api в `DEV_MODE`) +
`scripts/seed_extra_dev.py` (one-shot UAT-расширение). Оба ставят
`set_tenant_scope` перед доменными INSERT'ами.

## Подводные камни

- **RLS — не обойти приложением.** Любой доменный запрос требует
  `set_tenant_scope`; забыл — пустой результат, а не ошибка. Легко принять за
  «нет данных».
- **Две роли.** DDL — только `budget`; рантайм — только `budget_app`. Запуск
  alembic под `budget_app` упадёт на CREATE ROLE/GRANT.
- **Advisory-локи.** Воркер-джобы используют дизъюнктные ключи
  (`20250501`/`20250502`/`20250503`/`20260101`) — см. сервис `worker`.
- **Деньги — BIGINT копейки**, периоды считаются `period_for` в `Europe/Moscow`,
  БД хранит время в UTC.
- **pgvector.** Эмбеддинги категорий (`category_embedding`) требуют расширения
  `vector` — поэтому образ именно `pgvector/pgvector:pg16`.

**Держать актуальным:** при изменении поведения этого сервиса обнови этот файл в том же коммите (см. docs-drift правило в CLAUDE.md).
