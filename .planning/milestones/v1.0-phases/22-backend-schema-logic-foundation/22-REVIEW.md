---
phase: 22
status: findings_addressed
critical_count: 5
warning_count: 12
info_count: 8
reviewed_files: 26
date: 2026-05-10
fix_run_at: 2026-05-10
fix_run_iteration: 1
critical_resolved: 4
critical_deferred: 1
warning_resolved: 7
warning_deferred: 5
info_resolved: 0
info_deferred: 8
fix_report: 22-REVIEW-FIX.md
---

# Phase 22: Code Review Report

**Reviewed:** 2026-05-10
**Depth:** standard
**Scope:** 5 alembic migrations, ~10 services, ~9 routers, 4 schemas, worker job
**Status:** findings_found

## Summary

Review of Phase 22 v1.0 backend foundation: migrations 0012–0016, ORM models extension,
new services (accounts, roundup, savings, goals, rollover, onboarding_v10),
extended services (subscriptions post/unpost, actual v10), Pydantic v2 schemas,
REST routers (accounts/goals/savings/onboarding_v10/me/internal_onboarding),
deprecation stubs (templates), and `close_period_job` rollover integration.

The phase delivers strong RLS hardening (composite FKs for cross-tenant safety,
explicit GRANTs, `coalesce(NULLIF(...))` defense), correct integer money math
(`compute_roundup_delta` is float-free), and idempotency via advisory locks +
`rollover_processed_at` barrier. Pydantic schemas are mostly `strict + extra=forbid`.

However the review surfaced material defects:

* **Sign-convention drift** between v0.x and v1.0 actual transactions causes
  `compute_balance` (the very function feeding `close_period_job` and
  `BudgetPeriod.starting_balance_cents`) to mis-aggregate any v1.0 expense.
* **`close_period_job` ordering bug**: rollover deposits debit
  `account.balance_cents` AFTER `compute_balance` already produced
  `ending_balance`; the next period's `starting_balance_cents` therefore
  diverges from real account balances by the rollover amount.
* **Stale read-modify-write race** in `do_period_rollover`: the savings-deposit
  category lookup happens *before* `apply_balance_delta`, but `apply_balance_delta`
  is called for EVERY savings-rollover category iteration — `primary` is fetched
  once, but its in-memory `primary.balance_cents` is never re-read; not a bug
  here (UPDATE...RETURNING is atomic), but masks the implicit assumption.
* **0016 forgot composite FK** on `actual_transaction.account_id` →
  `account(id, user_id)` — the migration leaves only a simple FK, defeating
  the cross-tenant guarantee the rest of the phase carefully built.
* **Production routes still call the legacy `create_actual` / `update_actual` /
  `delete_actual`** which don't apply account-balance deltas — every
  Mini-App txn POSTed through `/api/v1/actual` silently leaves
  `account.balance_cents` unchanged. The new `create_actual_v10` exists but is
  only wired into `post_subscription` and `create_deposit`. CLAUDE.md / D-04
  states "trust delta-accounting" — this contract is broken on the main txn
  path.

## Critical Findings

### CR-01: Sign-convention drift between v0.x and v1.0 corrupts `compute_balance` [RESOLVED]

**Fix-run status:** RESOLVED (commit `cf7e67c`).
**Approach taken:** Option A from spawner — `compute_balance` now wraps actual
sums in `func.abs()` so legacy positive and v1.0 negative expense rows produce
the same magnitude. v1.0 storage convention (signed; expense negative) is
documented in the docstring. A retroactive data-flip migration on legacy rows
is intentionally NOT performed — abs() makes it non-blocking. See
`22-REVIEW-FIX.md` for details.

**Files:** `app/services/actual.py:421-499`, `app/services/subscriptions.py:415`,
`app/services/savings.py:341`, `app/services/rollover.py:194-205`

**Issue:** The codebase now stores `ActualTransaction.amount_cents` with **two
incompatible sign conventions**:

* Legacy `create_actual` (line 289-298): stores `amount_cents` verbatim from
  caller — historically positive for both expense and income (see existing
  `compute_balance` code at line 469: `delta = plan - act`, expecting positive).
* v1.0 `post_subscription` (line 415): `txn_amount = -abs(sub.amount_cents)` —
  **negative** for expense.
* v1.0 `create_deposit` (line 341): `signed_amount = -abs(int(amount_cents))` —
  negative.
* v1.0 roundup (`maybe_create_roundup_child`, `roundup.py:206`):
  `amount_cents=-delta` — negative.
* v1.0 rollover (`do_period_rollover`, line 250): `amount_cents=-remainder` —
  negative.

