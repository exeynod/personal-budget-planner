---
phase: 15-ai-cost-cap-per-user
plan: 05
subsystem: api
tags: [fastapi, pydantic, sqlalchemy, spend_cap, me_endpoint]

# Dependency graph
requires:
  - phase: 15-02
    provides: get_user_spend_cents service with 60s TTL cache
provides:
  - GET /api/v1/me returns ai_spend_cents (current MSK month spend in USD-cents)
  - GET /api/v1/me returns ai_spending_cap_cents (raw cap from app_user)
affects: [15-06-frontend-settings, frontend MeResponse type consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inject get_db into /me handler to read spend via TTL-cached service (60s)"
    - "MeResponse extended with spend + cap fields — frontend gets both in one request"

key-files:
  created: []
  modified:
    - app/api/router.py

key-decisions:
  - "ai_spending_cap_cents also added to MeResponse (D-15-04) so frontend SettingsScreen gets spend+cap in one request"
  - "get_user_spend_cents called with current_user.id — always shows own spend, isolation guaranteed"
  - "spending_cap_cents or 0 fallback handles NULL guard even though server_default=46500 prevents NULLs"

patterns-established:
  - "spend_cap_svc injected into /me handler via get_db dependency — same pattern as other service calls"

requirements-completed: [AICAP-04]

# Metrics
duration: 8min
completed: 2026-05-07
---

# Phase 15 Plan 05: ME AI Spend Summary

**GET /me extended with ai_spend_cents and ai_spending_cap_cents fields, wired to 60s-TTL spend_cap service — 4 RED integration tests now GREEN**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-07T11:44:00Z
- **Completed:** 2026-05-07T11:52:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Extended `MeResponse` Pydantic model with `ai_spend_cents: int` and `ai_spending_cap_cents: int`
- Added `get_db` + `AsyncSession` injection into `/me` handler
- Wired `await get_user_spend_cents(db, user_id=current_user.id)` call in `get_me`
- 4 integration tests in `tests/test_me_ai_spend.py` now GREEN
- `tests/test_me_returns_role.py` (2 existing tests) unaffected — no regressions

## Task Commits

1. **Task 1: Extend MeResponse + /me handler** - `ef26214` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/api/router.py` — MeResponse extended with 2 new fields; get_me handler gets db dependency and calls spend service

## Decisions Made

- Added `ai_spending_cap_cents` to MeResponse in addition to `ai_spend_cents` (D-15-04 context: frontend SettingsScreen needs both to render `$X.XX / $Y.YY` without extra request)
- Used `int(current_user.spending_cap_cents or 0)` for NULL-safety despite server_default=46500

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Tests required real DB (integration tests with docker-compose), rebuilt api container and ran inside container. All 6 tests passed on first run.

## Known Stubs

None.

## Threat Flags

No new threat surface. /me reads `current_user.id` — isolation guaranteed. T-15-05-02 (performance) mitigated by 60s TTL cache already in `get_user_spend_cents`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend contract ready: `ai_spend_cents` and `ai_spending_cap_cents` available in /me response
- Plan 15-06 (frontend Settings UI) can now read both fields from existing /me call
- No additional backend work needed for AICAP-04 frontend integration

---
*Phase: 15-ai-cost-cap-per-user*
*Completed: 2026-05-07*
