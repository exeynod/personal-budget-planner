---
phase: 15-ai-cost-cap-per-user
plan: 03
subsystem: api
tags: [fastapi, dependency-injection, spending-cap, rate-limit, 429, http-header]

requires:
  - phase: 15-02
    provides: get_user_spend_cents, seconds_until_next_msk_month (spend_cap.py service)

provides:
  - "enforce_spending_cap FastAPI dependency in app/api/dependencies.py"
  - "Router-level spend gate on /ai/* and /ai/suggest-category"
  - "429 + Retry-After response when monthly spend >= cap"
  - "cap=0 semantics: AI fully disabled (spend=0 >= cap=0)"

affects:
  - 15-04 (PATCH /admin/users/{id}/cap must invalidate cache post-update)
  - 15-05 (GET /me surfaces ai_spend_cents; reads from same spend_cap service)

tech-stack:
  added: []
  patterns:
    - "Router-level FastAPI dependency for cross-cutting gate enforcement"
    - "Local import inside dependency to avoid potential cyclic imports"
    - "cap=0 semantics via >= comparison (no special-case branch needed)"

key-files:
  created: []
  modified:
    - app/api/dependencies.py
    - app/api/routes/ai.py
    - app/api/routes/ai_suggest.py

key-decisions:
  - "Local import of spend_cap inside enforce_spending_cap to prevent cyclic import risk"
  - "Router-level dep covers ALL /ai/* endpoints (chat, history, conversation, usage) — history is also an AI feature, off when cap=0"
  - "get_db (not get_db_with_tenant_scope) used inside enforce_spending_cap — _fetch_spend_cents_from_db sets RLS context explicitly via SET LOCAL; avoids double-session complexity"
  - "One test (test_chat_unblocked_after_admin_patches_cap_higher) remains RED until Plan 15-04 ships PATCH /admin/users/{id}/cap"

requirements-completed: [AICAP-02]

duration: 15min
completed: 2026-05-07
---

# Phase 15 Plan 03: Enforce Spending Cap Dependency Summary

**enforce_spending_cap FastAPI dependency wired as router-level gate on /ai/* and /ai/suggest-category — raises 429 + Retry-After when monthly spend >= cap_cents**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-07T11:31:00Z
- **Completed:** 2026-05-07T11:46:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `enforce_spending_cap` async dependency in `app/api/dependencies.py` with full contract: passthrough on spend < cap, 429 with structured detail + `Retry-After` on exceed
- Applied `Depends(enforce_spending_cap)` at router level on both `/ai/*` (ai.py) and `/ai/suggest-category` (ai_suggest.py)
- cap=0 semantics handled naturally by `spend >= cap` with no special branch — spend=0 >= cap=0 triggers 429
- 6/6 enforce-dep unit tests (test_enforce_spending_cap_dep.py) are GREEN after these changes
- 3/4 integration tests (test_ai_cap_integration.py) are GREEN; the PATCH-cycle test depends on Plan 15-04

## Task Commits

1. **Task 1: Implement enforce_spending_cap dependency** - `c98cfb9` (feat)
2. **Task 2: Wire enforce_spending_cap to /ai and /ai-suggest routers** - `7fcedf7` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `app/api/dependencies.py` — Added `enforce_spending_cap` async dependency (42 lines) after `require_onboarded`
- `app/api/routes/ai.py` — Added `enforce_spending_cap` import + `Depends(enforce_spending_cap)` in router-level dependencies list
- `app/api/routes/ai_suggest.py` — Same changes as ai.py for the /suggest-category router

## Decisions Made

- Router-level dep covers all /ai/* (including /history, /conversation, /usage) — history is an AI feature; blocking access when cap=0 is intentional per plan decision
- Used `get_db` (plain session) inside `enforce_spending_cap` rather than `get_db_with_tenant_scope` — `_fetch_spend_cents_from_db` handles `SET LOCAL app.current_user_id` internally, so tenant scoping works without creating a second tenant-scoped session
- Local import (`from app.services.spend_cap import ...` inside function body) to prevent cyclic import risk if spend_cap grows to import from api/ layer later

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — no placeholder data or hardcoded stubs introduced.

## Threat Flags

No new security surface beyond what is documented in the plan's threat model (T-15-03-01 through T-15-03-05). Router-level dependency uniformly covers all /ai/* and /ai/suggest-category routes, satisfying T-15-03-02 (spoofing mitigation).

## Next Phase Readiness

- Plan 15-04 (PATCH /admin/users/{id}/cap) can now be executed; it must call `invalidate_user_spend_cache(user_id)` after successful DB update so the 60s TTL cache reflects the new cap immediately
- `test_chat_unblocked_after_admin_patches_cap_higher` will go GREEN after Plan 15-04 ships

## Self-Check: PASSED

- app/api/dependencies.py: FOUND
- app/api/routes/ai.py: FOUND
- app/api/routes/ai_suggest.py: FOUND
- Commit c98cfb9 (Task 1): FOUND
- Commit 7fcedf7 (Task 2): FOUND

---
*Phase: 15-ai-cost-cap-per-user*
*Completed: 2026-05-07*
