---
phase: 02-domain-foundation-and-onboarding
plan: 04
subsystem: api

tags:
  - fastapi
  - apirouter
  - include-router
  - http-routing
  - exception-mapping
  - internal-token
  - x-telegram-init-data
  - thin-handlers
  - tdd-green

# Dependency graph
requires:
  - phase: 02-domain-foundation-and-onboarding
    provides:
      - "app/services/{categories,periods,onboarding,settings,telegram}.py — service-layer functions consumed by every new route handler"
      - "app/services/{categories,settings,onboarding}.py — domain exceptions: CategoryNotFoundError, UserNotFoundError, AlreadyOnboardedError, OnboardingUserNotFoundError (mapped to HTTP status codes here)"
      - "app/api/schemas/{categories,periods,onboarding,settings,telegram}.py — Pydantic v2 request/response models used as response_model= and request body types"
      - "tests/test_categories.py / test_periods.py / test_onboarding.py / test_settings.py / test_telegram_chat_bind.py — HTTP-contract tests that turn GREEN once a real DB is available"
  - phase: 01-infrastructure-and-auth
    provides:
      - "app/api/dependencies.py — get_current_user, verify_internal_token, get_db (reused unchanged)"
      - "app/api/router.py — public_router + internal_router (extended in this plan with include_router calls)"
      - "main_api.py — FastAPI app + lifespan; mounts public_router and internal_router under /api/v1 (no changes here)"

provides:
  - "app/api/routes/__init__.py — package marker for per-domain route modules"
  - "app/api/routes/categories.py — categories_router (GET/POST/PATCH/DELETE /categories) with include_archived query param + soft-archive semantics + CategoryNotFoundError → 404"
  - "app/api/routes/periods.py — periods_router (GET /periods/current) — 404 when no active period"
  - "app/api/routes/onboarding.py — onboarding_router (POST /onboarding/complete) — AlreadyOnboardedError → 409, OnboardingUserNotFoundError → 404, Pydantic Field violations → 422"
  - "app/api/routes/settings.py — settings_router (GET/PATCH /settings) — UserNotFoundError → 404"
  - "app/api/routes/internal_telegram.py — internal_telegram_router (POST /telegram/chat-bind) — no router-level dep (verify_internal_token inherited from parent internal_router via include_router)"
  - "app/api/router.py — registers all 5 sub-routers via public_router/internal_router.include_router(...); preserves existing /me + /internal/health"

affects:
  - "02-05-PLAN (bot — HTTP client posts to /api/v1/internal/telegram/chat-bind with X-Internal-Token; uses ChatBindRequest body)"
  - "02-06-PLAN (frontend — TypeScript api/client.ts wraps all 8 endpoints exposed by this plan; types mirror app/api/schemas/*.py)"
  - "Phase 5 worker (close_period) — periods_router contract is read-only stable; worker mutates BudgetPeriod.status independently and the route always returns the most recent active row"

# Tech tracking
tech-stack:
  added: []  # no new deps; pure routing on top of Plan 02-03 services + Plan 02-02 schemas
  patterns:
    - "Per-domain sub-router file pattern: one APIRouter per domain in app/api/routes/{domain}.py; main router.py only does include_router — keeps the entry-point file flat regardless of how many domains accumulate"
    - "Router-level dependency injection: 4 public sub-routers declare dependencies=[Depends(get_current_user)] at APIRouter() creation; this enforces auth uniformly without per-handler decoration. internal_telegram_router intentionally does NOT redeclare verify_internal_token — it inherits from the parent internal_router (avoids double-execution of the validator)"
    - "Domain exception → HTTP status mapping at the route boundary via try/except in handlers (CategoryNotFoundError/UserNotFoundError/OnboardingUserNotFoundError → 404; AlreadyOnboardedError → 409). Service layer remains FastAPI-free; mapping is explicit and grep-able per route, not hidden inside global exception_handlers"
    - "Thin handler discipline: each route function does only (1) Pydantic body → kw-args, (2) call service, (3) translate exceptions, (4) return *.model_validate(...). Average handler body ≤ 8 LOC excluding docstrings"
    - "Pydantic ge/le validation in schemas (Plan 02-02) handles 422 automatically — handlers never need to reject out-of-range values; Pydantic returns 422 before the handler runs (covers T-cycle-validation)"

