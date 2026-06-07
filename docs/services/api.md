# api

FastAPI REST-сервис: основной backend Mini App. Валидирует Telegram `initData`,
ставит RLS tenant-scope на каждый запрос, обслуживает домен бюджета.

## Назначение

HTTP REST для веб/iOS Mini App: дашборд `home`, периоды, план месяца, шаблон
плана, плановые и фактические транзакции, корректировка остатка, подписки,
категории, профиль `me`, AI-чат и AI-категоризация, админка whitelist'а,
internal-эндпоинты для бота. Авторизация — TG `initData` HMAC-SHA256 (или
dev-Bearer на iOS). Изоляция данных — PostgreSQL RLS по `user_id`.

## Стек

- Python 3.12, FastAPI, Uvicorn
- SQLAlchemy 2.x async + asyncpg, Pydantic v2 / pydantic-settings
- structlog (json в prod, console в dev)
- OpenAI SDK (AI-чат + embeddings, опционально)
- pgvector (категорийные эмбеддинги)

## Точка входа

- `main_api.py` → `app = FastAPI(lifespan=...)`. Lifespan: `configure_logging` →
  `validate_production_settings` → (DEV) `seed_dev_data` → `_init_missing_embeddings`;
  на shutdown `async_engine.dispose()`.
- `entrypoint.sh` (CMD контейнера при `SERVICE=api`): сначала
  `alembic upgrade head` под `ADMIN_DATABASE_URL` (роль `budget`, SUPERUSER —
  нужна для DDL/ролей в миграциях), затем
  `exec uvicorn main_api:app --host 0.0.0.0 --port 8000` под `DATABASE_URL`
  (роль `budget_app`, NOSUPERUSER NOBYPASSRLS — RLS реально работает в рантайме).
- `docs_url=/api/docs` только при `DEV_MODE=true`, иначе отключён.

## Публичный интерфейс

Полный контракт — `contract/openapi.json` (источник истины для фронта и iOS DTO).
Роуты монтируются в `app/api/router.py` под префиксом `/api/v1`. Группы:

| Группа          | Префикс/маршрут                                             | Назначение                                                               |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `home`          | `GET /home`                                                 | единый bootstrap-эндпоинт дашборда (схлопывает N запросов)               |
| `me`            | `GET/PATCH /me`                                             | профиль владельца: роль, доход, AI-cap/spend                             |
| `periods`       | `/periods/*`                                                | текущий период, план/факт-листы периода                                  |
| `plan-month`    | `PATCH /plan-month`                                         | атомарное обновление плана месяца (Σплан ≤ доход)                        |
| `template`      | `/template/*`                                               | шаблон плана (items + lines), snapshot-from-period                       |
| `planned`       | `/periods/{id}/planned`, `/planned/{id}`                    | плановые транзакции                                                      |
| `actual`        | `/actual`, `/periods/{id}/actual`                           | фактические транзакции (Mini App CRUD)                                   |
| `balance`       | `/balance/*`                                                | корректировка/сверка остатка периода (v1.1)                              |
| `subscriptions` | `/subscriptions/*`                                          | подписки CRUD + charge-now                                               |
| `categories`    | `/categories/*`                                             | категории CRUD (soft delete через `is_archived`)                         |
| `accounts`      | `/accounts/*`                                               | read-only основной счёт/баланс                                           |
| `ai`            | `/ai/chat` (SSE), `/ai/history`, `/ai/suggest`, observation | AI-чат и категоризация                                                   |
| `analytics`     | `/analytics/*`, `/analytics/event`                          | агрегаты + телеметрия событий                                            |
| `admin`         | `/admin/*`                                                  | whitelist + AI-usage (owner-only)                                        |
| `auth`          | `/auth/dev-exchange`                                        | native iOS dev-token (без initData)                                      |
| `legal`         | `/privacy`, `/tos`                                          | публичные доки без auth (вне `/api/v1`)                                  |
| `webhooks`      | `/webhooks/yookassa`                                        | платёжный webhook (вне `/api/v1`)                                        |
| `internal`      | `/api/v1/internal/*`                                        | bot↔api: chat-bind, bot/actual, bot/balance, bot/today, onboarding/reset |

Публичные роуты под `Depends(get_current_user)`; internal — под
`Depends(verify_internal_token)` (заголовок `X-Internal-Token`). Доменные роуты
дополнительно несут `Depends(require_onboarded)`.

## Зависимости

