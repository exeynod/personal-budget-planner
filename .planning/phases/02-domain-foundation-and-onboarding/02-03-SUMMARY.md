---
phase: 02-domain-foundation-and-onboarding
plan: 03
subsystem: api

tags:
  - service-layer
  - async-sqlalchemy
  - onboarding
  - categories
  - periods
  - settings
  - telegram
  - postgres-upsert
  - domain-exceptions
  - tdd-green

# Dependency graph
requires:
  - phase: 02-domain-foundation-and-onboarding
    provides:
      - "app/core/period.py: period_for() (used by periods service)"
      - "app/api/schemas/categories.py: CategoryUpdate (used by update_category service)"
      - "tests/test_categories.py / test_onboarding.py / test_settings.py / test_telegram_chat_bind.py — service-layer behavior contracts"
  - phase: 01-infrastructure-and-auth
    provides:
      - "app/db/models.py: AppUser, Category, BudgetPeriod, CategoryKind, PeriodStatus enums"
      - "app/db/session.py: AsyncSessionLocal, get_db (transaction-per-request semantics — onboarding atomicity relies on this)"
      - "app/core/settings.py: APP_TZ='Europe/Moscow' (used by periods._today_in_app_tz)"

provides:
  - "app/services/__init__.py — package marker for the new service layer"
  - "app/services/categories.py — SEED_CATEGORIES (14: 12 expense + 2 income, D-16) + 6 async functions (list/create/update/archive/seed_default + get_or_404) + CategoryNotFoundError"
  - "app/services/periods.py — create_first_period (uses period_for + APP_TZ today) + get_current_active_period + _today_in_app_tz helper"
  - "app/services/settings.py — get/update_cycle_start_day (SET-01/D-17 boundary: deliberately no BudgetPeriod import) + UserNotFoundError"
  - "app/services/telegram.py — bind_chat_id via PostgreSQL UPSERT (on_conflict_do_update by tg_user_id) — ONB-03/D-11"
  - "app/services/onboarding.py — complete_onboarding atomic 4-step orchestration + AlreadyOnboardedError + OnboardingUserNotFoundError"
  - "Domain-exception pattern: 4 service-layer exceptions (CategoryNotFoundError, UserNotFoundError, AlreadyOnboardedError, OnboardingUserNotFoundError) replace HTTPException — keeps service layer FastAPI-free per Phase 2 success criterion"

affects:
  - "02-04-PLAN (API routes — wires services as thin handlers; will need exception mappers: CategoryNotFoundError→404, UserNotFoundError→404, AlreadyOnboardedError→409, OnboardingUserNotFoundError→404)"
  - "02-05-PLAN (bot — internal /telegram/chat-bind handler delegates to telegram.bind_chat_id)"
  - "Phase 5 worker close_period (will reuse periods.create_first_period structure for next-period creation)"

# Tech tracking
tech-stack:
  added: []  # no new deps; all stack already in place from 02-02
  patterns:
    - "Service layer: pure async functions, AsyncSession as first positional arg, kw-only domain args (PEP 3102) — uniform signature across all 6 modules"
    - "Domain exceptions in service layer (CategoryNotFoundError, UserNotFoundError, AlreadyOnboardedError, OnboardingUserNotFoundError) — route layer maps to HTTP status codes; services stay framework-agnostic and reusable from worker/CLI/tests"
    - "PostgreSQL UPSERT via sqlalchemy.dialects.postgresql.insert(...).on_conflict_do_update(index_elements=['tg_user_id'], set_={...}) — single round-trip atomic insert-or-update"
    - "Idempotent seed via existence check (count Category > 0 → skip) — D-16; matches Pattern 7 in 02-RESEARCH.md"
    - "Atomic multi-step orchestration: complete_onboarding does 4 mutations; transaction boundary owned by get_db (commit on handler success, rollback on any exception) — covers T-onboarding-atomicity"
    - "Cross-service composition without circular imports: onboarding imports `categories as cat_svc` and `periods as period_svc` (module-level alias), not individual symbols — avoids name-clash with seed_default_categories param vs function"
    - "SET-01/D-17 boundary made grep-able: settings.py docstring explicitly states no BudgetPeriod import + AST-verified no `period`-related imports"

