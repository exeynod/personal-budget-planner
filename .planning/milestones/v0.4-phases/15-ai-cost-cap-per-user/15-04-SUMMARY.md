---
phase: 15-ai-cost-cap-per-user
plan: "04"
subsystem: admin-api
tags: [admin, spend-cap, pydantic, fastapi, aicap]
dependency_graph:
  requires: [15-02]
  provides: [PATCH /admin/users/{id}/cap, CapUpdate schema, update_user_cap service]
  affects: [app/api/schemas/admin.py, app/services/admin_users.py, app/api/routes/admin.py]
tech_stack:
  added: []
  patterns: [owner-only admin endpoint, Pydantic Field bounds + extra=forbid, ORM flush+refresh, cache invalidation after write]
key_files:
  created: []
  modified:
    - app/api/schemas/admin.py
    - app/services/admin_users.py
    - app/api/routes/admin.py
decisions:
  - "CapUpdate.ge=0 allows cap=0 (AI-off semantics); le=100_000_00 sanity cap"
  - "self-edit allowed — no separate /me/cap; admin endpoint handles both owner and member"
  - "update_user_cap invalidates spend cache immediately after DB flush so next enforce_spending_cap request sees new limit without waiting for 60s TTL"
metrics:
  duration: ~8m
  completed: "2026-05-07"
  tasks_completed: 2
  files_modified: 3
---

# Phase 15 Plan 04: Admin PATCH Cap Endpoint Summary

PATCH /admin/users/{user_id}/cap endpoint with CapUpdate Pydantic schema, update_user_cap service, and AdminUserResponse.spending_cap_cents extension.

## What Was Built

- `CapUpdate` Pydantic schema: `spending_cap_cents: int = Field(..., ge=0, le=100_000_00)`, `extra="forbid"` (AICAP-04)
- `AdminUserResponse.spending_cap_cents: int = 0` — existing list/invite/cap endpoints now expose current cap value
- `update_user_cap(db, *, user_id, spending_cap_cents)` service: lookup AppUser, set field, flush, refresh, invalidate_user_spend_cache, structured audit log
- `PATCH /api/v1/admin/users/{user_id}/cap` route handler under `Depends(require_owner)`: 403 member, 404 unknown user_id, 422 negative/missing cap, 200 updated AdminUserResponse

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Schema + service | ec134cd |
| 2 | Route handler | e08c979 |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- app/api/schemas/admin.py: AdminUserResponse.spending_cap_cents present, CapUpdate class present
- app/services/admin_users.py: update_user_cap defined, calls invalidate_user_spend_cache
- app/api/routes/admin.py: patch_admin_user_cap handler, CapUpdate imported, audit.cap_patched log
- Commits ec134cd and e08c979 exist in git log

## Known Stubs

None — all fields wire to DB column app_user.spending_cap_cents (set by update_user_cap service).

## Threat Flags

None — all new surface covered by plan's threat model (T-15-04-01 through T-15-04-06).
