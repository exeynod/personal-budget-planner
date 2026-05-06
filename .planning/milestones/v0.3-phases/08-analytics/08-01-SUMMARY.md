---
phase: 08-analytics
plan: "01"
subsystem: backend-tests
tags: [tdd, analytics, contract-tests, red-gate]
dependency_graph:
  requires: []
  provides: [contract-tests-analytics]
  affects: [08-02-PLAN]
tech_stack:
  added: []
  patterns: [pytest-asyncio, _require_db skip pattern, auth_headers fixture]
key_files:
  created:
    - tests/test_analytics.py
  modified: []
decisions:
  - "Tests written as RED gate — 404 != 403 confirms routes not yet registered"
  - "DB-backed tests self-skip via _require_db() without DATABASE_URL"
  - "Auth tests do not require DB — FastAPI auth middleware fires before DB access"
metrics:
  duration: "5m"
  completed: "2026-05-05"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 08 Plan 01: Analytics RED Contract Tests Summary

RED-gate TDD: 13 pytest-asyncio contract tests for 4 analytics endpoints — all FAIL with `404 != 403` until Plan 08-02 registers routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write RED contract tests tests/test_analytics.py | 01b6720 | tests/test_analytics.py (created) |

## What Was Built

`tests/test_analytics.py` — 13 contract tests covering:

- **anl-auth-01..04**: 4 auth tests (no DB required) — each endpoint returns 403 without `X-Telegram-Init-Data`. Currently FAIL with `404 != 403` — RED state.
- **anl-trend-01..03**: trend endpoint 200 + `{points: list}` shape + point field types (`period_label`, `expense_cents: int`, `income_cents`)
- **anl-overspend-01..02**: top-overspend 200 + item shape (`category_id`, `name`, `planned_cents`, `actual_cents`, `overspend_pct`)
- **anl-topcat-01..02**: top-categories 200 + item shape (`category_id`, `name`, `actual_cents`, `planned_cents`)
- **anl-forecast-01..02**: forecast 200 + `insufficient_data: bool` + null fields when `insufficient_data=True`

## Verification

```
FAILED tests/test_analytics.py::test_trend_requires_auth - assert 404 == 403
```

- File exists: yes
- Test count: 13 (`grep -c "def test_"` = 13)
- `analytics/trend` references: 5
- `analytics/forecast` references: 4
- No SyntaxError / ImportError — clean collection
- RED state confirmed: `assert 404 == 403` (not ERROR)

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

RED gate: `test(08-01)` commit `01b6720` — RED tests written and failing.
GREEN gate: pending Plan 08-02.

## Known Stubs

None — test file only, no UI stubs.

## Threat Flags

None — test file, not deployed to production.

## Self-Check: PASSED

- `tests/test_analytics.py` exists: FOUND
- Commit `01b6720` exists: FOUND
- Test count >= 12: 13 tests FOUND
- RED state verified: `404 != 403` CONFIRMED
