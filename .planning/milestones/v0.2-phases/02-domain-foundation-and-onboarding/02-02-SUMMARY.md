---
phase: 02-domain-foundation-and-onboarding
plan: 02
subsystem: api

tags:
  - python-dateutil
  - httpx
  - pydantic-v2
  - period-engine
  - schemas
  - tdd-green

# Dependency graph
requires:
  - phase: 02-domain-foundation-and-onboarding
    provides:
      - "tests/test_period_engine.py — 9 parametrized contract tests for period_for + 2 sanity invariants"
      - "tests/test_categories.py / test_periods.py / test_onboarding.py / test_settings.py / test_telegram_chat_bind.py — schema-shape contracts"
  - phase: 01-infrastructure-and-auth
    provides:
      - "app/core/settings.py with pydantic-settings BaseSettings (extended here with MINI_APP_URL + BOT_USERNAME)"
      - "app/db/models.py with AppUser, Category, BudgetPeriod, PeriodStatus, CategoryKind"
      - "pyproject.toml with pydantic 2.13.3, pydantic-settings 2.11.0 (extended here with python-dateutil + httpx prod)"

provides:
  - "app/core/period.py: pure function `period_for(date, cycle_start_day) -> tuple[date, date]` per HLD §3 — 9/9 parametrized cases + 2/2 sanity tests verified inline (test_period_engine.py turns GREEN)"
  - "python-dateutil 2.9.0.post0 added to prod deps; httpx 0.28.1 promoted from dev to prod (needed by bot api_client in Plan 02-05)"
  - "MINI_APP_URL setting (default 'https://localhost') and BOT_USERNAME setting (default 'tg_budget_planner_bot') added to Settings"
  - "app/api/schemas/ package (6 files) — Pydantic v2 request/response contracts: CategoryCreate/Update/Read, PeriodRead, OnboardingCompleteRequest/Response, SettingsRead/Update, ChatBindRequest"
  - "Field(ge=1, le=28) validation on cycle_start_day in OnboardingCompleteRequest + SettingsUpdate (drives 422 in test_settings::test_invalid_cycle_day, test_onboarding::test_invalid_day)"
  - "ConfigDict(from_attributes=True) on CategoryRead and PeriodRead for ORM round-trip"
  - "Bug fix in tests/test_period_engine.py: corrected one inconsistent expected value (d=2026-01-15, csd=31) that violated HLD §3 invariant"

affects:
  - "02-03-PLAN (services layer — uses period_for in onboarding service; uses all 9 schema classes)"
  - "02-04-PLAN (API routes — wires schemas as response_model and request body)"
  - "02-05-PLAN (bot — uses httpx prod dep + MINI_APP_URL + BOT_USERNAME settings)"
  - "02-06-PLAN (frontend — schema field names define TypeScript types in api/client.ts)"
  - "Phase 5 worker close_period (will reuse period_for for date math)"

# Tech tracking
tech-stack:
  added:
    - "python-dateutil 2.9.0.post0 (prod) — month arithmetic with relativedelta"
    - "httpx 0.28.1 (promoted from dev to prod) — bot ↔ api internal HTTP calls"
  patterns:
    - "Pure function in app/core/ for date logic (period_for) — no DB/IO, trivially unit-testable"
    - "Pydantic v2 schemas as one-file-per-domain in app/api/schemas/ (categories, periods, onboarding, settings, telegram)"
    - "String Literal types (Literal['expense', 'income']) instead of enum imports in API schemas — simpler JSON serialization, service layer converts to ORM enum"
    - "ConfigDict(from_attributes=True) on Read-models for ORM round-trip without explicit serializer"
    - "Defensive clamping in pure functions: period_for clamps cycle_start_day > last_day_of_month even though API layer enforces ≤28 — protects worker / direct invocations"

key-files:
  created:
    - "app/core/period.py — period_for() pure function + _clamp_day_to_month helper"
    - "app/api/schemas/__init__.py — package marker"
    - "app/api/schemas/categories.py — CategoryCreate/Update/Read"
    - "app/api/schemas/periods.py — PeriodRead"
    - "app/api/schemas/onboarding.py — OnboardingCompleteRequest/Response"
    - "app/api/schemas/settings.py — SettingsRead/Update"
    - "app/api/schemas/telegram.py — ChatBindRequest"
  modified:
    - "pyproject.toml — added python-dateutil + httpx to [project] dependencies"
    - "app/core/settings.py — added MINI_APP_URL + BOT_USERNAME"
    - "tests/test_period_engine.py — corrected one inconsistent expected value (Rule 1 fix)"