`compute_balance()` aggregates expenses with `func.sum(amount_cents)` (no `abs`).
When even ONE v1.0 expense lands in a period mixed with legacy positive ones,
`actual_total_expense_cents` becomes mathematically meaningless (signs cancel).
`balance_now_cents = starting + actual_income - actual_expense` is then wrong,
which feeds the new `BudgetPeriod.starting_balance_cents` on the next period
through `close_period_job`.

The contradiction is visible in `rollover.py` lines 192-198: the code claims
"Expenses are stored as positive amounts in this codebase" but then defensively
wraps `func.abs(amount_cents)` — the comment is provably wrong for v1.0.

**Fix:**
1. Pick ONE convention (recommended: storage = signed; expense negative,
   income positive — already followed by all v1.0 paths) and document it in
   `CLAUDE.md` / `app/db/models.py:ActualTransaction`.
2. Update `compute_balance` in `app/services/actual.py:421-499`:

```python
# Use abs() for expense sums (sign-agnostic):
actual_q = (
    select(
        ActualTransaction.category_id,
        ActualTransaction.kind,
        func.sum(func.abs(ActualTransaction.amount_cents)).label("actual_cents"),
    )
    .where(...)
)
# Then balance_now uses signed delta directly:
balance_now = period.starting_balance_cents - act_exp + act_inc
```

3. Add a data-migration that flips signs on legacy positive expenses, OR add
   a CHECK constraint enforcing the new convention going forward.
4. Add a regression test: insert one positive (legacy) expense + one negative
   (v1.0) expense in the same period and assert `compute_balance.actual_total_expense_cents`
   equals the magnitude sum.

### CR-02: `close_period_job` records stale `ending_balance` BEFORE rollover deposits [RESOLVED]

**Fix-run status:** RESOLVED (commit `d863ef3`).
**Approach taken:** After `do_period_rollover()` runs, sum all deposit txns
inserted for the closing period (filtered by `parent_txn_id IS NULL` to
exclude unrelated roundup children) and subtract `Σ |deposit.amount_cents|`
from the pre-rollover ending balance. Apply the corrected value to BOTH
`expired.ending_balance_cents` and `new_period.starting_balance_cents` so
both period markers stay in lockstep with `account.balance_cents`. Flagged
for human verification of the math (logic-correctness pass).

**File:** `app/worker/jobs/close_period.py:157-194`

**Issue:** The current sequence is:

```python
bal = await compute_balance(session, expired.id, ...)           # (1)
ending_balance = bal["balance_now_cents"]
new_period = BudgetPeriod(starting_balance_cents=ending_balance) # (2)
session.add(new_period); await session.flush()
await do_period_rollover(session, period_id=expired.id, ...)     # (3)
expired.status = PeriodStatus.closed
expired.ending_balance_cents = ending_balance                    # (4)
```

Step (3) inserts `ActualTransaction(kind=deposit, amount=-remainder,
period_id=expired.id, account_id=primary.id)` AND calls `apply_balance_delta`.
The deposit txns affect:

* `account.balance_cents` — debited.
* `expired.actual_transactions` — but they were already counted at step (1).

The `compute_balance` filter `kind in (expense, income)` excludes
`kind=deposit`, so `ending_balance` does NOT reflect the rollover deposits.
Therefore:

* `BudgetPeriod.ending_balance_cents` (step 4) is recorded WITHOUT the rollover
  outflow.
* `new_period.starting_balance_cents` (step 2) inherits the same wrong value.
* But `account.balance_cents` IS reduced by the deposits.

Result: `Σ account.balance_cents != Σ BudgetPeriod.starting_balance_cents`
across users — the very invariant that makes "trust delta-accounting" workable.
On the next period close, ending_balance drifts further.

**Fix:** Either run rollover BEFORE compute_balance, or include
`kind=deposit` in compute_balance's expense aggregation, or recompute
`ending_balance` after rollover:

```python
# After do_period_rollover(...):
bal_after = await compute_balance(session, expired.id, user_id=user_id)
ending_balance = bal_after["balance_now_cents"]  # Now includes deposits.
expired.ending_balance_cents = ending_balance
new_period.starting_balance_cents = ending_balance
```

Add a regression test under `tests/jobs/test_close_period_rollover.py`
asserting `Σ account.balance_cents == new_period.starting_balance_cents`
after a savings-rollover close.

### CR-03: Migration 0016 omits composite FK — cross-tenant guard incomplete [RESOLVED]

**Fix-run status:** RESOLVED (commit `a87a79f`).
**Approach taken:** New migration `0017_v10_account_id_composite_fk.py` adds
`UNIQUE(id, user_id)` on `account` (FK target requirement) and converts both
`fk_actual_account` (0016) and `fk_subscription_account` (0014) into composite
`(account_id, user_id) → account(id, user_id) ON DELETE RESTRICT` FKs.
Symmetric downgrade. No data backfill needed (single-tenant; v1.0 service
layer never crosses tenants).

