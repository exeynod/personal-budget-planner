# deploy/

Infrastructure & deployment files for TG Budget Planner. All Docker, Caddy,
and VPS-deploy artefacts live here; application source stays in the repo root
(`app/`, `main_*.py`, `frontend/`, …).

## What's here

| File                            | Purpose                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`            | Production base stack (db, api, bot, worker, caddy, frontend init-container).                                                                                                            |
| `docker-compose.dev.yml`        | Dev overrides (DEV_MODE=true, api published on :8000, console logs).                                                                                                                     |
| `docker-compose.test.yml`       | Integration-test override (bind-mounts `tests/`, fake OpenAI key).                                                                                                                       |
| `docker-compose.cloudflare.yml` | Cloudflare Tunnel production override (HTTP-only Caddy + `cloudflared`).                                                                                                                 |
| `Dockerfile`                    | Single image for api/bot/worker (selected via `SERVICE` build-arg). Build context = repo root.                                                                                           |
| `Dockerfile.frontend`           | Builds the SPA and exports `dist/` into the `frontend_dist` volume. Build context = repo root.                                                                                           |
| `Caddyfile`                     | Production TLS reverse proxy + SPA static (Let's Encrypt).                                                                                                                               |
| `Caddyfile.dev`                 | HTTP-only Caddy for local dev (no public DNS / cert).                                                                                                                                    |
| `Caddyfile.cloudflare`          | HTTP-only Caddy behind Cloudflare Tunnel.                                                                                                                                                |
| `entrypoint.sh`                 | api container entrypoint: `alembic upgrade head` (admin role) → uvicorn.                                                                                                                 |
| `deploy.sh`                     | VPS-side SSH force-command wrapper: `git reset --hard origin/master` → `deploy_inner.sh`.                                                                                                |
| `deploy_inner.sh`               | Actual deploy logic: **pre-migration DB backup** (`pg_dump` → `backups/*.sql.gz`, hard-gate), build images, `up -d` (entrypoint runs migrations), refresh SPA, health-wait, smoke tests. |
| `cloudflared-config.yml`        | cloudflared ingress (routes the tunnel to `caddy:80`).                                                                                                                                   |

## Path conventions

Compose files reference the repo root as their build context (`context: ..`)
and point `dockerfile:` at `deploy/Dockerfile` / `deploy/Dockerfile.frontend`.
Always invoke compose with the `deploy/` prefix from the repo root, e.g.:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml up -d
```

The `Makefile` targets (`make up`, `make down`, `make test-backend`, …) and
`scripts/run-integration-tests.sh` already do this for you.

## How to bring it up

See [`../docs/RUNBOOK.md`](../docs/RUNBOOK.md) for local dev scenarios and
[`../docs/DEPLOY.md`](../docs/DEPLOY.md) for the production VPS / Cloudflare
Tunnel setup.
