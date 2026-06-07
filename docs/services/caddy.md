# caddy

Edge-сервис: TLS-терминатор + reverse-proxy к api + отдача SPA-статики.
Единственный сервис, публикующий порты на хост (:80, :443).

## Назначение

Граница доверия. Терминирует HTTPS (Let's Encrypt в стандартном режиме),
проксирует `/api/*` на api по `budget_net`, блокирует `/api/v1/internal/*`
(403), отдаёт собранный SPA из тома `frontend_dist` с SPA-fallback на
`index.html`.

## Стек

- Образ `caddy:2-alpine`
- Конфиги: `Caddyfile` (Let's Encrypt), `Caddyfile.cloudflare` (Cloudflare
  Tunnel — текущий прод), `Caddyfile.dev` (HTTP-only локально)

## Как раскатать

**Локально:** dev-override монтирует `Caddyfile.dev` (HTTP :80, без попытки
TLS — нет публичного DNS). Зависит от healthy `api` и успешного init-контейнера
`frontend`.

**Production:** push в `master` → CI → деплой. В прод-деплое (Cloudflare Tunnel)
монтируется `Caddyfile.cloudflare`, а не `Caddyfile`. Тома `caddy_data`
(сертификаты, обязан персиститься) + `caddy_config`.

## Маршрутизация (порядок важен)

Используются `handle {}`-блоки (взаимоисключающие, по порядку записи), а не
голые директивы — иначе `try_files` сработал бы раньше и замаскировал бы
internal/api SPA-фолбэком.

1. `@internal path /api/v1/internal/*` → `respond 403` (T-internal). Бот ходит
   на эти эндпоинты напрямую по `budget_net` (`http://api:8000`) с
   `X-Internal-Token`.
2. `@api path /api/*` → `reverse_proxy api:8000`. api не публикует :8000 на хост.
3. `handle {}` (всё остальное) → `root /srv/dist`, `try_files {path} /index.html`,
   `file_server`. Кэш: `/assets/*` — `immutable, max-age=31536000`;
   `index.html` — `no-cache` (чтобы после редеплоя не остался stale-shell).

## Зависимости

- **api** (`reverse_proxy api:8000`, `depends_on: service_healthy`).
- **frontend** init-контейнер (`service_completed_successfully`) — наполняет
  `frontend_dist`.
- Env: `PUBLIC_DOMAIN` (для auto-HTTPS site-блока).

## Подводные камни

- **Порядок `handle`.** internal-403 ДОЛЖЕН идти первым, api — вторым, SPA —
  последним. Перестановка ломает либо безопасность (internal утечёт), либо
  проксирование.
- **Персист сертификатов.** Том `caddy_data` нельзя терять — иначе повторные
  запросы к Let's Encrypt упрутся в rate-limit.
- **Прод ≠ Caddyfile.** Текущий прод — Cloudflare Tunnel (`Caddyfile.cloudflare`);
  базовый `Caddyfile` (Let's Encrypt) в этом деплое не монтируется.
- **index.html no-cache.** Хешированные ассеты иммутабельны, но shell обязан
  ревалидироваться, иначе WebView держит ссылки на удалённые бандлы.

**Держать актуальным:** при изменении поведения этого сервиса обнови этот файл в том же коммите (см. docs-drift правило в CLAUDE.md).