key-decisions:
  - "period_for clamps cycle_start_day > last_day_of_month rather than rejecting it, so worker/direct callers get a sensible result even if upstream Field validator is bypassed. Documented in docstring."
  - "Schema kind field uses Literal['expense', 'income'] string instead of importing CategoryKind enum — simpler JSON, service layer does the str→enum conversion."
  - "Field(ge=1, le=28) inlined on each schema (OnboardingCompleteRequest + SettingsUpdate) rather than via shared Annotated type — 2 occurrences don't justify abstraction; explicit is grep-able."
  - "Test bug found during execution (Rule 1 deviation): test_period_engine case `(date(2026,1,15), 31, date(2026,1,31), date(2026,2,27))` violated HLD §3 invariant 'period contains d' (Jan 15 < Jan 31). Corrected to `(date(2025,12,31), date(2026,1,30))` which contains d. Reference algorithm in 02-RESEARCH.md Pattern 4 produces this result."
  - "BOT_USERNAME added alongside MINI_APP_URL (not strictly in plan body, but plan section 2 says 'добавить также BOT_USERNAME' — done)."

patterns-established:
  - "TDD GREEN pattern: implementation written to satisfy pre-existing parametrized test; one inconsistent test case auto-corrected per Rule 1 with reasoning documented in commit message + this summary"
  - "All schema files include ASVS V5 Input Validation: name (min/max length), cycle_start_day (range), sort_order (ge=0)"

requirements-completed:
  - PER-01
  - PER-02
  - CAT-01
  - SET-01
  - ONB-01
  - ONB-03

# Metrics
duration: ~4min
completed: 2026-05-02
---

# Phase 02 Plan 02: Period Engine + Pydantic Schemas Summary

**Pure `period_for()` function (HLD §3, dateutil-backed) + 9 Pydantic v2 request/response schemas + python-dateutil/httpx prod deps + MINI_APP_URL setting; tests/test_period_engine.py turns GREEN (9 parametrized + 2 sanity, verified inline).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-02T22:30:49Z
- **Completed:** 2026-05-02T22:34:57Z
- **Tasks:** 2
- **Files created:** 7 (period.py + 6 schema files)
- **Files modified:** 3 (pyproject.toml, settings.py, test_period_engine.py)

## Accomplishments

- **`app/core/period.py` GREEN-implements PER-01 contract.** Pure function `period_for(d: date, cycle_start_day: int) -> tuple[date, date]` covers all 9 parametrized cases from `tests/test_period_engine.py`: HLD §3 examples (d=Feb 15, csd=5), boundary `d.day == csd`, boundary `d.day == csd-1`, leap-year Feb 29 with csd=31, year rollover (Dec→Jan), year rollunder (Jan→Dec), Feb-clamp (csd=28 in non-leap Feb), and previous-month clamp (csd=31 in Jan with d=Jan 15). Plus 2 sanity invariants (return type is `date`, period length 28..31 days).
- **6 Pydantic v2 schema files cover all Phase 2 endpoint contracts.** CategoryCreate/Update/Read with min/max-length name validation, sort_order ≥0, soft-archive flag; PeriodRead with optional ending_balance/closed_at; OnboardingCompleteRequest with cycle_start_day ∈ [1, 28]; SettingsRead/Update; internal ChatBindRequest. Read-models use `ConfigDict(from_attributes=True)` for ORM round-trip.
- **Dependencies aligned to Phase 2 needs.** `python-dateutil==2.9.0.post0` added (used by period.py); `httpx==0.28.1` promoted from `dev` to `[project] dependencies` (needed by `app/bot/api_client.py` in Plan 02-05).
- **Settings extended.** `MINI_APP_URL: str = "https://localhost"` (D-13) and `BOT_USERNAME: str = "tg_budget_planner_bot"` (used by bot UI). `.env.example` already had both placeholders from Phase 1.
- **Verified runtime: imports + Pydantic validation pass.** All 9 schema classes import; `SettingsUpdate(cycle_start_day=29)`, `SettingsUpdate(cycle_start_day=0)`, `OnboardingCompleteRequest(cycle_start_day=29)`, and `CategoryCreate(name="")` all raise `ValidationError`; happy-path `SettingsUpdate(15)`, `CategoryCreate("Test", "expense")`, `CategoryRead.model_validate(orm_obj)`, and `ChatBindRequest(...)` succeed.

## Task Commits

1. **Task 1: pyproject.toml + settings.py + period.py + test fix** — `45cb0a0` (feat)
2. **Task 2: app/api/schemas/ × 6 files** — `50f676c` (feat)

_Note: Plan 02-02 is the GREEN gate for Plan 02-01's RED test stubs (`test_period_engine.py`). TDD pattern across plans: 02-01 = test, 02-02 = feat (this plan)._

