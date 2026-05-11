# Phase 38: Landing Page + Onboarding Funnel + Analytics — Context

**Gathered:** 2026-05-11
**Status:** Complete (2 plans shipped — static landing + analytics
instrumentation)
**Mode:** Auto-generated (autonomous run; landing + instrumentation only,
PostHog/Plausible self-host deferred).

## Phase Boundary

Last phase of v1.1 Monetization Foundation. Delivers два baseline блока для
public launch:

- **38-01** — Static landing `landing/index.html` (hero + 3 features +
  pricing card + FAQ + footer + CTA «Открыть в Telegram»), Maximal Poster
  palette, single-file inline CSS, mobile-first.
- **38-02** — Analytics event log (alembic `0024_analytics_event` +
  `track_event` service + `POST /api/v1/analytics/event` endpoint +
  frontend `trackEvent` helper + EVENT enum constants). Fire-and-forget
  semantics — никогда не блокирует UI / product flow.

## Implementation Decisions

- **No PostHog/Plausible self-host** в Phase 38 — own таблица
  `analytics_event` (BIGSERIAL + JSONB props + 3 indexes) проще на pet-scale,
  никаких внешних зависимостей; миграция на PostHog → opt-in после Month-3
  gate если volumes растут.
- **No RLS** на `analytics_event` — internal anonymized log, user_id
  optional (ON DELETE SET NULL для GDPR-compliance после account
  deletion).
- **Separate `event_router`** в `app/api/routes/analytics.py` без
  `require_onboarded` — events типа `landing.hit` / `onboarding.started`
  должны логироваться до завершения onboarding'a.
- **Fire-and-forget** на всех уровнях: backend `track_event` ловит любое
  Exception → WARNING log, не raise; frontend `trackEvent` обёрнут в
  `try/catch {}` без propagation.
- **Stable event names** живут в двух местах: `app/services/analytics.py
  EVENT_*` константы (snake_case) + `frontend/src/api/analytics.ts EVENT`
  enum (UPPER_SNAKE). Источник истины — backend constants; фронт зеркалит.

## Deferred (manual / v1.2+)

- REQ-38-02 explainer GIF/video 30-60s — content TODO.
- REQ-38-03 UTM-param capture в `app_user.acquisition_source` — DB поле
  не добавлено, capture deferred к Phase 39 (Habr launch).
- REQ-38-04 Welcome survey (1 экран после onboarding) — UX-pass deferred.
- REQ-38-05 PostHog/Plausible self-host — own лог достаточен на pet-scale.
- REQ-38-06 Funnel dashboard — query-templates можно собрать ad-hoc
  поверх `analytics_event` для Month-3 review.
- REQ-38-07 Cookie banner на landing — landing статичен без cookies; если
  PostHog активируется → отдельная задача.
- Landing deploy через Caddy fileserver / GitHub Pages — manual user-side.

## Commits

1. `c802043` — feat(38-01): static landing page с hero/features/pricing/FAQ/footer (REQ-38-01)
2. `621cd76` — feat(38-02): analytics event log + /api/v1/analytics/event endpoint + frontend trackEvent (REQ-38-02)
