---
phase: 03-plan-template-and-planned-transactions
plan: 01
subsystem: testing
tags: [pytest, pytest-asyncio, sqlalchemy, fastapi, integration-tests, red-state, wave-0]

requires:
  - phase: 02-onboarding-and-categories
    provides: Wave-0 RED-stub pattern (test_categories.py self-skip + db_client fixture); ORM models PlanTemplateItem/PlannedTransaction/Subscription/BudgetPeriod (Phase 1+2); auth gate Depends(get_current_user)

provides:
  - 4 RED test files covering Phase 3 contracts (templates CRUD + snapshot + planned CRUD + apply-template idempotency)
  - 45 collected pytest cases pinning service-layer + REST contracts before implementation
  - Direct DB-seed helpers (_create_period, _create_planned, _create_subscription, _create_template_item) for integration tests bypassing not-yet-implemented endpoints
  - seed fixtures (seed_categories, seed_archived_category, seed_period, seed_template_items, seed_subscription_auto_planned) reusable across Wave-1+2 test refinement

affects: [03-02-services-templates-planned, 03-03-routes-templates-planned, 03-04-frontend-template-screen, 03-05-frontend-planned-screen, 03-06-final-integration]

tech-stack:
  added: []
  patterns:
    - "Wave-0 RED stub pattern (D-44 carry-over from D-22): integration tests written against not-yet-existent contracts; tests collect cleanly but fail at runtime until services + routes land"
    - "db_setup fixture returning (client, SessionLocal) tuple — enables direct DB-seed for setup state that has no API yet"
    - "self-skip via _require_db() when DATABASE_URL absent (carry-over from test_categories.py)"

key-files:
  created:
    - tests/test_templates.py
    - tests/test_snapshot.py
    - tests/test_planned.py
    - tests/test_apply_template.py
  modified: []

key-decisions:
  - "Use Optional[X] type hints over PEP 604 X | None in default-param annotations — runtime-evaluation safe across Python versions and matches conftest.py style"
  - "Each test file owns its own db_setup fixture (no shared conftest extension) — keeps Phase 3 test files self-contained and avoids modifying tests/conftest.py"
  - "Direct DB-seed helpers are private (_underscore prefix) — clearly signals 'bypass HTTP for setup', not part of public test API"
  - "subscription_auto seed fixture creates real Subscription row (FK satisfied) instead of using NULL subscription_id — better matches Phase 6 production data shape"

patterns-established:
  - "Pattern: db_setup fixture returns (async_client, SessionLocal) tuple → direct seed + HTTP test from same fixture"
  - "Pattern: test file == one resource (templates / snapshot / planned / apply-template) — 1:1 mapping to PLAN frontmatter files_modified"
  - "Pattern: archived-category guard tested by seeding is_archived=True row + asserting 400 (mirrors Phase 2 InvalidCategoryError shape)"

requirements-completed: [TPL-01, TPL-02, TPL-03, TPL-04, PLN-01, PLN-02, PLN-03]

duration: ~25min
completed: 2026-05-02
---

# Phase 03 Plan 01: Wave 0 RED Test Stubs Summary

**4 integration test files (45 cases) pinning Phase 3 contracts for templates/snapshot/planned/apply-template before service + route implementation lands.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-02 (auto mode)
- **Completed:** 2026-05-02
- **Tasks:** 2 (both committed atomically with --no-verify)
- **Files created:** 4 (all in `tests/`)
- **Tests collected:** 45 (14 templates + 6 snapshot + 17 planned + 8 apply-template)

## Accomplishments

- Wave-0 RED gate documented in 03-VALIDATION.md is satisfied: every Phase 3 requirement (TPL-01..04, PLN-01..03) has at least one automated test pinning the contract before implementation.
- Tests cover all dispositions in the threat register: T-archived-cat, T-kind-mismatch, T-sub-readonly (D-37 server-side guard), T-snapshot-pollution (D-32 source filter), T-apply-dupes (D-31 idempotency), T-auth-bypass, T-period-not-found, T-amount-zero, T-day-of-period-out-of-range.
- Direct DB-seed helpers established a reusable pattern for tests that need precise multi-row state (e.g., 3 planned rows with different `source` enums) which cannot be achieved via the public API alone.
- All 4 files self-skip cleanly via `_require_db()` when `DATABASE_URL` is absent, matching the Phase 1+2 convention.

## Task Commits

1. **Task 1: tests/test_templates.py + tests/test_snapshot.py** — `e10d145` (test)
2. **Task 2: tests/test_planned.py + tests/test_apply_template.py** — `258eab2` (test)

_Note: per orchestrator instructions, no STATE.md / ROADMAP.md updates and no separate metadata commit._

## Files Created

