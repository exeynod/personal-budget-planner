---
phase: 25-home-transactions-add-sheet
plan: 1
subsystem: api
tags: [pydantic, fastapi, actual-transaction, roundup, balance-delta, v1.0-wire]

# Dependency graph
requires:
  - phase: 22-backend-schema-logic-foundation
    provides: actual_transaction.account_id + parent_txn_id columns; ActualKind 4-valued PgEnum; create_actual_v10 service; SavingsConfig + roundup hook; Account.balance_cents delta-accounting; AccountNotFoundError + composite FK fk_actual_account_composite.
provides:
  - "POST /api/v1/actual accepts optional account_id; routes to create_actual_v10 (delta-balance + roundup hook) when present, legacy create_actual otherwise."
  - "ActualRead emits 4-valued kind enum (expense/income/roundup/deposit) + optional account_id + optional parent_txn_id — frontend can render TXN-V10-04 spec-tags."
  - "ActualCreate accepts new fields with strict validation (account_id gt=0, kind=Literal[4], extra='forbid')."
  - "Cross-tenant account_id surfaces as 404 (not 500 / IntegrityError) via service-level pre-validation."
  - "Backward-compat KindStr alias kept so internal_bot / planned-route imports do not churn."
affects:
  - 25-03-api-clients (web/iOS clients can now pass account_id + decode kind=roundup/deposit)
  - 25-04-web-home-view + 25-05-ios-home-view (rendering roundup/deposit spec-tags relies on ActualRead.kind)
  - 25-XX-add-sheet (FAB Add Sheet calls POST /actual with account_id to fire balance delta + roundup)

# Tech tracking
tech-stack:
  added: []  # no new dependencies
  patterns:
    - "Wire-level dispatch on optional body field (account_id) → service-version routing"
    - "Pre-validate composite-FK target via get_or_404 to translate IntegrityError → contract 404"
    - "Backward-compat type alias (KindStr = ActualKindStr) avoids cross-module rename churn"

key-files:
  created:
    - tests/api/test_actual_v10_extension.py  # 16 tests: 11 schema unit + 5 route integration
    - .planning/phases/25-home-transactions-add-sheet/deferred-items.md  # log of pre-existing test_actual_crud.py failure (out-of-scope)
  modified:
    - app/api/schemas/actual.py  # ActualKindStr (4-valued) + ActualCreate.account_id + ActualRead.{account_id,parent_txn_id} + extra='forbid'
    - app/api/routes/actual.py  # account_id-presence dispatch; AccountNotFoundError → 404 mapping; pre-validation guard

key-decisions:
  - "Keep KindStr = ActualKindStr alias instead of renaming all consumers — internal_bot / planned-route do not need 4-valued kind today; defer rename as cleanup."
  - "Pre-validate account ownership via accounts.get_or_404 BEFORE the parent INSERT — composite FK fk_actual_account_composite would otherwise raise IntegrityError → 500 instead of contracted 404 (T-25-01-01)."
  - "PATCH endpoint stays scoped to v0.x surface (no account_id in ActualUpdate). Phase 25 only requires create-flow extension; edit can remain legacy until Phase 26."
  - "BalanceCategoryRow.kind kept 2-valued (CategoryKind never roundup/deposit — they are transaction-side kinds applied to system 'savings' Category whose CategoryKind is still expense)."

patterns-established:
  - "Optional wire field → service-version dispatch: route inspects body.<feature_field>; absence → legacy path, presence → v10 path. Lets v0.x clients keep working untouched."
  - "Composite-FK error translation: route-layer get_or_404 turns DB-level FK violations into contracted HTTP 404 instead of 500."

requirements-completed:
  - ADD-V10-01
  - ADD-V10-02
  - ADD-V10-03
  - ADD-V10-04
  - ADD-V10-05
  - TXN-V10-04
  - HOME-V10-04

# Metrics
duration: 13min
completed: 2026-05-10
---

# Phase 25 Plan 1: Backend Actual v10 Extension Summary

**Extended `POST /api/v1/actual` schema and route so the v1.0 UI can pass `account_id` (firing delta-balance + roundup hook server-side) and so `ActualRead` emits the full 4-valued `kind` enum + `account_id` + `parent_txn_id` for spec-tag rendering — without breaking any v0.x client.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-10T11:52:10Z (commit `abe36a7`)
- **Completed:** 2026-05-10T12:04:12Z (commit `a4b63d0`)
- **Tasks:** 3 of 3 (TDD: RED + 2 GREEN)
- **Files modified:** 2 source + 1 test + 1 deferred-items

## Accomplishments