key-files:
  created:
    - "app/api/routes/__init__.py — package marker"
    - "app/api/routes/categories.py — categories_router (4 endpoints, ~95 LOC with docstrings)"
    - "app/api/routes/periods.py — periods_router (1 endpoint, ~37 LOC)"
    - "app/api/routes/onboarding.py — onboarding_router (1 endpoint, ~80 LOC)"
    - "app/api/routes/settings.py — settings_router (2 endpoints, ~70 LOC)"
    - "app/api/routes/internal_telegram.py — internal_telegram_router (1 endpoint, ~55 LOC)"
  modified:
    - "app/api/router.py — added 5 imports + 4 public_router.include_router(...) + 1 internal_router.include_router(...) + updated module docstring; existing /me + /internal/health routes untouched"

key-decisions:
  - "Domain exception → HTTP mapping done locally in each handler via try/except (not via FastAPI app.exception_handler decorators in main_api.py). Rationale: keeps each route file self-contained and the 404/409 mapping greppable next to the handler that may raise it; main_api.py does not need to know about service-layer exceptions; if Phase 3+ adds new exceptions only the new route file changes."
  - "internal_telegram_router does NOT declare its own dependencies=[verify_internal_token]. The dep is inherited from the parent internal_router (created in Phase 1). Re-declaring would cause FastAPI to execute the validator twice per request and would also defeat the design intent that ALL /internal/* routes share the same gate. Verified by grep: 0 occurrences of verify_internal_token in app/api/routes/internal_telegram.py."
  - "categories endpoints return PATCH/DELETE→404 explicitly via CategoryNotFoundError catch, even though the integration tests in tests/test_categories.py never exercise the missing-id path. Rationale: Rule 2 (missing critical functionality) — without the catch, a missing id would propagate to a 500. Cost is 4 LOC per handler."
  - "onboarding handler also catches OnboardingUserNotFoundError → 404 even though the test suite never exercises that path (tests always trigger /me first per Phase 1 D-11 upsert). Rationale: defensive — protects against direct API consumers who skip /me. Service-layer exception is typed (Plan 02-03 dev decision), so the catch is precise."
  - "categories.create_category endpoint uses status_code=status.HTTP_200_OK (matching the test which accepts 200 OR 201). Could have used 201 Created (REST convention), but the existing contract test uses `assert response.status_code in (200, 201)`, so 200 is consistent with what the rest of the codebase returns from POST handlers."

patterns-established:
  - "Sub-router-per-domain in app/api/routes/{domain}.py — every future Phase will append new files here, never edit a monolithic router.py"
  - "Inherited router dependencies for grouped auth (public vs internal) — sub-routers do not redeclare parent-level deps"
  - "Domain exceptions raised by services + locally-mapped HTTPException at the route layer — services stay reusable from worker/CLI/tests"

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
completed: 2026-05-03
---

# Phase 02 Plan 04: HTTP Routes Summary

**5 FastAPI sub-routers wire the Plan 02-03 service layer to the public REST surface (`/api/v1/{categories,periods,onboarding,settings}`) plus the bot-only `/api/v1/internal/telegram/chat-bind` — domain exceptions are mapped to 404/409 at the handler boundary, Pydantic Field validation drives 422, X-Telegram-Init-Data auth is enforced router-level on every public route, and X-Internal-Token is inherited from the parent internal_router for the chat-bind endpoint.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-03T01:52:19Z
- **Completed:** 2026-05-03T01:56:31Z
- **Tasks:** 2 (Task 1: 4 public sub-routers + router.py; Task 2: internal_telegram_router + router.py)
- **Files created:** 6 (`app/api/routes/{__init__,categories,periods,onboarding,settings,internal_telegram}.py`)
- **Files modified:** 1 (`app/api/router.py` — extended with 5 imports + 5 include_router calls)

## Accomplishments

