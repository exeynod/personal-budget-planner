---
phase: 11-multi-tenancy-db-migration
plan: 05
subsystem: api
tags: [services, routes, refactor, multitenancy, user-id-param, sqlalchemy, fastapi]

# Dependency graph
requires:
  - phase: 11-04
    provides: "get_current_user_id + get_db_with_tenant_scope dependencies"
  - phase: 11-03
    provides: "Mapped user_id columns on 9 domain ORM models"
  - phase: 11-02
    provides: "user_id BIGINT NOT NULL FK + RLS policies on 9 domain tables"
provides:
  - "categories service: 6 functions take *, user_id: int, scope every Category query/INSERT"
  - "periods service: 3 functions take *, user_id: int, scope every BudgetPeriod query/INSERT"
  - "templates service: 6 functions + helper take *, user_id: int, scope PlanTemplateItem/PlannedTransaction"
  - "planned service: 9 functions take *, user_id: int, scope PlannedTransaction/BudgetPeriod/PlanTemplateItem"
  - "onboarding service: external tg_user_id signature preserved; internal user.id PK forwarded to per-tenant calls"
  - "settings service: unchanged (AppUser-only, no domain queries)"
  - "categories/periods/templates/planned routes: switched to get_db_with_tenant_scope + get_current_user_id"
  - "T-11-05-04 mitigation: apply_template_to_period propagates user_id into every new PlannedTransaction row"
  - "T-11-05-05 mitigation: get_or_404 helpers return 404 for cross-tenant ID access (no existence leak)"
