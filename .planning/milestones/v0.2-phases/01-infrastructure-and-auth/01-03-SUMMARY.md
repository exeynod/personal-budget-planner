---
phase: 01-infrastructure-and-auth
plan: 03
subsystem: infra
tags: [vite, react, typescript, telegram-mini-app, docker, frontend, sdk-react]

# Dependency graph
requires:
  - phase: 01-infrastructure-and-auth/01
    provides: pytest infrastructure (RED stubs) — independent of this plan; same wave
provides:
  - frontend/ Vite+React 18+TypeScript scaffold with @telegram-apps/sdk-react 3.3.9
  - "TG Budget" stub page rendered via App.tsx (validates Caddy SPA-static path in INF-03)
  - Multi-stage Dockerfile.frontend (node:22-alpine builder → scratch dist exporter)
  - Deterministic build: package-lock.json checked in (frozen via npm ci in Docker)
affects: [01-04 (Caddyfile uses dist/), 01-06 (docker-compose builds frontend image), 02-* (Phase 2 starts wiring real UI on this scaffold)]

# Tech tracking
tech-stack:
  added:
    - "vite@8.0.10 (build tool)"
    - "react@^18.3.1 + react-dom@^18.3.1 (UI runtime)"
    - "@telegram-apps/sdk-react@3.3.9 (TG Mini App SDK — deps only, not yet imported)"
    - "@vitejs/plugin-react@^5.2.0 (Vite 8 compat — Rule 3 deviation from plan's ^4.3.4)"
    - "typescript@^5.6.2 (strict mode)"
  patterns:
    - "Multi-stage Docker frontend: node:22-alpine builder → FROM scratch AS dist exporter"
    - "TypeScript project references: tsconfig.json → tsconfig.app.json + tsconfig.node.json"
    - "Vite dev proxy: '/api' → http://localhost:8000 (mirrors Caddy reverse proxy in prod)"

key-files:
  created:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/vite.config.ts
    - frontend/tsconfig.json
    - frontend/tsconfig.app.json
    - frontend/tsconfig.node.json
    - frontend/index.html
    - frontend/src/main.tsx
    - frontend/src/App.tsx
    - frontend/src/vite-env.d.ts
    - frontend/.gitignore
    - Dockerfile.frontend
  modified: []

key-decisions:
  - "Pinned @telegram-apps/sdk-react 3.3.9 and vite 8.0.10 per RESEARCH.md Standard Stack Frontend"
  - "Bumped @vitejs/plugin-react ^4.3.4 → ^5.2.0 (Rule 3): plugin v4 peer rejects Vite 8; v5 declares ^4||^5||^6||^7||^8"
  - "Added tsconfig.app.json (Rule 3): tsconfig.json references it but plan files list omitted it — tsc -b would fail"
  - "Frontend-scoped .gitignore (dist/, node_modules/) — not root-level, to avoid stepping on Plan 04/06 docker scope"
  - "package-lock.json committed: required by Dockerfile.frontend `npm ci` path for deterministic build (mitigates T-frontend-02)"
  - "App.tsx is intentional stub per D-07 (Phase 1 scope limited to verifying Caddy+TLS); real UI begins in Phase 2"

patterns-established:
  - "Frontend deps live in frontend/, never root — Dockerfile.frontend copies frontend/ into /app"
  - "Build artefact extraction via FROM scratch AS dist: docker-compose can `docker buildx bake --target dist` and copy /dist into Caddy volume"
  - "Vite dev proxy mirrors Caddy reverse proxy semantics (/api → api:8000) so dev and prod paths stay symmetric"

requirements-completed: [INF-01, INF-03]

# Metrics
duration: 3m
completed: 2026-05-02
---

# Phase 01 Plan 03: Frontend Scaffold Summary

**Vite 8 + React 18 + TypeScript scaffold with @telegram-apps/sdk-react 3.3.9, "TG Budget" stub page, and multi-stage Dockerfile.frontend (node:22-alpine → dist) — verified end-to-end via local `npm install && npm run build`.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-02T21:06:15Z
- **Completed:** 2026-05-02T21:09:13Z
- **Tasks:** 2 planned + 1 Rule 3 fixup
- **Files created:** 12 (11 in frontend/ + Dockerfile.frontend)
- **Files modified:** 0

