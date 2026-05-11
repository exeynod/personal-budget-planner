# Plan 32-04 Summary: Locust Load-Test Harness + LOAD-TEST.md

**Phase:** 32 — Multi-tenant Production Enablement
**Plan:** 04
**Status:** Complete (manual run before deploy)
**Date:** 2026-05-11
**Requirements:** REQ-32-04

## What shipped

- `loadtest/locustfile.py` — 2 user classes:
  - `ActualTxnUser` — POST /api/v1/actual (10:1) + GET /me.
  - `AIChatUser` — POST /api/v1/ai/chat SSE.
  - Each VU gets unique `tg_user_id` (offset 1_000_000+) seeded via internal onboarding endpoint.
  - X-Test-User header (DEV_MODE bypass).
- `loadtest/README.md` — operator quick-start, acceptance table, cross-tenant leakage spot-check snippet.
- `docs/LOAD-TEST.md` — methodology + acceptance criteria + result template + pre-deploy checklist.

## Acceptance criteria (REQ-32-04)

| Metric | Threshold |
|--------|-----------|
| p95 latency (POST /actual) | < 800ms |
| p95 latency (GET /me) | < 200ms |
| p95 latency (POST /ai/chat) | < 5000ms (SSE first chunk) |
| 5xx count | 0 |
| Cross-tenant leakage | 0 |
| Sustained RPS | ≥ 30 |

## Known deviation: manual rerun before deploy

Load test НЕ запущен в this commit — methodology готова, harness готова,
но фактический run требует:
- Staging environment с DEV_MODE=true.
- `INTERNAL_TOKEN` env var.
- Manual interpretation результатов (fill table в `docs/LOAD-TEST.md`).

Pre-deploy checklist в `docs/LOAD-TEST.md` детализирует steps.

## Files changed

- `loadtest/locustfile.py` (new, 105 LOC)
- `loadtest/README.md` (new, 60 LOC)
- `docs/LOAD-TEST.md` (new, 70 LOC)
