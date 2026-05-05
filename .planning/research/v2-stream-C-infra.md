# v0.3 Research — Stream C: Backups, Monitoring, Rate Limiting, CI/CD, Secrets

**Researched:** 2026-05-05
**Domain:** PostgreSQL backups, error monitoring, uptime checks, rate limiting, CI/CD, secrets management
**Confidence:** HIGH on stack choices; MEDIUM on exact Cloudflare WAF rules (Free tier limits); LOW on pgBackRest (archived April 2026)
**Scope:** Production-grade reliability for single VPS, 5-50 whitelist users, budget ~$10-20/month overhead

---

## Executive Summary

For a personal-scale TG Mini App (< 1 GB DB, 5-50 users) on a single 2-4 GB VPS, **don't over-engineer**. The stack below adds production reliability at near-zero RAM cost. Key decisions:

1. **Backups**: `pg_dump | gzip | age | rclone` → Cloudflare R2. R2 wins on price (~$0 for 10 GB + free egress). WAL-G adds complexity without benefit at this scale. pgBackRest was archived in April 2026 — do not use.
2. **Error monitoring**: GlitchTip self-hosted (4 containers, ~512 MB RAM). Sentry Cloud free is viable if you want zero-ops but has 5k/month cap.
3. **Uptime**: UptimeRobot free (HTTP) + Healthchecks.io free (cron heartbeats). Use both — they serve different purposes.
4. **Metrics**: Skip Prometheus+Grafana. At 2-4 GB RAM it costs 300-600 MB for near-zero benefit. Use structlog + BetterStack logs or Docker stats.
5. **Rate limiting**: 3 layers — Cloudflare Free WAF rules → Caddy `rate_limit` plugin → slowapi per-user in FastAPI. Redis required for cross-container per-user limits.
6. **Logs**: BetterStack free (1 GB/month, 3-day retention) — zero ops, good enough. Loki adds overhead without payoff.
7. **CI/CD**: GitHub Actions → `appleboy/ssh-action` → `docker compose pull && up -d`. Watchtower is simpler but less safe (no health gate before switch).
8. **Secrets**: Keep `.env` for now. Add SOPS + age only when AI API keys are checked into git or shared with another person.

**Primary recommendation:** Ship GlitchTip + UptimeRobot + Healthchecks.io + Cloudflare R2 backup cron as first reliability sprint. Total overhead: ~$1-2/month + ~600 MB RAM.

---

## 1. PostgreSQL Backups — Recommendation

### 1.1 Tool Comparison

| Tool | Type | Complexity | PITR | Best For |
|------|------|------------|------|----------|
| `pg_dump` + cron | Logical | LOW | No | Small DBs, < 10 GB, simple ops |
| WAL-G | Physical + WAL | MEDIUM | Yes | Multi-GB DBs, RPO < 1 hour |
| pgBackRest | Physical + WAL | HIGH | Yes | **ARCHIVED 2026-04-27 — do not use** |

**Verdict for this project:** `pg_dump` in a cron script. WAL-G is the right next step *only* if the DB grows past 5 GB or RPO requirements tighten to sub-hour. The project has < 1 GB of data and daily backups are sufficient for a personal budget app.

[CITED: bytebase.com/blog/top-open-source-postgres-backup-solution/ — pgBackRest archived April 27, 2026, v2.58.0 final]
[CITED: dev.to/rostislav_dugin/top-5-postgresql-backup-tools-in-2025-5801]

### 1.2 Backup Script

Requires on the VPS: `age`, `rclone` (configured with R2 remote named `r2`), `postgresql-client`.

