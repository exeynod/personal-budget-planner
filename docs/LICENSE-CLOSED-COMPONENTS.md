# Closed-Source Components

The following directories / files are **NOT** included under the PolyForm Shield license
and are proprietary to the TG Budget Planner project authors. They are NOT distributed
under the open-core package and remain under "all rights reserved":

## Frontend (Maximal Poster Design System)

- `frontend/src/screensV10/` — pixel-perfect Maximal Poster screens.
- `frontend/src/componentsV10/` — Maximal Poster components.
- `frontend/src/stylesV10/` — design tokens for Maximal Poster.
- `frontend/public/fonts/poster/` — proprietary font subset (Archivo Black, DM Serif Italic, Manrope, JetBrains Mono).
- All Maximal Poster animations + design files in `frontend/src/animationsV10/`.

## iOS Native Client

- `ios/` — entire SwiftUI iOS app.

## AI Integration (Premium tier value)

- `app/services/ai_*.py` — AI conversational service, tool-use definitions.
- `app/services/embeddings_*.py` — pgvector-based auto-categorization service.
- `app/api/routes/ai.py` + `app/api/routes/ai_suggest.py` — AI endpoints.
- `app/services/yookassa_client.py` + `app/services/tier.py` + `app/api/routes/billing.py` — multi-tenant cloud billing.

## Open-Core Components (PolyForm Shield)

Everything else, including:

- `app/db/models.py` (без AI-specific models)
- `app/db/session.py` + RLS infra
- `app/services/onboarding_v10.py` (без AI)
- `app/services/data_export.py` + account_deletion.py
- `app/services/tax_reserve.py` + csv_export.py
- `app/services/budget_period.py` (rollover, close-period jobs)
- `app/api/routes/categories.py`, `accounts.py`, `actual.py`, `subscriptions.py`, `legal.py`
- `app/worker/` (cron jobs)
- `bot/` — Telegram bot commands
- `deploy/docker-compose.yml` + Dockerfiles
- `alembic/` migrations
- `docs/`

## Distribution Note

If you wish to use the open-core components for a **competing product**, you may not.
PolyForm Shield is **noncompete** — see LICENSE.

Self-hosted personal / family / org use is **permitted**.