## Files Created/Modified

**Created (7):**
- `app/core/period.py` — `period_for()` + `_clamp_day_to_month()` helper, 80 LOC with docstrings
- `app/api/schemas/__init__.py` — package marker
- `app/api/schemas/categories.py` — `CategoryCreate`, `CategoryUpdate`, `CategoryRead` (3 classes; CategoryKindStr Literal alias)
- `app/api/schemas/periods.py` — `PeriodRead` (PeriodStatusStr Literal alias)
- `app/api/schemas/onboarding.py` — `OnboardingCompleteRequest`, `OnboardingCompleteResponse`
- `app/api/schemas/settings.py` — `SettingsRead`, `SettingsUpdate`
- `app/api/schemas/telegram.py` — `ChatBindRequest`

**Modified (3):**
- `pyproject.toml` — added `python-dateutil==2.9.0.post0` and `httpx==0.28.1` to `[project] dependencies`
- `app/core/settings.py` — added `MINI_APP_URL: str = "https://localhost"` and `BOT_USERNAME: str = "tg_budget_planner_bot"`
- `tests/test_period_engine.py` — corrected one inconsistent expected value (Rule 1 fix; details in Deviations)

## Decisions Made

- **`period_for` clamps `cycle_start_day` > last_day_of_month rather than raising.** Even though API layer enforces ≤ 28 via Field validator, the worker (Phase 5) and direct callers may pass arbitrary ints. Clamping keeps the function robust per HLD §3 contract. Only `cycle_start_day < 1` raises `ValueError` defensively.
- **Schema `kind` uses `Literal["expense", "income"]` not `CategoryKind` enum import.** Simpler JSON output (`"expense"` vs `{"value": "expense"}`), no schema-side enum class; service layer casts string → `CategoryKind(kind_str)`.
- **`Field(ge=1, le=28)` inlined twice (onboarding + settings) instead of shared `Annotated[int, ...]` type.** Two call sites don't justify abstraction layer; inline is grep-able and self-documenting.
- **`BOT_USERNAME` added alongside `MINI_APP_URL`.** Plan section 2 explicitly requested it ("Добавить также BOT_USERNAME"); used by bot start handler for display.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected inconsistent expected value in test_period_engine.py**
- **Found during:** Task 1 — running `period_for` against the 9 parametrized cases inline before commit revealed 1 failure.
- **Issue:** `tests/test_period_engine.py` case `(date(2026, 1, 15), 31, date(2026, 1, 31), date(2026, 2, 27), "Jan has 31, Feb 2026 (non-leap) has 28 — clamp")` expected `period_start = 2026-01-31`. But `d = 2026-01-15 < 2026-01-31`, so the period `[Jan 31, Feb 27]` does NOT contain d — violates HLD §3 invariant "the returned period contains d". The reference algorithm in 02-RESEARCH.md Pattern 4 (which Plan 02-02 explicitly mandates) produces `(2025-12-31, 2026-01-30)` for this input — that period DOES contain Jan 15.
- **Fix:** Updated test expected to `(date(2025, 12, 31), date(2026, 1, 30))` with corrected reasoning string `"csd=31, d=Jan 15 < Jan 31 → previous-month anchor Dec 31; period must contain d (HLD §3)"`. Re-verified all 9 cases now pass.
- **Files modified:** `tests/test_period_engine.py` (single tuple in CASES list)
- **Verification:** Inline runner shows `9 passed, 0 failed` for parametrized + `PASS` for both sanity tests.
- **Committed in:** `45cb0a0` (Task 1 commit; commit message documents the fix in detail)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 - bug)
**Impact on plan:** The fix reconciles a self-contradictory test case. Without it `tests/test_period_engine.py` would never be GREEN regardless of `period_for` implementation correctness, blocking Plan 02-02's success criterion. The corrected expected value matches the algorithm specified by 02-RESEARCH.md Pattern 4 (the canonical reference for this plan). No scope creep; no behavior change in production code.

## Issues Encountered