```bash
#!/usr/bin/env bash
# /opt/budget/scripts/backup-pg.sh
# Runs as: cron, 02:00 UTC daily
# Deps: age, rclone, pg_dump (postgresql-client package)
# Env: DB_PASSWORD, AGE_RECIPIENT (age public key)

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-budget_db}"
DB_USER="${DB_USER:-budget}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set}"
AGE_RECIPIENT="${AGE_RECIPIENT:?AGE_RECIPIENT must be set}"  # age1... public key
RCLONE_REMOTE="${RCLONE_REMOTE:-r2:budget-backups}"
BACKUP_ROOT="/var/backups/budget"
LOG_FILE="/var/log/budget-backup.log"

DATE=$(date -u +%Y%m%dT%H%M%SZ)
DOW=$(date -u +%u)    # 1=Mon..7=Sun
DOM=$(date -u +%d)    # day of month 01-31

# Determine backup tier
if [[ "$DOM" == "01" ]]; then
  TIER="monthly"
elif [[ "$DOW" == "7" ]]; then
  TIER="weekly"
else
  TIER="daily"
fi

FILENAME="${DATE}-${TIER}.sql.gz.age"
LOCAL_PATH="${BACKUP_ROOT}/${FILENAME}"
REMOTE_PATH="${RCLONE_REMOTE}/${FILENAME}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }

log "Starting $TIER backup → $FILENAME"

mkdir -p "$BACKUP_ROOT"

# pg_dump → gzip → age-encrypt → local file
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  -Fc \
| gzip -9 \
| age --recipient "$AGE_RECIPIENT" \
> "$LOCAL_PATH"

SIZE=$(du -sh "$LOCAL_PATH" | cut -f1)
log "Backup written locally: $LOCAL_PATH ($SIZE)"

# Upload to R2 (or any rclone remote)
rclone copy "$LOCAL_PATH" "$RCLONE_REMOTE/" \
  --s3-chunk-size=8M \
  --retries=3 \
  --log-level INFO \
  --log-file "$LOG_FILE"

log "Uploaded to $REMOTE_PATH"

# Retention pruning on remote (keep 7 daily, 4 weekly, 6 monthly)
prune_remote() {
  local tier="$1"
  local keep="$2"
  # List files of this tier sorted oldest-first, delete beyond keep count
  rclone lsf "$RCLONE_REMOTE/" --include "*-${tier}.sql.gz.age" \
  | sort \
  | head -n -"$keep" \
  | while read -r f; do
      log "Pruning old $tier backup: $f"
      rclone delete "$RCLONE_REMOTE/$f"
    done
}

prune_remote "daily"   7
prune_remote "weekly"  4
prune_remote "monthly" 6

# Clean local copies older than 2 days (remote is source of truth)
find "$BACKUP_ROOT" -name "*.sql.gz.age" -mtime +2 -delete
log "Local cleanup done"

# Ping Healthchecks.io (cron heartbeat)
curl -fsS --retry 3 "https://hc-ping.com/${HC_BACKUP_UUID:-}" > /dev/null 2>&1 || true

log "Backup complete."
```

**Crontab (on VPS, root or dedicated backup user):**
```cron
0 2 * * * /opt/budget/scripts/backup-pg.sh >> /var/log/budget-backup.log 2>&1
```

**First-time setup:**
```bash
# Generate age key pair on VPS
age-keygen -o /root/.age/budget-backup.key
# Output shows public key: age1xxxxxxxx... → set AGE_RECIPIENT in env

# Configure rclone with Cloudflare R2
rclone config  # create remote "r2", provider=S3, endpoint=https://<accountid>.r2.cloudflarestorage.com
```

[ASSUMED] `pg_dump -Fc` format is used (custom format) which is smaller than plain SQL and required for `pg_restore`. The restore test script in Section 3 uses `pg_restore`.

---

## 2. Backup Storage — Recommendation

### 2.1 Comparison for ~10 GB / month

| Provider | Storage/month | Egress | Min retention | Free tier | GDPR |
|----------|--------------|--------|---------------|-----------|------|
| **Cloudflare R2** | $0.015/GB → $0.15 | **Free** | None | 10 GB free | EU option |
| Backblaze B2 | $0.006/GB → $0.06 | Free up to 3x storage | None | 10 GB free | US/EU |
| Wasabi | $0.0069/GB → $0.069 | Free | **90 days min** | None | US/EU |
| AWS S3 | $0.023/GB → $0.23 | $0.09/GB | None | 5 GB 1yr | Global |
| Hetzner Object Storage | €4.99/mo base, 1 TB incl. | €1/TB | None | None | EU GDPR |

**Verdict: Cloudflare R2.**

- 10 GB of backup data = **$0.00/month** (within 10 GB free tier).
- Zero egress fees → restore tests are free.
- Same Cloudflare account already used for Tunnel — single billing.
- S3-compatible API → rclone works out of the box.
- Hetzner Object Storage is overkill (€4.99 base for 10 GB backups).
- Wasabi's 90-day minimum retention makes it expensive for backup rotation (you pay for 90 days even if you delete after 7).

[CITED: developers.cloudflare.com/r2/pricing/ — 10 GB free standard storage, zero egress]
[CITED: onidel.com/blog/cloudflare-r2-vs-backblaze-b2 — pricing comparison]

---

## 3. Restore Test Script

Run monthly (or after each schema migration) to verify backups are valid.

