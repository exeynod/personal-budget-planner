# Multi-tenant Production Load Test

**Phase**: 32 (Multi-tenant Production Enablement)
**Requirement**: REQ-32-04
**Driver**: locust (Python)
**Date** of last documented run: 2026-05-11 (initial; rerun before prod deploy).
**Status**: methodology готова; sample run в staging environment рекомендован
перед production cutover.

## Goal

Validate, что multi-tenant infrastructure (RLS + role-based auth + AI cap)
выдерживает 50 concurrent users × 100 actual_tx creates + 20 AI chats без
5xx и с p95 < 800ms.

## Methodology

1. Boot full stack via `docker-compose up -d` (api + bot + worker + db).
   DEV_MODE=true (для `X-Test-User` header bypass).
2. Seed internal-onboarding endpoint доступен по `X-Internal-Token`.
3. Run locust harness — see `loadtest/README.md`:
   ```
   locust -f loadtest/locustfile.py --headless \
       -u 50 -r 5 -t 2m --host=http://localhost:8000 --csv=results
   ```
4. После run — cross-tenant leakage spot-check (3 random users).
5. Inspect:
   - `results_stats.csv` — p50/p95/p99 + RPS + failures.
   - `results_failures.csv` — 5xx breakdown.
   - `docker compose logs api worker | grep 'ERROR\|CRITICAL'` — server-side errors.

## Acceptance criteria

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| p95 latency (POST /actual) | < 800ms | TG Mini App responsiveness budget |
| p95 latency (GET /me) | < 200ms | Простой read, должно быть очень fast |
| p95 latency (POST /ai/chat) | < 5000ms (SSE first chunk) | OpenAI roundtrip dominant |
| 5xx count | 0 | Production-readiness — any 5xx = blocker |
| Cross-tenant leakage (sample 3 users) | 0 leaked rows | RLS hard guarantee |
| Sustained RPS | ≥ 30 | 50 users × 0.6 req/s average |

## Last-run results (template — fill after actual run)

| Endpoint | RPS | p50 | p95 | p99 | Fails |
|----------|-----|-----|-----|-----|-------|
| POST /api/v1/actual | TBD | TBD | TBD | TBD | TBD |
| GET /api/v1/me | TBD | TBD | TBD | TBD | TBD |
| POST /api/v1/ai/chat | TBD | TBD | TBD | TBD | TBD |

**Cross-tenant leakage check**: TBD (rerun-before-deploy).

**Verdict**: TBD.

## Known limitations

- DEV_MODE=true required — load test НЕ runs against pure-prod (требует
  `X-Test-User` bypass; init-data signing для 50 virtual users слишком
  heavy для locust workflow). Production-environment validation —
  manual smoke (один user через real TG client) перед public launch.
- `loadtest/locustfile.py` использует hard-coded `category_id=1` fallback
  если /categories returns empty — для seeded users это always seeds 8
  default categories (Phase 11 onboarding); fallback only kicks in для
  misconfigured env.
- AI chat responses не fully consumed (stream=True + break после first
  chunk) — это intentional, чтобы load test измерял backend latency, не
  OpenAI roundtrip duration.

## Pre-deploy checklist

- [ ] Run locust against staging environment.
- [ ] Fill last-run table выше.
- [ ] Cross-tenant leakage spot-check returns 0 для 3 sampled users.
- [ ] Add result CSV to `loadtest/results/YYYY-MM-DD/` для historical baseline.
- [ ] Verdict signed off в commit message: `loadtest(phase-32): pass / fail`.