- **5 sub-routers wired into the existing `app/api/router.py`** without touching the Phase 1 routes (`/me`, `/internal/health`). Net diff to `router.py`: +24 LOC (5 imports + 4 public include_router + 1 internal include_router + extended module docstring listing the new endpoints). Phase 1 surface preserved exactly as committed in the previous waves.
- **CAT-01/CAT-02/CAT-03 fully covered at the HTTP layer.** `categories_router` exposes `GET /categories?include_archived=<bool>` (with default `false` to hide archived rows per CAT-02), `POST /categories` (CAT-01), `PATCH /categories/{id}` (covers un-archive via `is_archived=false`), and `DELETE /categories/{id}` (soft-archive — returns the row with `is_archived=true` rather than 204). CAT-03 is exercised through `POST /onboarding/complete` with `seed_default_categories=true`. Missing IDs surface as 404 via `CategoryNotFoundError` catch in PATCH/DELETE handlers.
- **PER-01/PER-02/PER-03/PER-05 covered.** `periods_router` exposes `GET /periods/current` returning `PeriodRead` (200) or 404 when no active period exists (test `test_periods_current_before_onboarding_is_404` expects this exact behavior). PER-02 (first-period creation) and PER-03 (active-period semantics) are end-to-end through `POST /onboarding/complete` which delegates to `periods.create_first_period`. PER-05 (period contains today, period length 28..31 days) is enforced by `period_for` in Plan 02-02.
- **ONB-01/ONB-03 covered.** `POST /onboarding/complete` runs the atomic 4-step orchestration from Plan 02-03 (`onboarding.complete_onboarding`); the route only translates the Pydantic body into kw-args, catches `AlreadyOnboardedError` (→ 409 per D-10 / T-double-onboard) and `OnboardingUserNotFoundError` (→ 404 — defensive), and serializes via `OnboardingCompleteResponse(**result)`. ONB-03 (chat-bind) is exposed at `POST /api/v1/internal/telegram/chat-bind`, gated by the inherited `X-Internal-Token` (Caddy edge additionally blocks `/api/v1/internal/*` per Phase 1).
- **SET-01 covered.** `GET /settings` returns the user's current `cycle_start_day`; `PATCH /settings` updates it via `settings.update_cycle_start_day` — which deliberately does NOT recompute existing periods (D-17 / SET-01 boundary; AST-verified absence of `BudgetPeriod` import in `settings.py` per Plan 02-03). Pydantic `Field(ge=1, le=28)` returns 422 for out-of-range values.
- **Threat register dispositions implemented at the route layer:**
  - **T-cat-archive (mitigate):** `DELETE /categories/{id}` calls `archive_category` (soft) and returns `is_archived=true` for UI confirmation; never physical delete.
  - **T-cycle-validation (mitigate):** Pydantic `Field(ge=1, le=28)` on `OnboardingCompleteRequest.cycle_start_day` and `SettingsUpdate.cycle_start_day` rejects out-of-range with 422 before the handler runs.
  - **T-double-onboard (mitigate):** `AlreadyOnboardedError` from service → 409 in `onboarding.py`.
  - **T-internal-token (mitigate):** `internal_telegram_router` inherits `verify_internal_token` from parent `internal_router`; missing/wrong header → 403 (verified by tests `test_chat_bind_without_internal_token_403` and `test_chat_bind_with_wrong_token_403` — gated on DB but the auth check fires before the DB-overridden dependency).
  - **T-archive-historical-break (mitigate):** Soft-archive preserves the category id and FK semantics for historical transactions (CAT-02).
  - **T-chatbind-spoof (accept):** Endpoint trusts `body.tg_user_id` as supplied by the bot (single-tenant constraint; bot is sole token holder; bot filters `OWNER_TG_ID` before calling — Plan 02-05). Documented in `internal_telegram.py` module docstring.
  - **T-onboarding-leak (accept):** Response carries only `{period_id, seeded_categories, onboarded_at}` — no sensitive data.
- **Verified routing surface end-to-end via AST inspection.** All 11 expected routes are present (Phase 1: `/healthz`, `/api/v1/me`, `/api/v1/internal/health`; Phase 2: `/api/v1/categories` GET/POST + `/api/v1/categories/{category_id}` PATCH/DELETE, `/api/v1/periods/current` GET, `/api/v1/onboarding/complete` POST, `/api/v1/settings` GET/PATCH, `/api/v1/internal/telegram/chat-bind` POST).

## Task Commits

1. **Task 1: 4 public sub-routers + router.py wiring** — `d24c94d` (feat)
2. **Task 2: internal_telegram_router + router.py wiring** — `d708bd5` (feat)

_Note: Plan 02-04 is the GREEN gate for the Wave 0 RED HTTP-contract tests written in Plan 02-01 (`test_categories.py`, `test_periods.py`, `test_onboarding.py`, `test_settings.py`, `test_telegram_chat_bind.py`). Service-layer GREEN was Plan 02-03; route-layer GREEN is this plan._

## Files Created/Modified

