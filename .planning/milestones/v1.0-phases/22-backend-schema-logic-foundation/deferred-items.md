# Deferred Items — Phase 22

Out-of-scope discoveries logged during plan execution. Do not fix here;
schedule appropriately.

---

## D-22-01: `app/services/templates.py` legacy `PlanTemplateItem` import

**Discovered during:** Plan 22.10 execution (rollover service tests).
**Symptom:** Importing `app.main_api` (FastAPI app) raises:

```
ImportError: cannot import name 'PlanTemplateItem' from 'app.db.models'
  at app/services/templates.py:26
  via app/api/router.py → app/api/routes/templates.py → app.services.templates
```

**Root cause:** `PlanTemplateItem` was dropped in alembic 0013 / models.py
(per Phase 22 CONTEXT D-02), but `app/services/templates.py` and
`app/services/planned.py::get_template` still import it eagerly.

**Affected tests:** Anything that loads `app.main_api` via the
`async_client` fixture — including `tests/test_close_period_job.py`.

**Resolution path:** Plan 22.13 (route layer rewrite) is the canonical
home for dropping the templates router and the corresponding service
shim. Do not patch piecemeal in 22.10–22.12.

**Workaround in 22.10 tests:** `tests/jobs/test_close_period_rollover.py`
opens its own `SessionLocal` directly without booting the FastAPI app —
the rollover service is HTTP-agnostic so this is a clean isolation.

