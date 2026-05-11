# Open-Core Manifest

This document lists what's included in the public open-core release vs closed.

## Public (open-core, PolyForm Shield)

### Backend
- FastAPI app skeleton + Postgres + Alembic + RLS multi-tenancy infra.
- Budget domain: categories, plan, actual transactions, subscriptions, accounts.
- Tax reserve calculator (НПД 4-6%) — Persona E.
- CSV export — Persona E.
- Reverse-trial 14-day onboarding mechanic.
- ЮKassa client wrapper + payment + subscription_billing tables (schemas + webhook).
- Compliance: 152-ФЗ ПДн consent + data export + account deletion + privacy/tos endpoints.
- Cookie banner web Mini App.
- Cron worker (notify_subscriptions, charge_subscriptions, close_period).

### Bot
- Telegram bot commands: `/start`, `/add`, `/income`, `/balance`, `/today`, `/app`.
- Inline disambiguation для multi-category match.

### Frontend (basic React Vite + TS)
- `frontend/src/api/` HTTP client + endpoints.
- `frontend/src/components/CookieBanner.tsx`, `PdnConsentCheckbox.tsx`, `PaymentButton.tsx`, `PaywallSheet.tsx`.
- Generic legal pages (privacy/terms).

### Infra
- docker-compose.yml — 5-container setup (caddy + api + bot + worker + db).
- Caddy reverse proxy + Let's Encrypt config.
- Alembic migrations (0001 — 0023, кроме AI-specific tables).

## Private / Closed

### Frontend
- `frontend/src/screensV10/` — Maximal Poster screen implementations.
- `frontend/src/componentsV10/` — Maximal Poster components + tokens.
- Maximal Poster fonts (proprietary subsets).
- 11 keyframe animations.

### Backend
- `app/services/ai_*` — conversational AI с tool-use (6 tools).
- `app/services/embeddings_*` — pgvector-based auto-categorization.
- `app/api/routes/ai.py` + `ai_suggest.py` — AI endpoints.
- `app/services/yookassa_client.py` + `tier.py` + `billing.py` — multi-tenant cloud billing.

### iOS
- `ios/` — entire SwiftUI app, custom PosterNavStack, PosterSheet, Maximal Poster design system.

## Strategic Rationale

Per `.planning/PRODUCT-STRATEGY.md` Q3=c:
- Open-core gives credibility + acquisition funnel (Habr longread + GitHub stars).
- Proprietary AI + Maximal Poster + iOS = value props that justify Pro 299₽/мес.
- Self-hosters DON'T compete (no scale advantage); хостед users пользуются AI + polished iOS.
- PolyForm Shield blocks competing SaaS clones (e.g. «MyBudgetClone.ru» reusing наш core).
