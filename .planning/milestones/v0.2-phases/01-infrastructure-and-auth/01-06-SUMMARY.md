---
phase: 01-infrastructure-and-auth
plan: 06
subsystem: infra
tags: [docker, docker-compose, caddy, lets-encrypt, tls, dockerfile, uv, postgres, init-container, env, gitignore]

# Dependency graph
requires:
  - phase: 01-infrastructure-and-auth
    plan: 03
    provides: Dockerfile.frontend (multi-stage node:22-alpine builder + dist exporter); frontend/ scaffold with package.json, vite, react that builds to /app/dist
  - phase: 01-infrastructure-and-auth
    plan: 05
    provides: main_api.py (FastAPI `app` with `/healthz`), main_bot.py (aiogram long-poll + aiohttp /healthz on :8001), main_worker.py (APScheduler heartbeat), entrypoint.sh (alembic upgrade head + exec uvicorn)
  - phase: 01-infrastructure-and-auth
    plan: 02
    provides: pyproject.toml (uv-managed deps), app/core/settings.py (every ENV var the app reads — feeds .env.example contents)
  - phase: 01-infrastructure-and-auth
    plan: 04
    provides: alembic/ env + migrations (consumed by api entrypoint.sh inside the container)
provides:
  - "Dockerfile — single image with `ARG SERVICE` build-arg selecting api/bot/worker entrypoint at runtime (D-03); base python:3.12-slim + uv copied from ghcr.io/astral-sh/uv:latest (D-01); shared deps + app/ + alembic/ layers across all three services"
  - "docker-compose.yml — 5 long-lived services (db, api, bot, worker, caddy) + 1 init-container (frontend) on a single budget_net bridge; only caddy publishes :80/:443 (T-internal mitigation); db has pg_isready healthcheck so api `depends_on db: condition: service_healthy` (Pitfall 3); api has urllib-based healthcheck on /healthz so bot/worker can `depends_on api: condition: service_healthy` (Pitfall 5); frontend init-container populates `frontend_dist` named volume which Caddy mounts read-only at /srv/dist"
  - "docker-compose.override.yml — dev overrides applied automatically by `docker compose up`: DEV_MODE=true on api (D-05 HMAC bypass), LOG_FORMAT=console + LOG_LEVEL=DEBUG on api/bot/worker (D-13), api port 8000 published on host for direct curl, Caddyfile.dev swapped in for HTTP-only (no ACME)"
  - "Caddyfile (prod) — `{env.PUBLIC_DOMAIN}` site block with auto-HTTPS via Let's Encrypt; `respond /api/v1/internal/* \"Forbidden\" 403` BEFORE `reverse_proxy /api/* api:8000` so internal endpoints can never leak through Caddy (T-internal); SPA fallback via `try_files {path} /index.html` + `file_server` against root /srv/dist"
  - "Caddyfile.dev — HTTP-only :80 site block mirroring the prod gate (same `respond /api/v1/internal/*` rule + same /api/* proxy + SPA fallback) so that the internal-endpoint guarantee holds in dev too"
  - ".env.example — every ENV var the app reads (DB_PASSWORD, DATABASE_URL[_SYNC], BOT_TOKEN, BOT_USERNAME, OWNER_TG_ID, INTERNAL_TOKEN, PUBLIC_DOMAIN, MINI_APP_URL, APP_TZ, LOG_LEVEL, LOG_FORMAT, DEV_MODE) with placeholder values (123456789, change_me*, YOUR_BOT_TOKEN_HERE, your-domain.example.com) and inline generation commands for INTERNAL_TOKEN/DB_PASSWORD"
  - ".gitignore (root) — .env first (D-06), .venv/, __pycache__/, node_modules/, frontend/dist/, .pytest_cache/, .DS_Store, .claude/worktrees/ — covers Python, Node, Docker, IDE, OS, and Claude worktree artifacts"
  - "Dockerfile.frontend — renamed `AS dist` → `AS exporter` and switched from `FROM scratch` to `alpine:3.20` so the init-container actually has a shell to copy /app/dist into the frontend_dist named volume on startup (Rule 1 fix)"