- **db** (`db` сервис) — единственный источник состояния.
- Env: `DATABASE_URL` (budget_app), `ADMIN_DATABASE_URL` (budget, для alembic),
  `BUDGET_APP_PASSWORD`, `BOT_TOKEN`, `OWNER_TG_ID`, `INTERNAL_TOKEN`,
  `PUBLIC_DOMAIN`, `APP_TZ=Europe/Moscow`, `DEV_MODE`, `OPENAI_API_KEY`,
  `LLM_PROVIDER`, `LLM_MODEL`, `ENABLE_AI_CATEGORIZATION`, `DEV_AUTH_SECRET` (опц).
- `validate_production_settings` отказывается стартовать при placeholder-секретах
  (вне DEV_MODE — `BOT_TOKEN`/`INTERNAL_TOKEN`/`OWNER_TG_ID`; всегда для api —
  `OPENAI_API_KEY`, если AI включён).

## Как раскатать

**Локально (dev):**

```bash
# Полный стек с dev-override (DEV_MODE=true, console-логи, api на :8000)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db api
# api сам прогоняет alembic upgrade head на старте, затем dev_seed
curl http://localhost:8000/healthz          # {"status":"ok"}
open http://localhost:8000/api/docs         # Swagger (только DEV_MODE)
```

В `DEV_MODE=true` HMAC `initData` обходится, `get_current_user` апсёртит
owner-строку (по `OWNER_TG_ID`) при первом обращении — auth не нужен.

**Production:** push в `master` → зелёный CI → авто-деплой (GitHub Actions).
SSH не требуется. В prod api не публикует порт — доступен только через Caddy.

## Тестовые данные

- `app/dev_seed.py` — идемпотентно при старте api в `DEV_MODE`: 1 owner
  (`OWNER_TG_ID`, `cycle_start_day=5`, onboarded), 1 активный период
  (старт-баланс 100 000 ₽), 9 категорий (8 расход + 1 доход «Зарплата»),
  6 фактов + зарплата. Эмбеддинги для категорий генерит `_init_missing_embeddings`.
- `scripts/seed_extra_dev.py` — one-shot, поверх dev_seed (богатые UAT-данные):
  +12 факт-транзакций, +8 плановых, +3 подписки (Netflix/Spotify/Яндекс Плюс) с
  ближайшими списаниями. Запуск внутри контейнера:

  ```bash
  docker compose exec -T api /app/.venv/bin/python /app/scripts/seed_extra_dev.py
  ```

Оба сидера идемпотентны (вставляют только недостающее) и ставят
`set_tenant_scope` перед доменными INSERT'ами.

## Где какие модули

- `app/api/router.py` — сборка `public_router` + `internal_router`, монтаж под `/api/v1`.
- `app/api/routes/` — хендлеры по группам (home/periods/plan*month/template/
  planned/actual/balance/subscriptions/categories/accounts/me/ai/analytics/admin/
  auth/legal/webhooks + internal*\*).
- `app/api/schemas/` — Pydantic v2 request/response модели.
- `app/api/dependencies.py` — `get_current_user`, `get_db`,
  `get_db_with_tenant_scope`, `verify_internal_token`, `require_onboarded`.
- `app/services/` — бизнес-логика (periods, planned, actual, templates,
  subscriptions, plan_month, balance/spend_cap, analytics, AI, account_deletion).
- `app/core/` — `auth.py` (initData HMAC), `period.py` (`period_for`),
  `settings.py`, `logging.py`.
- `app/db/` — `models.py` (ORM), `session.py` (engine + `set_tenant_scope`).
- `app/ai/` — `llm_client.py`, `embedding_service.py`, `tools.py`, providers.

## Тесты

- `tests/` — pytest (api/services/jobs/ai/helpers).
- Интеграционные (нужен live db): `./scripts/run-integration-tests.sh [args]` —
  поднимает стек (base+dev+test override), ждёт healthy api, гоняет pytest
  внутри контейнера, делает `docker compose down`.

## Подводные камни

- **RLS на каждом запросе.** Без `set_tenant_scope` (через
  `get_db_with_tenant_scope`) RLS-политика даёт `user_id = -1` → 0 строк.
  `SET LOCAL` транзакционен — сбрасывается на COMMIT/ROLLBACK.
- **Две роли БД.** alembic под `budget` (SUPERUSER), рантайм под `budget_app`
  (NOSUPERUSER NOBYPASSRLS). Перепутать — либо DDL упадёт, либо RLS отключится.
- **Деньги — BIGINT копейки** (`*_cents`). Никаких float; рубли только на UI.
- **Период** — только через `period_for(date, cycle_start_day)`; даты — `DATE`,
  аудит-времена — `TIMESTAMPTZ` UTC, расчёты — `Europe/Moscow`.
- **`docs_url` отключён** в prod (`DEV_MODE=false`) — attack surface.

**Держать актуальным:** при изменении поведения этого сервиса обнови этот файл в том же коммите (см. docs-drift правило в CLAUDE.md).