affects: ["11-06", "11-07", "11-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service signatures: AsyncSession positional, *, user_id: int keyword-only required"
    - "get_or_404 contract: scoped by user_id, raises NotFound for missing OR cross-tenant"
    - "INSERT new domain row → always sets user_id=user_id field"
    - "Routes: get_db_with_tenant_scope + get_current_user_id forwarded to service"
    - "Onboarding pattern: external tg_user_id contract + internal user_pk resolution"

key-files:
  created:
    - .planning/phases/11-multi-tenancy-db-migration/11-05-SUMMARY.md
  modified:
    - app/services/categories.py
    - app/services/periods.py
    - app/services/templates.py
    - app/services/planned.py
    - app/services/onboarding.py
    - app/api/routes/categories.py
    - app/api/routes/periods.py
    - app/api/routes/templates.py
    - app/api/routes/planned.py

key-decisions:
  - "settings.py service + route NOT touched: only operates on AppUser table (no RLS, no user_id FK)"
  - "onboarding route NOT switched to get_db_with_tenant_scope: keeps get_db; consistent with future Phase 14 onboarding redesign"
  - "Cross-tenant ID access returns 404 (CategoryNotFoundError / PlannedNotFoundError / PeriodNotFoundError / TemplateItemNotFoundError) — REST convention: don't leak existence"
  - "user_id is keyword-only (*, user_id: int) in every service signature for safety: caller cannot accidentally swap with another int positional"
  - "Service layer kept HTTP-framework-agnostic — no FastAPI imports added"
  - "snapshot_from_period now DELETEs only this user's PlanTemplateItem rows (was global DELETE — would have wiped all tenants)"
  - "Routes/periods.py still calls actual_svc.compute_balance(db, period_id) without user_id — that signature lands in Plan 11-06 (actuals scope); RLS provides backstop until then"

patterns-established:
  - "Service: async def fn(db: AsyncSession, [positional...], *, user_id: int, [optional kwargs]) -> ..."
  - "Route: db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)] + user_id: Annotated[int, Depends(get_current_user_id)]"
  - "INSERT: Model(user_id=user_id, ...) — user_id is the first explicit kwarg"
  - "Read: select(Model).where(Model.user_id == user_id, ...)"
  - "Onboarding internal resolution: user_pk = user.id then forward to cat_svc/period_svc"

requirements-completed: [MUL-03, MUL-04]

# Metrics
duration: ~30min
completed: 2026-05-06
---

# Phase 11 Plan 05: Service+Route Refactor PART A Summary

**Categories, periods, templates, planned, onboarding services + their routes scoped by explicit user_id parameter; settings/onboarding-route deliberately untouched (AppUser-only / future Phase 14 redesign).**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-06 (early afternoon)
- **Completed:** 2026-05-06
- **Tasks:** 3 (all autonomous, no checkpoints)
- **Files modified:** 9 (6 service + 3 route — settings/onboarding routes unchanged per plan)

## Accomplishments

- Every public function in 5 service modules (categories, periods, templates, planned + internal helper in onboarding) now takes `*, user_id: int` keyword-only and applies it in WHERE clauses (read) or INSERT fields (write)
- 4 route modules (categories, periods, templates, planned) switched from `get_db` → `get_db_with_tenant_scope` and added `user_id: Annotated[int, Depends(get_current_user_id)]` — total 16 handlers updated to forward user_id
- T-11-05-04 mitigation in place: `apply_template_to_period` inserts every new PlannedTransaction with the caller's user_id (no risk of cross-tenant template apply leaking rows)
- T-11-05-05 mitigation in place: every `get_or_404` helper (categories, planned, templates, periods) returns NotFoundError for cross-tenant ID access (404 not 403 — no existence leak per REST convention)
- onboarding.py preserves its external `tg_user_id: int` signature (route layer contract intact) but internally resolves `user.id` PK and forwards it to `seed_default_categories(user_id=...)` and `create_first_period(user_id=...)` — newly seeded categories and the first period belong to the correct tenant
- Discovered & fixed bug in templates.snapshot_from_period: previously `DELETE FROM plan_template_item` had no WHERE clause — would have wiped templates of all tenants. Now scoped to `WHERE user_id = :user_id` (Rule 1 fix, see Deviations).
- All 12 in-scope files parse with Python 3.12 AST; sub-targets (services + routes) compile-clean

## Task Commits

1. **Task 1: Refactor categories service + route** - `9515edd` (refactor)
2. **Task 2: Refactor periods + templates services + routes** - `80456ec` (refactor)
3. **Task 3: Refactor planned + onboarding (+ verify settings unchanged)** - `a92c068` (refactor)

## Files Created/Modified

### Service layer

- `app/services/categories.py` — 6 fns (`list_categories`, `create_category`, `get_or_404`, `update_category`, `archive_category`, `seed_default_categories`) take `*, user_id: int`. Every Category query has `.where(Category.user_id == user_id)`; every Category INSERT carries `user_id=user_id`. `seed_default_categories` idempotent now per-user (existing_count scoped).
- `app/services/periods.py` — 3 fns (`get_current_active_period`, `list_all_periods`, `create_first_period`) take `*, user_id: int`. `_today_in_app_tz()` (DB-less helper) untouched.
- `app/services/templates.py` — `_ensure_category_active` + 6 public fns (`list_template_items`, `get_or_404`, `create_template_item`, `update_template_item`, `delete_template_item`, `snapshot_from_period`) take `*, user_id: int`. `snapshot_from_period` DELETE now scoped to user (Rule 1 fix).
- `app/services/planned.py` — `_ensure_category_active`, `_get_period_or_404`, `get_or_404` + 5 public fns (`list_planned_for_period`, `create_manual_planned`, `update_planned`, `delete_planned`, `apply_template_to_period`) take `*, user_id: int`. `_get_period_or_404` rewritten as a select+filter (was `db.get`, no scope possible). `apply_template_to_period` propagates user_id to every new PlannedTransaction (T-11-05-04).
- `app/services/onboarding.py` — `complete_onboarding` external signature unchanged (still `tg_user_id: int`); internally extracts `user_pk = user.id` and forwards to `cat_svc.seed_default_categories(user_id=user_pk)` + `period_svc.create_first_period(user_id=user_pk, ...)`.
- `app/services/settings.py` — UNCHANGED. Verified by grep: no `select(Category|BudgetPeriod|Planned|Actual|Subscription)` calls — only operates on AppUser. AppUser has no RLS / no user_id FK; tg_user_id-based signatures stay.

### Route layer

- `app/api/routes/categories.py` — 4 handlers (list, create, update, archive) switched to `get_db_with_tenant_scope` + `get_current_user_id`. Forward `user_id` to service. Background-task `_refresh_embedding` untouched (uses its own session; embedding ownership refactor is Plan 11-06's territory).
- `app/api/routes/periods.py` — 3 handlers (list, current, balance) switched. `compute_balance(db, period_id)` call left as-is — that service signature changes in Plan 11-06; RLS via tenant-scoped session provides backstop until then.
- `app/api/routes/templates.py` — 5 handlers (list, create, update, delete, snapshot) switched.
- `app/api/routes/planned.py` — 5 handlers (list, create, apply-template, update, delete) switched.
- `app/api/routes/onboarding.py` — UNCHANGED per plan. Uses `get_db` (no tenant scope). Consistent with Phase 14 onboarding redesign that will refactor this flow holistically.
- `app/api/routes/settings.py` — UNCHANGED per plan. AppUser-only operations.

## Decisions Made

- **settings.py untouched** — verified by grep there are zero `select()` calls on user-scoped domain tables. AppUser has no RLS, so `SET LOCAL app.current_user_id` is unnecessary; switching to `get_db_with_tenant_scope` would just add a no-op SET LOCAL but force callers (worker) to also resolve a user_id, breaking legacy `tg_user_id` contracts. Plan explicitly specified leaving settings alone.
- **onboarding route untouched** — same rationale: per-plan instruction, plus Phase 14 will redesign onboarding flow holistically.
- **`_get_period_or_404` rewritten** in planned.py — was `db.get(BudgetPeriod, period_id)` (RLS-only check, no app filter). Replaced with explicit select+where so app-side filtering is primary defense, RLS the backstop (CONTEXT.md MUL-03 principle).
- **`get_or_404` in templates.py rewritten** — same reason: was `db.get(...)`, now `select+where`.
- **404 (not 403) for cross-tenant access** — chose this for all four `*NotFoundError` exceptions. Matches REST convention; threat T-11-05-05 explicitly approves this.
- **Async signatures: keyword-only `user_id`** — `*, user_id: int` so callers cannot accidentally swap user_id with another int positional. mypy + Pylance flag missing keyword arg loudly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] templates.snapshot_from_period: missing WHERE clause on DELETE would have wiped all tenants' templates**
- **Found during:** Task 2 (templates.py refactor)
- **Issue:** Original code had `await db.execute(delete(PlanTemplateItem))` — no WHERE clause. After Phase 11-02 RLS landed, the SET LOCAL guard would trim the DELETE to current user only at the policy level — but app-side this is invisible and brittle (a stray query without SET LOCAL set would wipe everything). Plan principle MUL-03: app-side filtering is PRIMARY, RLS is the backstop.
- **Fix:** Added `.where(PlanTemplateItem.user_id == user_id)` to the DELETE statement.
- **Files modified:** `app/services/templates.py` (snapshot_from_period)
- **Verification:** grep confirms `delete(PlanTemplateItem).where(PlanTemplateItem.user_id == user_id)` present.
- **Committed in:** `80456ec` (Task 2)

**2. [Rule 1 — Bug] templates.get_or_404 + planned._get_period_or_404 used `db.get(Model, id)` (no scope possible)**
- **Found during:** Task 2 + Task 3
- **Issue:** `db.get(Model, id)` is a primary-key shortcut that cannot apply WHERE filters. Even with RLS as backstop, this violates MUL-03 ("app-side filtering as primary"). It would also bypass `Model.user_id == user_id` in the SQL fingerprint, making query analysis harder.
- **Fix:** Replaced with `select(Model).where(Model.id == id, Model.user_id == user_id)` + `scalar_one_or_none()`.
- **Files modified:** `app/services/templates.py`, `app/services/planned.py`
- **Verification:** grep confirms `where(...user_id == user_id)` on both helpers; no remaining `db.get(BudgetPeriod` or `db.get(PlanTemplateItem` calls.
- **Committed in:** `80456ec` + `a92c068`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — Bug)
**Impact on plan:** Both fixes essential for the MUL-03 contract ("app-side filtering as primary defense"). No scope creep — both are within the 12 plan-scope files.