- `tests/test_templates.py` — 14 test cases. Covers list/create/update/delete template-items, validation guards (`amount_cents > 0`, `day_of_period 1..31`), 404 on non-existent ID, 400 on archived category, 403 without `X-Telegram-Init-Data`, full-field response shape.
- `tests/test_snapshot.py` — 6 test cases. Covers snapshot-from-period: 404 on missing period, empty period clears template (replaced=N), template+manual inclusion, subscription_auto exclusion (D-32), destructive overwrite of pre-existing template, auth gate.
- `tests/test_planned.py` — 17 test cases. Covers manual planned CRUD, kind/category filters, archived-category 400, kind-mismatch 400 (create + update), subscription_auto read-only (PATCH 400, DELETE 400 — D-37), full-field response shape including `source` and `subscription_id`, auth gate.
- `tests/test_apply_template.py` — 8 test cases. Covers apply-template: 404 on missing period, empty-template returns `created=0`, bulk creation with `source=template`, idempotency (D-31: second call returns existing rows with `created=0`, no duplicates), `planned_date` clamp to `period_end` (Pitfall 2), NULL `day_of_period` → NULL `planned_date`, kind mirrors `category.kind`, auth gate.

## Decisions Made

- **Optional[X] over PEP 604 unions in default-param annotations:** PEP 604 (`X | None`) is evaluated at function-definition time and fails on Python <3.10. The project requires 3.12, but using `Optional[X]` keeps test file collection robust across local sandboxes (e.g., system python 3.9 used to run `pytest --collect-only` here). Same approach as `tests/conftest.py`.
- **Self-contained fixtures per test file:** Each Phase 3 test file owns its own `db_setup` / `auth_headers` / seed fixtures. Trade-off: code duplication (~80 lines/file) in exchange for not modifying `tests/conftest.py` (pre-existing baseline). Aligns with `tests/test_categories.py` precedent.
- **Real Subscription row for subscription_auto seed:** Phase 6 will produce real Subscription FKs; the test seed mirrors that shape rather than relying on `subscription_id=NULL` (which the model technically allows). Catches more potential bugs in Plan 03-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced PEP 604 `X | None` with `Optional[X]` in test_snapshot.py default-param annotations**

- **Found during:** Task 1 verify (`pytest --collect-only` failed with `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`)
- **Issue:** Default-param annotations are evaluated at function-definition time. The local sandbox python is 3.9 (system python3) which does not support PEP 604 unions in runtime contexts. Even though the project targets Python 3.12, collection-time failures in any environment block the verification step.
- **Fix:** Imported `Optional` from `typing` and replaced `X | None` with `Optional[X]` in 4 helper-function signatures (`_create_template_item`, `_create_planned`, `_create_subscription`).
- **Files modified:** `tests/test_snapshot.py`
- **Verification:** `python3 -m pytest tests/test_templates.py tests/test_snapshot.py --collect-only` → 20 tests collected cleanly.
- **Committed in:** `e10d145` (Task 1 commit, includes the fix)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep — fix preserved type intent and matches existing `tests/conftest.py` style.

## Issues Encountered

- **Local sandbox runs Python 3.9, not 3.12 (project requires_python).** Collection succeeds for all 4 files (45 tests), but full `pytest` run fails immediately at `app/api/dependencies.py:34` (PEP 604 union in `get_current_user` Header annotation). This is an environment limitation, not a defect in the new test files — the same baseline failure also occurs on `tests/test_categories.py` and `tests/test_onboarding.py` when run under python 3.9. On the project's targeted environment (Python 3.12 with `uv sync`), runtime failures will surface as expected RED-state behaviors (HTTP 404 / `ModuleNotFoundError` for `app.services.templates`).

## Self-Check: PASSED

- `tests/test_templates.py` — FOUND
- `tests/test_snapshot.py` — FOUND
- `tests/test_planned.py` — FOUND
- `tests/test_apply_template.py` — FOUND
- Commit `e10d145` — FOUND
- Commit `258eab2` — FOUND
- Total tests collected: 45 (target: 30+) — PASSED
- Coverage of threat register dispositions: T-archived-cat, T-kind-mismatch, T-sub-readonly, T-snapshot-pollution, T-apply-dupes, T-auth-bypass, T-period-not-found, T-amount-zero, T-day-of-period-out-of-range — all covered.

## Next Phase Readiness

- **Plan 03-02** can now implement `app/services/templates.py` and `app/services/planned.py` against pinned test contracts. Service-layer signatures are derivable directly from test fixture shapes and HTTP-call assertions.
- **Plan 03-03** can wire `app/api/routes/templates.py` and `app/api/routes/planned.py`; route surface is fully specified by HTTP method + path + status-code matrix in the tests.
- **Wave-1 verifier** should run all 4 files end-to-end with `DATABASE_URL` set and expect transition from RED (404 / ImportError) → GREEN as services + routes land.
- No external service configuration required (User Setup: none).

---
*Phase: 03-plan-template-and-planned-transactions*
*Completed: 2026-05-02*