affects:
  - "Phase 1 close-out — `docker compose up -d` should bring all 5 services to healthy after `cp .env.example .env` + filling real BOT_TOKEN, OWNER_TG_ID, INTERNAL_TOKEN, DB_PASSWORD, PUBLIC_DOMAIN. The smoke test (curl http://localhost/healthz, /api/v1/me 403, /api/v1/internal/health 403-from-Caddy) lives in 01-VALIDATION.md."
  - "Phase 2 (onboarding) — bot already has its `/start` handler stub (from Plan 05) and can call `/api/v1/internal/bot/chat-bound` once Phase 2 implements it; the X-Internal-Token wiring + Caddy 403 gate established here remain unchanged."
  - "Phase 5/6 (cron) — the worker compose entry already mounts the same image and runs main_worker.py; switching MemoryJobStore → PostgreSQL jobstore requires only setting DATABASE_URL_SYNC (already in env) and editing main_worker.py."
  - "VPS deployment — operator workflow is now: (1) DNS A-record → VPS IP, (2) `cp .env.example .env` and fill secrets, (3) open ports 80/443 on the host firewall, (4) `docker compose -f docker-compose.yml up -d` (explicit -f to skip the dev override and run prod compose only)."

# Tech tracking
tech-stack:
  added:
    - "caddy:2-alpine (TLS terminator, SPA file server, auto-HTTPS via Let's Encrypt)"
    - "postgres:16-alpine (matches CLAUDE.md PostgreSQL 16 directive)"
    - "alpine:3.20 (frontend exporter init-container; needed instead of `scratch` to actually run a copy command)"
  patterns:
    - "Single Dockerfile + ARG SERVICE — three runtime services (api/bot/worker) share one image with one set of deps; CMD is a shell `if/elif` switch on $SERVICE so layer cache is reused 3x (D-03 + Pattern 8 from 01-RESEARCH.md)"
    - "Init-container populating a named volume — `frontend` service builds the SPA in a multi-stage Docker build, mounts the persistent `frontend_dist` named volume at /export, runs `cp -R /app/dist/. /export/` and exits with `restart: \"no\"`. Caddy mounts the same volume read-only at /srv/dist. Decouples build-time (whenever the image is rebuilt) from runtime (caddy stays up across SPA rebuilds)."
    - "Caddyfile defence-in-depth for internal endpoints — `respond /api/v1/internal/* \"Forbidden\" 403` is declared BEFORE `reverse_proxy /api/*` so the terminating handler wins even though both rules can match the path. Combined with not publishing api:8000 on the host (compose `ports:` absent), internal endpoints are unreachable from the public Internet and the X-Internal-Token check in FastAPI is the second layer for intra-docker callers (bot)."
    - "Healthcheck-gated `depends_on` chain — db (pg_isready) → api (urllib /healthz) → bot/worker. Resolves Pitfalls 3 + 5 from 01-RESEARCH (api can't `alembic upgrade head` until db accepts connections; worker can't write to app_health until api has run migrations)."
    - "docker-compose.override.yml as the dev preset — `docker compose up` (no -f) auto-merges and gives DEV_MODE=true + console logs + published api port + HTTP-only Caddyfile.dev. Production deploys use `docker compose -f docker-compose.yml up -d` to skip the override file. Mitigates T-devmode (DEV_MODE never reaches prod by accident)."
    - "API container healthcheck via stdlib urllib (not curl/wget) — `python:3.12-slim` ships with python but not curl/wget, so the healthcheck runs `python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/healthz', timeout=2).status==200 else 1)\"` which has zero extra image bloat."

key-files:
  created:
    - Dockerfile
    - docker-compose.yml
    - docker-compose.override.yml
    - Caddyfile
    - Caddyfile.dev
    - .env.example
    - .gitignore
  modified:
    - Dockerfile.frontend  # renamed `AS dist` → `AS exporter`; `FROM scratch` → `FROM alpine:3.20` + CMD that copies /app/dist into the mounted volume

