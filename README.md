# TG Budget Planner — Open Core

Personal finance Telegram Mini App + bot + iOS native — план/факт-бюджет с rollover, AI-чатом, auto-roundup в копилку, multi-account, recurrent platежi, tax reserve calculator для самозанятых.

**Status:** in active development. Currently in v1.1 — Monetization Foundation milestone.

[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/License-PolyForm%20Shield%201.0.0-blue.svg)](LICENSE)

---

## Что в open-core

- **Backend** (FastAPI + Postgres + RLS) — budget domain, categories, plan, actual transactions, recurrent.
- **Bot** (aiogram 3) — TG-команды `/start`, `/add`, `/income`, `/balance`, `/today`.
- **Worker** (APScheduler) — 3 cron-джобы (notify / charge / close_period).
- **Infrastructure** — docker-compose 5 containers + Caddy + Alembic migrations.
- **Compliance** — 152-ФЗ ПДн consent + data export + account deletion + privacy/tos.
- **Tax tools** — НПД 4-6% reserve calculator + CSV export для самозанятых.
- **Payments** — ЮKassa Self-Employed wrapper + webhook + subscription state machine.

## Что в Pro (proprietary / hosted)

- **Conversational AI** (6 tool-use functions: write_transaction, suggest_budget, analyze_category, etc.).
- **AI categorization** через pgvector embeddings (cosine similarity на text-embedding-3-small).
- **Maximal Poster Design System** — Telegram Mini App с 4 proprietary шрифтами, 11 keyframe-анимациями, кораллово-кобальтовой палитрой.
- **iOS native client** — SwiftUI 100% vanilla, custom PosterNavStack + posterSheet с edge-swipe-back.
- **Multi-tenant cloud hosting** — managed instance с 99.9% SLA.

## Self-hosting (open-core)

```bash
git clone https://github.com/<your-username>/tg-budget-planner
cd tg-budget-planner
cp .env.example .env
# Fill BOT_TOKEN, OWNER_TG_ID, DATABASE_URL
docker compose up -d
```

Подробности: `docs/self-hosting.md`.

## Hosted version

Try Pro tier:

- [tg-budget-planner.ru](https://tg-budget-planner.ru) (placeholder URL)
- Pro: 299 ₽/мес или 1990 ₽/год.
- 14-day free trial — no credit card required.

## License

PolyForm Shield 1.0.0 — open for self-hosting, **noncompete clause** prevents competing SaaS.
See `LICENSE` + `docs/LICENSE-CLOSED-COMPONENTS.md` for details.

## Contributing

PRs welcome for open-core components. See `CONTRIBUTING.md`.

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Pydantic v2.
- **Bot:** aiogram 3.x.
- **DB:** PostgreSQL 16 + pgvector + Alembic.
- **Frontend:** React 18, Vite, TypeScript, @telegram-apps/sdk-react.
- **Worker:** APScheduler (Postgres jobstore) + pg_try_advisory_lock idempotency.
- **Hosting:** Docker compose, Caddy + Let's Encrypt.

## Architecture

См. `docs/HLD.md`.

## Compliance (РФ)

- 152-ФЗ ПДн consent на /start + onboarding.
- РКН notification template в `docs/legal/RKN-NOTIFICATION.md`.
- Privacy Policy + ToS (драфт; legal review pending) в `docs/legal/`.
- Data export (GDPR-style) + 30-day soft-delete + automatic purge job.