- `ActualCreate` / `ActualRead` / `ActualKindStr` extended with v10 surface (`account_id`, `parent_txn_id`, 4-valued kind enum) — additive, optional, backward-compat preserved via `KindStr = ActualKindStr` alias.
- `POST /api/v1/actual` dispatches on `body.account_id`: present → `create_actual_v10` (balance delta + roundup hook), absent → legacy `create_actual` (T-25-01-04 explicit fallback).
- Cross-tenant `account_id` returns clean `404` (`AccountNotFoundError`) instead of leaking the composite-FK `IntegrityError` → `500` (T-25-01-01 mitigation).
- `ConfigDict(extra='forbid')` on `ActualCreate` rejects unknown fields with `422` (T-25-01-02 — protects against typos and tampering).
- 16 new tests (11 schema unit + 5 DB-backed integration) all green against the full docker compose stack.

## Task Commits

Each task was committed atomically (TDD RED → GREEN cycle):

1. **Task 1 RED — failing tests for schema + route extension** — `abe36a7` (test)
2. **Task 1 GREEN — extend ActualCreate/ActualRead schema** — `4daea41` (feat)
3. **Task 2 + 3 GREEN — wire POST /actual dispatch + fix RED-stage fixture assumptions** — `a4b63d0` (feat)

_Note: Tasks 2 and 3 from the plan were collapsed into a single GREEN commit — Task 1 RED already included the integration tests required by Task 3 (single test file, simpler bookkeeping). The integration tests would not exercise the route until Task 2 implementation landed, so a single combined GREEN commit makes the RED → GREEN delta cleaner._

## Files Created/Modified

- `app/api/schemas/actual.py` — Added `ActualKindStr = Literal['expense','income','roundup','deposit']`, `ActualCreate.account_id: Optional[int] = Field(default=None, gt=0)` with `extra='forbid'`, `ActualRead.account_id` + `ActualRead.parent_txn_id`. Backward-compat `KindStr = ActualKindStr` alias. `BalanceCategoryRow.kind` deliberately kept 2-valued.
- `app/api/routes/actual.py` — Added `from app.services.accounts import AccountNotFoundError`. `create_actual` handler now branches on `body.account_id`: pre-validate via `accounts.get_or_404`, then dispatch to `actual_svc.create_actual_v10(..., account_id=...)`; legacy path unchanged when `account_id` is `None`. Added `AccountNotFoundError → 404` to the exception ladder.
- `tests/api/test_actual_v10_extension.py` — 16 tests covering all behavioral requirements (Layer 1: 11 schema units; Layer 2: 5 DB-backed integration). Mirrors `tests/api/test_accounts_api.py` `db_setup` pattern.
- `.planning/phases/25-home-transactions-add-sheet/deferred-items.md` — Log of pre-existing failure in `tests/test_actual_crud.py` (legacy fixture lacks `code` + `ord`, made NOT NULL by Phase 22 alembic 0013) — out of scope for this plan.

## Decisions Made

- **KindStr alias kept**: renaming all `KindStr` consumers (`internal_bot`, `planned`-route) would touch 5+ files for zero behavioral benefit. The 2-valued surface still works because `ActualKindStr` is a superset.
- **Pre-validation guard before parent INSERT**: the composite FK on `actual_transaction(account_id, user_id)` already catches cross-tenant attempts, but it raises `IntegrityError → 500`. Service-level `get_or_404` gives a clean `404` per REST contract (T-25-01-01).
- **PATCH stays v0.x**: `ActualUpdate` does NOT add `account_id`; phase 25 scope (TXN-V10-05) only needs create-flow extension. Edit endpoint can stay legacy until phase 26 if needed.
- **Single test file** (Layer 1 + Layer 2 in `test_actual_v10_extension.py`): the plan asked for separate Task 1 / Task 3 test artifacts, but in practice both layers test the same wire surface and benefit from shared imports + fixture proximity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Cross-tenant `account_id` returned 500 instead of 404**
- **Found during:** Task 2 GREEN (running `test_post_actual_cross_tenant_account_id_returns_404`).
- **Issue:** Service-layer `create_actual_v10` flushes the parent INSERT with the foreign `account_id` first; the DB-level composite FK `fk_actual_account_composite (account_id, user_id) → account` raises `IntegrityError`, which surfaces as `500`. The plan’s `<threat_model>` T-25-01-01 specifies `404` (account not found from caller’s perspective).
- **Fix:** Added `await accounts.get_or_404(db, user_id=user_id, account_id=body.account_id)` immediately before dispatching to `create_actual_v10`. This raises `AccountNotFoundError` first, mapped to `404` by the existing exception ladder.
- **Files modified:** `app/api/routes/actual.py`
- **Verification:** `test_post_actual_cross_tenant_account_id_returns_404` now green; full integration suite 16/16.
- **Committed in:** `a4b63d0`

