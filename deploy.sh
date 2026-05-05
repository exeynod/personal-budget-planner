#!/usr/bin/env bash
# VPS-side deploy script for personal-budget-planner.
#
# Invoked over SSH by .github/workflows/deploy.yml — the github-deploy key in
# ~/.ssh/authorized_keys is force-commanded to this script (`command="..."`),
# so the SSH session can run nothing else regardless of what CI sends.
#
# Sequence:
#   1. fetch + reset hard to origin/master (no merge conflicts on dirty tree)
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

log "fetching origin/master"
git fetch --quiet origin master
git reset --hard origin/master
SHA=$(git rev-parse --short HEAD)
log "now at $SHA: $(git log -1 --format=%s)"

log "building images (api, bot, worker)"
"${COMPOSE[@]}" build api bot worker

log "rolling restart"
"${COMPOSE[@]}" up -d api bot worker

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