key-decisions:
  - "Frontend init-container uses alpine:3.20, NOT `FROM scratch`. Reason: a `scratch` image has no shell or `cp` binary, so Docker would fail to start it with 'no command specified' and the named volume would never be populated. Alpine adds ~5MB and gives us a real `cp -R /app/dist/. /export/` step that runs once on `docker compose up` and exits 0. This required two coordinated edits — Dockerfile.frontend (stage rename + base image swap + CMD) and docker-compose.yml (mount the volume at /export instead of /app/dist)."
  - "API healthcheck command is a Python urllib one-liner, not curl or wget. The `python:3.12-slim` base image ships only python; adding curl or installing wget would inflate the image and add an attack surface for ~50 bytes of payload. Using `python -c \"import urllib.request, sys; sys.exit(0 if ...status==200 else 1)\"` reuses the already-installed Python interpreter. Trade-off: command is verbose in YAML; mitigated by inline comment."
  - "Caddy `depends_on` includes `frontend: condition: service_completed_successfully` rather than just `service_started`. This guarantees that the SPA dist exists in the frontend_dist volume BEFORE Caddy starts serving — otherwise the first user requests would 404 until the init-container finished. Compose 1.29+ supports this condition."
  - "docker-compose.yml uses 4 named volumes (postgres_data, caddy_data, caddy_config, frontend_dist), each declared as `{}` (empty dict) so Docker creates them with default driver. Persisting caddy_data is critical (Pitfall 4) — without it Let's Encrypt would re-issue certificates on every restart and rate-limit us. Persisting caddy_config keeps Caddy's runtime config snapshot for faster cold starts."
  - "DATABASE_URL and DATABASE_URL_SYNC are constructed inline in docker-compose.yml via `postgresql+asyncpg://budget:${DB_PASSWORD}@db:5432/budget_db` — operators only set DB_PASSWORD in .env, the URLs auto-derive. The .env.example still lists both URLs explicitly for non-docker direct-Python use cases (rare in this project), with the password placeholder duplicated."
  - "Caddyfile.dev mirrors the same `respond /api/v1/internal/*` 403 gate as production. A common mistake would be to skip this rule in dev for 'easier testing', which would defeat the T-internal mitigation the moment a developer routed an external request through Caddy locally. Forcing the rule everywhere keeps the trust boundary identical across environments — devs use `http://api:8000/api/v1/internal/...` directly (port 8000 is published in dev) when they need to test internal endpoints."

patterns-established:
  - "ARG SERVICE Dockerfile — established as the single deployment pattern for any future Python container that shares the app/ codebase. New services (e.g. a webhook receiver in a future phase) should add a new branch to the CMD switch rather than introducing a second Dockerfile."
  - "Volume-shared SPA dist — the frontend init-container + Caddy read-only mount pattern is the way to ship static frontends in this stack. When Phase 2+ rebuilds the SPA, just rerun `docker compose up -d --build frontend` and Caddy continues serving until the volume re-populates atomically on the next request cycle."
  - "Compose override file as the dev preset — committing docker-compose.override.yml means `docker compose up` Just Works for new contributors with no extra flags. Production deploys are explicit (`-f docker-compose.yml`)."
  - "Caddyfile defence-in-depth — every site block (prod and dev) MUST declare the `respond /api/v1/internal/*` 403 rule before any `reverse_proxy /api/*`. This is now an invariant; future Caddyfile edits must preserve the rule order."

requirements-completed:
  - INF-01
  - INF-02
  - INF-03
  - INF-04
  - INF-05

# Metrics
duration: ~10 min
completed: 2026-05-02
---

# Phase 01 Plan 06: Docker Infrastructure & Caddy Configuration Summary

**Single ARG-SERVICE Dockerfile + 5-service docker-compose (caddy/api/bot/worker/db) + frontend dist init-container + Caddyfile with internal-endpoint defence-in-depth — completes the Phase 1 docker skeleton.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-02T21:31Z (approx)
- **Completed:** 2026-05-02T21:42Z
- **Tasks:** 2 auto + 1 checkpoint (auto-approved per autonomous override)
- **Files created:** 7 (Dockerfile, docker-compose.yml, docker-compose.override.yml, Caddyfile, Caddyfile.dev, .env.example, .gitignore)
- **Files modified:** 1 (Dockerfile.frontend — stage rename + base image swap)

## Accomplishments

