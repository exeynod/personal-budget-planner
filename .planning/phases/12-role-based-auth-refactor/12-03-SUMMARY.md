---
phase: 12-role-based-auth-refactor
plan: 03
subsystem: auth
tags: [fastapi, pydantic, role-based-auth, frontend-types, typescript, testing]

# Dependency graph
requires:
  - phase: 12-01
    provides: RED tests for ROLE-05 (test_me_returns_role.py)
  - phase: 12-02
    provides: get_current_user returning AppUser ORM (applied here as deviation)
provides:
  - "GET /api/v1/me returns role field (ROLE-05)"
  - "MeResponse pydantic model with role: Literal['owner','member','revoked']"
  - "Frontend MeResponse interface + UserRole type"
  - "get_current_user role-based auth (AppUser ORM, revoked/unknown → 403)"
  - "require_owner dependency for admin-only endpoints"
affects: [12-04, 12-05, 12-06, 13-admin-ui, 14-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "get_current_user returns AppUser ORM (not dict) — downstream reads .role, .tg_user_id"
    - "_dev_mode_resolve_owner isolated helper — OWNER_TG_ID only in dev path"
    - "require_owner Depends chain for admin-only endpoint protection"

key-files:
  created: []
  modified:
    - app/api/router.py
    - app/api/dependencies.py
    - app/api/routes/settings.py
    - app/api/routes/onboarding.py
    - frontend/src/api/types.ts
    - tests/test_auth.py
    - tests/test_role_based_auth.py

key-decisions:
  - "Applied Plan 12-02 auth dep changes in this worktree (deviation Rule 3) to enable test_me_returns_role tests to pass"
  - "Isolated OWNER_TG_ID in _dev_mode_resolve_owner helper — not in get_current_user production path"
  - "Refined test_owner_tg_id_eq to use AST and check only get_current_user function body"
  - "Updated test_auth.py db_client to seed owner AppUser (no upsert in /me handler)"
  - "test_owner_whitelist_foreign moved to real DB (Phase 12 get_current_user requires DB lookup)"

requirements-completed: [ROLE-05]

# Metrics
duration: 45min
completed: 2026-05-06
---

# Phase 12 Plan 03: /me Role Field + Auth Dep Refactor Summary

**GET /api/v1/me returns `role` field via AppUser ORM; frontend MeResponse adds `UserRole` type; all 18 auth tests GREEN**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-06T22:00:00Z
- **Completed:** 2026-05-06T22:45:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- MeResponse pydantic model extended with `role: Literal["owner", "member", "revoked"]` (ROLE-05)
- `/me` handler refactored to use AppUser ORM from `get_current_user` — no more D-11 upsert in handler
- Frontend `UserRole` type + `role` field added to `MeResponse` interface; TS compiles clean
- `get_current_user` refactored to role-based auth (AppUser ORM, revokes revoked/unknown users)
- `require_owner` dependency added for future admin-only endpoints (Phase 13)
- All 18 tests GREEN: 2 (test_me_returns_role) + 6 (test_role_based_auth) + 3 (test_require_owner) + 7 (test_auth)

## Task Commits

1. **Task 1: Refactor /me endpoint — MeResponse.role + AppUser ORM** - `1c872a9` (feat)
2. **Task 2: Frontend types UserRole + MeResponse.role** - `4f685d3` (feat)
3. **Task 3: Auth dep refactor + test fixes → 18 tests GREEN** - `ee1a548` (feat)

## Files Created/Modified

- `app/api/router.py` — MeResponse.role field; get_me uses AppUser ORM; removed upsert + unused imports
- `app/api/dependencies.py` — get_current_user returns AppUser ORM; role-based auth; require_owner added
- `app/api/routes/settings.py` — current_user dict access → .tg_user_id; AppUser type annotation
- `app/api/routes/onboarding.py` — current_user dict access → .tg_user_id; AppUser type annotation
- `frontend/src/api/types.ts` — UserRole type + role field in MeResponse
- `tests/test_auth.py` — seed owner AppUser in db_client; test_owner_whitelist_foreign uses real DB
- `tests/test_role_based_auth.py` — refine test_owner_tg_id_eq to use ast.parse on function body only

## Decisions Made

- Applied Plan 12-02's auth dep changes here (deviation Rule 3) since Plan 12-03's Task 3 test suite requires `get_current_user` to return AppUser ORM for member role test to pass
- Isolated `OWNER_TG_ID` usage in private `_dev_mode_resolve_owner` helper so `get_current_user` production path contains no OWNER_TG_ID equality check
- Refined `test_owner_tg_id_eq_no_longer_in_get_current_user` to use AST (check only `get_current_user` body) per Plan 12-02's own executor guidance — allows `_dev_mode_resolve_owner` helper to hold OWNER_TG_ID reference
- `test_owner_whitelist_foreign` moved from stub-db (`async_client`) to real-db (`db_client`) since new `get_current_user` requires DB lookup even for 403 responses

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied Plan 12-02 auth dep changes to unblock Task 3 tests**
- **Found during:** Task 3 (pytest run for test_me_returns_role.py)
- **Issue:** `test_me_includes_role_for_member` requires `get_current_user` to allow member users (not just OWNER_TG_ID). Current code rejects non-owner → 403. Tests cannot pass without Plan 12-02's auth dep refactor.
- **Fix:** Implemented full Plan 12-02 changes: `get_current_user` → AppUser ORM, role-based whitelist, `require_owner` dep, `get_current_user_id` via ORM, updated callers (settings.py, onboarding.py)
- **Files modified:** app/api/dependencies.py, app/api/routes/settings.py, app/api/routes/onboarding.py
- **Verification:** 18 tests pass (all from test_me_returns_role, test_role_based_auth, test_require_owner, test_auth)
- **Committed in:** ee1a548

**2. [Rule 1 - Bug] Fixed test_owner_tg_id_eq_no_longer_in_get_current_user false failure**
- **Found during:** Task 3 (pytest run)
- **Issue:** Test scanned WHOLE FILE for `settings.OWNER_TG_ID`. The `_dev_mode_resolve_owner` helper contains `tg_user_id = settings.OWNER_TG_ID` — legitimate dev-mode code — causing test to fail
- **Fix:** Updated test to use `ast.parse` and check only the `get_current_user` function body for `== settings.OWNER_TG_ID` / `!= settings.OWNER_TG_ID` equality checks. This is the AST-based approach recommended in Plan 12-02's own executor guidance.
- **Files modified:** tests/test_role_based_auth.py
- **Committed in:** ee1a548

**3. [Rule 1 - Bug] Fixed test_auth.py db_client fixture and test_owner_whitelist_foreign**
- **Found during:** Task 3 (pytest run)
- **Issue:** (a) `test_owner_whitelist_valid` fails with 403 because db_client truncates but doesn't seed owner AppUser — new code requires pre-existing AppUser. (b) `test_owner_whitelist_foreign` uses stub db but new `get_current_user` needs real DB → AttributeError on None session.
- **Fix:** (a) Added owner AppUser seed after TRUNCATE in db_client. (b) Changed `test_owner_whitelist_foreign` to use `db_client` (real DB, truncated — 999999 not seeded → 403). Also added AI tables to TRUNCATE list.
- **Files modified:** tests/test_auth.py
- **Committed in:** ee1a548

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All fixes necessary for correctness and test completeness. Plan 12-02 changes applied here ensure tests pass; orchestrator will need to handle merge when Plan 12-02's separate worktree is also merged.

## Issues Encountered

- Container running with `DEV_MODE=true` prevented direct pytest runs without explicit env override; tests run correctly with `DEV_MODE=false` forced in environment
- Tests executed inside running docker API container (copied files) since local test infrastructure lacked DB access

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced beyond what the plan specified. The `require_owner` dependency is wired correctly to reject members (403) — admin endpoints using it in Phase 13 will be safe by default.

## Next Phase Readiness

- ROLE-05 satisfied: `/me` returns `role` field
- `require_owner` exported and ready for Phase 13 admin endpoints
- Frontend `UserRole` type ready for Phase 13 admin tab visibility logic
- Plans 12-04 through 12-07 can proceed with role-based auth in place

## Self-Check: PASSED

Files exist:
- app/api/router.py: FOUND (modified)
- frontend/src/api/types.ts: FOUND (modified)
- app/api/dependencies.py: FOUND (modified)

Commits exist:
- 1c872a9: FOUND (feat(12-03): refactor /me endpoint)
- 4f685d3: FOUND (feat(12-03): add UserRole type)
- ee1a548: FOUND (feat(12-03): auth dep refactor + test fixes)

---
*Phase: 12-role-based-auth-refactor*
*Completed: 2026-05-06*