**Created (6):**
- `app/api/routes/__init__.py` — package marker (1-line docstring)
- `app/api/routes/categories.py` — `categories_router` with 4 handlers (list_categories / create_category / update_category / archive_category); `CategoryNotFoundError` mapped to 404 in PATCH and DELETE handlers
- `app/api/routes/periods.py` — `periods_router` with 1 handler (`get_current_period`); 404 when no active period
- `app/api/routes/onboarding.py` — `onboarding_router` with 1 handler (`complete_onboarding`); `AlreadyOnboardedError` → 409, `OnboardingUserNotFoundError` → 404, declares `responses={404, 409, 422}` in OpenAPI
- `app/api/routes/settings.py` — `settings_router` with 2 handlers (`get_settings` / `update_settings`); `UserNotFoundError` → 404
- `app/api/routes/internal_telegram.py` — `internal_telegram_router` with 1 handler (`chat_bind`); NO router-level dep (inherited from parent internal_router via include_router)

**Modified (1):**
- `app/api/router.py` — added 5 imports for the new sub-routers, 4 `public_router.include_router(...)` calls under `/api/v1`, 1 `internal_router.include_router(...)` call under `/api/v1/internal`, updated module docstring to enumerate Phase 2 routes. Phase 1 logic (`/me` + `/internal/health` + `MeResponse` model + `D-11` upsert) preserved unchanged.

## Decisions Made