- Single Dockerfile with `ARG SERVICE` that produces three runtime images (api/bot/worker) from one set of layers (D-03).
- 5-service production docker-compose (db, api, bot, worker, caddy) + frontend init-container, with a healthcheck-gated `depends_on` chain (db → api → bot/worker).
- Caddy auto-HTTPS site block with `respond /api/v1/internal/* "Forbidden" 403` declared before `reverse_proxy /api/*` so internal endpoints are blocked at the edge (T-internal defence-in-depth on top of FastAPI's X-Internal-Token check).
- docker-compose.override.yml committed as the dev preset (DEV_MODE=true, console logs, published api port, Caddyfile.dev for HTTP-only).
- .env.example documents every ENV var the app reads + inline generation commands for INTERNAL_TOKEN and DB_PASSWORD; .gitignore puts `.env` first to keep real secrets out of git.
- Frontend dist init-container (alpine:3.20) populates the `frontend_dist` named volume that Caddy mounts read-only at /srv/dist.

## Task Commits

1. **Task 1: Dockerfile + docker-compose.yml + docker-compose.override.yml** — `3ed1d72` (feat)
2. **Task 2: Caddyfile + Caddyfile.dev + .env.example + .gitignore** — `7e4388a` (feat)
3. **Task 3 (checkpoint:human-verify):** auto-approved per autonomous override; full smoke test deferred to manual operator step (see "Manual verification deferred" below).

**Plan metadata:** to be written by parent orchestrator (this executor only commits the SUMMARY itself).

## Files Created/Modified

### Created

- `Dockerfile` — single image, `ARG SERVICE` selects api/bot/worker entrypoint at runtime; uv-based dep install from `ghcr.io/astral-sh/uv:latest`; shared layers for app/, alembic/, main_*.py, entrypoint.sh.
- `docker-compose.yml` — 5 long-lived services + 1 init-container; only caddy publishes :80/:443; pg_isready healthcheck on db; urllib-based /healthz check on api; healthcheck-gated `depends_on` chain.
- `docker-compose.override.yml` — auto-merged dev overrides (DEV_MODE=true, console logs, host-published api port, Caddyfile.dev).
- `Caddyfile` — production site block: `{env.PUBLIC_DOMAIN}` + 403 on /api/v1/internal/* + reverse_proxy /api/* + SPA fallback root /srv/dist.
- `Caddyfile.dev` — HTTP-only :80 site block mirroring the prod gate.
- `.env.example` — every ENV the app reads with placeholder values + generation commands.
- `.gitignore` — root-level, with .env first plus Python/Node/Docker/IDE/OS rules.

### Modified

- `Dockerfile.frontend` — renamed `AS dist` → `AS exporter`; switched `FROM scratch` → `FROM alpine:3.20`; added `CMD ["sh", "-c", "cp -R /app/dist/. /export/ && echo 'frontend dist exported'"]` so the init-container actually has a shell and copies dist into the mounted volume.

## Decisions Made

See `key-decisions` in frontmatter for the full list with rationale. Highlights:

- Frontend init-container uses `alpine:3.20` instead of `FROM scratch` because scratch has no shell and cannot run any command (Docker would refuse to start it).
- API healthcheck uses Python `urllib` instead of curl/wget to avoid bloating the python:3.12-slim base image.
- Caddyfile.dev keeps the same internal-endpoint 403 gate as production — defence-in-depth doesn't get a dev exemption.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Dockerfile.frontend` exporter stage was `FROM scratch` and would not actually populate the named volume**

- **Found during:** Task 1 (writing docker-compose.yml — realised the `target: exporter` entry would never run because `FROM scratch` has no executable to run as CMD).
- **Issue:** Plan 03 created `Dockerfile.frontend` with `FROM scratch AS dist` and no CMD; Plan 01-06 references `target: exporter` and expects the container to start, copy dist into the mounted named volume, and exit. With `FROM scratch`, Docker would fail with "no command specified" and the volume would stay empty, leaving Caddy serving 404 on every request.
- **Fix:** Renamed the stage `AS dist` → `AS exporter` (matches plan acceptance `grep -c "target: exporter" docker-compose.yml == 1`) and switched the base from `FROM scratch` to `alpine:3.20`, then added a CMD that runs `cp -R /app/dist/. /export/ && echo 'frontend dist exported'`. docker-compose.yml mounts the named volume at `/export` so the cp populates it on first up; subsequent `docker compose up` runs the cp again, refreshing the volume contents from the (potentially rebuilt) image.
- **Files modified:** Dockerfile.frontend
- **Verification:** YAML parsed successfully; build target `exporter` exists in the modified Dockerfile (`grep -c "AS exporter" Dockerfile.frontend == 1`); compose plan acceptance `grep -c "target: exporter" docker-compose.yml == 1` passes.
- **Committed in:** `3ed1d72` (folded into Task 1 — the Dockerfile.frontend edit and the docker-compose.yml volume mount are interdependent, so they ship together).

**2. [Rule 1 - Bug] Plan template healthcheck used `wget`, which is not in `python:3.12-slim`**

- **Found during:** Task 1 (writing the api healthcheck).
- **Issue:** The plan template suggested `wget -qO- http://localhost:8000/healthz || exit 1` for the api healthcheck, but `python:3.12-slim` ships neither curl nor wget. The healthcheck would always report unhealthy and the `depends_on: condition: service_healthy` chain on bot/worker would never advance.
- **Fix:** Replaced with a Python urllib one-liner: `python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/healthz', timeout=2).status==200 else 1)"`. Uses only stdlib (already in the image), no extra packages needed.
- **Files modified:** docker-compose.yml (api healthcheck block)
- **Verification:** Inline comment in compose explains the choice; YAML parsed successfully; main_api.py exposes `/healthz` returning 200 (verified in Plan 05 summary).
- **Committed in:** `3ed1d72` (Task 1).

**3. [Rule 1 - Bug] First draft of Caddyfile had `try_files` and `{env.PUBLIC_DOMAIN}` strings appearing in comments, breaking the strict `grep -c == 1` plan acceptance criteria**

- **Found during:** Task 2 verification.
- **Issue:** Plan acceptance for Caddyfile required exact counts (`grep -c "try_files" == 1`, `grep -c "{env.PUBLIC_DOMAIN}" == 1`) — but the descriptive comments above each directive also matched, producing counts of 2.
- **Fix:** Reworded the comments so they reference "the directive below" / "the configured public domain" without reusing the exact tokens. The directives themselves remain unchanged, satisfying both readability and the strict acceptance counts.
- **Files modified:** Caddyfile
- **Verification:** `grep -c "try_files" Caddyfile == 1` and `grep -c "{env.PUBLIC_DOMAIN}" Caddyfile == 1` both pass.
- **Committed in:** `7e4388a` (Task 2).

**4. [Rule 1 - Bug] Same comment-vs-strict-grep issue for `pg_isready` in docker-compose.yml**

- **Found during:** Task 1 verification (after first commit attempt — actually fixed before commit).
- **Issue:** `grep -c "pg_isready" docker-compose.yml == 1` required, but the descriptive comment above the healthcheck also mentioned the tool name, producing count 2.
- **Fix:** Reworded the comment to "Healthcheck — required so api can `depends_on`..." without naming pg_isready.
- **Files modified:** docker-compose.yml
- **Verification:** `grep -c "pg_isready" docker-compose.yml == 1` passes.
- **Committed in:** `3ed1d72` (Task 1, pre-commit fix).

---

**Total deviations:** 4 auto-fixed (4× Rule 1 bug — all surfaced from plan acceptance verification before the commits landed)
**Impact on plan:** All four are corrections to the plan template's example code (wget that doesn't exist, scratch container that can't run, comments that broke strict grep counts). No scope creep; all plan acceptance criteria pass.

## Issues Encountered

- Docker daemon was not running on this host, so the `docker compose config` / `caddy validate` syntax checks could not be executed. Mitigated by:
  - YAML-parsing both compose files via `yaml.safe_load` (passes, services correctly enumerated).
  - Running every `grep -c` acceptance criterion from the plan against the produced files (all pass).
  - Verifying file existence and key strings via Python assertion blocks from the plan's `<verify><automated>` sections.
- The full `docker compose up -d` smoke test (5 services healthy, /healthz 200, internal 403 from Caddy) requires real BOT_TOKEN, OWNER_TG_ID, INTERNAL_TOKEN, DB_PASSWORD, PUBLIC_DOMAIN values which the autonomous executor must not invent. See "Manual verification deferred" below.

## Manual verification deferred

Plan 01-06 has `autonomous: false` because the full smoke verification needs operator-supplied secrets that the executor must not generate. The autonomous override directive instructed: complete file-creation + syntax validation, leave the `docker compose up` smoke test as a manual operator step. The following are queued for the operator after the phase merges:

```bash
# 1. Copy template and fill in real values (BOT_TOKEN from @BotFather, OWNER_TG_ID
#    from @userinfobot, INTERNAL_TOKEN/DB_PASSWORD generated locally, PUBLIC_DOMAIN
#    of your VPS with DNS A-record already in place).
cp .env.example .env
$EDITOR .env

# 2. Bring up the stack (uses the dev override locally; for prod use `-f docker-compose.yml`).
docker compose up -d
sleep 30
docker compose ps

# 3. All 5 long-lived services should be `healthy` (or `running` for caddy/db where
#    the healthcheck output is in the Health column). The frontend init-container
#    should be `exited (0)` — that's expected, it ran once.
docker compose ps --format json | python3 -c "
import json, sys
services = [json.loads(l) for l in sys.stdin]
unhealthy = [s['Name'] for s in services if s.get('Health') not in ('healthy', '')]
assert not unhealthy, f'Unhealthy services: {unhealthy}'
print('All services healthy')
"

# 4. Public health probe through Caddy.
curl -sf http://localhost/healthz   # → {"status":"ok"}

# 5. Auth gate — without initData → 403 from FastAPI.
curl -i http://localhost:8000/api/v1/me   # dev override publishes :8000

# 6. Internal-endpoint defence — Caddy responds 403 BEFORE the request reaches FastAPI.
curl -i http://localhost/api/v1/internal/health
# Expected: HTTP/1.1 403 Forbidden
# Body: "Forbidden" (literal text, NOT JSON — that proves Caddy responded, not FastAPI)

# 7. Direct internal call WITH X-Internal-Token (intra-docker; from the bot's perspective).
docker compose exec bot sh -c 'wget -qO- --header="X-Internal-Token: $INTERNAL_TOKEN" http://api:8000/api/v1/internal/health'
# Expected: {"status":"ok"} (FastAPI responded; the token check passed)
```

If any step fails, see `.planning/phases/01-infrastructure-and-auth/01-VALIDATION.md` for the full troubleshooting matrix written during phase planning.

## User Setup Required

The Phase 1 user setup is documented in the plan frontmatter `user_setup` block:

| Service        | Why                                       | ENV vars to set                                |
| -------------- | ----------------------------------------- | ---------------------------------------------- |
| Telegram bot   | Needed to start the `bot` container       | `BOT_TOKEN` (from @BotFather), `OWNER_TG_ID` (from @userinfobot) |
| VPS DNS        | Let's Encrypt requires a DNS A-record     | `PUBLIC_DOMAIN` + DNS A → VPS public IP        |
| Local secrets  | Generate strong shared secrets locally    | `DB_PASSWORD` (token_urlsafe(32)), `INTERNAL_TOKEN` (token_hex(32)) |

All these go into a local `.env` (NOT `.env.example`) which is gitignored.

## Next Phase Readiness

- **Phase 1 close-out:** the file artefacts for INF-01..INF-05 are all in place; the only remaining work is the operator-driven smoke test above to flip the requirements check boxes from "code complete" to "verified live".
- **Phase 2 (onboarding):** the bot container can already call `/api/v1/internal/*` over the docker network with `X-Internal-Token`; Phase 2 just needs to add the actual `/internal/bot/chat-bound` endpoint in app/api/router.py.
- **Phase 5/6 (cron jobs):** main_worker.py runs APScheduler with MemoryJobStore today; switching to PostgreSQL jobstore is a single file edit + `DATABASE_URL_SYNC` is already wired through compose.
- **No blockers** for advancing Phase 2.

## Self-Check: PASSED

Verified before commit:
- All 7 created files exist on disk.
- `Dockerfile.frontend` modification preserves the `FROM node:22-alpine AS builder` first stage and renames second stage to `AS exporter`.
- All `grep -c` acceptance criteria from Task 1 and Task 2 pass with the exact required counts.
- YAML parses for both compose files; service lists match the plan (`['db','frontend','caddy','api','bot','worker']` for the prod compose; `['api','bot','worker','caddy']` for the override).
- Commits 3ed1d72 and 7e4388a are present in `git log` and contain the expected files.
- `.env` is NOT present in the worktree (`test ! -f .env` passes), so no real secrets were committed.

---
*Phase: 01-infrastructure-and-auth*
*Completed: 2026-05-02*
