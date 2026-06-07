# Runbook — TG Budget Planner

Практическая инструкция: что и как запускать. Архитектура — 5 docker-сервисов
(`caddy` · `api` · `bot` · `worker` · `db`), общий Python-codebase `app/` с тремя
точками входа (`main_api.py` / `main_bot.py` / `main_worker.py`) + фронтенд
`frontend/` (React+Vite). Полный контракт API и ERD — в `docs/HLD.md`.

```
            ┌──────── docker-compose (caddy/api/bot/worker/db) ────────┐
            │                                                          │
  browser ──┤ caddy ─/api→ api ──┐                                     │
  (TMA)     │   └─/ → SPA static  ├─→ db (postgres16 + pgvector, RLS)  │
            │ bot  ───────────────┤                                    │
            │ worker (APScheduler)┘   3 джобы: notify 09:00 /          │
            │                          charge 00:05 / close_period 00:01│
            └──────────────────────────────────────────────────────────┘
```

Все make-таргеты — `make help`. Дев-стек поднимается через `docker-compose.yml`

- `docker-compose.dev.yml` (override авто-мержится; `DEV_MODE=true` обходит HMAC,
  api публикуется на `:8000`).

---

## Сценарий 1 — поднять dev-стек (compose: db + api + bot + worker + caddy)

```bash
make up            # docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
make ps            # статус сервисов
make logs          # docker compose logs -f --tail=100
```

Что происходит на старте:

- `db` (pgvector/pgvector:pg16) поднимается, `api` ждёт его healthcheck.
- `entrypoint.sh` гонит `alembic upgrade head` под **admin**-ролью
  (`ADMIN_DATABASE_URL` → `budget`), затем стартует uvicorn под runtime-ролью
  `budget_app` (NOSUPERUSER NOBYPASSRLS — RLS реально энфорсится и в dev).
- При `DEV_MODE=true` `main_api.py` запускает `dev_seed` (идемпотентно).

Доступы:

- **api**: http://localhost:8000 (Swagger на `/api/docs`, только при `DEV_MODE`).
- **db**: внутри compose-сети как `db:5432` (`budget_app`/`budget`, БД `budget_db`).
  Хост-порт по умолчанию **не** публикуется — для прямого `psql` см. `make psql`.

> ⚠️ После ЛЮБОЙ правки python-сорсов образ нужно **пересобрать** — `docker compose
up -d` поднимает уже собранный образ. Используй `make up-build`. (Фронтенд в dev
> подхватывает HMR отдельно — см. сценарий 3.)

Остановить: `make down` (volume `postgres_data` сохраняется).

---

## Сценарий 2 — seed демо-бюджета (dev_seed + seed_extra)

`dev_seed` (`app/dev_seed.py`) идёт **автоматически** на старте `api` при
`DEV_MODE=true`: создаёт owner'а (`OWNER_TG_ID`), базовые категории и текущий
период. Этого достаточно для пустого дашборда.

Для богатых UAT-данных (дельты план/факт, история, подписки) — наложи extra-seed
поверх (идемпотентно, безопасно перезапускать):

```bash
make up            # если стек ещё не поднят
make seed          # scripts/seed_extra_dev.py внутри контейнера api
```

Добавляет ~12 actual-транзакций, 8 planned-транзакций в активном периоде и 3
подписки (Netflix/Spotify/Yandex Plus) с `next_charge_date` в ближайшие дни.

---

## Сценарий 3 — frontend dev (Vite :5173, тема liquid_glass)

Лёгкий контур: только Vite dev-server с HMR, без пересборки docker-образов.

```bash
cd frontend
npm install        # один раз
npm run dev        # Vite → http://localhost:5173
```

- Дизайн — единственный: **liquid_glass** (тумблер `ui.theme`; других тем нет).
- HMR работает: правишь компонент → страница обновляется без перезапуска.
- API: фронт ходит на api (`:8000` в dev) — стек из сценария 1 должен быть поднят.

Когда применять: UI-итерации, отладка экранов, разработка фич не дожидаясь
пересборки api-образа.

---

## Сценарий 4 — прогнать тесты (backend / frontend / e2e)

```bash
# Backend: pytest на ЖИВОЙ Postgres (boot compose test-стека → pytest внутри api → teardown)
make test-backend                       # = scripts/run-integration-tests.sh -q
bash scripts/run-integration-tests.sh -k test_subscriptions -v   # подмножество

# Frontend unit (vitest)
make test-frontend                      # cd frontend && vitest run
make tsc                                # type-check (tsc -b)

# Frontend e2e (Playwright: native-liquid-glass + responsive)
make test-e2e                           # cd frontend && playwright test
```

Backend-тесты идут под ролью `budget_app`, поэтому RLS-энфорсмент-тесты видят ту
же роль, что и прод. Контракт-дрейф ловится отдельно: `make contract-check`.

---

## Сценарий 5 — прогнать шедулер-джобы локально (worker)

`worker` — APScheduler с PostgreSQL jobstore. 4 джобы в `app/worker/jobs/`:

| Джоба                  | Время (Europe/Moscow) | Что делает                            |
| ---------------------- | --------------------- | ------------------------------------- |
| `notify_subscriptions` | 09:00                 | пуш-напоминания о ближайших списаниях |
| `charge_subscriptions` | 00:05                 | проводит plan-транзакции по подпискам |
| `close_period`         | 00:01                 | закрывает период, открывает новый     |
| `purge_deleted_users`  | (retention)           | hard-delete soft-deleted юзеров       |

Все джобы обёрнуты в `pg_try_advisory_lock` (защита от гонок при нескольких worker'ах).

```bash
make logs                               # смотреть, что делает worker в стеке
docker compose logs -f worker

# Триггернуть джобу вручную (вне расписания) — внутри контейнера worker:
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  exec -T worker /app/.venv/bin/python -c \
  "import asyncio; from app.worker.jobs.notify_subscriptions import run; asyncio.run(run())"
```

(Точная сигнатура `run` — смотри в файле джобы; некоторые принимают session-factory.)

---

## Сценарий 6 — контракт-регенерация (contract/openapi.json → web + iOS типы)

Источник истины — `contract/openapi.json`, дампится из ЖИВОГО api. Из него
генерятся web-типы (`frontend/src/api/generated/schema.ts`) и iOS DTO
(`GeneratedDTO.swift`). Подробности — `contract/README.md`.

```bash
make up                                 # api должен быть жив (дамп идёт из контейнера)
make contract                           # перегенерить contract/openapi.json
cd frontend && npm run gen:api          # перегенерить web schema.ts из openapi.json
make contract-check                     # regen всех 3 артефактов + git-diff-гейт (дрейф → fail)
```

`make contract-check` — это и есть CI-гейт: правка API без перегенеренных
клиентских типов уронит сборку.

---

## Сценарий 7 — деплой (push master → CI → авто-деплой)

Прод катится **автоматически** через GitHub Actions: `push` в `master` при
зелёном CI (`.github/workflows/ci.yml`) триггерит `deploy.yml`. SSH вручную не нужен.

Между мерджем и продом ручного гейта **нет** — поэтому перед пушем прогоняй
локальный mirror CI:

```bash
make ci-local                           # зеркалит все CI-джобы; «зелёно локально = зелёно в CI»
# частичный/срочный push: SKIP_E2E=1 / SKIP_BACKEND=1 / SKIP_FRONTEND=1 make ci-local
git push                                # pre-push хук сам гонит ci-local (если установлен: make hooks)
```

`ci-local` повторяет CI один-в-один: backend pytest на живом PG + contract
sync-guard, frontend build + vitest, Playwright e2e, плюс schema-SoT DDL-гейт.

Bare-metal / ручной деплой и операционные детали — `docs/DEPLOY.md`.

---

## Git-хуки (lefthook)

Установить один раз на клон (разработчик ИЛИ агент):

```bash
make hooks                              # lefthook install (или npx lefthook install)
```

- **pre-commit** (быстро, только staged-файлы): `ruff check` + `ruff format --check`
  на изменённых `.py`; `tsc -b` если затронут фронтенд; schema-SoT DDL-гейт;
  предупреждение-напоминание обновить доки при правке `app/db/models.py` /
  `alembic/versions/*` (warning, не блокирует).
- **pre-push**: полный `scripts/ci-local.sh`.

Обойти осознанно: `git commit --no-verify` / `git push --no-verify`.

---

## Troubleshooting

**`make up` → api не становится healthy, в логах ошибки подключения к БД**

- `db` ещё не прошёл healthcheck до старта `api`, или миграции упали. Смотри
  `docker compose logs db` и `docker compose logs api`. Часто помогает
  `make down && make up` (db успевает прогреться).

**Правки в python-коде «не видны» в контейнере**

- Образ собран со старым кодом. `make up-build` (пересобирает образы). Это
  частая stale-bundle ловушка — `docker compose up -d` НЕ пересобирает.

**`make test-backend` падает на «api did not become healthy in 60s»**

- Test-стек не поднялся. Запусти `bash scripts/run-integration-tests.sh` без `-q`
  — он печатает `docker compose logs api --tail 30` при таймауте.

**`make migrate` / `make psql` → «container api is not running»**

- Стек не поднят. Сначала `make up`. Таргеты `migrate/seed/psql` работают ВНУТРИ
  живых контейнеров.

**`make contract` падает на docker exec**

- api-контейнер не жив, или `.venv` в нём сломан. Подними стек (`make up`).
  Альтернатива (если локальный uv рабочий): `CONTRACT_DUMP=python make contract-check`.

**`make check-no-manual-ddl` краснеет**

- В `app/` или `main_*.py` появился сырой `CREATE/ALTER/DROP TABLE`. Перенеси
  изменение схемы в Alembic-миграцию (`alembic/versions/`). Если это НЕ изменение
  схемы (например, SQLi-payload в строке) — пометь строку `DDL-EXEMPT: <причина>`.

**`make ci-local` слишком долгий перед пушем**

- Используй escape-флаги осознанно: `SKIP_E2E=1 make ci-local` (e2e — самый
  медленный). CI всё равно прогонит полный набор.

**Vite `port 5173 already in use`**

- `npm run dev -- --port 5174` или прибей процесс: `lsof -i :5173`.