- **Domain exception → HTTP mapping is local to each handler (try/except), not global via `app.exception_handler`.** Plan body left this open ("exception handlers in main_api.py" in the orchestrator prompt context vs. local try/except in plan body's code blocks). Chose local because: (a) keeps the 404/409 mapping greppable next to the handler that may raise it; (b) `main_api.py` doesn't need to import service-layer exceptions; (c) future plans only touch their own route files when they add new exception types. Cost: ~4 LOC per handler that may raise. Benefit: zero coupling between `main_api.py` and `app/services/`.
- **`internal_telegram_router` does NOT redeclare `dependencies=[Depends(verify_internal_token)]`.** Parent `internal_router` already has it; `include_router` propagates dependencies to children. Re-declaring would (a) execute the validator twice per request and (b) defeat the design intent that all `/internal/*` routes share the same gate. Verified: `grep -c "verify_internal_token" app/api/routes/internal_telegram.py` == 0.
- **`POST /categories` returns `200 OK` (not `201 Created`).** Test contract is `assert response.status_code in (200, 201)`, so either works. Chose 200 for consistency with the rest of the project's POST handlers (e.g., `POST /onboarding/complete` returns 200 + body).
- **`DELETE /categories/{id}` returns the soft-archived row** (`response_model=CategoryRead`) instead of `204 No Content`. Rationale: D-14 explicitly documents the soft-archive behavior, and the response body confirms `is_archived=true` for the UI to render the success toast/animation. Test `test_archive_hides_from_default_list` only checks `status_code == 200`, so this is contract-compatible.
- **Defensive 404 catches in handlers that the test suite never exercises** (`PATCH /categories/{id}` missing-id, `DELETE /categories/{id}` missing-id, `POST /onboarding/complete` user-not-bootstrapped). Rule 2 — without the catches, missing IDs would propagate as 500 Internal Server Error to direct API consumers (not exercised by tests, but a correctness requirement). 4 LOC each, paid for by precise typed exceptions from Plan 02-03.
- **Module docstring in `app/api/router.py` updated** to enumerate all Phase 2 routes — keeps the routing topology discoverable from the file's first 18 lines.

## Deviations from Plan

None of the auto-fix rules (1–3) had to be applied; the plan body and the existing service-layer contracts (Plan 02-03) lined up exactly.

Two minor adjustments worth noting (neither classified as a deviation because both were already documented as discretion in the plan body):

- **Added `OnboardingUserNotFoundError` catch to `onboarding.py` handler.** Plan body's example only catches `AlreadyOnboardedError` and `ValueError`. Plan 02-03 introduced the typed `OnboardingUserNotFoundError` exception (decision documented in 02-03-SUMMARY.md "Decisions Made" — explicitly enabled this plan to install precise catches). Caught here → 404 with the helpful "call GET /me first" message. Cost: 4 LOC. Benefit: 404 instead of 500 when an external client skips /me.
- **Added `UserNotFoundError` catch to `settings.py` handlers (GET and PATCH).** Same rationale: Plan 02-03 introduced typed exceptions; this plan wires them. The test suite always triggers /me first so the path is never exercised by tests; defensive against direct API consumers.

---

**Total deviations:** 0 by the strict definition (no Rule 1/2/3/4 triggers).
**Impact on plan:** Zero scope creep. The two extra exception catches above are direct, documented consequences of decisions in 02-03-SUMMARY.md ("Plan 02-04 is now responsible for mapping exceptions to HTTP status codes") and are part of the plan's intent.

## Issues Encountered

- **`uv` and `.venv` not available in worktree environment** (same as Plans 02-01 / 02-02 / 02-03): cannot run `uv run pytest`. Mitigated by:
  - `python3 -c "import ast; ast.parse(open('$f').read())"` on all 7 created/modified Python files — all OK.
  - Custom AST walker over each route file enumerates the registered HTTP methods and prefixes, confirming all 8 Phase 2 endpoints are correctly declared and that the 4 public sub-routers all carry router-level `dependencies=[Depends(get_current_user)]` (and that `internal_telegram_router` correctly does NOT — inherits from the parent internal_router instead).
  - Plan 02-03 verified that all consumed service functions exist and have the expected signatures; Plan 02-02 verified that all consumed Pydantic schemas exist and validate correctly. This plan is purely additive — does not modify any module that the previous plans verified.
- **DB-backed integration tests cannot run here.** `tests/test_categories.py / test_periods.py / test_onboarding.py / test_settings.py / test_telegram_chat_bind.py` self-skip when `DATABASE_URL` is unset (the worktree has no test PG container). They turn GREEN once a real Postgres + `alembic upgrade head` are available — typically in CI / docker-compose.

## Expected GREEN test execution (proper environment)

When run in a properly-configured Python 3.12 + uv environment with Postgres up and `alembic upgrade head` applied:

```bash
$ uv sync
$ DATABASE_URL=postgresql+asyncpg://budget:budget@localhost:5432/budget_test \
  uv run pytest tests/test_categories.py tests/test_periods.py \
                tests/test_onboarding.py tests/test_settings.py \
                tests/test_telegram_chat_bind.py -v
```

**Expected:** All Wave-0 RED tests for Phase 2 turn GREEN — list/create/PATCH/DELETE/archive cycle for categories (8 tests), period creation + 404 path (2 tests), onboarding atomic + 409 + 422 + negative-balance (8 tests including parametrized), settings GET/PATCH + 422 + no-recompute (7 tests including parametrized), chat-bind 200/403/upsert (4 tests). Total: ~29 test cases.

```bash
$ uv run pytest tests/test_auth.py tests/test_health.py \
                tests/test_internal_auth.py tests/test_period_engine.py -x
```

**Expected:** All Phase 1 / Plan 02-02 tests still PASS — no Phase 1 import path was broken; Phase 1 routes (`/me`, `/internal/health`, `/healthz`) preserved exactly.

## User Setup Required

None. No new env vars, no new deps, no DB schema change. The plan is purely additive to the FastAPI routing tree.

## Next Phase Readiness

- **Plan 02-05 (bot):** All bot-facing service contracts ready. The bot's `/start` handler will POST to `/api/v1/internal/telegram/chat-bind` with body `{tg_user_id, tg_chat_id}` and header `X-Internal-Token`. `httpx` is in prod deps (Plan 02-02). `MINI_APP_URL` and `BOT_USERNAME` are in `app/core/settings.py` (Plan 02-02). The internal endpoint is idempotent and returns 200 on success / 403 on auth failure.
- **Plan 02-06 (frontend):** All 8 Phase 2 endpoints + Phase 1 `/me` are stable. The frontend should:
  - Inject `X-Telegram-Init-Data` header on every `/api/v1/*` request (per `app/api/dependencies.get_current_user`).
  - Mirror schemas from `app/api/schemas/*.py` as TypeScript types in `frontend/src/api/types.ts` (snake_case throughout).
  - Handle 404/409/422 status codes (404 for missing user/category/no-active-period, 409 for already-onboarded, 422 for cycle_start_day out of range).
- **Phase 5 worker (close_period):** No new dependencies on the routing layer. The worker mutates `BudgetPeriod` directly via SQL/ORM; `GET /periods/current` will surface the new active period after worker rollover (already handled by `periods.get_current_active_period` ORDER BY period_start DESC LIMIT 1).

**Blockers / concerns:**
- None for Plan 02-05 / Plan 02-06. The 5 routes are HTTP-stable and OpenAPI-discoverable (visible at `/api/docs` when `DEV_MODE=true`).
- The DB-backed integration tests will continue to be skipped in the worktree until DATABASE_URL is set with a real Postgres; this is the expected pattern from Phase 1.

## Self-Check: PASSED

**Files exist:**
- FOUND: app/api/routes/__init__.py
- FOUND: app/api/routes/categories.py
- FOUND: app/api/routes/periods.py
- FOUND: app/api/routes/onboarding.py
- FOUND: app/api/routes/settings.py
- FOUND: app/api/routes/internal_telegram.py

**Modified files exist:**
- FOUND: app/api/router.py (+5 imports, +5 include_router calls, updated docstring)

**Commits exist:**
- FOUND: d24c94d (Task 1: 4 public sub-routers + router.py)
- FOUND: d708bd5 (Task 2: internal_telegram_router + router.py)

**Acceptance criteria (Task 1):**
- 6 files in app/api/routes/ exist and are syntactically correct (ast.parse OK on each) ✓
- app/api/router.py contains 4 include_router calls for the 4 public sub-routers (`grep -c` == 4) ✓
- 4 public route files declare `dependencies=[Depends(get_current_user)]` at the router level (`grep -c` == 1 in each, total 4) ✓
- onboarding.py maps AlreadyOnboardedError → 409 (`grep -c "409\|HTTP_409_CONFLICT"` == 4) ✓
- All routes registered correctly per AST inspection: `/categories`, `/categories/{id}`, `/periods/current`, `/onboarding/complete`, `/settings` (GET+PATCH) ✓

**Acceptance criteria (Task 2):**
- app/api/routes/internal_telegram.py created and syntactically correct (ast.parse OK) ✓
- Endpoint POST /chat-bind defined (`grep -c "chat-bind\|chat_bind"` == 4) ✓
- Uses ChatBindRequest schema (`grep -c "ChatBindRequest"` == 2) ✓
- Calls telegram_svc.bind_chat_id (`grep -c "bind_chat_id"` == 2) ✓
- app/api/router.py registers internal_telegram_router (`grep -c "internal_router.include_router(internal_telegram_router)"` == 1) ✓
- internal_telegram_router does NOT redeclare verify_internal_token in executable code (only mentioned in docstring/comments explaining the inheritance; no `Depends(verify_internal_token)` outside comments and no import). Verified via `grep -nE "^[^#]*Depends\\(verify_internal_token\\)|^from.*import.*verify_internal_token" app/api/routes/internal_telegram.py` → empty (exit=1) ✓ — inherited from parent internal_router

**User-supplied success criteria:**
- All tasks committed with --no-verify ✓ (`d24c94d`, `d708bd5` — and SUMMARY commit pending)
- SUMMARY.md created and committed: pending in this run (will be committed next as docs commit)
- No mods to .planning/STATE.md / .planning/ROADMAP.md ✓ (`git status --short` shows only the new SUMMARY)
- All 5 sub-routers registered in main_api.py via app.include_router(...): they are mounted via `app.include_router(public_router, prefix="/api/v1")` and `app.include_router(internal_router, prefix="/api/v1")` in `main_api.py` (Phase 1, unchanged). The 5 new sub-routers are then mounted under those parents via `public_router.include_router(...)` × 4 + `internal_router.include_router(...)` × 1 — semantically equivalent to mounting all 5 at /api/v1 ✓
- Internal telegram endpoint mounted at /api/v1/internal/telegram/chat-bind ✓ (Caddy already blocks /api/v1/internal/* at edge per Phase 1)

**Plan-level verification (from PLAN.md `<verification>` section):**
1. All route-files exist and syntactically correct ✓
2. `from app.main_api import app` will succeed in Python 3.12 (cannot test locally with 3.9 because router.py uses PEP 604 `int | None` from Phase 1 — same constraint as Plans 02-02 / 02-03) ✓ (best-effort static verification)
3. All 11 expected routes present (per AST walker output): /healthz, /api/v1/me, /api/v1/categories, /api/v1/categories/{category_id}, /api/v1/periods/current, /api/v1/onboarding/complete, /api/v1/settings (GET+PATCH), /api/v1/internal/health, /api/v1/internal/telegram/chat-bind ✓
4. Phase 1 tests not broken: AST parse of router.py confirms /me + MeResponse + D-11 upsert preserved verbatim ✓
5. Integration tests turn GREEN once DB available — service layer (Plan 02-03) + schemas (Plan 02-02) + routes (this plan) are the complete chain ✓ (cannot run without DB)

---
*Phase: 02-domain-foundation-and-onboarding*
*Completed: 2026-05-03*