## Issues Encountered

- **Worktree had pre-existing uncommitted changes from a Plan 11-06 session** (actual.py, analytics.py, subscriptions.py + their routes). These files are 11-06's scope — I did NOT include them in any of my commits. They remain unstaged in the working tree for the 11-06 worktree session to commit. Verified `git status --short` after each commit to confirm only my-scope files were staged.
- **No runnable test environment** in this dev machine: project venv is empty, deps live in docker. Validation done via Python 3.12 AST parse + grep audits. Acceptance criteria thresholds all met. Per memory feedback (`feedback-restart-services.md`), the user pulls the changes and rebuilds docker themselves.

## User Setup Required

None — pure code refactor, no env vars, no migrations beyond what 11-02 already shipped.

## Next Phase Readiness

**For Plan 11-06 (PART B — actuals/subs/analytics/AI/internal_bot/worker):**
- Service signatures established here are stable: `*, user_id: int` keyword-only. 11-06's tests/sanity calls can rely on them.
- `cat_svc.get_or_404` callers in `actual.py` + `internal_bot.py` need updating in 11-06 — they currently call `cat_svc.get_or_404(db, category_id)` without user_id. mypy/runtime will flag missing kwarg. (Note: those files appear pre-modified in this worktree's working tree from a prior 11-06 session — that session will resolve them.)
- `actual_svc.compute_balance(db, period_id)` is called from `routes/periods.py:get_period_balance` without user_id — Plan 11-06 should add `user_id=user_id` there as part of its actuals refactor. Until 11-06 lands, RLS on `actual_transaction` (set by tenant-scoped session) provides backstop.
- `worker/jobs/close_period.py`, `notify_subscriptions.py`, `charge_subscriptions.py` import `_today_in_app_tz` from periods.py — that helper is unchanged, so worker imports remain valid. The user-iteration refactor lands in 11-06.
- `routes/onboarding.py` continues using `get_db` (NOT tenant scope) intentionally — Phase 14 will redesign onboarding holistically.

**For Plan 11-07 (integration tests + isolation suite):**
- All `get_or_404` helpers return 404 for cross-tenant access — wire two-tenant fixture and assert direct-ID GET returns 404, not 200, not 403.
- `apply_template_to_period` is the highest-value isolation test target (T-11-05-04): user A's template apply must not write rows for user B regardless of period_id manipulation.
- `seed_default_categories` is now per-user idempotent — test that calling for two distinct users seeds twice (one set per user).

## Self-Check: PASSED

**Files verified to exist:**
- `app/services/categories.py` — FOUND
- `app/services/periods.py` — FOUND
- `app/services/templates.py` — FOUND
- `app/services/planned.py` — FOUND
- `app/services/onboarding.py` — FOUND
- `app/api/routes/categories.py` — FOUND
- `app/api/routes/periods.py` — FOUND
- `app/api/routes/templates.py` — FOUND
- `app/api/routes/planned.py` — FOUND

**Commits verified:**
- `9515edd` — FOUND
- `80456ec` — FOUND
- `a92c068` — FOUND

**Acceptance grep counts (all met or exceeded):**
- `Category.user_id == user_id` in services/categories.py: 3 (≥3 required)
- `user_id=user_id` in services/categories.py (INSERT): 5 (≥2 required)
- `BudgetPeriod.user_id == user_id` in services/periods.py: 2 (≥1 required)
- `user_id=user_id` in services/periods.py (INSERT): 2 (≥1 required)
- `PlanTemplateItem.user_id == user_id` in services/templates.py: 4 (≥1 required)
- `get_db_with_tenant_scope` in routes/categories|periods|templates|planned.py: 6+5+7+7 = 25 (≥4 required, one each)
- `user_id: Annotated[int, Depends(get_current_user_id)]` in routes/categories.py: 4 (≥4 required)
- `seed_default_categories(.*user_id=` in services/onboarding.py: 1 (≥1 required)
- All 12 files parse with Python 3.12 AST: PASS

---
*Phase: 11-multi-tenancy-db-migration*
*Completed: 2026-05-06*
