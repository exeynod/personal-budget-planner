#!/usr/bin/env bash
# All deploy logic lives here so it updates atomically with each git reset
# inside deploy.sh (the wrapper). Never call this script directly via SSH —
# the wrapper is the SSH force-command target. Calling this directly is
# fine for ad-hoc local re-deploys when stdin isn't being piped.
#
# Sequence:
#   1. consume optional .env payload from stdin (CI pipes it in)
#   2. build api/bot/worker images
#   3. up -d to recreate them
#   4. wait until api healthcheck reports `healthy` (alembic migrations run
#      in entrypoint.sh, can take a few seconds)
#   5. smoke-test public endpoints — fail deploy if Caddy 403 / SPA / 500 wrong
#
# Failures bubble out (set -e); CI workflow surfaces them.
set -euo pipefail

REPO=/home/exy/personal-budget-planner
COMPOSE=(docker compose -f "$REPO/docker-compose.yml" -f "$REPO/docker-compose.cloudflare.yml")
LOG_PREFIX="[deploy $(date -u +%FT%TZ)]"

log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX FATAL: $*" >&2; exit 1; }

cd "$REPO"

# .env rotation — optional stdin payload from CI. When CI assembles a fresh
# .env from GitHub Secrets it pipes it into the deploy wrapper via SSH
# stdin and the wrapper's `exec` hands stdin to us untouched. We write the
# new file atomically *before* the build/up steps so docker compose
# interpolation (DATABASE_URL, OPENAI_API_KEY, …) sees the new values.
# Empty / TTY stdin keeps the existing .env untouched, which is what manual
# `workflow_dispatch` re-deploys and direct `ssh ... deploy` invocations
# from the operator want.
if [ ! -t 0 ]; then
    ENV_PAYLOAD=$(cat || true)
    if [ -n "${ENV_PAYLOAD:-}" ]; then
        TS=$(date -u +%FT%H%M%SZ)
        if [ -f .env ]; then
            cp -p .env ".env.old.$TS"
            log "archived current .env → .env.old.$TS"
        fi
        umask 077
        printf '%s\n' "$ENV_PAYLOAD" > .env.new
        mv .env.new .env
        log "wrote new .env from CI payload ($(wc -l < .env) lines)"

        # Keep only the 5 most recent .env.old.* archives so the working
        # tree doesn't accumulate years of rotated secrets on every deploy.
        ls -1t .env.old.* 2>/dev/null | tail -n +6 | xargs -r rm --
    fi
fi

SHA=$(git rev-parse --short HEAD)
log "now at $SHA: $(git log -1 --format=%s)"

log "building images (api, bot, worker, frontend)"
"${COMPOSE[@]}" build api bot worker frontend

log "rolling restart"
"${COMPOSE[@]}" up -d api bot worker

# Frontend is a one-shot exporter that copies built SPA assets into the
# `frontend_dist` named volume; caddy serves that volume read-only. Without
# this step, every deploy rebuilt the api image but left the SPA stuck on
# whatever was in the volume from the very first `compose up` (incident
# 2026-05-08: users saw the old UI for days). `run --rm` blocks until the
# copy completes, so smoke tests below see the fresh assets. `--no-deps`
# avoids restarting db.
log "refreshing SPA assets in frontend_dist volume"
"${COMPOSE[@]}" run --rm --no-deps frontend

log "waiting for api health (max 90s)"
for i in $(seq 1 45); do
    state=$(docker inspect personal-budget-planner-api-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
    if [ "$state" = "healthy" ]; then
        log "api healthy after ${i}×2s"
        break
    fi
    if [ "$i" -eq 45 ]; then
        log "api last 30 log lines:"
        "${COMPOSE[@]}" logs --tail 30 api >&2
        die "api never reached healthy state"
    fi
    sleep 2
done

log "smoke tests via Caddy on 127.0.0.1:8087"
check() {
    local path="$1" expected="$2"
    local actual
    actual=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8087$path")
    if [ "$actual" != "$expected" ]; then
        die "$path expected $expected, got $actual"
    fi
    log "  $path → $actual ✓"
}
check / 200
check /api/v1/internal/health 403   # blocked by Caddy handle{}
check /api/v1/me 403                # FastAPI rejects no initData

log "deploy of $SHA done"