**Resolved by plan 22.13:** templates service rewritten as deprecation
stub; legacy /api/v1/template/* router returns empty list / 410 Gone;
`apply_template_to_period` no-ops without the dropped table; tests/helpers
truncate sets refreshed for v1.0 schema.

---

## D-22-02: Legacy `seed_default_categories` does not set `Category.code`/`ord`

**Discovered during:** Plan 22.13 execution (existing test surface re-run).
**Symptom:** `tests/test_actual_crud.py`, `tests/test_categories.py` and
several other legacy tests fail with `NotNullViolationError: null value
in column "code" of relation "category"` when they call
`seed_default_categories` or directly insert `Category(... name=, kind=,
sort_order=, ...)` without supplying `code`/`ord`.

**Root cause:** Alembic 0013 added `code TEXT NOT NULL` and `ord CHAR(2)
NOT NULL` (CONTEXT §Area 1 + §Area 2). The legacy seed function in
`app/services/categories.py::seed_default_categories` was not updated to
populate the new columns. Test fixtures that build `Category(...)` rows
manually likewise omit them.

**Resolution path:** Phase 23 (frontend integration) or a Phase 22 fixup
plan. Should:
1. Either drop the legacy `seed_default_categories` (not used by v1.0
   onboarding-complete) or extend it with auto-generated `code` from
   `name` (transliteration helper) and `ord` from `sort_order`.
2. Update test seeds to pass `code=` and `ord=` explicitly.

**Workaround in plan 22.13:** v1.0 routers + tests use the v1.0
onboarding-complete path which DOES set `code`/`ord` correctly. New tests
under `tests/api/test_*_v10_api.py` and `tests/api/test_subscriptions_post_api.py`
do not call legacy seed functions, so they are unaffected.

---

## D-22-03: Legacy onboarding test surface broken by v1.0 router replacement

**Discovered during:** Plan 22.13 execution.
**Symptom:** `tests/test_categories.py` (4 tests),
`tests/test_actual_crud.py` (10 errors), and any other legacy test that
POSTs `{starting_balance_cents, cycle_start_day, seed_default_categories}`
to `/api/v1/onboarding/complete` now receives 422 because the legacy
mount was REPLACED by `onboarding_v10_router` per CONTEXT D-04.

**Root cause:** CONTEXT D-04 explicitly drops v0.x backward compat for
the onboarding flow — the v1.0 body schema differs (income_cents,
accounts[], category_plans, ...).

**Resolution path:** Phase 23+ — rewrite legacy onboarding-using tests to
either (a) seed AppUser+Category+BudgetPeriod directly via fixtures, or
(b) use the v1.0 onboarding-complete body shape. The legacy
`onboarding_router` module is still importable from `app.api.routes.onboarding`
in case any test wants to mount it on a private FastAPI app for isolated
testing.

**Workaround in plan 22.13:** New tests use direct fixture seeding
(no onboarding-complete call needed). Legacy tests that depend on the
old endpoint are out of scope for this plan.

---

## D-22-04 (CR-04): Production `/api/v1/actual` routes do NOT update `account.balance_cents`

**Discovered during:** Phase 22 code review (`22-REVIEW.md` CR-04).
**Source:** `gsd-code-review-fix --auto` run on 2026-05-10.
**Status:** DEFERRED (intentional per plan 22.13 SUMMARY).

The legacy `/api/v1/actual` POST/PATCH/DELETE routes still call
`create_actual` / `update_actual` / `delete_actual` (no balance delta, no
roundup hook). The v1.0 versions `create_actual_v10` / `delete_actual_v10`
exist but are wired only into `post_subscription` and `create_deposit`.

**Why deferred:** switching production routes to v10 implementations is a
**wire-level breaking change**:

1. `ActualCreate` schema currently does not include `account_id`. v10
   contract requires it (BE-07 / DATA-MODEL §4). Adding it as
   `Optional[int]` would silently default to NULL — leaving balance still
   stale. Adding it as required would 422 every existing v0.6 iOS / bot
   client immediately.
2. The bot's `app/bot/handlers.py` builds the same `/api/v1/actual` payload
   without an account_id. Bot would need a "primary account fallback" or a
   migration to v10 path with explicit account selection.
3. Tests `tests/test_actual_crud.py` (~1k LoC) assume legacy semantics —
   would need a sweep to update payloads + assertions for balance side-
   effects.

**Mitigation already in place:**

- Onboarding seeds initial `account.balance_cents`; the legacy txn path does
  NOT corrupt it, only fails to keep it current. A reconciliation pass (or
  v1.0 cutover) is the recommended remediation.
- The deposit / roundup / subscription-post / rollover paths DO honour the
  v10 contract, so the "savings story" is correct end-to-end despite the
  txn drift.

**Resolution path:** Phase 23+ when the v1.0 web frontend lands and expects
v10 semantics from day one. Add a regression test asserting
`account.balance_cents` is unchanged by legacy POST/PATCH/DELETE so the gap
stays measurable until cutover.

---

## D-22-05 (WR-01): `_resolve_period_for_date` calls `db.rollback()` inside outer transaction

**Discovered during:** Phase 22 code review (`22-REVIEW.md` WR-01).
**Source:** `gsd-code-review-fix --auto` run on 2026-05-10.
**Status:** DEFERRED.

The fix requires migrating all five callers (`create_actual_v10`,
`create_deposit`, `update_actual`, `charge_subscription`,
`_close_period_for_user`) to use SAVEPOINT (`async with db.begin_nested()`)
so the concurrent-period-create race recovery does not nuke the outer
transaction. Cross-cutting change with subtle interaction with each
caller's own transaction-management style.

The race window is narrow (two requests in the same second resolving the
SAME tx_date that crosses an unmaterialised period boundary), and Phase 22
tests have not surfaced it in CI runs. Defer to a dedicated transaction-
hygiene phase where SAVEPOINT pattern can be applied uniformly.

---

## D-22-06 (WR-02): `accounts.create_account` two-statement demote+insert race

**Discovered during:** Phase 22 code review (`22-REVIEW.md` WR-02).
**Source:** `gsd-code-review-fix --auto` run on 2026-05-10.
**Status:** DEFERRED.

Same shape as D-22-05 — fix needs SAVEPOINT or a single CTE for atomic
demote+insert. Single-tenant deployment in MVP makes the race effectively
zero-probability (one human user); the partial-unique-index protects the DB
from corrupting the invariant even if both requests succeeded as a fluke.
Defer to multi-tenant phase or to the broader transaction-hygiene pass.

---

## D-22-07 (WR-03): `apply_balance_delta` ignores CHECK constraint surface

**Discovered during:** Phase 22 code review (`22-REVIEW.md` WR-03).
**Source:** `gsd-code-review-fix --auto` run on 2026-05-10.
**Status:** DEFERRED.

Adding `AccountBalanceOverflowError` requires:
1. New domain exception class in `app/services/accounts.py`.
2. `try/except IntegrityError` around the `UPDATE … RETURNING` with
   discrimination on the constraint name (only catch
   `ck_account_balance_range`, re-raise anything else).
3. Route-layer mapping in `app/api/routes/accounts.py` plus all callers
   (roundup, deposit, subscription post, rollover) that may now produce
   this error.
4. Tests for the overflow surface.

The bound (±100B kopeks = ±1B ₽) is unreachable for a personal budget
app — this is firmly a "future-proofing" tier improvement, not a v1.0
blocker.

---

## D-22-08 (WR-08): `internal_onboarding_router` uses raw `get_db`

**Discovered during:** Phase 22 code review (`22-REVIEW.md` WR-08).
**Source:** `gsd-code-review-fix --auto` run on 2026-05-10.
**Status:** DEFERRED.

The current code is **functionally correct** — `set_tenant_scope` runs
before any DB write inside `reset_v10`. The "subtle dependency ordering"
concern is a code-quality nit; FastAPI's dep ordering is deterministic per
declared order in the function signature.

A refactor to `get_db_with_tenant_scope(user_id_param)` requires changing
the dependency signature globally (not all callers want to pass user_id
explicitly — most resolve it from initData). Defer to a dedicated
auth-dependency cleanup phase.

---

## D-22-09 (IN-01..IN-08): Phase 22 review nits

**Discovered during:** Phase 22 code review (`22-REVIEW.md` Info section).
**Source:** `gsd-code-review-fix --auto` run on 2026-05-10.
**Status:** DEFERRED (low priority).

All Info findings (IN-01..IN-08) are deferred — they are nits / minor
consistency improvements that do not affect Phase 22 acceptance:

- **IN-01** (`compute_roundup_delta` should raise on negative base) —
  same-day fix-on-touch acceptable.
- **IN-02** (TypedDict for `_DEFAULT_CONFIG`) — type-safety nit.
- **IN-03** (consolidate 100M ₽ constant) — refactoring, no functional bug.
- **IN-04** (kw-only `goals.get_or_404`) — API consistency nit.
- **IN-05** (templates OpenAPI response model) — partially superseded by
  CR-05 fix (deprecated handlers now have `None` return type / no body).
- **IN-06** (lazy fetch comment) — explicit no-bug per reviewer.
- **IN-07** (`Subscription.amount_cents` sign docstring) — docs-only.
- **IN-08** (`__all__` exports in services) — convention nit.

Roll into a "Phase 22 polish" follow-up work item.

---