```bash
#!/usr/bin/env bash
# /opt/budget/scripts/test-restore.sh
# Downloads latest backup, decrypts, restores into temp container, checks rowcounts.

set -euo pipefail

RCLONE_REMOTE="${RCLONE_REMOTE:-r2:budget-backups}"
AGE_KEY_FILE="${AGE_KEY_FILE:-/root/.age/budget-backup.key}"
TEST_CONTAINER="pg-restore-test-$$"
TEST_DB="restore_test"
PG_PASSWORD="testpassword123"
WORK_DIR=$(mktemp -d)

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { log "FAIL: $*"; cleanup; exit 1; }

cleanup() {
  log "Cleanup: removing temp container and files"
  docker rm -f "$TEST_CONTAINER" 2>/dev/null || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

log "=== Restore Test Starting ==="

# 1. Find latest backup on remote
LATEST=$(rclone lsf "$RCLONE_REMOTE/" --include "*.sql.gz.age" | sort | tail -1)
[[ -z "$LATEST" ]] && die "No backups found on remote $RCLONE_REMOTE"
log "Latest backup: $LATEST"

# 2. Download
ENCRYPTED_FILE="${WORK_DIR}/${LATEST}"
rclone copy "$RCLONE_REMOTE/$LATEST" "$WORK_DIR/" || die "Download failed"
log "Downloaded: $(du -sh "$ENCRYPTED_FILE" | cut -f1)"

# 3. Decrypt + decompress
DUMP_FILE="${WORK_DIR}/restore.dump"
age --decrypt \
  --identity "$AGE_KEY_FILE" \
  "$ENCRYPTED_FILE" \
| gunzip > "$DUMP_FILE" \
|| die "Decryption/decompression failed"
log "Decrypted dump: $(du -sh "$DUMP_FILE" | cut -f1)"

# 4. Start ephemeral PostgreSQL container
docker run -d \
  --name "$TEST_CONTAINER" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER=budget \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  postgres:16-alpine \
|| die "Failed to start test container"

log "Waiting for test PostgreSQL to be ready..."
for i in $(seq 1 30); do
  docker exec "$TEST_CONTAINER" pg_isready -U budget -d "$TEST_DB" > /dev/null 2>&1 && break
  sleep 1
  [[ $i -eq 30 ]] && die "Test PostgreSQL never became ready"
done

# 5. Restore dump
docker cp "$DUMP_FILE" "${TEST_CONTAINER}:/tmp/restore.dump"
docker exec "$TEST_CONTAINER" pg_restore \
  -U budget \
  -d "$TEST_DB" \
  --no-owner \
  --no-privileges \
  /tmp/restore.dump \
|| die "pg_restore failed"
log "pg_restore completed"

# 6. Rowcount verification
check_table() {
  local table="$1"
  local min_expected="${2:-0}"
  local count
  count=$(docker exec "$TEST_CONTAINER" \
    psql -U budget -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM ${table};" \
    | tr -d ' ')
  if [[ "$count" -ge "$min_expected" ]]; then
    log "  PASS: $table has $count rows (min=$min_expected)"
  else
    die "$table has $count rows but expected >= $min_expected"
  fi
}

log "--- Rowcount checks ---"
check_table "app_user"             0
check_table "category"             1
check_table "budget_period"        0
check_table "plan_template_item"   0
check_table "actual_transaction"   0
check_table "subscription"         0

log "=== PASS: Restore test completed successfully ==="
log "Backup file: $LATEST"
log "All tables verified."
```

Run monthly via cron or after migrations:
```cron
0 4 1 * * /opt/budget/scripts/test-restore.sh >> /var/log/budget-restore-test.log 2>&1
```

---

## 4. Error Monitoring

### 4.1 Comparison

| Option | Host | RAM overhead | Cost | Limit |
|--------|------|-------------|------|-------|
| **GlitchTip self-hosted** | Your VPS | ~512 MB (4 containers) | $0 | Unlimited |
| Sentry Cloud free | Cloud | 0 | $0 | 5k errors/month |
| BetterStack | Cloud | 0 | $0 free / $25+ paid | Alerts only, no error grouping |

**Verdict: Sentry Cloud free tier** for this project.

Reasoning: 5-50 users generating < 100 meaningful errors/month is well within the 5k/month free limit. GlitchTip at ~512 MB RAM is fine but adds operational burden (another compose stack to maintain, backup, update). At this scale, the ops cost outweighs the savings. If the project grows to multi-tenant with real users, switch to GlitchTip.

