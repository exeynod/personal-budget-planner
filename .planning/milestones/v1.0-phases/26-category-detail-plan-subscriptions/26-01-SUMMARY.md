---
phase: 26-category-detail-plan-subscriptions
plan: 01
subsystem: api
tags: [backend, fastapi, sqlalchemy, pydantic, plan-month, atomic-patch, tdd]

# Dependency graph
requires:
  - phase: 22-v10-data-model
    provides: "Category.plan_cents/rollover/paused/parent_id columns; AppUser.income_cents column (alembic 0012/0013/0014)"
  - phase: 25-home-transactions-add-sheet
    provides: "CategoryRead surfaces v1.0 ORM columns on the wire (commit eb7192e); test fixture pattern (test_onboarding_v10_api.py)"
provides:
  - "PATCH /api/v1/categories/{id} accepts plan_cents/rollover/paused/parent_id (CategoryUpdate v1.0 extension)"
  - "PATCH /api/v1/plan-month — atomic batch plan-cents update with Σplan ≤ income validation"
  - "PlanOverflowError + CategoryNotInTenantError domain exceptions for plan-month service"
  - "17 integration tests (7 categories PATCH + 10 plan-month) covering happy/400/404/422/atomicity"
affects:
  - "26-04 web Plan view (PlanMount calls PATCH /plan-month on save)"
  - "26-05 iOS Plan view (PlanViewModel calls PATCH /plan-month on save)"
  - "26-02/03 web/iOS Category Detail (PATCH /categories/:id with rollover/paused/plan_cents)"

# Tech tracking
tech-stack:
  added: []  # No new dependencies — uses existing FastAPI/Pydantic/SQLAlchemy stack
  patterns:
    - "Atomic batch update: pre-fetch all referenced rows → fail-fast on missing → mutate in-memory → flush+commit"
    - "Domain exception → HTTPException mapping at route layer (PlanOverflowError → 400, CategoryNotInTenantError → 404)"
    - "Pydantic v2 model_validator for cross-field constraints (no-duplicate category_id)"
    - "ConfigDict(extra='forbid') on request schemas to fail-fast on wire-contract drift"

key-files:
  created:
    - "app/api/schemas/plan_month.py — PlanMonthItem/PlanMonthPatch/PlanMonthResponse"
    - "app/services/plan_month.py — update_plan_month_atomic + 2 domain exceptions"
    - "app/api/routes/plan_month.py — PATCH /api/v1/plan-month endpoint"
    - "tests/api/test_categories_v10_patch.py — 7 phase_26 tests for extended CategoryUpdate"
    - "tests/api/test_plan_month_route.py — 10 phase_26 tests for plan-month endpoint"
  modified:
    - "app/api/schemas/categories.py — extended CategoryUpdate with plan_cents/rollover/paused/parent_id"
    - "app/api/router.py — include plan_month_router on public_router"

key-decisions:
  - "Σplan ≤ income validation skipped когда AppUser.income_cents IS NULL (legacy v0.x users); frontend redirects to onboarding-edit"
  - "Cross-tenant + non-existent category_id оба возвращают 404 (REST convention — не leak existence)"
  - "Order of validation: overflow check FIRST, missing-id check SECOND (Σ > income preempts ID lookups, saves a query for malformed batches)"
  - "parent_id принимается без service-level FK validation; composite FK (parent_id, user_id) enforced на DB-level (alembic 0013); полная pre-validation отложена до Phase 27"
  - "Response.categories preserves request insertion order — frontend может zip против local copy без re-keying"

patterns-established:
  - "Atomic batch endpoint shape: list of {id, payload} items + ConfigDict(extra='forbid') + min_length=1 + model_validator no-duplicates"
  - "Domain exception hierarchy in service module (PlanOverflowError, CategoryNotInTenantError) — route layer maps each to HTTPException with structured detail"

requirements-completed: []  # Plan frontmatter intentionally empty — REQs are owned by frontend-screen plans 26-02..26-05; this is a backend prereq plan

# Metrics
duration: ~30min
completed: 2026-05-10
---

# Phase 26 Plan 01: Backend Extension (CategoryUpdate v1.0 + PATCH /plan-month) Summary

**Расширил CategoryUpdate Pydantic schema (plan_cents/rollover/paused/parent_id) и добавил PATCH /api/v1/plan-month — atomic batch plan-cents update с server-side Σplan ≤ income validation; 17/17 integration tests pass.**

