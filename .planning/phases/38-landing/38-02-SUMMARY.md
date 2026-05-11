# Plan 38-02 Summary

**Commit:** `621cd76`
**Date:** 2026-05-11
**REQ:** REQ-38-02

## What landed

- DB schema `analytics_event` (BIGSERIAL + JSONB props + 3 indexes), no
  RLS — anonymized internal log; ON DELETE SET NULL у `user_id` для
  GDPR-compliance после account deletion.
- `track_event(db, name, user_id, props)` сервис с swallow-all error
  semantics — никогда не блокирует caller / product flow.
- `POST /api/v1/analytics/event` endpoint в отдельном `event_router`
  (без `require_onboarded`, чтобы события типа `landing.hit` /
  `onboarding.started` могли логироваться до завершения onboarding'a).
- Frontend `trackEvent()` helper + `EVENT` enum — 9 stable constants
  (mirrors backend EVENT_* names).
- Migration 0024 — round-trip downgrade/upgrade clean.

## Tests delta

- `tests/test_analytics_event.py` — 2 tests green
  (insert + silent-error).
- 0 регрессий в Phase 8 `test_analytics.py` (10 pass / 4 skip).

## Deferred

- UTM attribution → Phase 39.
- PostHog / Plausible self-host → opt-in после Month-3 gate.
- Welcome survey → v1.2 UX wave.
- Funnel dashboard → ad-hoc SQL поверх таблицы для Month-3 review.