[CITED: dev.to/selfhostingsh/glitchtip-vs-sentry-206o — GlitchTip 512 MB, 4 containers]
[CITED: docs.sentry.io/platforms/python/integrations/fastapi/]

### 4.2 Integration Code

**Install:**
```bash
pip install sentry-sdk[fastapi]
```

**FastAPI (`app/main_api.py`):**
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
import os

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", ""),  # empty string = disabled
    environment=os.environ.get("ENVIRONMENT", "production"),
    integrations=[
        StarletteIntegration(transaction_style="endpoint"),
        FastApiIntegration(transaction_style="endpoint"),
        SqlalchemyIntegration(),
    ],
    traces_sample_rate=0.05,     # 5% of requests for performance traces
    profiles_sample_rate=0.0,    # disabled — not needed at this scale
    send_default_pii=False,      # GDPR: no user PII in events
)
```

**aiogram 3 global error handler (`app/bot/handlers/errors.py`):**
```python
import sentry_sdk
import logging
from aiogram import Router
from aiogram.types import ErrorEvent

router = Router()
logger = logging.getLogger(__name__)

@router.errors()
async def global_error_handler(event: ErrorEvent) -> bool:
    exc = event.exception
    logger.exception(
        "Unhandled bot error",
        exc_info=exc,
        extra={"update": event.update.model_dump(exclude_none=True)},
    )
    # Capture to Sentry with bot-specific context
    with sentry_sdk.push_scope() as scope:
        if event.update.message:
            scope.set_user({"id": str(event.update.message.from_user.id)})
        scope.set_tag("component", "bot")
        scope.set_context("update", {"type": str(event.update)[:200]})
        sentry_sdk.capture_exception(exc)
    return True  # mark as handled
```

**APScheduler job wrapper (`app/worker/jobs.py`):**
```python
import sentry_sdk
import functools
import logging

logger = logging.getLogger(__name__)

def with_sentry(job_name: str):
    """Decorator to capture APScheduler job exceptions to Sentry."""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            with sentry_sdk.start_transaction(op="job", name=job_name):
                try:
                    return await func(*args, **kwargs)
                except Exception as exc:
                    sentry_sdk.capture_exception(exc)
                    logger.exception("Job %s failed", job_name, exc_info=exc)
                    raise
        return wrapper
    return decorator
```

**docker-compose addition (env only, no new service):**
```yaml
# Add to api, bot, worker services in docker-compose.yml:
environment:
  SENTRY_DSN: ${SENTRY_DSN:-}           # empty = Sentry disabled (local dev)
  ENVIRONMENT: ${ENVIRONMENT:-production}
```

---

## 5. Uptime Monitoring

### 5.1 Comparison

| Tool | Free monitors | Cron-aware | Check interval | Push alerts |
|------|--------------|------------|----------------|-------------|
| UptimeRobot | 50 HTTP monitors | No | 5 min (free) | Email, Telegram |
| Healthchecks.io | 20 ping checks | **Yes** — cron expressions | On-miss | Email, Telegram |
| Better Uptime | 10 monitors | Limited | 3 min | Email, Slack |

**Verdict: Use BOTH UptimeRobot + Healthchecks.io — they're complementary.**

- **UptimeRobot**: HTTP monitor on `https://yourdomain.com/healthz`. Detects if the API is down.
- **Healthchecks.io**: Heartbeat from the `worker` container (and backup cron). Detects if scheduled jobs silently stopped running — UptimeRobot cannot detect this.

Setup:
1. UptimeRobot → New Monitor → HTTPS → `https://$PUBLIC_DOMAIN/healthz` → notify via Telegram
2. Healthchecks.io → Create check "budget-worker-heartbeat" → grab ping URL → worker pings it after each scheduler tick
3. Healthchecks.io → Create check "budget-backup" → backup script pings `HC_BACKUP_UUID` at end

**Worker heartbeat ping in APScheduler:**
```python
# In worker main loop or after each job run:
import httpx, os

async def ping_healthcheck():
    uuid = os.environ.get("HC_WORKER_UUID", "")
    if uuid:
        async with httpx.AsyncClient() as client:
            await client.get(f"https://hc-ping.com/{uuid}", timeout=5)
```

[CITED: healthchecks.io — 20 free checks, cron expression support]
[CITED: uptimerobot.com — 50 free monitors, 5-min interval]

---

## 6. Metrics (Prometheus + Grafana Decision)

**Verdict: Skip Prometheus + Grafana for now.**

