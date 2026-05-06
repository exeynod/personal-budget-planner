# Phase 1: Infrastructure & Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 1-infrastructure-and-auth
**Areas discussed:** Python tooling & layout, Bot mode, Dev-среда / initData bypass, Frontend в Phase 1

---

## Python tooling & layout

| Option | Description | Selected |
|--------|-------------|----------|
| uv + pyproject.toml | Быстрый современный менеджер, lock-файл | ✓ |
| poetry | Устоявшийся стандарт, тяжелее | |
| pip + requirements.txt | Минималистично, нет lock-file автоматизации | |

**User's choice:** все сам решай (Claude Discretion)
**Notes:** Claude выбрал `uv` + `pyproject.toml`. Один Dockerfile с build-arg SERVICE для трёх Python-контейнеров.

---

## Bot: webhook vs long-poll

| Option | Description | Selected |
|--------|-------------|----------|
| Long-poll | Проще для self-hosted, не требует настройки webhook в Caddy | ✓ |
| Webhook | Требует регистрации URL, есть TLS — технически возможно | |

**User's choice:** все сам решай (Claude Discretion)
**Notes:** Claude выбрал long-poll как более простой для MVP. Webhook отложен в post-MVP (HLD Q-11).

---

## Dev-среда / initData bypass

| Option | Description | Selected |
|--------|-------------|----------|
| DEV_MODE=true env | Отключает HMAC, инжектирует mock user с OWNER_TG_ID | ✓ |
| Всегда валидировать | Строго, но неудобно для локального dev | |

**User's choice:** все сам решай (Claude Discretion)
**Notes:** Claude добавил `DEV_MODE` ENV. В prod должен быть false. `.env.example` обязателен в repo.

---

## Frontend в Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal Vite+React scaffold | Stub-страница, Caddy+TLS проверяется сразу | ✓ |
| Только placeholder HTML | Проще, без Node.js в CI | |
| Пропустить до Phase 2 | Caddy без SPA-контента | |

**User's choice:** все сам решай (Claude Discretion)
**Notes:** Claude включил минимальный Vite scaffold в Phase 1 — нужно проверить что Caddy+TLS работает со SPA.

---

## Claude's Discretion

- Все 4 области Phase 1 — пользователь делегировал решения Claude целиком.
- Конкретные версии зависимостей, имена сетей/volumes, детали Caddyfile.

## Deferred Ideas

- **Bot webhook** — Q-11 из HLD, отложен в post-MVP.
- **pg_dump backup destination** — Q-9 из HLD, отложен в Phase 6 или post-MVP.