- **`uv` and `.venv` not available in worktree environment** (same as Plan 02-01): cannot run `uv sync` / `uv run pytest` here. Mitigated by:
  - Validating syntax via `python3 -c "import ast; ast.parse(...)"` on all 7 created/modified Python files.
  - Running `period_for` against all 9 test cases inline using system `python3` + system `python-dateutil` (which IS available locally) — all 9 + 2 sanity invariants pass.
  - Importing all 9 Pydantic schema classes via system pydantic 2.11.10 (close enough to spec'd 2.13.3 for syntax) and exercising 8 validation paths (4 should-fail, 4 should-pass) — all pass as expected.
  - `app.api.dependencies` import fails locally with `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` — that's a Python 3.9 vs 3.12 PEP 604 syntax issue in pre-existing Phase 1 code, NOT a regression from Plan 02-02 changes. Production runs Python 3.12 in Docker per `pyproject.toml requires-python = ">=3.12"`.
- **Acceptance criterion "uv lock"** could not be executed (uv not present). The `uv.lock` file does not exist in this repo (Phase 1 didn't generate it either), so adding new deps to `pyproject.toml` will be locked on first `uv sync` in Docker build per existing infrastructure pattern.

## Expected GREEN test execution (proper environment)

When run in a properly-configured Python 3.12 + uv environment:

```bash
$ uv sync
$ uv run pytest tests/test_period_engine.py -x -v
```

**Expected:** 11 PASSED (9 parametrized + 2 sanity). Independently verified inline against the implementation using system `python3` + `python-dateutil`.

```bash
$ uv run pytest tests/test_auth.py tests/test_health.py tests/test_internal_auth.py -x
```

**Expected:** Phase 1 tests still PASS — `app/core/settings.py` only adds two new fields (default-valued, no required-env change); no Phase 1 import path is broken.

## User Setup Required

None — no external service configuration required. The new `MINI_APP_URL` and `BOT_USERNAME` settings have safe defaults (`"https://localhost"` / `"tg_budget_planner_bot"`); production overrides via existing `.env` (placeholders already documented in `.env.example` from Phase 1).

## Next Phase Readiness

- **Plan 02-03 (services layer):** All Pydantic schemas are ready — services can use `OnboardingCompleteRequest`-derived params, return `CategoryRead.model_validate(orm)` from CRUD operations. `period_for` is importable from `app.core.period` for use in `complete_onboarding(...)` to compute first-period dates.
- **Plan 02-04 (API routes):** All 9 schemas ready as `response_model=` / request body types in route signatures.
- **Plan 02-05 (bot):** `httpx` available as prod dependency; `settings.MINI_APP_URL` available for `WebAppInfo(url=...)`; `settings.BOT_USERNAME` available for display.
- **Plan 02-06 (frontend):** Schema field names defined and stable — TypeScript types in `frontend/src/api/types.ts` should mirror these (snake_case, camelCase only at component layer if needed).

**Blockers / concerns:**
- None. The 1 test fix is self-contained and verified.
- The `uv.lock` regeneration on first Docker rebuild is expected behavior, not a blocker — Phase 1 followed the same pattern.

## Self-Check: PASSED

**Files exist:**
- FOUND: app/core/period.py
- FOUND: app/api/schemas/__init__.py
- FOUND: app/api/schemas/categories.py
- FOUND: app/api/schemas/periods.py
- FOUND: app/api/schemas/onboarding.py
- FOUND: app/api/schemas/settings.py
- FOUND: app/api/schemas/telegram.py

**Modified files exist:**
- FOUND: pyproject.toml (+2 deps)
- FOUND: app/core/settings.py (+2 fields)
- FOUND: tests/test_period_engine.py (1 tuple corrected)

**Commits exist:**
- FOUND: 45cb0a0 (Task 1: period_for + deps + settings + test fix)
- FOUND: 50f676c (Task 2: 6 schema files)

**Acceptance criteria (Task 1):**
- period.py syntactically valid ✓ (ast.parse OK)
- `def period_for` count == 1 ✓
- dateutil refs in period.py ≥ 1 ✓ (count=1, single import)
- python-dateutil in pyproject.toml ≥ 1 ✓ (count=1)
- httpx in [project] dependencies (before [project.optional-dependencies]) ✓ (line 15, before optional section)
- MINI_APP_URL in settings.py == 1 ✓
- MINI_APP_URL in .env.example == 1 ✓ (already present from Phase 1)
- GREEN test execution: verified inline with system python3 + dateutil → 9 parametrized PASS + 2 sanity PASS

**Acceptance criteria (Task 2):**
- 6 schema files syntactically valid ✓ (ast.parse OK on all 6)
- categories.py class count == 3 ✓ (CategoryCreate, CategoryUpdate, CategoryRead)
- onboarding.py Field(ge=1, le=28) ≥ 1 ✓
- settings.py Field(ge=1, le=28) ≥ 1 ✓
- categories.py from_attributes ≥ 1 ✓
- periods.py from_attributes ≥ 1 ✓
- All schemas import without errors ✓ (runtime test passed)
- SettingsUpdate(29) → ValidationError ✓
- CategoryCreate(name="") → ValidationError ✓
- CategoryRead.model_validate(orm_obj) round-trip works ✓

---
*Phase: 02-domain-foundation-and-onboarding*
*Completed: 2026-05-02*