On a 2-4 GB RAM VPS running 5+ Docker containers, adding Prometheus + Grafana + Node Exporter + cAdvisor costs 300-600 MB RAM (typically: Prometheus ~250 MB, Grafana ~150 MB, cAdvisor ~50 MB, node-exporter ~15 MB). That's 15-30% of total RAM on a 2 GB server.

[CITED: last9.io/blog/prometheus-with-docker-compose/ — minimum 4 GB recommended for full stack]
[ASSUMED] At < 50 users with structured logs and healthchecks, actionable signals come from errors and uptime checks, not dashboards.

**Alternatives that add zero RAM:**
- `docker stats` on the host — instant memory/CPU overview
- structlog JSON logs → BetterStack free → queryable without local infra
- Sentry performance traces (5% sample rate) → response time trends

**When to add Prometheus:** If the project scales to 500+ users or you add AI endpoints that need latency percentiles. At that point, move to a 4 GB+ server and add the monitoring stack.

---

## 7. Rate Limiting — Layered Design

### 7.1 Architecture (3 layers)

```
[Telegram User]
     |
     v
[Cloudflare Free WAF]  ← Layer 1: IP-level, bot fight mode, geo-block
     |
     v
[cloudflared Tunnel]   ← (no rate limiting here — pass-through)
     |
     v
[Caddy rate_limit]     ← Layer 2: per-IP burst protection, endpoint-level
     |
     v
[FastAPI / slowapi]    ← Layer 3: per-user (tg_user_id) fine-grained limits
     |
     v
[Redis]                ← slowapi distributed storage (new service)
```

### 7.2 Layer 1: Cloudflare Free WAF

Since October 2022, Cloudflare rate limiting is free on all plans including Free tier.
[CITED: blog.cloudflare.com/unmetered-ratelimiting/]

**Recommended Cloudflare Free WAF rules (dashboard: Security → WAF → Custom Rules):**

```
# Rule 1: Block non-Telegram user agents hitting /api/
# Expression: (http.request.uri.path contains "/api/") and 
#             (not http.user_agent contains "TelegramBot") and
#             (not http.user_agent contains "Mozilla")
# Action: JS Challenge (not Block — lets humans through)

# Rule 2: Rate limit /api/v1/ per IP
# Security → WAF → Rate Limiting Rules
# Path: /api/v1/*
# Rate: 100 requests per 10 seconds per IP
# Action: Block for 60 seconds

# Rule 3: Rate limit AI endpoint specifically
# Path: /api/v1/chat/message  (or whatever the AI endpoint is)
# Rate: 10 requests per 60 seconds per IP
# Action: Block for 300 seconds
```

Enable **Bot Fight Mode** (free): Security → Bots → Bot Fight Mode → ON.
This blocks known bad bots at Cloudflare edge, before they reach your VPS.

[CITED: developers.cloudflare.com/waf/rate-limiting-rules/ — free tier rate limiting]

### 7.3 Layer 2: Caddy rate_limit Plugin

The `mholt/caddy-ratelimit` module must be compiled into Caddy via xcaddy (not in the standard alpine image).

[CITED: github.com/mholt/caddy-ratelimit — module requires xcaddy build]

**Dockerfile for custom Caddy:**
```dockerfile
# Dockerfile.caddy
FROM caddy:2-builder AS builder
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

**docker-compose.yml update:**
```yaml
caddy:
  build:
    context: .
    dockerfile: Dockerfile.caddy
  # ... rest unchanged