## Performance

- **Duration:** ~30 min (включая docker rebuild × 2 для GREEN gates)
- **Started:** 2026-05-10T17:50:00Z (approx — после worktree branch reset)
- **Completed:** 2026-05-10T18:00:01Z
- **Tasks:** 2 (TDD — 4 commits: test→feat × 2)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- `CategoryUpdate` Pydantic schema accepts `plan_cents` (ge=0), `rollover` (Literal['misc','savings']), `paused` (bool), `parent_id` (int) — no service-side change нужен (existing `model_dump(exclude_unset=True)` setattr loop работает)
- New `PATCH /api/v1/plan-month` endpoint exposed на public_router behind `get_current_user` + `require_onboarded`
- `update_plan_month_atomic` service function: pre-validates Σplan ≤ income, bulk-fetches categories filtered by user_id, fails-fast на missing IDs БЕЗ partial mutations
- Two domain exceptions (`PlanOverflowError`, `CategoryNotInTenantError`) mapped to 400 / 404 at route layer with structured details
- 17 integration tests (7 для CategoryUpdate, 10 для plan-month) all pass against live Postgres docker stack — covers happy path, overflow → 400, cross-tenant → 404, missing → 404, negative cents → 422, empty list → 422, duplicate ID → 422, atomicity rollback на late 404

## Task Commits

TDD execution — each task split into RED (test) + GREEN (impl) commits:

1. **Task 1 RED: 7 failing tests for CategoryUpdate v1.0 fields** — `3f653a8` (test)
2. **Task 1 GREEN: extend CategoryUpdate schema** — `555840a` (feat)
3. **Task 2 RED: 10 failing tests for PATCH /plan-month** — `d350250` (test)
4. **Task 2 GREEN: implement schema + service + route + register** — `73b32f5` (feat)

(SUMMARY metadata commit will be created after this file is written.)

## Files Created/Modified

### Created
- `app/api/schemas/plan_month.py` — Pydantic v2 schemas (PlanMonthItem with gt=0/ge=0; PlanMonthPatch with min_length=1 + model_validator no-duplicates + extra='forbid'; PlanMonthResponse wrapping CategoryRead list)
- `app/services/plan_month.py` — `update_plan_month_atomic(db, user_id, plans)` + 2 domain exceptions
- `app/api/routes/plan_month.py` — `PATCH /api/v1/plan-month` route с tenant-scoped DB session + exception mapping
- `tests/api/test_categories_v10_patch.py` — 7 `test_phase_26_*` tests against extended CategoryUpdate
- `tests/api/test_plan_month_route.py` — 10 `test_phase_26_plan_month_*` tests against new endpoint

### Modified
- `app/api/schemas/categories.py` — `CategoryUpdate` теперь принимает 4 v1.0 fields (Optional, default None); detailed Phase 26 docstring objясняет why deferred parent_id FK validation
- `app/api/router.py` — import + `include_router(plan_month_router)` под существующим Phase 22 me_router

## Decisions Made

- **Income IS NULL → skip overflow check.** Legacy v0.x users w/o configured income не блокируются — frontend (см. /me-driven routing) redirects them на onboarding-edit; backend позволяет PATCH работать чтобы UI flow не deadlocked.
- **404 на cross-tenant И на missing.** RESTful — не leak existence. Service-layer фильтр `Category.user_id == user_id` всегда первая защита; RLS — secondary backstop.
- **Validation order: overflow → missing-id.** При overflow request однозначно invalid — не нужно тратить query на ID lookup. Late-404 atomicity test (test 10) обеспечивает что когда overflow check passes, missing-ID все ещё откатывает все мутации.
- **parent_id принимается без service FK validation.** Composite (parent_id, user_id) → (id, user_id) enforced на DB-level (alembic 0013); request layer accepts integer; полная pre-validation в Phase 27 (sub-categories feature). `test_phase_26_patch_parent_id_accepts_valid_sibling` проверяет valid path; invalid parent_id будет ловиться DB IntegrityError → 500 (acceptable для MVP).
- **PATCH /plan-month использует `db.commit()` явно в route handler.** Mirrors /categories handler pattern — `get_db_with_tenant_scope` НЕ auto-commit-ит в успехе (в отличие от тестового `real_get_db` override).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 10 (atomic_rollback_on_late_404) использовал значение plan_cents что вызывало overflow first**
- **Found during:** Task 2 GREEN gate
- **Issue:** Test seeded `plan_cents: 999_999_00` (≈₽999_999), что превышает owner's income 100_000_00 (₽100_000) → service raises PlanOverflowError → 400 plan_overflow вместо ожидаемого 404. Тест проверял atomicity для missing-ID, но overflow check срабатывал раньше.
- **Fix:** Изменил test value на `30_000_00` (Σ = 31_000_00 ≪ 100_000_00 income) чтобы overflow check passed и failure только из-за missing 888_888 ID — что и есть тест на atomicity для missing-ID-late.
- **Files modified:** `tests/api/test_plan_month_route.py`
- **Verification:** 17/17 tests pass.
- **Committed in:** `73b32f5` (combined с GREEN impl per protocol — test fix needed для GREEN gate to pass; plan-as-written предполагал что тест будет работать; mismatch в plan, не в impl).

