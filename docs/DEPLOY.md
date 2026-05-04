# Гайд: CI + запуск Mini App

## Архитектура

```
Телефон (v2rayTun + Telegram)
    → Cloudflare Edge (публичный HTTPS)
        → cloudflared tunnel (outbound с сервера)
            → Caddy:80 (HTTP внутри docker-сети)
                → api:8000 / frontend_dist

Ты (SSH/управление)
    → Tailscale → сервер
```

Cloudflare даёт публичный HTTPS без открытия портов и без конфликта с VPN на телефоне.
Tailscale остаётся только для SSH-доступа к серверу.

---

## Часть 1 — Настройка CI

### 1.1 Создать репозиторий на GitHub

```bash
git remote add origin git@github.com:<username>/tg-budget-planner.git
git push -u origin main
```

### 1.2 Secrets

`GitHub → Settings → Secrets and variables → Actions → New repository secret`

Для CI секреты не нужны — тесты используют мок-значения из `conftest.py`. CI запустится автоматически после первого `git push`.

### 1.3 Что проверяет CI

| Джоба | Что делает |
|---|---|
| `backend` | PostgreSQL 16 + Alembic migrate + pytest |
| `frontend-build` | `tsc` + `vite build` |
| `frontend-e2e` | Playwright в Chromium |

Все три джобы параллельны. Статус — в `Actions` вкладке репозитория.

---

## Часть 2 — Сервер

### 2.1 Tailscale (управление сервером)

Tailscale уже настроен. Подключение к серверу:

```bash
ssh user@100.85.17.52
```

### 2.2 Cloudflare Tunnel (публичный доступ к Mini App)

#### Шаг 1 — Домен в Cloudflare

**Вариант А: купить домен через Cloudflare Registrar (рекомендуется)**

Cloudflare продаёт домены по себестоимости — дешевле большинства регистраторов, и NS уже настроены автоматически.

1. Зарегистрируй аккаунт на `cloudflare.com`
2. `Domain Registration → Register a Domain`
3. Выбери домен, например `mybudget.app` (~$10-15/год)
4. Оплати — домен сразу готов к использованию, переходи к Шагу 2

**Вариант Б: есть домен у другого регистратора**

Перенести NS на Cloudflare:

1. Добавь домен: `cloudflare.com → Add a Site`
2. Выбери тариф **Free**
3. Cloudflare покажет два NS-сервера, например:
   ```
   bart.ns.cloudflare.com
   emma.ns.cloudflare.com
   ```
4. Вставь их в настройках своего регистратора вместо старых NS
5. Подождать до 24 часов (обычно 15-30 минут)

#### Шаг 2 — Создать тоннель

На сервере:

```bash
# Установить cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Войти в аккаунт Cloudflare (откроет ссылку в браузере)
cloudflared tunnel login

# Создать тоннель
cloudflared tunnel create tg-budget

# Сохранить tunnel ID — понадобится
cloudflared tunnel list
```

#### Шаг 3 — Настроить маршрут

```bash
# Привязать публичный домен к тоннелю
cloudflared tunnel route dns tg-budget budget.yourdomain.com
```

#### Шаг 4 — Конфиг тоннеля

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: budget.yourdomain.com
    service: http://localhost:8087
  - service: http_status:404
EOF
```

#### Без домена (быстрый старт)

Cloudflare даёт временный публичный URL без домена и регистрации:

```bash
cloudflared tunnel --url http://localhost:8087
# Выдаст URL вида: https://random-name.trycloudflare.com
```

Временный URL меняется при каждом перезапуске — подходит только для теста.

### 2.3 Caddy — HTTP-режим для Cloudflare

Cloudflare сам терминирует TLS, поэтому Caddy нужен в HTTP-режиме. Переопределения уже прописаны в `docker-compose.cloudflare.yml`:

- монтирует `Caddyfile.dev` (HTTP-only, без Let's Encrypt)
- открывает Caddy только на `127.0.0.1:8087` — снаружи недоступно, Cloudflare Tunnel дотягивается изнутри

Ничего редактировать вручную не нужно.

### 2.4 cloudflared как docker-сервис

`cloudflared` и переопределение Caddy уже описаны в `docker-compose.cloudflare.yml` — ничего не нужно добавлять вручную.

Получить токен и записать в `.env`:

```bash
cloudflared tunnel token tg-budget
# → вставить значение в CLOUDFLARE_TUNNEL_TOKEN в .env
```

### 2.5 Настройка `.env`

```bash
cp .env.example .env
nano .env
```

```env
DB_PASSWORD=<python3 -c "import secrets; print(secrets.token_urlsafe(32))">
BOT_TOKEN=<токен от @BotFather>
OWNER_TG_ID=<твой Telegram ID от @userinfobot>
INTERNAL_TOKEN=<python3 -c "import secrets; print(secrets.token_hex(32))">
PUBLIC_DOMAIN=budget.yourdomain.com
MINI_APP_URL=https://budget.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=<из cloudflared tunnel token tg-budget>
LOG_LEVEL=INFO
```

### 2.6 Первый запуск

```bash
git clone git@github.com:<username>/tg-budget-planner.git /opt/tg-budget-planner
cd /opt/tg-budget-planner
cp .env.example .env && nano .env

# Cloudflare Tunnel режим (рекомендуется):
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build

# Let's Encrypt режим (требует открытых портов 80/443 и DNS, направленного на VPS):
# docker compose -f docker-compose.yml up -d --build

# Проверить что всё поднялось
docker compose ps
docker compose logs -f cloudflared
```

Порядок старта: `db` → `api` (миграции) → `bot`, `worker`, `caddy` → `cloudflared`.

Проверка: открой `https://budget.yourdomain.com` в браузере — должен ответить SPA.

### 2.7 Настройка в BotFather

```
/setmenubutton → выбрать бота → Web App
URL: https://budget.yourdomain.com
```

### 2.8 Обновление

```bash
cd /opt/tg-budget-planner
git pull
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build
```

`api` накатывает миграции автоматически при перезапуске.

---

## Шпаргалка

```bash
# Первый деплой (Cloudflare Tunnel режим)
git clone … /opt/tg-budget-planner && cd /opt/tg-budget-planner
cp .env.example .env && nano .env
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build

# Обновление
git pull && docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build

# Логи
docker compose logs -f api bot worker cloudflared

# Перезапустить сервис
docker compose restart api

# Проверить тоннель
docker compose logs cloudflared | tail -20
```