**2. [Rule 1 — Bug] RED-stage fixture used non-existent `SavingsRoundupBase` enum**
- **Found during:** Task 2 GREEN (first integration run inside docker compose).
- **Issue:** I assumed `SavingsConfig.roundup_base` was a typed enum (`SavingsRoundupBase.r10`) — actually it is a plain `SmallInteger` with a CHECK constraint (`roundup_base IN (10, 50, 100)`).
- **Fix:** Changed fixture to pass `roundup_base=10` directly. Documented the unit (копейки vs рубли) ambiguity inline so future readers understand why the literal `10` works with the existing `compute_roundup_delta(amount_cents, base)`.
- **Files modified:** `tests/api/test_actual_v10_extension.py`
- **Verification:** Fixture now constructs `SavingsConfig` cleanly; downstream tests exercise the roundup path correctly (`amount=100_53`, `base=10` → `delta=7` → roundup child created).
- **Committed in:** `a4b63d0`

**3. [Rule 1 — Bug] RED-stage fixture missed `Category.ord` NOT NULL**
- **Found during:** Task 2 GREEN (second integration run inside docker compose).
- **Issue:** Phase 22 alembic 0013 made `category.ord CHAR(2) NOT NULL` with a CHECK on the format. The fixture omitted it → `NotNullViolationError` at INSERT.
- **Fix:** Added `ord="01"` (food cat) and `ord="99"` (savings cat) to fixture.
- **Files modified:** `tests/api/test_actual_v10_extension.py`
- **Verification:** All 5 integration tests green afterwards.
- **Committed in:** `a4b63d0`

---

**Total deviations:** 3 auto-fixed (all Rule 1 bug fixes)
**Impact on plan:** All three are necessary for correctness — none expand the wire contract or scope. The `404` translation closes a real T-25-01-01 mitigation gap that the plan explicitly mandated. The two fixture fixes correct my own RED-stage assumptions and are confined to the new test file.

## Issues Encountered

- **Worktree shared with another agent (plan 25-02):** The `v1.0-maximal-poster` branch in this worktree showed commits and stashes from a parallel `25-02-web-routing-bottomnav` execution. My Task 2 GREEN edits got temporarily stashed (twice — `git stash` is global per-repo even across worktrees) and had to be popped back. No data loss; final state correct. Documented for awareness but no action required by the plan.
- **Legacy `tests/test_actual_crud.py` fixture is pre-existing broken:** Its `seed_categories` fixture omits `code` + `ord` (made NOT NULL by Phase 22 alembic 0013). All 10 of its tests error at fixture setup. NOT caused by this plan — verified by reading commit history (`tests/test_actual_crud.py` not modified since 2026-04). Logged in `deferred-items.md` for a future quick-task sweep.

## User Setup Required

None — no external service configuration needed.

## Next Phase Readiness

- The v1.0 wire contract for `POST /api/v1/actual` and `ActualRead` is unblocked. Plans 25-03 (api clients), 25-04 (web home view), 25-05 (iOS home view) can now:
  - Pass `account_id` from the Add Sheet to fire balance + roundup hook automatically.
  - Read `kind ∈ {expense, income, roundup, deposit}` to render TXN-V10-04 spec-tags.
  - Read `parent_txn_id` to group roundup children with their expense parent.
- No backend blockers remain for HOME-V10-04 (wallet link sums `Σ account.balance_cents` — already exposed by `GET /accounts`).
- One out-of-scope follow-up logged in `deferred-items.md`: legacy `test_actual_crud.py` fixture needs `code` + `ord` backfill.

## Self-Check: PASSED

Verified before commit:
- All 3 task commits present in git log: `abe36a7`, `4daea41`, `a4b63d0` ✓
- Modified files exist on disk: `app/api/schemas/actual.py`, `app/api/routes/actual.py`, `tests/api/test_actual_v10_extension.py` ✓
- Plan verify items: 16/16 v10 tests green; `ActualCreate(kind='roundup', account_id=42)` validates; `account_id` appears 7× in schema (declared in `ActualCreate` + `ActualRead`); `create_actual_v10` referenced 2× in route ✓
- No accidental file deletions in `git diff ee2a423..HEAD --diff-filter=D` ✓

---
*Phase: 25-home-transactions-add-sheet*
*Completed: 2026-05-10*