---

**Total deviations:** 1 auto-fixed (Rule 1 — test value bug в plan)
**Impact on plan:** No scope creep. Plan files_modified list соблюдён 1:1. Тест семантика unchanged (по-прежнему проверяет atomic rollback на late missing-ID).

## Issues Encountered

- **Pre-existing test failures в `tests/test_categories.py`:** legacy `test_create_category` и др. падают с `NotNullViolationError on category.code` потому что POST /categories endpoint не заполняет Phase 22 NOT NULL колонки. SCOPE BOUNDARY — не моя задача (logged для phase 27+ to backfill через migration или service-side default code generation). Phase 26-01 tests обходят это правильным sidом ORM rows c явными `code='food'`, `ord='01'`.
- **OpenAI API spam в test logs:** existing `_refresh_embedding` background task пытается дернуть OpenAI с fake API key и валится 401 в logs — pre-existing test infra issue, не блокирует тесты (background failure swallowed by `try/except`). Не моя задача.
- **Docker `restart` не обновляет код в контейнере** — нужен `up --build` чтобы pick up Python source changes (нет bind-mount для `app/`). Так и сделал для GREEN gates.

## User Setup Required

None — backend changes only, no env vars / external service config.

## Next Phase Readiness

- Wave 2 plans (26-02..26-05 для CategoryDetail + PlanView web/iOS) могут starting заводить Mount/ViewModel layers с уверенностью что:
  - `updateCategoryV10(id, {plan_cents, rollover, paused, parent_id})` доступен через PATCH /categories/:id
  - `patchPlanMonth(plans)` доступен через PATCH /plan-month с гарантией atomic Σplan ≤ income
  - Error contract documented: 400 plan_overflow detail = `{error, income_cents, sum_plan_cents}`; 404 missing/cross-tenant; 422 negative/empty/duplicate
- No blockers. Wave 1 finished.

## Self-Check: PASSED

**Files exist:**
- `/Users/exy/pet_projects/tg-budget-planner/app/api/schemas/plan_month.py` — FOUND
- `/Users/exy/pet_projects/tg-budget-planner/app/services/plan_month.py` — FOUND
- `/Users/exy/pet_projects/tg-budget-planner/app/api/routes/plan_month.py` — FOUND
- `/Users/exy/pet_projects/tg-budget-planner/tests/api/test_categories_v10_patch.py` — FOUND
- `/Users/exy/pet_projects/tg-budget-planner/tests/api/test_plan_month_route.py` — FOUND

**Commits exist (verified via `git log --oneline`):**
- `3f653a8` — FOUND (test RED — categories)
- `555840a` — FOUND (feat GREEN — categories schema)
- `d350250` — FOUND (test RED — plan-month)
- `73b32f5` — FOUND (feat GREEN — plan-month full)

**Tests pass:** 7/7 phase_26 categories + 10/10 phase_26 plan-month + 0 regressions in tests/api/test_onboarding_v10_api.py + tests/services/test_onboarding_v10.py.

## TDD Gate Compliance

- Plan 26-01 tasks marked `tdd="true"` — both followed RED → GREEN cycle:
  - Task 1: `3f653a8` (test, 7 failing) → `555840a` (feat, 7 passing)
  - Task 2: `d350250` (test, 8 failing + 2 false-positive 404 protected via atomicity assert) → `73b32f5` (feat, 10 passing — incl. test value fix)
- No REFACTOR commits — no cleanup needed.
- Both gates committed in correct order (test before feat).

---
*Phase: 26-category-detail-plan-subscriptions*
*Completed: 2026-05-10*
