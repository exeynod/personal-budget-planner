---
status: passed
verified: 2026-05-11
phase: 38-landing
---

# Phase 38 Verification

## Requirements

- [x] REQ-38-01 — Static landing `landing/index.html` (hero / 3 features
  / pricing / FAQ / footer), Maximal Poster palette, mobile-first, CTA
  deeplink `t.me/<bot>?start=ref_landing` placeholder. Commit `c802043`.
- [x] REQ-38-02 — Analytics event log: alembic `0024_analytics_event` +
  `track_event` service + 12 EVENT_* constants + `POST
  /api/v1/analytics/event` endpoint + frontend `trackEvent()` helper +
  `EVENT` enum + 2 tests green. Commit `621cd76`.

## Tests

- `tests/test_analytics_event.py` — 2 passed.
- `tests/test_analytics.py` (Phase 8 aggregates regression) — 10 passed,
  4 skipped (DEV_MODE auth-skip), 0 regressions.
- Alembic round-trip: `upgrade head → downgrade -1 → upgrade head` clean.

## Manual follow-ups

- **Landing deploy** — Caddy fileserver block в Caddyfile ИЛИ GitHub
  Pages; DNS A-record на main домен.
- **Bot username** — заменить `<bot>` placeholder в `landing/index.html`
  при first deploy (search-and-replace).
- **Lighthouse audit** — после deploy, target mobile score >90.
- **Explainer GIF/video 30-60s** (REQ-38-02 content piece) — content
  production task.
- **UTM-attribution capture** (REQ-38-03) — add
  `app_user.acquisition_source` + `?utm_source=` parser в bot `/start`
  handler — deferred к Phase 39 (Habr launch).
- **Welcome survey** (REQ-38-04) — UX-pass deferred к v1.2.
- **PostHog / Plausible self-host** (REQ-38-05) — opt-in после Month-3
  gate если volume растёт; ad-hoc SQL поверх `analytics_event`
  достаточен на pet-scale.
- **Funnel dashboard** (REQ-38-06) — query templates для Month-3 review
  пишутся ad-hoc.
- **Cookie banner на landing** (REQ-38-07) — landing статичен без
  cookies; required только если PostHog активируется.

## Known gaps (manual / v1.2)

- REQ-38-03..07 — deferred per manual follow-ups выше; v1.1 ships
  baseline instrumentation + landing markup.

## Commits (2 total)

1. `c802043` — feat(38-01): static landing page с hero/features/pricing/FAQ/footer (REQ-38-01)
2. `621cd76` — feat(38-02): analytics event log + /api/v1/analytics/event endpoint + frontend trackEvent (REQ-38-02)