**File:** `alembic/versions/0016_v10_actual_account_id.py:57-64`

**Issue:** Phase 22 carefully introduced composite FKs `(parent_txn_id, user_id)
→ (id, user_id)` in 0015 and `(parent_id, user_id) → (id, user_id)` in 0013 to
enforce cross-tenant safety on FK targets. Migration 0016 added
`actual_transaction.account_id` BUT only as a SIMPLE FK to `account.id`:

```python
op.create_foreign_key(
    "fk_actual_account",
    "actual_transaction",
    "account",
    ["account_id"],
    ["id"],          # ← only id, not (id, user_id)
    ondelete="RESTRICT",
)
```

A compromised app layer could insert `actual_transaction(user_id=1,
account_id=<account_owned_by_user_2>)`. RLS on `account` blocks the SELECT,
but the FK by itself does not enforce same-tenant. Composite FK +
`ux_account_id_user UNIQUE` (which doesn't exist on `account`) is the same
pattern used in 0013/0015 — Phase 22 BE-16 explicitly defines this as the
mitigation surface.

**Fix:** Add a follow-up migration:

```python
def upgrade() -> None:
    # 1. Composite UNIQUE on account (target of composite FK)
    op.create_unique_constraint(
        "ux_account_id_user", "account", ["id", "user_id"]
    )
    # 2. Drop simple FK + create composite FK
    op.drop_constraint("fk_actual_account", "actual_transaction", type_="foreignkey")
    op.execute(
        "ALTER TABLE actual_transaction "
        "ADD CONSTRAINT fk_actual_account_composite "
        "FOREIGN KEY (account_id, user_id) REFERENCES account (id, user_id) "
        "ON DELETE RESTRICT"
    )
```

Apply the same fix to `subscription.account_id` (also a simple FK in 0014:
`fk_subscription_account`).

### CR-04: Production `/api/v1/actual` routes do NOT update `account.balance_cents` [DEFERRED]

**Fix-run status:** DEFERRED — see `deferred-items.md` D-22-04.
**Rationale:** Switching legacy routes to `create_actual_v10` requires a
**wire-level breaking change**: `ActualCreate` schema must add required
`account_id`, breaking every v0.6 iOS / bot client immediately; tests
`tests/test_actual_crud.py` (~1k LoC) need full payload + assertion sweep;
bot's `app/bot/handlers.py` needs primary-account fallback logic.
Plan 22.13 SUMMARY explicitly defers this to Phase 23+ when v1.0 web
frontend lands. Mitigation: deposit/roundup/subscription-post/rollover
paths DO honour the v10 contract — savings story stays correct end-to-end.

**Files:** `app/api/routes/actual.py:100-152`, `app/api/routes/actual.py:185-228`,
`app/services/actual.py:255-302` (legacy `create_actual`)

**Issue:** Per CONTEXT §Area 2 D-04 ("trust delta-accounting; service-layer is
the single source of truth for balance updates"), every `actual_transaction`
INSERT/DELETE that touches an account must call `apply_balance_delta`. Phase 22
introduced `create_actual_v10` / `delete_actual_v10` which honour that contract
— but the public REST routes still call `create_actual`, `update_actual`,
`delete_actual` (legacy, no balance delta).

Result: every Mini-App actual txn POSTed through `/api/v1/actual` silently
leaves `account.balance_cents` stale. Onboarding seeds the initial balance,
but the running total drifts immediately as soon as the user adds a single
expense. This contradicts the entire roundup / savings story (the roundup
hook is bypassed too — `maybe_create_roundup_child` only runs inside
`create_actual_v10`).

The legacy schema also lacks `account_id` in the request body
(`ActualCreate` — verify `app/api/schemas/actual.py`), so even if the route
were swapped to `create_actual_v10`, the wire contract is missing the
required selector.

**Fix (one of the two — pick per release plan):**

1. Switch the production routes to `create_actual_v10` / `update_actual_v10`
   / `delete_actual_v10` and extend the request body with `account_id`
   (BE-07 contract). This is the v1.0 expectation per DATA-MODEL §4.
2. If the deferral is intentional (plan 22.13 SUMMARY suggests so),
   document the active state explicitly in `app/api/router.py` and add a
   pinned regression test confirming `account.balance_cents` is unchanged so
   the gap is not silently narrowed/widened. Do NOT ship to v1.0 without (1).

### CR-05: `templates_router` 410 endpoints do work BEFORE returning 410 [RESOLVED]

**Fix-run status:** RESOLVED (commit `71457ed`).
**Approach taken:** Stripped Pydantic body parsing and DB-with-tenant-scope
dependencies from every deprecated handler. Each is now a one-liner that
raises 410 immediately. Path parameters (`item_id`, `period_id`) preserved
so OpenAPI URL shape is unchanged. Removed unused imports.

**File:** `app/api/routes/templates.py:75-125`

**Issue:** The deprecated POST/PATCH/DELETE/snapshot endpoints declare
`status_code=status.HTTP_410_GONE` in the decorator AND raise
`HTTPException(410, ...)` in the body. They ALSO accept `body:
TemplateItemCreate` etc. as Pydantic models — meaning Pydantic runs the full
schema validation (rejecting 422 errors before the 410), and then if the body
is well-formed FastAPI hits the route function which raises 410. From a
client's perspective, an unauthenticated payload-shape check is performed
on a deprecated endpoint, leaking validation behaviour and using DB cycles
(handler dependencies `get_db_with_tenant_scope` issue `SET LOCAL
app.current_user_id`).

This is a security/quality concern because the endpoints are gated by
`Depends(get_current_user)` BUT clients sending invalid bodies get 422 instead
of 410, creating a discoverable surface.

**Fix:** Strip the request bodies and DB dependency from the deprecated
handlers — every endpoint should be a one-liner:

```python
@templates_router.post("/items", status_code=status.HTTP_410_GONE)
async def _gone() -> None:
    raise HTTPException(status_code=410, detail=_GONE_DETAIL)
```

Optionally use a router-level `dependencies=[Depends(_410_now)]` to short-
circuit auth/db machinery for every method on this router.

## Warning Findings

### WR-01: `_resolve_period_for_date` calls `db.rollback()` inside another transaction [DEFERRED]

**Fix-run status:** DEFERRED — see `deferred-items.md` D-22-05.
**Rationale:** SAVEPOINT migration touches 5 callers each with distinct
transaction-management style; race window narrow; CI hasn't surfaced the
bug. Roll into a transaction-hygiene phase.

**File:** `app/services/actual.py:191-201`

**Issue:** On `IntegrityError` (concurrent period creation), the helper does
`await db.rollback()`, which **rolls back the entire outer transaction**.
This is called from `create_actual_v10`, `create_deposit`, `update_actual`,
`charge_subscription`, and inside the `close_period_job` per-user transaction.
For `close_period_job`, a race here would silently lose the new_period and
the rollover deposits already inserted in the same transaction; for
`create_deposit`, prior validation reads are wasted but no writes are lost
because the function inserts after the period resolve. For `update_actual`,
in-flight ORM dirty state on the `row` is silently discarded.

**Fix:** Use `SAVEPOINT` (`async with db.begin_nested()`) around the optional
period insert so only the SAVEPOINT rolls back on conflict:

```python
try:
    async with db.begin_nested():
        db.add(period)
        await db.flush()
    return period.id
except IntegrityError:
    existing = await db.scalar(...)  # re-fetch
    return existing
```

### WR-02: `_demote_existing_primary` then INSERT primary — two-statement race [DEFERRED]

**Fix-run status:** DEFERRED — see `deferred-items.md` D-22-06.
**Rationale:** Single-tenant MVP makes the race effectively zero-probability;
partial-unique-index protects the DB invariant. Defer to multi-tenant phase
or transaction-hygiene pass.

**File:** `app/services/accounts.py:84-97`, `app/services/accounts.py:191-211`

**Issue:** `create_account(primary=True)` runs:
1. `UPDATE account SET "primary"=false WHERE user_id=:uid AND "primary"=true`
2. `INSERT INTO account (... "primary"=true ...)`

Two concurrent `create_account` requests can both observe step 1 succeed and
both attempt step 2; the partial unique index `ix_account_user_primary_one`
will reject one with `IntegrityError`, but the loser's other INSERT side
effects (e.g. demote of the prior primary in step 1) have already occurred.
The user ends up with the loser's prior primary demoted plus the winner's
new primary — semantically defensible but counterintuitive ("I tried to
create account X but Y was demoted").

**Fix:** Wrap the demote+insert pair in `SAVEPOINT` and on
`IntegrityError` re-execute the whole sequence (or surface a 409). At minimum
document the race in the docstring; ideally use a single CTE
(`WITH demote AS (UPDATE ...) INSERT ...`).

### WR-03: `apply_balance_delta` ignores CHECK constraint surface [DEFERRED]

**Fix-run status:** DEFERRED — see `deferred-items.md` D-22-07.
**Rationale:** Bound (±100B kopeks = ±1B ₽) is unreachable in personal
budget app — pure future-proofing. Adding `AccountBalanceOverflowError`
requires plumbing through 4 callers + route-layer mapping + tests. Not a
v1.0 blocker.

**File:** `app/services/accounts.py:365-406`

**Issue:** The `UPDATE ... RETURNING` will raise `IntegrityError` if the new
balance falls outside `ck_account_balance_range` (±100B копеек). That
exception propagates to the route layer as 500 (unhandled). Callers
(roundup, deposit, subscription post, rollover) never catch it — a single
overflow attempt aborts the whole transaction and surfaces as opaque 500.

**Fix:** Catch `IntegrityError` in `apply_balance_delta` and raise a domain
exception (`AccountBalanceOverflowError`) that route layers can map to 422
or 409 with a meaningful message. Document the bound in `AccountUpdate` /
`DepositCreate` schemas.

### WR-04: Onboarding due-date validator uses wrong timezone [RESOLVED]

**Fix-run status:** RESOLVED (commit `c49bcd9`).
**Approach taken:** Both `app/api/schemas/goals.py` and
`app/api/schemas/onboarding_v10.py` now compute today via
`ZoneInfo("Europe/Moscow")`, aligning with the service-layer
`_today_in_app_tz()` helper. Factored into a small `_today_msk()` helper in
goals.py rather than importing from `app.services.periods` to keep schema
modules decoupled from SQLAlchemy at module-load time.

**Files:** `app/api/schemas/onboarding_v10.py:103`, `app/api/schemas/goals.py:56`,
vs. service `app/services/goals.py:97-109`

**Issue:** Pydantic schemas use `_date.today()` (server local TZ) for the
"due > today" validator; the service layer uses `_today_in_app_tz()` (Europe/
Moscow). On a UTC-deployed container at 23:30 UTC = 02:30 MSK, the schema
sees `today = N` while the service sees `today = N+1`. A goal due on N+1
passes Pydantic but fails the service `_validate_due` — surfaces as 422 at a
different layer for the same input.

**Fix:** Replace `_date.today()` calls in
`app/api/schemas/onboarding_v10.py:103` and `app/api/schemas/goals.py:56`
with the MSK helper (factor `_today_in_app_tz` to a non-DB-dependent module
or duplicate it locally with `ZoneInfo("Europe/Moscow")`).

### WR-05: `delete_account` `try/except Exception: pass` swallows real errors [RESOLVED]

**Fix-run status:** RESOLVED (commit `1aecc1c`).
**Approach taken:** Removed the entire try/except + hasattr probe — migration
0016 has landed, `actual_transaction.account_id` is permanent ORM state.
Count is now unconditional; real DB errors surface as 500 with proper
traceback (acceptable — they signal a stack-level fault that must be
diagnosed, not silently bypassed).

**File:** `app/services/accounts.py:319-335`

**Issue:** The `hasattr` probe wraps the entire FK count query in `try/except
Exception: txn_count = 0`. Any DB error (timeout, network), real authz
failure (RLS denying), or even import-time module-load issue silently
defaults `txn_count = 0` — the delete then proceeds with the FK constraint
firing later as `IntegrityError`. The error message reaches the client as
500 "internal server error", but the audit log shows nothing about WHY the
"forward-compat probe" failed.

**Fix:** With migration 0016 landed, the `hasattr` branch is now always
taken. Drop the entire try/except and run the count unconditionally:

```python
from app.db.models import ActualTransaction
txn_count = int(await db.scalar(
    select(func.count())
    .select_from(ActualTransaction)
    .where(
        ActualTransaction.user_id == user_id,
        ActualTransaction.account_id == account_id,
    )
) or 0)
```

### WR-06: `outer.commit()` after read-only block in `close_period_job` [RESOLVED]

**Fix-run status:** RESOLVED (commit `fb6a993`).
**Approach taken:** Removed the `outer.commit()` call. `pg_try_advisory_lock`
is connection-scoped (NOT transaction-scoped), so the unlock takes effect
without a commit. Comment added explaining the choice and contrasting with
`pg_try_advisory_xact_lock` used inside `rollover.py`.

**File:** `app/worker/jobs/close_period.py:101-109`

**Issue:** The outer session only ran a SELECT (`select(AppUser)`) and an
advisory lock. On the `finally` block the code does `await
outer.execute(unlock); await outer.commit()`. If the SELECT happened to
trigger an autoflush of pending unrelated state (none in this code path,
but defensively), the commit would silently flush it. More immediately,
`outer.commit()` after `pg_advisory_unlock` is unnecessary — advisory locks
are connection-scoped, not transaction-scoped (because we used
`pg_try_advisory_lock`, not `pg_try_advisory_xact_lock`). The unlock is
required, but the commit only matters for any DML side effects.

**Fix:** Remove `outer.commit()`. Add a comment that the lock unlock is
explicit because we used the non-xact variant. Consider switching to
`pg_try_advisory_xact_lock` to match the per-period rollover lock and let
COMMIT/ROLLBACK auto-release.

### WR-07: `_validate_accounts` mismatch with Pydantic primary check [RESOLVED]

**Fix-run status:** RESOLVED (commit `ccd796f`).
**Approach taken:** Switched `if a.get("primary") is True:` →
`if bool(a.get("primary")):` so direct service callers passing truthy ints
(legacy `primary=1`, AI ops, raw-dict tests) get the same defense-in-depth
as wire callers. No behaviour change for the strict-Pydantic happy path.

**Files:** `app/services/onboarding_v10.py:265-273`,
`app/api/schemas/onboarding_v10.py:187-192`

**Issue:** The schema validator (`_cross_field_checks`) rejects `primary_count
> 1`. The service validator (`_validate_accounts`) rejects strictly the same.
But the service's loop uses `if a.get("primary") is True:` while Pydantic
typed `primary: bool` and accepts truthy ints. After Pydantic strict mode
the `True` check is fine, but the **service is also called from
`reset_v10` re-onboarding tests with raw dicts** — where `primary=1` would
slip past the service `is True` check (because `1 is True` is `False` in
Python, only the singleton `True` matches). Defense-in-depth on the service
should use `bool(a.get("primary"))`.

**Fix:** Change line 265 to `if bool(a.get("primary")):` so direct service
calls (tests, AI ops) cannot pass an extra truthy primary.

### WR-08: `internal_onboarding_router` uses raw `get_db` — bypasses tenant scope decorator [DEFERRED]

**Fix-run status:** DEFERRED — see `deferred-items.md` D-22-08.
**Rationale:** Code is **functionally correct** — `set_tenant_scope` runs
before any DB write; FastAPI dep ordering is deterministic. The refactor
to a parametrised `get_db_with_tenant_scope(user_id_param)` requires a
global signature change. Defer to auth-dependency cleanup phase.

**File:** `app/api/routes/internal_onboarding.py:93`

**Issue:** The route depends on `get_db` (no auto tenant scope) and manually
calls `set_tenant_scope(db, user_id)` later. If `set_tenant_scope` raises
(invalid user_id), `get_db`'s commit-on-success behaviour kicks in on the
empty session. More subtly, between the dependency wiring (FastAPI may
order deps unpredictably) and the manual `set_tenant_scope`, no GUC is set
— but no DB writes happen until inside `reset_v10`, so this is currently
benign.

**Fix:** Either use `get_db_with_tenant_scope` extracted to accept an
explicit user_id (refactor target), or wrap the entire body in
`async with db.begin():` so commit/rollback is explicit. Add a comment
asserting that `set_tenant_scope` MUST run before any `reset_v10` call.

### WR-09: `internal_onboarding_router` `except Exception: raise` swallows traceback context [RESOLVED]

**Fix-run status:** RESOLVED (commit `093f395`).
**Approach taken:** Dropped the named `as exc` binding and `error=str(exc)`
kwarg. structlog's `logger.exception` already captures the active
exception's type + traceback via exc_info; passing str(exc) only obscured
the type.

**File:** `app/api/routes/internal_onboarding.py:147-153`

**Issue:** The `except Exception as exc: raise` re-raises but `logger.exception`
formats `error=str(exc)`, losing the traceback in structured logs (structlog
captures `exc_info` automatically when using `logger.exception` — but only if
the exception is currently being handled). Re-raising bare `raise` after the
log call works, but `logger.exception` should NOT be passed `error=str(exc)`
because that hides the type. Recommend:

```python
except Exception:
    logger.exception("internal_onboarding_reset.failed", target_user_id=user_id)
    raise
```

### WR-10: Missing `extra="forbid"` on legacy `SubscriptionCreate` / `SubscriptionUpdate` [RESOLVED]

**Fix-run status:** RESOLVED (commit `7b5ce13`).
**Approach taken:** Added `model_config = ConfigDict(extra="forbid")` to
both legacy classes, aligning them with every v1.0 schema's T-22-12-02
mitigation.

**File:** `app/api/schemas/subscriptions.py:16-37`

**Issue:** The legacy schemas don't have `model_config = ConfigDict(extra="forbid",
strict=True)`. They are still wired into `POST /api/v1/subscriptions` (line 56
of `routes/subscriptions.py`). T-22-12-02 (extra-key state injection)
applies — a malicious client can submit
`{"name": "...", "amount_cents": 100, ..., "user_id": 999}` and Pydantic
will silently ignore `user_id`, but a future careless `**body.model_dump()`
splat into the ORM kwargs would propagate it. Service layer protects via
explicit `user_id=user_id`, so currently safe — but the new schemas in this
phase ALL set `extra="forbid"` and these legacy ones break the convention.

**Fix:** Add `model_config = ConfigDict(strict=True, extra="forbid")` to
`SubscriptionCreate` and `SubscriptionUpdate` for consistency.

### WR-11: `OnboardingV10Body` has no upper bound on `category_plans` dict size [RESOLVED]

**Fix-run status:** RESOLVED (commit `e0401ee`).
**Approach taken:** `category_plans: dict[str, int] = Field(max_length=20)`.
Pydantic rejects oversize dicts before any per-key validator runs, shrinking
DoS surface from O(payload size) to O(1).

**File:** `app/api/schemas/onboarding_v10.py:138`

**Issue:** `category_plans: dict[str, int]` accepts any number of keys. The
field validator whitelist-checks each key against `VALID_CATEGORY_CODES`
(8 codes), so an attacker submitting 1M unknown keys gets rejected on the
first unknown key — but in O(N) time. Pydantic strict-mode does not bound
dict size by default. For DoS resilience, set an explicit max:

**Fix:**
```python
category_plans: dict[str, int] = Field(max_length=20)
```

(8 valid keys + headroom). Also bound nested-dict / list sizes on every
schema that accepts user input.

### WR-12: `_TRANSLIT` map missing collisions case-insensitively [RESOLVED]

**Fix-run status:** RESOLVED (commit `a169431`).
**Approach taken:** Truncate the BASE to 37 chars (3 reserved for `-NN` +
dash) BEFORE appending the suffix, so a 40-char base + `-2` won't lose the
suffix to the column-length cap. Final `code[:40]` truncation kept as
defensive belt-and-suspenders for `-100`+ pathological collision counts.

**File:** `alembic/versions/0013_v10_category_ext.py:60-89`

**Issue:** `_transliterate("Кафе и рестораны")` produces `"kafe_i_restorany"`;
`_transliterate("Кафе/Рестораны")` produces `"kafe_restorany"`; but
`_transliterate("Кафе")` produces `"kafe"`. The collision detection key
is `(user_id, base_code)` — but the column is `code String(40)`, so
`"kafe-2"` (truncated) collides with `"kafe-20"` after truncation. In
real seed data this never triggers (max 14 categories per user), but a
user with 100+ legacy categories triggering many `kafe-NN` suffixes could
hit the truncation collision. The truncation `code = code[:40]` happens
AFTER the suffix append, so `"longname"` (40 chars) `-2` becomes
`"longname[40 chars]-2"[:40]` = the first 40 chars only — losing the suffix.

**Fix:** Truncate the BASE before appending the suffix:

```python
base_code = base[:38]  # leave room for "-NN"
code = base_code if seen[key] == 1 else f"{base_code}-{seen[key]}"
```

Add a unit test with a 50-char Russian category name + collisions.

## Info Findings

**Fix-run status (entire section):** ALL DEFERRED — see `deferred-items.md`
D-22-09 for rationale. None of the Info findings are v1.0 blockers; they
are deferred for a future "Phase 22 polish" follow-up.

### IN-01: `compute_roundup_delta` allows negative `base` silently [DEFERRED]

**File:** `app/services/roundup.py:96-101`

**Issue:** The defensive `if base <= 0: return 0` masks misconfigured
`SavingsConfig.roundup_base`. The DB CHECK forbids non-{10,50,100}, but a
direct service call could pass `base=-1`. Better to raise:

```python
if base <= 0:
    raise ValueError(f"roundup base must be positive; got {base}")
```

### IN-02: `_DEFAULT_CONFIG` typed as `dict[str, object]` loses type safety [DEFERRED]

**Files:** `app/services/savings.py:66`, `app/services/onboarding_v10.py:120`

**Issue:** Using `dict[str, object]` (or `Any`) for the defaults dict means
type checkers don't catch typos like `_DEFAULT_CONFIG["roundup_basis"]`.
Use a `TypedDict`:

```python
class _SavingsDefaults(TypedDict):
    roundup_enabled: bool
    roundup_base: int
_DEFAULT_CONFIG: _SavingsDefaults = {"roundup_enabled": False, "roundup_base": 10}
```

### IN-03: Magic number `100_000_000_00` repeated across schemas/services [DEFERRED]

**Files:** `app/api/schemas/accounts.py:32-33`,
`app/api/schemas/onboarding_v10.py:61`, `app/api/schemas/savings.py:25`,
`app/api/schemas/goals.py:24`, `app/services/onboarding_v10.py:117`,
`alembic/versions/0012_v10_user_account.py:81`

**Issue:** The 100M ₽ bound (`10_000_000_000` копеек) is hard-coded in 6+
places. Drift risk if the policy changes. Consolidate into a single
constant in `app/core/constants.py` or `app/db/models.py`.

### IN-04: `get_or_404(goal_id, *, user_id)` parameter order inconsistent [DEFERRED]

**File:** `app/services/goals.py:143`

**Issue:** `goals.get_or_404(db, goal_id, *, user_id)` puts `goal_id` as
positional, but `accounts.get_or_404(db, *, user_id, account_id)` makes both
keyword-only. This is a small inconsistency that confuses future contributors
who blindly copy patterns.

**Fix:** Standardise on keyword-only: `get_or_404(db, *, user_id, goal_id)`.

### IN-05: `templates_router` deprecation notice in OpenAPI [DEFERRED — partially resolved by CR-05]

(Deprecated handlers now have `None` return type / no body — see CR-05.
The `GET /items` response model still references `TemplateItemRead`; the
remaining nit is purely OpenAPI cosmetics.)

**File:** `app/api/routes/templates.py:53-58`

**Issue:** `deprecated=True` on the router emits OpenAPI `deprecated` flags
for every endpoint, but the response models are still wired to the legacy
`TemplateItemRead`, suggesting to clients a non-empty success response that
will never come (`GET /items` only returns empty list, the others 410).
Replace return models with `dict | None` and add a `description` callout.

### IN-06: `do_period_rollover` may produce zero-amount deposits if `remainder == 0` [DEFERRED — no bug]

**File:** `app/services/rollover.py:208-209`

Already guarded — `if remainder == 0: continue`. No bug, but the loop body
still re-resolves savings_cat / primary lazily, which is fine. The eager
fetch of `cats` (line 167) loads ALL non-archived categories even on users
with no rollover-savings categories. Tiny inefficiency, accept-as-is for
v1.0.

### IN-07: `subscription.amount_cents` sign inconsistency with `actual_transaction` [DEFERRED]

**Files:** `app/db/models.py:454`, `app/services/subscriptions.py:415`

**Issue:** `Subscription.amount_cents` is documented to be POSITIVE
("DATA-MODEL §1.5"), but `ActualTransaction.amount_cents` is now negative
for v1.0 expense (CR-01). `post_subscription` correctly negates
(`-abs(sub.amount_cents)`), but a casual reader of the schema might pass
the raw amount through. Add a docstring note on `Subscription.amount_cents`
clarifying the sign expectation contrast.

### IN-08: `__all__` lists in services are partial (e.g. `accounts.py` omits `__all__`) [DEFERRED]

**Files:** `app/services/accounts.py`, `app/services/subscriptions.py`,
`app/services/rollover.py:305-308` (has but partial)

**Issue:** Most v1.0 services have `__all__` (savings, goals, roundup,
onboarding_v10) — but `accounts.py` and `subscriptions.py` do not. With
`from app.services.accounts import *` (used in some test fixtures), the
exception classes would still leak. Minor: add `__all__` for consistency.

## Coverage Notes

* **Tests reviewed lightly** — only file structure was inspected. Per scope
  ("review for quality, не deep") the test bodies were not executed against
  the bugs identified above. Recommended next steps:
  - `tests/jobs/test_close_period_rollover.py`: add the
    `Σ account.balance_cents == new_period.starting_balance_cents`
    invariant assertion to catch CR-02.
  - `tests/services/test_*v10*`: add a mixed-sign-convention test for
    `compute_balance` to catch CR-01 regressions.
  - `tests/test_migrations_v1_0.py`: add a check that EVERY new FK on
    `actual_transaction` / `subscription` referencing `account` is
    composite (catches CR-03 regressions).
* **`app/services/planned.py`** — only the lazy-import workaround was
  reviewed (no defects in the scope of this phase).
* **`app/services/templates.py`** — fully reviewed; deprecation stub is
  semantically correct but see CR-05 + IN-05 for surface tightening.
* **Cross-file call-chain tracing** (`do_period_rollover` → `apply_balance_delta`
  → DB UPDATE; `complete_v10` → `_upsert_seed_categories` → ORM INSERT) was
  performed. The `expire_all()` call in `reset_v10` (line 658) is correctly
  placed; no other ORM-cache drift bugs found.
* **RLS audit** — migrations 0012/0014/0015 use the same
  `coalesce(NULLIF(current_setting(...), '')::bigint, -1)` defense as the
  legacy 0006 policies. Naming convention drift documented (CONTEXT D-08:
  `tenant_isolation_<table>` vs legacy `<table>_user_isolation`); no
  functional issue.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