key-files:
  created:
    - "app/services/__init__.py — package marker (3-line docstring)"
    - "app/services/categories.py — SEED_CATEGORIES + 6 async funcs + CategoryNotFoundError (~140 LOC)"
    - "app/services/periods.py — create_first_period + get_current_active_period + _today_in_app_tz (~60 LOC)"
    - "app/services/settings.py — get/update_cycle_start_day + UserNotFoundError (~70 LOC)"
    - "app/services/telegram.py — bind_chat_id (PostgreSQL UPSERT) (~35 LOC)"
    - "app/services/onboarding.py — complete_onboarding + AlreadyOnboardedError + OnboardingUserNotFoundError (~125 LOC)"
  modified: []

key-decisions:
  - "Service layer is FastAPI-free (Phase 2 user-defined success criterion overrides plan body which originally proposed HTTPException raises). Replaced 2 originally-planned HTTPException raises with domain exceptions: CategoryNotFoundError (in categories.get_or_404) and UserNotFoundError (in settings._get_user_or_404). Plus introduced OnboardingUserNotFoundError to replace the originally-planned ValueError on missing user — clearer semantics and parallel structure across all 6 modules. Route layer (Plan 02-04) is now responsible for mapping exceptions to HTTP status codes via @app.exception_handler decorators or explicit try/except in handlers."
  - "Kept name `get_or_404` in categories.py despite no longer raising HTTPException — preserves the export contract listed in the plan's <interfaces> section, and the suffix communicates intent to the route layer (caller knows it raises a 'lookup failed' exception)."
  - "Added one extra exception (OnboardingUserNotFoundError) beyond plan's spec (ValueError) — gives route layer a typed exception to catch and map to 404 instead of having to discriminate ValueError vs other ValueErrors."
  - "Used module-aliased imports in onboarding.py (`from app.services import categories as cat_svc`) instead of symbol imports (`from app.services.categories import seed_default_categories`) to avoid name-clash with the function parameter `seed_default_categories: bool` in complete_onboarding's signature. Plan body already used this pattern; documented here for clarity."
  - "periods.get_current_active_period orders by period_start desc + LIMIT 1, even though there should normally be exactly one active period. Defensive against transient overlap during Phase 5 worker rollover; cheap (indexed by primary key access pattern)."
  - "Period overlap protection (T-active-overlap from 02-VALIDATION) is delegated to the onboarding orchestrator's idempotency guard (`user.onboarded_at IS NOT NULL → AlreadyOnboardedError`). Plan 02-04 may add a defensive route-layer check; not duplicated in services."

requirements-completed:
  - CAT-01
  - CAT-02
  - CAT-03
  - PER-01
  - PER-02
  - PER-03
  - PER-05
  - ONB-01
  - ONB-03
  - SET-01

# Metrics
duration: ~4min
completed: 2026-05-02
---

# Phase 02 Plan 03: Domain Service Layer Summary

**Pure-async service layer (`app/services/` — 6 modules) implementing categories CRUD + soft-archive + idempotent seed (14 cats), period creation/retrieval, atomic 4-step onboarding orchestration, settings (cycle_start_day) read/write that explicitly does NOT recompute existing periods, and PostgreSQL-UPSERT chat-bind. Service layer is framework-agnostic: 4 domain exceptions replace HTTPException, leaving HTTP mapping to the route layer (Plan 02-04).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-02T22:39:09Z
- **Completed:** 2026-05-02T22:43:32Z
- **Tasks:** 2 (Task 1: 5 modules — categories/periods/settings/telegram/__init__; Task 2: onboarding orchestrator)
- **Files created:** 6 (all under `app/services/`)
- **Files modified:** 0

## Accomplishments