```

**Caddyfile rate_limit directives:**
```caddy
{$PUBLIC_DOMAIN} {
    # Global per-IP rate limit — 300 req/min
    rate_limit {
        zone global_ip {
            key    {remote_host}
            events 300
            window 1m
        }
    }

    # Tighter limit on all /api/v1/ routes
    handle /api/v1/* {
        rate_limit {
            zone api_ip {
                key    {remote_host}
                events 60
                window 1m
            }
        }
        reverse_proxy api:8000
    }

    # AI chat endpoint — tightest Caddy-level limit
    # (per-user fine-grained done in FastAPI layer)
    handle /api/v1/ai/* {
        rate_limit {
            zone ai_ip {
                key    {remote_host}
                events 20
                window 1m
            }
        }
        reverse_proxy api:8000
    }

    # SPA static
    handle {
        root * /srv/dist
        try_files {path} /index.html
        file_server
    }
}
```

### 7.4 Layer 3: FastAPI / slowapi (per-user)

slowapi is the recommended library for async FastAPI — it supports Redis storage for distributed state and is actively maintained as of 2026.
[CITED: github.com/laurentS/slowapi — async FastAPI support, Redis backend]

**New Redis service in docker-compose.yml:**
```yaml
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru
    networks:
      - budget_net
    # no ports: — internal only
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

Add to `api` service environment:
```yaml
REDIS_URL: redis://redis:6379/0
```

**FastAPI rate limiting setup (`app/api/rate_limiting.py`):**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIASGIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import os

# Key function: use tg_user_id when authenticated, else IP
def get_tg_user_key(request: Request) -> str:
    # After auth middleware sets request.state.tg_user_id
    tg_user_id = getattr(request.state, "tg_user_id", None)
    if tg_user_id:
        return f"user:{tg_user_id}"
    return get_remote_address(request)

limiter = Limiter(
    key_func=get_tg_user_key,
    storage_uri=os.environ.get("REDIS_URL", "memory://"),  # fallback to memory in dev
)

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "detail": f"Too many requests. Retry after {exc.retry_after}s.",
        },
        headers={"Retry-After": str(exc.retry_after)},
    )
```

**Register in FastAPI app:**
```python
from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.api.rate_limiting import limiter, rate_limit_exceeded_handler

app = FastAPI()
app.state.limiter = limiter
app.add_middleware(SlowAPIASGIMiddleware)
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
```

**Endpoint decorators:**
```python
from app.api.rate_limiting import limiter

# General API endpoints — 60/minute per user
@router.get("/transactions")
@limiter.limit("60/minute")
async def list_transactions(request: Request, ...):
    ...

# AI chat — expensive endpoint
@router.post("/ai/message")
@limiter.limit("10/minute")           # burst: max 10 per minute
@limiter.limit("50/day")              # daily cap: 50 messages per user per day
async def ai_chat(request: Request, ...):
    ...

# Auth failures — handled separately via middleware
```

### 7.5 Concrete Rate Limit Targets

| Endpoint | Per-user/minute | Per-user/day | Per-IP (Caddy) | Notes |
|----------|----------------|-------------|----------------|-------|
| General API (`/api/v1/*`) | 60 | — | 60 | Standard usage |
| AI chat (`/ai/message`) | 10 | 50 | 20 | Token cost control |
| Auth/initData validation | 30 | — | 60 | Prevent replay attacks |
| Healthcheck (`/healthz`) | — | — | 600/min | Don't block monitors |

---

## 8. Logs

### 8.1 Decision

**Verdict: stdout + BetterStack free tier.** Loki is overkill for this scale.

| Option | RAM | Ops cost | Retention | Query |
|--------|-----|----------|-----------|-------|
| stdout only | 0 | 0 | Docker log rotation | `docker logs` / `grep` |
| **BetterStack free** | 0 | 0 | 3 days / 1 GB | SQL-like UI, live tail |
| Loki + Promtail | ~200-400 MB | Medium | Configurable | LogQL |

BetterStack (formerly Logtail) has a free tier: 1 GB/month ingestion, 3-day retention. For 5-50 users generating structured JSON logs, this is more than enough. The Vector agent (sidecar) ships logs from stdout to BetterStack.

[CITED: betterstack.com/log-management — free tier details]

**docker-compose addition:**
```yaml
  vector:
    image: timberio/vector:0.39.0-alpine
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./vector.toml:/etc/vector/vector.toml:ro
    networks:
      - budget_net
    environment:
      BETTERSTACK_TOKEN: ${BETTERSTACK_TOKEN:-}
```

**vector.toml:**
```toml
[sources.docker]
type = "docker_logs"
include_containers = ["budget-api-1", "budget-bot-1", "budget-worker-1"]

[transforms.parse_json]
type = "remap"
inputs = ["docker"]
source = '''
  . = parse_json!(.message) ?? .
  .service = .container_name
'''

[sinks.betterstack]
type = "http"
inputs = ["parse_json"]
uri = "https://in.logs.betterstack.com"
encoding.codec = "json"
method = "post"
request.headers.Authorization = "Bearer ${BETTERSTACK_TOKEN}"
```

If `BETTERSTACK_TOKEN` is empty → vector sends nowhere → logs remain in stdout only (safe fallback for local dev).

---

## 9. CI/CD Minimum Viable

### 9.1 Comparison

| Approach | Setup time | Safety | Zero-downtime |
|----------|-----------|--------|---------------|
| **GitHub Actions → SSH** | ~2 hours | HIGH — explicit steps, health gate | Yes (healthcheck-gated) |
| Watchtower auto-pull | ~30 min | MEDIUM — pulls on image push, no gate | Limited |
| GitHub Actions + Watchtower | ~1 hour | MEDIUM | Yes |

**Verdict: GitHub Actions → SSH deploy.** More explicit control, health-gate before switch, zero external dependencies beyond GitHub.

[CITED: docs.servicestack.net/ssh-docker-compose-deploment]
[CITED: medium.com/@avash700/ci-cd-made-easy-github-actions-docker-compose-and-watchtower]

**Watchtower** is simpler but has a key risk: it pulls and restarts without checking if the new image is healthy. For a personal project this is acceptable, but the SSH approach takes only a few hours to set up and gives explicit health gates.

**`.github/workflows/deploy.yml`:**
```yaml
name: Deploy to VPS

on:
  push:
    branches: [master]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push API/Bot/Worker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/budget-app:latest
            ghcr.io/${{ github.repository_owner }}/budget-app:${{ github.sha }}

      - name: Build and push Frontend image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.frontend
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/budget-frontend:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/budget
            # Pull new images
            docker compose pull api bot worker frontend
            # Restart with new images (rolling — db and caddy untouched)
            docker compose up -d --no-deps api bot worker frontend
            # Health gate: wait for api to pass healthcheck
            for i in $(seq 1 30); do
              STATUS=$(docker inspect budget-api-1 --format='{{.State.Health.Status}}' 2>/dev/null)
              if [[ "$STATUS" == "healthy" ]]; then
                echo "Deploy succeeded: api is healthy"
                exit 0
              fi
              echo "Waiting for health ($i/30)..."
              sleep 5
            done
            echo "FAIL: api did not become healthy after deploy"
            docker compose logs api --tail 50
            exit 1
```

**GitHub repository secrets to set:**
- `VPS_HOST` — VPS IP or hostname
- `VPS_USER` — SSH user (e.g., `deploy`)
- `VPS_SSH_KEY` — private SSH key (the VPS has the public key in `authorized_keys`)

---

## 10. Secrets Management

### 10.1 Current vs. Recommended

| Scenario | Recommendation |
|----------|---------------|
| .env on VPS, not in git, single person | **Keep .env — no change needed** |
| Adding AI API keys to same .env | Still safe if .env not committed |
| .env needs to be in git (reproducible deploys) | **SOPS + age** |
| Shared with second person | SOPS + age, share public key |

**Verdict: Keep `.env` for now.** Adding AI API keys to an existing `.env` that is gitignored is the correct approach — no ceremony required. SOPS adds value when:
1. The encrypted secrets file needs to live in git, OR
2. Multiple people need access to secrets

[CITED: blog.cmmx.de/2025/08/27/secure-your-environment-files-with-git-sops-and-age/]
[CITED: getsops.io/docs/]

**If/when SOPS is adopted:**
```bash
# One-time setup
age-keygen -o ~/.age/budget.key         # generate key
export SOPS_AGE_KEY_FILE=~/.age/budget.key

# Encrypt existing .env
sops --encrypt \
     --age $(cat ~/.age/budget.key | grep "public key" | awk '{print $NF}') \
     --input-type dotenv \
     --output-type dotenv \
     .env > .env.enc

# Add to .gitignore: .env (raw)
# Commit: .env.enc

# Decrypt for deploy (in CI/CD or manually on VPS):
sops --decrypt --input-type dotenv --output-type dotenv .env.enc > .env
```

**For GitHub Actions with SOPS:**
- Store the age private key as `SOPS_AGE_KEY` secret in GitHub
- Add decrypt step before SSH deploy: `sops -d .env.enc > .env`

---

## Infrastructure Cost Summary

| Item | Service | Monthly Cost |
|------|---------|-------------|
| VPS (2-4 GB RAM) | Hetzner CX21 or equivalent | ~€4-6 |
| Cloudflare Tunnel | Cloudflare Free | $0 |
| Backup storage (< 10 GB) | Cloudflare R2 | $0 (free tier) |
| Error monitoring | Sentry Cloud free | $0 |
| Uptime monitoring | UptimeRobot free | $0 |
| Cron monitoring | Healthchecks.io free | $0 |
| Log aggregation | BetterStack free | $0 |
| **Total** | | **~€4-6/month** |

Optional additions (if needed):
- Redis for distributed rate limiting: +0 cost (runs in existing Docker budget, ~30 MB RAM)
- GlitchTip self-hosted (if error volume exceeds Sentry free): $0 but +~512 MB RAM → upgrade VPS to 4 GB → +€4/month

---

## RAM Budget (2 GB VPS)

| Container | Est. RAM |
|-----------|---------|
| db (PostgreSQL 16) | ~150 MB |
| api (FastAPI) | ~80 MB |
| bot (aiogram) | ~60 MB |
| worker (APScheduler) | ~60 MB |
| caddy | ~20 MB |
| redis (rate limiting) | ~30 MB |
| vector (log shipper) | ~30 MB |
| OS + docker overhead | ~300 MB |
| **Total** | **~730 MB** |
| Headroom (2 GB server) | **~1.3 GB** |

GlitchTip self-hosted would add ~512 MB → still fits with headroom. Prometheus + Grafana (~400 MB) would leave only ~400 MB headroom — tight.

---

## Environment Availability

| Dependency | Required By | Available (dev machine) | Fallback |
|------------|------------|------------------------|---------|
| Docker 29.x | CI/CD, restore test | Yes (29.2.1) | — |
| age | Backup encryption | Not found on dev machine | Install: `brew install age` or `apt install age` on VPS |
| rclone | R2 upload | Not found on dev machine | Install: `curl https://rclone.org/install.sh \| bash` on VPS |
| Redis 7 | Per-user rate limiting | Not installed (new service) | Docker container |
| GitHub Actions | CI/CD | Cloud — always available | — |

**Missing on VPS (install during backup setup):**
```bash
# On VPS (Debian/Ubuntu):
apt-get install -y age postgresql-client
curl https://rclone.org/install.sh | bash
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sentry Cloud free 5k/month is sufficient for 5-50 users | §4 | If error volume exceeds 5k (bugs), events silently dropped — switch to GlitchTip |
| A2 | R2 10 GB free tier covers backups indefinitely | §2 | If backup set grows past 10 GB (unlikely given gzip+age on < 1 GB DB), cost = $0.15/GB |
| A3 | mholt/caddy-ratelimit is the correct current module name and actively maintained | §7.3 | Verify before building: `xcaddy build --with github.com/mholt/caddy-ratelimit` |
| A4 | slowapi works with async FastAPI and Redis backend as of current version | §7.4 | Check PyPI: `pip show slowapi` — verify latest version supports Redis backend |
| A5 | Prometheus + Grafana overhead is ~400-600 MB on this specific stack | §6 | Could be lower with careful tuning; worth re-evaluating at 4 GB VPS |
| A6 | BetterStack free tier is still 1 GB/month, 3-day retention | §8 | Check current pricing at betterstack.com — free tier terms change |

---

## Sources

### Primary (HIGH confidence)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — 10 GB free tier, zero egress confirmed
- [Cloudflare WAF Rate Limiting Docs](https://developers.cloudflare.com/waf/rate-limiting-rules/) — free tier confirmed Oct 2022
- [Sentry FastAPI Integration](https://docs.sentry.io/platforms/python/integrations/fastapi/) — StarletteIntegration + FastApiIntegration setup
- [aiogram 3 Error Handling](https://docs.aiogram.dev/en/latest/dispatcher/errors.html) — `@router.errors()` decorator
- [mholt/caddy-ratelimit](https://github.com/mholt/caddy-ratelimit) — Caddyfile syntax, zone configuration
- [slowapi GitHub](https://github.com/laurentS/slowapi) — async FastAPI, Redis storage support
- [pgBackRest archived](https://thebuild.com/blog/2026/04/30/after-pgbackrest/) — April 27, 2026, v2.58.0 final release
- [Healthchecks.io](https://healthchecks.io/) — free tier, cron expression support
- [SOPS docs](https://getsops.io/docs/) — age integration, dotenv format

### Secondary (MEDIUM confidence)
- [GlitchTip vs Sentry comparison](https://dev.to/selfhostingsh/glitchtip-vs-sentry-206o) — 512 MB RAM, 4 containers
- [Backblaze vs R2 vs Wasabi comparison](https://onidel.com/blog/cloudflare-r2-vs-backblaze-b2) — pricing table
- [BetterStack log management](https://betterstack.com/log-management) — free tier
- [Hetzner Object Storage pricing](https://www.hetzner.com/storage/object-storage/) — €4.99/month base

### Tertiary (LOW confidence)
- Prometheus + Grafana RAM overhead estimates (~400-600 MB) — based on multiple community reports, not precise measurement on this specific stack
