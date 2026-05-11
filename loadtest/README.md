# Multi-tenant Load Test

Phase 32 REQ-32-04 — production-readiness load test для multi-tenant
backend. Locust-based; runs against staging (or dev) с `DEV_MODE=true`
через `X-Test-User` header bypass.

## Quick start

```bash
pip install locust
export INTERNAL_TOKEN=$(grep INTERNAL_TOKEN .env | cut -d= -f2)
locust -f loadtest/locustfile.py --headless \
    -u 50 -r 5 -t 2m --host=http://localhost:8000 --csv=results
```

## Scenarios

- `ActualTxnUser` — POST /api/v1/actual + GET /me, 10:1 ratio.
- `AIChatUser` — POST /api/v1/ai/chat SSE.

Each virtual user gets unique `tg_user_id` (1_000_000+ для tx user'ов,
1_500_000+ для AI users). User seeded once on_start через internal
onboarding endpoint.

## Acceptance criteria

| Metric | Threshold |
|--------|-----------|
| p95 latency | < 800ms |
| 5xx count | 0 |
| Cross-tenant leakage (sampled) | 0 |
| Throughput (req/s, sustained) | ≥ 30 |

## Output

- `results_stats.csv` — per-endpoint p50/p95/p99/RPS/failures.
- `results_failures.csv` — failure breakdown.
- `results_exceptions.csv` — Python exceptions.

## Tuning

- `-u N` — target concurrent users (50 production-readiness gate).
- `-r R` — spawn rate (5 user/sec — gradual ramp).
- `-t Tm` — test duration (2-5 min recommended).

## Cross-tenant leakage check

После run, для 3 случайных tg_user_id из range 1_000_000..1_010_000:

```bash
docker compose exec api python -c "
from sqlalchemy import create_engine, text
import os
url = os.environ['DATABASE_URL'].replace('+asyncpg', '+psycopg2')
engine = create_engine(url)
with engine.connect() as c:
    for tg in [1_000_001, 1_000_500, 1_001_000]:
        r = c.execute(text('SELECT COUNT(*) FROM actual_transaction at JOIN app_user au ON at.user_id=au.id WHERE au.tg_user_id <> :tg AND at.description = :desc'), {'tg': tg, 'desc': 'loadtest-tx'})
        print(tg, '-> leaked rows seen:', r.scalar())
"
```

Expected: каждый 0.