## Accomplishments

- Frontend project structure created from scratch: `frontend/` is a self-contained Vite TypeScript project ready for Phase 2 development.
- Stub `App.tsx` renders "TG Budget" — sufficient signal for Plan 04 (Caddyfile) and Plan 06 (docker-compose) to verify TLS termination and SPA fallback (`try_files {path} /index.html`).
- Multi-stage `Dockerfile.frontend` builds with `npm ci --prefer-offline 2>/dev/null || npm install` for deterministic rebuilds in CI/CD; `FROM scratch AS dist` lets docker-compose extract `/dist` into a Caddy volume without shipping the Node toolchain.
- Local smoke test passed: `npm install` resolves cleanly (85 packages, 20s) and `npm run build` produces `dist/index.html` (0.38 kB) + `dist/assets/index-*.js` (140.88 kB, 45.89 kB gzipped) via Vite v8.0.10 in 35ms.

## Task Commits

1. **Task 1: Vite+React+TypeScript scaffold** — `e261b34` (feat)
2. **Task 2: Multi-stage Dockerfile.frontend** — `d51de50` (feat)
3. **Rule 3 fixup: plugin-react Vite 8 compat + lockfile + .gitignore** — `90ec272` (fix)

_(SUMMARY commit will follow this file's creation.)_

## Files Created/Modified

### Created
- `frontend/package.json` — npm manifest: react 18.3, vite 8.0.10, @telegram-apps/sdk-react 3.3.9, @vitejs/plugin-react ^5.2.0, typescript ^5.6.2.
- `frontend/package-lock.json` — generated lockfile (1804 lines), required by Dockerfile.frontend `npm ci` path.
- `frontend/vite.config.ts` — Vite config: `plugins: [react()]`, `build.outDir: 'dist'`, dev server port 5173 with `/api → http://localhost:8000` proxy.
- `frontend/tsconfig.json` — root tsconfig with project references to `tsconfig.app.json` and `tsconfig.node.json`.
- `frontend/tsconfig.app.json` — strict TS config for `src/`: ES2020 target, DOM libs, `react-jsx`, `noUnusedLocals/Parameters`, bundler module resolution.
- `frontend/tsconfig.node.json` — TS config for `vite.config.ts` only (Node-side, ES2022).
- `frontend/index.html` — HTML entrypoint with `<title>TG Budget</title>`, `lang="ru"`, mounts `/src/main.tsx`.
- `frontend/src/main.tsx` — React 18 entry: `createRoot().render(<StrictMode><App/></StrictMode>)`.
- `frontend/src/App.tsx` — stub component: `<h1>TG Budget</h1>` + descriptive paragraph (Phase 1 scope per D-07).
- `frontend/src/vite-env.d.ts` — `/// <reference types="vite/client" />`.
- `frontend/.gitignore` — excludes `dist/`, `node_modules/`, log files, editor noise.
- `Dockerfile.frontend` — two-stage: `node:22-alpine AS builder` (copy package files → `npm ci || npm install` → copy src → `npm run build`) → `FROM scratch AS dist` (`COPY --from=builder /app/dist /dist`).

### Modified
- _None._ (`frontend/package.json` was modified intra-plan during the Rule 3 fixup, but it's a single-plan file; net effect: created.)

## Decisions Made

1. **Vite 8.0.10 + @vitejs/plugin-react ^5.2.0 (smallest viable bump from plan's ^4.3.4):** plan/RESEARCH.md was authored 2026-05-01 against Vite 8; today's `@vitejs/plugin-react@4.x` peer-deps reject Vite 8 (max ^7). Plugin-react v5 series declares `vite ^4||^5||^6||^7||^8` and has minimal peer surface (no required babel deps), so it's the conservative pick.
2. **Added `tsconfig.app.json`** (not in plan's files list, but referenced by plan's own `tsconfig.json` body): without it, `npm run build` (= `tsc -b && vite build`) would fail at the `tsc -b` step. Files-list omission was a plan typo.
3. **Frontend-scoped `.gitignore` instead of root-level:** root `.gitignore` is Plan 04/06's docker concern (will need entries for `.env`, `caddy_data/`, `pgdata/`, etc.). Scoping the new gitignore under `frontend/` avoids cross-plan conflicts in Wave 1 and is a standard pattern (cf. monorepo per-package gitignores).
4. **Committed `package-lock.json`:** required by Dockerfile.frontend's `npm ci` path. Skipping the lockfile would force the Docker build to fall back to `npm install`, which would resolve dependencies non-deterministically — defeats Threat T-frontend-02 (Tampering) mitigation.
5. **App.tsx remains a stub:** explicitly per D-07 ("Phase 1 — только пустая страница «TG Budget»"). Wiring `@telegram-apps/sdk-react` (importing `useLaunchParams`, `useInitData`, etc.) is Phase 2 scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] @vitejs/plugin-react@^4.3.4 incompatible with Vite 8.0.10**
- **Found during:** Post-Task-2 smoke test (`npm install` in `frontend/`)
- **Issue:** `npm install` failed with ERESOLVE — `@vitejs/plugin-react@4.7.0` declares peer `vite ^4||^5||^6||^7`, rejecting `vite@8.0.10`. The plan's pin was based on RESEARCH.md (2026-05-01), but the plugin-react v5 release that supports Vite 8 wasn't reflected in the plan's pinned `^4.3.4`.
- **Fix:** Bumped `devDependencies."@vitejs/plugin-react"` from `^4.3.4` to `^5.2.0`. Verified peer compat (`npm view @vitejs/plugin-react@5.2.0 peerDependencies` → `vite: '^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0'`).
- **Files modified:** `frontend/package.json`
- **Verification:** `npm install` succeeds (85 pkgs, 20s); `npm run build` succeeds (vite v8.0.10 → 14 modules → `dist/index.html` + `dist/assets/index-Bb3CZNbD.js` 140.88 kB / 45.89 kB gz, 35ms).
- **Committed in:** `90ec272`

**2. [Rule 3 — Blocking] Missing `tsconfig.app.json` (referenced by plan's own tsconfig.json)**
- **Found during:** Task 1 (file creation)
- **Issue:** Plan's `<files>` block listed `tsconfig.json` and `tsconfig.node.json`, but the plan's `tsconfig.json` body references both `./tsconfig.node.json` and `./tsconfig.app.json`. Without the latter, `tsc -b` (the first half of `npm run build`) would fail to resolve project reference.
- **Fix:** Created `frontend/tsconfig.app.json` per the plan's `<action>` body (which spelled it out fully — only the `<files>` summary was incomplete).
- **Files modified:** `frontend/tsconfig.app.json` (new)
- **Verification:** `tsc -b` runs clean as part of `npm run build`.
- **Committed in:** `e261b34` (folded into Task 1 since plan's action body included the file content)

**3. [Rule 2 — Missing Critical] `package-lock.json` and `.gitignore` for `frontend/`**
- **Found during:** Post-fix smoke (after #1 above resolved install)
- **Issue:** (a) Without a committed lockfile, the Docker `npm ci` path is unreachable — every Docker build would resolve dependencies fresh, undermining T-frontend-02 (Tampering / supply-chain). (b) Without `.gitignore`, `node_modules/` (12 MB+) and `dist/` would become tracked.
- **Fix:** Committed `frontend/package-lock.json` (1804 lines, generated by `npm install`). Added `frontend/.gitignore` excluding `dist/`, `node_modules/`, log files, editor noise, and `node_modules/.tmp/` (referenced by `tsconfig.{app,node}.json` `tsBuildInfoFile`).
- **Files modified:** `frontend/package-lock.json` (new), `frontend/.gitignore` (new)
- **Verification:** `git status` clean post-commit; `node_modules/` and `dist/` correctly ignored.
- **Committed in:** `90ec272`

---

**Total deviations:** 3 auto-fixed (2 × Rule 3 blocking, 1 × Rule 2 missing critical)
**Impact on plan:** Both Rule 3 fixes were strictly required for the plan to compile (deterministic build was Truth #2 of `must_haves`). Rule 2 (lockfile + gitignore) reinforces the plan's threat-model intent (T-frontend-02 mitigation) without expanding scope. No architectural drift; all changes localized to `frontend/`.

## Issues Encountered

None beyond the deviations above. The plan was self-consistent in intent — only two version/file-list bookkeeping gaps surfaced once `npm install` actually ran (which the plan's `<verify>` step did not do — it only checked file existence and grep patterns). Recommend Phase 2 plans add `npm ci && npm run build` to verify automation.

## Known Stubs

`frontend/src/App.tsx` is an intentional stub per **D-07** in `01-CONTEXT.md`: Phase 1 scope is limited to "пустая страница «TG Budget» (stub для проверки, что Caddy+TLS работают)". The component renders inline-styled HTML only; no `@telegram-apps/sdk-react` hooks, no `/api/v1/*` fetches, no routing. **Resolved by:** Phase 2 plans (real UI + onboarding flow per sketch winners 001-B / 006-B).

`@telegram-apps/sdk-react@3.3.9` is declared as a dependency but **not yet imported** anywhere in `src/`. This is by design (D-07 — Phase 1 only verifies the build pipeline; SDK wiring is Phase 2). The dep is pinned in advance so Phase 2 doesn't need a `package.json` migration.

## User Setup Required

None — frontend scaffold has no external services. The full stack will require user-supplied `BOT_TOKEN`, `OWNER_TG_ID`, `PUBLIC_DOMAIN`, etc. (see Plan 04/05/06), but those are unrelated to this plan's deliverables.

## Next Phase Readiness

**Wave 1 status (this plan):** complete. Plan 04 (Caddyfile) can now reference `frontend/dist/` as the SPA static root. Plan 06 (docker-compose) can build the frontend image via `docker compose build frontend` (multi-stage target `dist`).

**For Phase 2:**
- The scaffold is React 18 + Vite 8 — `useEffect`, `useState`, `Suspense`, and Concurrent Mode all available.
- `@telegram-apps/sdk-react@3.3.9` is pre-installed; first import will likely be `useLaunchParams()` or `useInitData()` in `App.tsx` to read TG context.
- TypeScript strict mode is on (`noUnusedLocals`, `noUnusedParameters`) — Phase 2 code must be clean from day one.
- Vite dev proxy `/api → http://localhost:8000` matches the planned Caddy reverse-proxy semantics, so dev and prod fetch URLs stay identical (`fetch('/api/v1/...')`).

**Threat-model reminder for Phase 2:** T-frontend-01 (Info Disclosure) becomes active once real data flows through the SPA. Ensure no secrets are bundled into the static assets (Vite inlines `import.meta.env.VITE_*` literals — never put `BOT_TOKEN` or `INTERNAL_TOKEN` behind a `VITE_` prefix).

## Self-Check: PASSED

**Files (13/13 found):**
- `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts`
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`
- `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/vite-env.d.ts`
- `frontend/.gitignore`, `Dockerfile.frontend`
- `.planning/phases/01-infrastructure-and-auth/01-03-SUMMARY.md`

**Commits (3/3 in git log):**
- `e261b34` (Task 1)
- `d51de50` (Task 2)
- `90ec272` (Rule 3 fixup)

**Scope checks:**
- Plan 02 territory (`pyproject.toml`, `app/`, `tests/`) — not modified.
- `.planning/STATE.md`, `.planning/ROADMAP.md` — not modified.

**Smoke test (manual, executed during plan):**
- `npm install` in `frontend/` → 85 packages, 20s, exit 0.
- `npm run build` in `frontend/` → vite v8.0.10, 14 modules, `dist/index.html` (0.38 kB) + `dist/assets/index-*.js` (140.88 kB / 45.89 kB gz), exit 0.

---
*Phase: 01-infrastructure-and-auth*
*Plan: 03*
*Completed: 2026-05-02*