- **6-module service package created end-to-end.** `app/services/{__init__,categories,periods,settings,telegram,onboarding}.py` — every public async function takes `db: AsyncSession` as first positional argument, uses kw-only domain arguments (PEP 3102), is type-annotated, and uses no HTTP-framework imports. Total ~430 LOC (excluding docstrings).
- **CAT-01/02/03 fully covered.** `categories.list_categories(*, include_archived=False)` → ordered list (kind ASC: expense first, sort_order ASC, name ASC), `create_category`, `update_category` (applies non-None fields from `CategoryUpdate.model_dump(exclude_unset=True)` — supports un-archive), `archive_category` (soft-delete via `is_archived=True`), `seed_default_categories` (idempotent: skips if `count(Category) > 0`), `get_or_404` (raises `CategoryNotFoundError`). `SEED_CATEGORIES` is a module-level constant: 14 entries (12 expense + 2 income, exact list from D-16 per CAT-03).
- **PER-01/02/03/05 covered.** `periods.create_first_period(starting_balance_cents, cycle_start_day)` calls `period_for(today_msk, cycle_start_day)` (today computed via `datetime.now(ZoneInfo(settings.APP_TZ)).date()` per APP_TZ='Europe/Moscow'), creates a `BudgetPeriod` row with `status=active`. `get_current_active_period` returns the most-recent active period (defensive ordering for Phase 5 rollover).
- **SET-01/D-17 boundary enforced.** `settings.update_cycle_start_day` updates `app_user.cycle_start_day` only — does NOT touch any `budget_period` row. AST verification confirms no `BudgetPeriod` symbol is imported (only `AppUser`, `select`, `AsyncSession` — full import list: `['sqlalchemy.select', 'sqlalchemy.ext.asyncio.AsyncSession', 'app.db.models.AppUser']`). Module docstring explicitly documents the boundary.
- **ONB-03/D-11 covered.** `telegram.bind_chat_id(*, tg_user_id, tg_chat_id)` performs a single-round-trip PostgreSQL UPSERT via `sqlalchemy.dialects.postgresql.insert(AppUser).values(...).on_conflict_do_update(index_elements=['tg_user_id'], set_={'tg_chat_id': tg_chat_id})`. Handles both cases atomically: pre-existing user row from `/me` upsert (UPDATE) and brand-new bot-first row (INSERT).
- **ONB-01 atomic orchestration covered.** `onboarding.complete_onboarding(*, tg_user_id, starting_balance_cents, cycle_start_day, seed_default_categories)` runs 4 steps in a single DB transaction (held by `get_db`):
  1. SELECT AppUser → raise `OnboardingUserNotFoundError` if missing.
  2. Check `user.onboarded_at` → raise `AlreadyOnboardedError` if already onboarded (D-10 / T-double-onboard).
  3. If flag set, call `cat_svc.seed_default_categories(db)` (idempotent inside service).
  4. Call `period_svc.create_first_period(db, ...)` to create the first period.
  5. Set `user.cycle_start_day = ...; user.onboarded_at = datetime.now(timezone.utc); flush()`.

  Returns `{period_id, seeded_categories, onboarded_at: iso-str}`. Atomicity covers T-onboarding-atomicity from 02-VALIDATION.md (any exception → `get_db` rolls back the entire transaction, no partial onboarding state persisted).
- **Threat register dispositions implemented.** All 6 STRIDE threats from the plan's `<threat_model>` are mitigated in code:
  - T-double-onboard → `user.onboarded_at is not None` check → `AlreadyOnboardedError` (route maps to 409).
  - T-onboarding-atomicity → single transaction owned by `get_db`; any failure rolls back all 4 steps.
  - T-cat-archive → `list_categories(*, include_archived=False)` default; explicit kwarg required to bypass.
  - T-seed-double-fire → `seed_default_categories` no-ops when `count(Category) > 0`.
  - T-chatbind-spoof → mitigation delegated to route-layer `verify_internal_token` (Plan 02-04); service trusts caller by design (also called from bot/tests).
  - T-settings-side-effect → AST-verified no BudgetPeriod import in settings.py.
- **Verified runtime behavior at module load + signature shape.** Successfully imported all 8 public symbols from `categories`, all 2 from `periods`, all 3 from `settings`, the `bind_chat_id` from `telegram`, all 3 from `onboarding`. `complete_onboarding` signature inspected: `(db: AsyncSession, *, tg_user_id: int, starting_balance_cents: int, cycle_start_day: int, seed_default_categories: bool) → dict`. `_today_in_app_tz()` returns `2026-05-03` (Europe/Moscow today) and `period_for(today, csd=5)` returns `(2026-04-05, 2026-05-04)` — period contains today as required.

## Task Commits

1. **Task 1: categories + periods + settings + telegram + __init__.py** — `8e488a1` (feat)
2. **Task 2: onboarding orchestrator (atomic 4-step)** — `0c2ae5e` (feat)

