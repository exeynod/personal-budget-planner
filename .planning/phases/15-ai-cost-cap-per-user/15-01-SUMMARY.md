---
phase: 15-ai-cost-cap-per-user
plan: "01"
subsystem: tests
tags: [tdd, red-phase, ai-cost-cap, spending-cap, aicap]
dependency_graph:
  requires: []
  provides:
    - tests/test_spend_cap_service.py
    - tests/test_enforce_spending_cap_dep.py
    - tests/test_admin_cap_endpoint.py
    - tests/test_me_ai_spend.py
    - tests/test_ai_cap_integration.py
  affects:
    - app/services/spend_cap.py (Plan 15-02 must satisfy these tests)
    - app/api/dependencies.py::enforce_spending_cap (Plan 15-03)
    - app/api/routes/admin.py PATCH /users/{id}/cap (Plan 15-04)
    - app/api/router.py /me ai_spend_cents (Plan 15-05)
tech_stack:
  added: []
  patterns:
    - TDD RED phase: tests created before implementation
    - stub route injection (mirror test_require_onboarded.py pattern)
    - db_client fixture with TRUNCATE + real DB session
key_files:
  created:
    - tests/test_spend_cap_service.py
    - tests/test_enforce_spending_cap_dep.py
    - tests/test_admin_cap_endpoint.py
    - tests/test_me_ai_spend.py
    - tests/test_ai_cap_integration.py
  modified: []
decisions:
  - "test_extra_fields_rejected_422 marked xfail — Plan 15-04 decides whether CapUpdate schema uses extra='forbid'"
  - "test_spend_cents_cache_hits_within_ttl validates cache contract without binding to specific library (cachetools vs dict+lock)"
  - "Integration tests mock LLM via monkeypatch to avoid real OpenAI calls in RED phase"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-07T11:35:00Z"
  tasks_completed: 3
  files_created: 5
  files_modified: 0
---

# Phase 15 Plan 01: RED Tests for AI Cost Cap per User Summary

28 RED-phase tests across 5 modules pinning API contracts for AICAP-01..05; all fail until Plans 15-02..15-05 implement service, dependency, admin endpoint, and /me extension.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | test_spend_cap_service.py + helper check | f9c5db4 | tests/test_spend_cap_service.py |
| 2 | test_enforce_spending_cap_dep.py + test_admin_cap_endpoint.py | 2fc32ed | 2 test files |
| 3 | test_me_ai_spend.py + test_ai_cap_integration.py | e05a959 | 2 test files |

## Tests Created

| File | Tests | AICAP | RED trigger |
|------|-------|-------|-------------|
| test_spend_cap_service.py | 7 | AICAP-03 | ModuleNotFoundError: app.services.spend_cap |
| test_enforce_spending_cap_dep.py | 6 | AICAP-01/02 | ImportError: enforce_spending_cap |
| test_admin_cap_endpoint.py | 7 | AICAP-04 | 404/405 PATCH endpoint not created |
| test_me_ai_spend.py | 4 | AICAP-05 | KeyError: ai_spend_cents not in /me |
| test_ai_cap_integration.py | 4 | AICAP-01/02/04 | 429 not returned (enforce not wired) |
| **Total** | **28** | | |

## Contract Pins

```
from app.services.spend_cap import get_user_spend_cents, invalidate_user_spend_cache, seconds_until_next_msk_month
from app.api.dependencies import enforce_spending_cap
PATCH /api/v1/admin/users/{user_id}/cap  body={"spending_cap_cents": int≥0}
GET /api/v1/me  → {"ai_spend_cents": int, ...}
```

## Deviations from Plan

None — plan executed exactly as written.

Minor implementation choice: `test_extra_fields_rejected_422` uses `pytest.mark.xfail` as directed by plan ("пометьте как `pytest.mark.xfail` если Plan 15-04 решит не enforced extra=forbid").

## Known Stubs

None — these are test files only; no implementation stubs.

## Threat Flags

None — test files only; no new network endpoints or auth paths introduced.

## Self-Check: PASSED

Files exist:
- tests/test_spend_cap_service.py: FOUND
- tests/test_enforce_spending_cap_dep.py: FOUND
- tests/test_admin_cap_endpoint.py: FOUND
- tests/test_me_ai_spend.py: FOUND
- tests/test_ai_cap_integration.py: FOUND

Commits:
- f9c5db4: test(15-01): RED — 7 unit tests for get_user_spend_cents service
- 2fc32ed: test(15-01): RED — 6+7 tests for enforce_spending_cap dep + admin PATCH cap
- e05a959: test(15-01): RED — 4+4 tests for /me ai_spend_cents + cap integration

Collection: 28 tests collected, all RED.
