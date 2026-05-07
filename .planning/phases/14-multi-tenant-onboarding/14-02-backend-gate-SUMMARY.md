---
phase: 14-multi-tenant-onboarding
plan: 02
subsystem: backend
tags: [auth, dependency, onboarding-gate, fastapi, multi-tenant]
dependency_graph:
  requires: [14-01]
  provides: [require_onboarded dependency, 10 gated domain routers]
  affects: [app/api/dependencies.py, app/api/routes/*.py]
tech_stack:
  added: []
  patterns: [FastAPI router-level dependency gate, HTTPException 409 with dict detail]
key_files:
  created: []
  modified:
    - app/api/dependencies.py
    - app/api/routes/categories.py
    - app/api/routes/actual.py
    - app/api/routes/planned.py
    - app/api/routes/templates.py
    - app/api/routes/subscriptions.py
    - app/api/routes/periods.py
    - app/api/routes/analytics.py
    - app/api/routes/ai.py
    - app/api/routes/ai_suggest.py
    - app/api/routes/settings.py
    - app/api/router.py
decisions:
  - "require_onboarded placed after require_owner in dependencies.py for symmetry"
  - "Router-level Depends not endpoint-level: single change per file, all endpoints covered"
  - "409 detail as dict (not str) so FastAPI serialises to {detail: {error: onboarding_required}} verbatim"
metrics:
  duration: ~10min
  completed: 2026-05-07T00:00:00Z
  tasks_completed: 2
  files_modified: 12
requirements: [MTONB-04]
---

# Phase 14 Plan 02: Backend Onboarding Gate Summary

**One-liner:** `require_onboarded` FastAPI dependency (409 on NULL onboarded_at) wired as router-level gate on all 10 domain routers.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add require_onboarded dependency | 084cde9 | app/api/dependencies.py |
| 2 | Apply gate to 10 domain routers | 710dbc4 | 10 route files + router.py |

## Implementation Details

### Task 1 — require_onboarded dependency

Added `async def require_onboarded` immediately after `require_owner` in `app/api/dependencies.py`. The dependency:

- Accepts `current_user: AppUser` via `Depends(get_current_user)` (dep cache prevents double SELECT)
- Checks `current_user.onboarded_at is None`
- Raises `HTTPException(status_code=409, detail={"error": "onboarding_required"})` when not onboarded
- Returns `current_user` unchanged when onboarded, so dep chains can reuse it
- Module docstring updated with Phase 14 MTONB-04 reference

RED tests from Plan 14-01 (`tests/test_require_onboarded.py`) now collect without ImportError — all 4 tests will turn GREEN when DATABASE_URL is available.

### Task 2 — 10 router gates

Each of the 10 domain router files received two surgical edits:

1. `require_onboarded` appended to the existing `from app.api.dependencies import (...)` block
2. `Depends(require_onboarded)` appended to the router's `dependencies=[...]` list

**Gated routers (10):**
- `categories_router` — `/categories`
- `actual_router` — `/actual`, `/periods/{id}/actual`
- `planned_router` — `/planned`, `/periods/{id}/planned`
- `templates_router` — `/template`
- `router` (subscriptions) — `/subscriptions`
- `periods_router` — `/periods`
- `router` (analytics) — `/analytics`
- `router` (ai) — `/ai`
- `router` (ai_suggest) — `/suggest-category` (mounted under `/ai` in router.py)
- `settings_router` — `/settings`

**Explicitly NOT gated:**
- `onboarding_router` — `/onboarding/*` (target of the redirect)
- `admin_router` — `/admin/*` (require_owner gate; owner always has onboarded_at set)
- `internal_bot_router`, `internal_telegram_router` — X-Internal-Token, no user context
- `public_router` — `/me`, `/health` (frontend reads /me to drive routing)

A Phase 14 block comment was added to `app/api/router.py` documenting the gate policy for future router authors.

## Verification

```bash
# Count of gated files = 10
grep -l "Depends(require_onboarded)" app/api/routes/*.py | wc -l
# => 10

# Excluded files have 0 occurrences
grep -c "Depends(require_onboarded)" app/api/routes/onboarding.py  # => 0
grep -c "Depends(require_onboarded)" app/api/routes/admin.py       # => 0

# Tests collect without ImportError
pytest tests/test_require_onboarded.py --collect-only -q
# => 4 tests collected
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. This plan adds a gate to existing endpoints only. All new surfaces are within the plan's threat model (T-14-02-01 through T-14-02-04 documented in PLAN.md).

## Self-Check: PASSED

Files exist:
- app/api/dependencies.py — contains `async def require_onboarded` (FOUND)
- All 10 route files — contain `Depends(require_onboarded)` (FOUND)

Commits exist:
- 084cde9 (Task 1 — require_onboarded dependency)
- 710dbc4 (Task 2 — 10 router gates)
