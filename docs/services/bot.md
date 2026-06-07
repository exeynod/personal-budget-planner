# bot

aiogram 3.x бот: команды быстрого ввода трат + push-уведомления. Long-poll,
отдельный контейнер, тот же Python-образ что и api/worker.

## Назначение

Telegram-интерфейс для владельца: `/start` (онбординг + кнопка WebApp),
быстрый ввод факт-трат/доходов командами, сводка баланса и список за сегодня.
Сам бот не пишет в БД напрямую — он зовёт `/api/v1/internal/*` у api с
`X-Internal-Token`. Также используется воркером как HTTP-клиент для push'ей
(см. сервис `worker`).

## Стек

- Python 3.12, aiogram 3.x (Dispatcher + Router'ы)
- aiohttp (healthz на :8001)
- httpx (клиент к internal API)
- structlog

## Точка входа

- `main_bot.py` → `main()`: `validate_production_settings` → создаёт `Bot`
  (ParseMode.HTML) + `Dispatcher`, подключает `start_router` и `commands_router`,
  поднимает aiohttp `GET /healthz` на :8001, затем `dp.start_polling(bot)`
  (long-poll, блокирует до shutdown). CMD контейнера при `SERVICE=bot`:
  `uv run python main_bot.py`.

## Публичный интерфейс

- Команды: `/start`, `/add`, `/income`, `/balance`, `/today`, `/app`.
- Callback: `cb_disambiguation` (инлайн-выбор категории при неоднозначности).
- `GET /healthz` на :8001 (порт не публикуется наружу — только для
  docker healthcheck).

## Зависимости

- **api** (`API_BASE_URL=http://api:8000`) — все данные через internal-эндпоинты.
- Env: `BOT_TOKEN`, `OWNER_TG_ID`, `INTERNAL_TOKEN`, `API_BASE_URL`,
  `MINI_APP_URL`, `APP_TZ`, `DEV_MODE`, `LOG_LEVEL`/`LOG_FORMAT`.
- БД-роль `budget_app` пробрасывается в env, но бот ходит в БД только через api.

## Как раскатать

**Локально:** контейнер `bot` поднимается вместе со стеком
(`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build bot`),
зависит от healthy `api`. Для реальных апдейтов нужен валидный `BOT_TOKEN` от
BotFather; иначе бот стартует, но Telegram-апдейтов нет.

**Production:** push в `master` → CI → авто-деплой. Режим — long-poll (D-04),
вебхук не используется. Порт :8001 наружу не публикуется.

## Где какие модули

- `app/bot/handlers.py` — `/start`: chat-bind + ветвление приветствия
  (member-invite vs onboarded) + кнопка `WebAppInfo(MINI_APP_URL)`.
- `app/bot/commands.py` — 5 команд + `cb_disambiguation`. OWNER/member-only:
  для не-whitelisted молча `return` (анти-спам, T-04-30/37).
- `app/bot/parsers.py` — чистые парсеры аргументов: `parse_amount`
  (1500 / 1500,50 / 1 500₽ → копейки), `parse_add_command`.
- `app/bot/disambiguation.py` — in-memory store `PendingActual` (TTL 5 мин)
  для callback-флоу выбора категории. Не персистится — рестарт сбрасывает.
- `app/bot/api_client.py` — клиент к internal API: `bind_chat_id`,
  `bot_create_actual`, `bot_get_balance`, `bot_get_today`; ошибки в
  `InternalApiError` (graceful degrade, токен не логируется).
- `app/bot/auth.py` — резолв роли/статуса пользователя.

## Тесты

- `tests/test_bot_handlers.py`, тесты парсеров — pytest (часть unit, без БД).
- Интеграционные — общий `./scripts/run-integration-tests.sh`.

## Подводные камни

- **Только через internal API.** Бот не делает прямых SQL-запросов; всё через
  `/api/v1/internal/*` + `X-Internal-Token`. Эти эндпоинты заблокированы на
  Caddy (403) и доступны боту только по `budget_net` (`http://api:8000`).
- **Приватность.** Любой не-owner/не-member получает «Бот приватный» или молчание —
  не утечь существование данных.
- **Disambiguation in-memory.** Рестарт контейнера теряет ожидающие выборы —
  пользователь просто повторяет команду.
- **Секреты не в логах.** `BOT_TOKEN`/`INTERNAL_TOKEN` никогда не пишутся в
  сообщения и логи.
- **Деньги — копейки.** Парсер возвращает `*_cents` (cap 10^12); рубли только в тексте.

**Держать актуальным:** при изменении поведения этого сервиса обнови этот файл в том же коммите (см. docs-drift правило в CLAUDE.md).