## Files Created/Modified

**Created (6):**
- `app/services/__init__.py` — package marker (3-line docstring)
- `app/services/categories.py` — SEED_CATEGORIES + 6 async funcs (list/create/get_or_404/update/archive/seed_default) + `CategoryNotFoundError` (~140 LOC)
- `app/services/periods.py` — `create_first_period` + `get_current_active_period` + `_today_in_app_tz` helper (~60 LOC)
- `app/services/settings.py` — `get_cycle_start_day` + `update_cycle_start_day` + `UserNotFoundError` (~70 LOC)
- `app/services/telegram.py` — `bind_chat_id` (PostgreSQL UPSERT via on_conflict_do_update) (~35 LOC)
- `app/services/onboarding.py` — `complete_onboarding` + `AlreadyOnboardedError` + `OnboardingUserNotFoundError` (~125 LOC)

**Modified:** none

## Decisions Made

- **Service layer is HTTP-framework-free.** The plan body originally specified `from fastapi import HTTPException, status` in `categories.get_or_404` and `settings._get_user_or_404`. The user-supplied success criterion ("Service layer is pure: no FastAPI imports, only SQLAlchemy + Pydantic + domain types") takes precedence over the plan body. Replaced with 4 domain exceptions:
  - `CategoryNotFoundError(category_id)` in `categories.py`
  - `UserNotFoundError(tg_user_id)` in `settings.py`
  - `AlreadyOnboardedError(tg_user_id, onboarded_at)` in `onboarding.py`
  - `OnboardingUserNotFoundError(tg_user_id)` in `onboarding.py` (replaces the plan's `ValueError` on missing user — typed exception is easier for the route layer to catch)

  Plan 02-04 (API routes) will need to install exception handlers / try-except blocks: `CategoryNotFoundError → 404`, `UserNotFoundError → 404`, `OnboardingUserNotFoundError → 404`, `AlreadyOnboardedError → 409`. This change makes the service layer reusable from worker jobs (Phase 5) and CLI (Phase 6+) without dragging FastAPI into non-HTTP contexts.
- **Kept the name `get_or_404` in `categories.py`** even though it no longer raises HTTPException directly — the suffix is a useful intent signal to the route layer ("calling this can raise a not-found-style exception"), and preserving the export contract from the plan's `<interfaces>` section avoids breaking downstream Plan 02-04 expectations.
- **Module-aliased import in `onboarding.py`:** `from app.services import categories as cat_svc` (not `from app.services.categories import seed_default_categories`). Avoids name-clash with the `seed_default_categories: bool` parameter in `complete_onboarding`'s signature. Plan body already used this pattern.
- **`get_current_active_period` orders by `period_start DESC LIMIT 1`** even though normally exactly one active period exists. Defensive against transient overlap during Phase 5 worker rollover (`close_period` job → create next period). Trivial cost; clean semantics.
- **Period overlap protection (T-active-overlap)** is delegated to the onboarding orchestrator's `user.onboarded_at IS NOT NULL` guard rather than duplicated in `periods.create_first_period`. Single source of truth (the user-onboarded flag) prevents state divergence between user and period rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical Correctness] Removed FastAPI imports from service layer**

- **Found during:** Task 1 (initial draft of `categories.py` followed plan body exactly with `from fastapi import HTTPException, status`).
- **Issue:** Plan body specified HTTPException raises in `categories.get_or_404` (line ~243 of plan) and `settings._get_user_or_404` (line ~377), but the user-supplied success criterion in the orchestrator prompt explicitly states: "Service layer is pure: no FastAPI imports, only SQLAlchemy + Pydantic + domain types". Following the plan body would have violated the operating contract.
- **Fix:** Introduced 4 domain exceptions (`CategoryNotFoundError`, `UserNotFoundError`, `AlreadyOnboardedError`, `OnboardingUserNotFoundError`). Each carries the relevant identifier (category_id / tg_user_id / onboarded_at) for the route layer to format the HTTP response. No `from fastapi import` anywhere in `app/services/`. Added explicit module docstrings explaining the pattern.
- **Files modified:** all 6 service files (designed from the start to avoid FastAPI imports after detecting the constraint conflict before commit).
- **Verification:** `grep -rc "from fastapi" app/services/` → 0 matches across all 6 files (verified post-Task-1 and post-Task-2).
- **Committed in:** `8e488a1` (Task 1: 3 of the 4 exceptions — Cat/User/no Onboarding ones), `0c2ae5e` (Task 2: AlreadyOnboardedError + OnboardingUserNotFoundError).

**2. [Rule 2 — Critical Correctness] Replaced plan-spec'd `ValueError` with typed `OnboardingUserNotFoundError` for missing user**

- **Found during:** Task 2 (drafting `onboarding.complete_onboarding`).
- **Issue:** Plan body specified `raise ValueError(f"AppUser with tg_user_id={tg_user_id} not found; ...")` for the missing-user case. ValueError is hard for the route layer to discriminate (could be raised by any inner call), so mapping it to a clean 404 reliably is fragile.
- **Fix:** Created `OnboardingUserNotFoundError(Exception)` with the same message; route layer can `except OnboardingUserNotFoundError` cleanly.
- **Files modified:** `app/services/onboarding.py` (Task 2).
- **Verification:** Both onboarding exceptions importable, both `issubclass(_, Exception)`.
- **Committed in:** `0c2ae5e` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 2 — critical correctness for the user's contract).
**Impact on plan:** Service layer is now truly framework-agnostic (reusable from worker/CLI/bot). Route layer in Plan 02-04 must install 4 exception handlers (or explicit try/except in handlers) — straightforward, ~12 LOC. No behavior change to clients; HTTP status codes will be identical (404 / 409). No scope creep.

## Issues Encountered

- **`uv` and `.venv` not available in worktree environment** (same as Plans 02-01 and 02-02): cannot run `uv run pytest` here. Mitigated by:
  - `python3 -c "import ast; ast.parse(...)"` on all 6 created files — all OK.
  - System `python3` (3.9.6) + system pydantic 2.11.10 + system sqlalchemy 2.0.49 + system fastapi 0.128.8 + system dateutil are available; all 6 service modules import successfully (despite production target being Python 3.12 in Docker per `pyproject.toml requires-python = ">=3.12"`).
  - Public exports verified by import + `inspect.signature` (`complete_onboarding` signature confirmed: `(db, *, tg_user_id, starting_balance_cents, cycle_start_day, seed_default_categories) → dict`, all kw-only after `db`).
  - `_today_in_app_tz()` smoke-test produces `2026-05-03` and `period_for(today, csd=5)` returns `(2026-04-05, 2026-05-04)` — period contains today as required.
  - Phase 1 / 02-02 module imports re-verified (`app.api.schemas.*`, `app.core.period`, `app.core.settings`, `app.db.models`) — none broken.
- **DB-backed integration tests cannot run here.** `tests/test_categories.py / test_periods.py / test_onboarding.py / test_settings.py / test_telegram_chat_bind.py` self-skip when `DATABASE_URL` is unset, and the worktree has no test PG container. They turn GREEN once Plan 02-04 wires the routes and a real PG is available (CI / docker-compose).

## Expected GREEN test execution (proper environment)

When run in a properly-configured Python 3.12 + uv environment with PG up and `alembic upgrade head` applied:

```bash
$ uv sync
$ DATABASE_URL=postgresql+asyncpg://... uv run pytest tests/test_period_engine.py tests/test_auth.py tests/test_health.py -x
```

**Expected:** All previous-wave tests still PASS (this plan only adds files under `app/services/`; no Phase 1 or 02-02 import path changes).

```bash
$ uv run pytest tests/test_categories.py tests/test_onboarding.py tests/test_settings.py tests/test_telegram_chat_bind.py -x
```

**Expected:** Still skipped (no routes yet) until Plan 02-04 wires the HTTP layer. The service layer itself is GREEN-ready and will be exercised end-to-end through the routes.

## User Setup Required

None. No new env vars, no new deps, no DB schema change. The plan is purely additive (new package `app/services/`).

## Next Phase Readiness

- **Plan 02-04 (API routes):** All 6 services ready for thin-router delegation. Routers should:
  - Inject `db: AsyncSession = Depends(get_db)` and `user: dict = Depends(get_current_user)` (Phase 1).
  - Translate Pydantic request bodies into kw-args for service calls.
  - Translate service return values via `CategoryRead.model_validate(...)`, `PeriodRead.model_validate(...)`, etc. (`from_attributes=True` is set on Read models from 02-02).
  - Install 4 exception handlers (or explicit try/except):
    - `CategoryNotFoundError` → `HTTPException(404, "Category {id} not found")`
    - `UserNotFoundError` → `HTTPException(404, "App user not found — call /me first")`
    - `OnboardingUserNotFoundError` → `HTTPException(404, "App user not found — call /me first")`
    - `AlreadyOnboardedError` → `HTTPException(409, "User already onboarded")`
  - For internal `/internal/telegram/chat-bind`: `Depends(verify_internal_token)` + delegate to `telegram.bind_chat_id`.
- **Plan 02-05 (bot):** No new service calls from bot in this wave. Bot's `/start` handler will POST to `/api/v1/internal/telegram/chat-bind` (Plan 02-04 endpoint), which delegates to `telegram.bind_chat_id`.
- **Phase 5 worker:** `periods.create_first_period` is templated for re-use as `create_next_period` (only difference: caller passes the post-current-end date instead of today_msk). The transaction-per-call pattern carries over directly.

**Blockers / concerns:**
- None for Plan 02-04. The 2 deviations (FastAPI-free services, typed onboarding exception) require Plan 02-04 to install exception handlers — this is a small, well-defined task explicitly enabled by the deviation, not a blocker.
- The DB-backed integration tests will continue to be skipped in the worktree until DATABASE_URL is set; this is the expected pattern from Phase 1.

## Self-Check: PASSED

**Files exist:**
- FOUND: app/services/__init__.py
- FOUND: app/services/categories.py
- FOUND: app/services/periods.py
- FOUND: app/services/settings.py
- FOUND: app/services/telegram.py
- FOUND: app/services/onboarding.py

**Commits exist:**
- FOUND: 8e488a1 (Task 1: categories + periods + settings + telegram + __init__.py)
- FOUND: 0c2ae5e (Task 2: onboarding orchestrator)

**Acceptance criteria (Task 1):**
- 5 files in app/services/ exist and are syntactically correct (ast.parse) ✓
- SEED_CATEGORIES has exactly 14 entries (12 expense + 2 income) ✓
- categories.py defines 6 public async functions (`grep -c "^async def"` == 6) ✓
- periods.py imports period_for (count == 1) ✓
- periods.py uses ZoneInfo (count == 2: import + usage) ✓
- telegram.py uses on_conflict_do_update (count == 1) ✓
- settings.py does not import BudgetPeriod (AST verified — imports list: `['sqlalchemy.select', 'sqlalchemy.ext.asyncio.AsyncSession', 'app.db.models.AppUser']`) ✓
- All imports resolve at runtime ✓

**Acceptance criteria (Task 2):**
- onboarding.py exists and is syntactically correct ✓
- Defines AlreadyOnboardedError class (count == 1) ✓
- Imports cat_svc + period_svc (count of `from app.services` == 2) ✓
- Checks user.onboarded_at (count of `onboarded_at` == 10 — well over 2) ✓
- Uses datetime.now(timezone.utc) (count of `timezone.utc` == 1) ✓
- All imports resolve and `AlreadyOnboardedError`/`OnboardingUserNotFoundError` are Exception subclasses ✓

**User-supplied success criteria:**
- All tasks committed with --no-verify ✓ (`8e488a1`, `0c2ae5e` — and SUMMARY commit pending)
- SUMMARY.md created and committed: pending in this run (will be committed next as docs commit)
- No mods to .planning/STATE.md / .planning/ROADMAP.md ✓ (`git status --short` shows only `app/services/*` and the upcoming SUMMARY)
- Service layer is pure: no FastAPI imports — `grep -rc "from fastapi" app/services/` == 0 across all 6 files ✓

**Plan-level verification:**
- All 6 files in app/services/ exist and syntactically correct ✓
- SEED_CATEGORIES has 14 entries ✓
- All import chains work (full `from app.services.* import *` chain verified) ✓
- AlreadyOnboardedError is Exception subclass ✓
- settings.py does not import BudgetPeriod (AST-verified) ✓
- Phase 1 / 02-02 modules still import cleanly ✓

---
*Phase: 02-domain-foundation-and-onboarding*
*Completed: 2026-05-02*
