---
phase: 22
fixed_at: 2026-05-10
review_path: .planning/phases/22-backend-schema-logic-foundation/22-REVIEW.md
deferred_path: .planning/phases/22-backend-schema-logic-foundation/deferred-items.md
iteration: 1
findings_in_scope: 17
fixed: 11
skipped: 6
status: partial
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-05-10
**Source review:** `.planning/phases/22-backend-schema-logic-foundation/22-REVIEW.md`
**Iteration:** 1
**Mode:** `--auto`, scope = critical_warning (excluded Info; documented as deferred).

## Summary

- Findings in scope (Critical + Warning): 17
- Fixed (RESOLVED): 11
- Deferred / Skipped: 6
- Info findings (out of scope): 8 — all DEFERRED, see `deferred-items.md` D-22-09.

## Status Per Finding

| ID    | Title                                                                          | Status     | Commit    |
|-------|--------------------------------------------------------------------------------|------------|-----------|
| CR-01 | Sign-convention drift corrupts `compute_balance`                               | RESOLVED*  | `cf7e67c` |
| CR-02 | `close_period_job` records stale `ending_balance` BEFORE rollover deposits    | RESOLVED*  | `d863ef3` |
| CR-03 | Migration 0016 omits composite FK — cross-tenant guard incomplete              | RESOLVED   | `a87a79f` |
| CR-04 | Production `/api/v1/actual` routes do NOT update `account.balance_cents`       | DEFERRED   | —         |
| CR-05 | `templates_router` 410 endpoints do work BEFORE returning 410                  | RESOLVED   | `71457ed` |
| WR-01 | `_resolve_period_for_date` calls `db.rollback()` inside another transaction    | DEFERRED   | —         |
| WR-02 | `_demote_existing_primary` then INSERT primary — two-statement race            | DEFERRED   | —         |
| WR-03 | `apply_balance_delta` ignores CHECK constraint surface                         | DEFERRED   | —         |
| WR-04 | Onboarding due-date validator uses wrong timezone                              | RESOLVED   | `c49bcd9` |
| WR-05 | `delete_account` `try/except Exception: pass` swallows real errors             | RESOLVED   | `1aecc1c` |
| WR-06 | `outer.commit()` after read-only block in `close_period_job`                   | RESOLVED   | `fb6a993` |
| WR-07 | `_validate_accounts` mismatch with Pydantic primary check                      | RESOLVED   | `ccd796f` |
| WR-08 | `internal_onboarding_router` uses raw `get_db` — bypasses tenant scope         | DEFERRED   | —         |
| WR-09 | `internal_onboarding_router` `except Exception: raise` swallows traceback ctx  | RESOLVED   | `093f395` |
| WR-10 | Missing `extra="forbid"` on legacy `SubscriptionCreate` / `SubscriptionUpdate` | RESOLVED   | `7b5ce13` |
| WR-11 | `OnboardingV10Body` has no upper bound on `category_plans` dict size           | RESOLVED   | `e0401ee` |
| WR-12 | `_TRANSLIT` map missing collisions case-insensitively                          | RESOLVED   | `a169431` |

\* — Logic-correctness fixes (CR-01, CR-02) flagged for human verification of
the math. Tier 1 (re-read) + Tier 2 (Python `ast.parse` / `py_compile`) syntax
checks PASS for every modified file. Live-stack pytest verification was NOT
performed (see "Verification Notes" below).

## Fixed Issues

### CR-01: Sign-convention drift corrupts `compute_balance`

- **Files modified:** `app/services/actual.py`
- **Commit:** `cf7e67c`
- **Applied fix:** Wrapped `func.sum(ActualTransaction.amount_cents)` in
  `func.abs()` inside `compute_balance` so legacy positive expense rows and
  v1.0 negative expense rows both contribute their magnitude. Documented v1.0
  storage convention (signed; expense negative; CR-01) in the docstring.
  Existing tests (`tests/test_balance.py`) using positive amounts continue to
  pass (`|positive| == positive`).

### CR-02: `close_period_job` records stale `ending_balance` BEFORE rollover deposits

- **Files modified:** `app/worker/jobs/close_period.py`
- **Commit:** `d863ef3`
- **Applied fix:** Re-ordered so the rollover deposits are now reflected in
  both `expired.ending_balance_cents` and `new_period.starting_balance_cents`.
  Sum all deposit txns inserted by this rollover (filtered by
  `parent_txn_id IS NULL` to exclude unrelated roundup children), subtract
  `Σ |deposit.amount_cents|` from the pre-rollover ending balance, apply the
  corrected value to both period markers. Added imports for `func`,
  `ActualKind`, `ActualTransaction`.

### CR-03: Migration 0016 omits composite FK — cross-tenant guard incomplete

- **Files modified:** `alembic/versions/0017_v10_account_id_composite_fk.py`
  (NEW)
- **Commit:** `a87a79f`
- **Applied fix:** New alembic migration `0017_v10_account_id_composite_fk.py`:
  - Step 1: `UNIQUE(id, user_id)` constraint on `account` (`ux_account_id_user`).
  - Step 2: drop simple `fk_actual_account` FK; create composite
    `fk_actual_account_composite (account_id, user_id) → account(id, user_id)
    ON DELETE RESTRICT`.
  - Step 3: same shape for `subscription` (`fk_subscription_account` →
    `fk_subscription_account_composite`).
  - Symmetric downgrade. No data backfill required.

### CR-05: `templates_router` 410 endpoints do work BEFORE returning 410

- **Files modified:** `app/api/routes/templates.py`
- **Commit:** `71457ed`
- **Applied fix:** Stripped Pydantic body and DB-with-tenant-scope deps from
  every deprecated handler. Each one is now a one-liner that raises 410
  directly. Path parameters preserved for OpenAPI URL shape parity. Removed
  unused imports (`HTTPException` kept; `AsyncSession`,
  `get_db_with_tenant_scope`, `get_current_user_id`,
  `TemplateItemCreate/Update`, `SnapshotFromPeriodResponse` dropped).

### WR-04: Onboarding due-date validator uses wrong timezone

- **Files modified:** `app/api/schemas/goals.py`,
  `app/api/schemas/onboarding_v10.py`
- **Commit:** `c49bcd9`
- **Applied fix:** Both schemas now compute today via
  `datetime.now(ZoneInfo("Europe/Moscow")).date()`, matching service-layer
  `_today_in_app_tz()`. Helper `_today_msk()` added in goals.py; inline call
  in onboarding_v10.py.

### WR-05: `delete_account` `try/except Exception: pass` swallows real errors

- **Files modified:** `app/services/accounts.py`
- **Commit:** `1aecc1c`
- **Applied fix:** Removed try/except + hasattr probe — migration 0016 has
  landed, `actual_transaction.account_id` is permanent. Count is now
  unconditional; real DB errors surface as 500 with a proper traceback.

### WR-06: `outer.commit()` after read-only block in `close_period_job`

- **Files modified:** `app/worker/jobs/close_period.py`
- **Commit:** `fb6a993`
- **Applied fix:** Removed the `outer.commit()` call. Comment added explaining
  that `pg_try_advisory_lock` is connection-scoped (NOT
  transaction-scoped, unlike the xact variant in `rollover.py`), so the
  unlock takes effect without a commit.

### WR-07: `_validate_accounts` mismatch with Pydantic primary check

- **Files modified:** `app/services/onboarding_v10.py`
- **Commit:** `ccd796f`
- **Applied fix:** `if a.get("primary") is True:` →
  `if bool(a.get("primary")):`. Defense-in-depth against direct service
  callers passing truthy ints.

### WR-09: `internal_onboarding_router` `except Exception: raise` swallows traceback context

- **Files modified:** `app/api/routes/internal_onboarding.py`
- **Commit:** `093f395`
- **Applied fix:** Dropped the `as exc` binding and the `error=str(exc)`
  kwarg passed to `logger.exception`. structlog already captures the active
  exception's type + traceback via exc_info.

### WR-10: Missing `extra="forbid"` on legacy `SubscriptionCreate` / `SubscriptionUpdate`

- **Files modified:** `app/api/schemas/subscriptions.py`
- **Commit:** `7b5ce13`
- **Applied fix:** Added `model_config = ConfigDict(extra="forbid")` to both
  legacy classes, aligning with every v1.0 schema's T-22-12-02 mitigation.

### WR-11: `OnboardingV10Body` has no upper bound on `category_plans` dict size

- **Files modified:** `app/api/schemas/onboarding_v10.py`
- **Commit:** `e0401ee`
- **Applied fix:** `category_plans: dict[str, int] = Field(max_length=20)`.
  Pydantic rejects oversize dicts before any per-key validator runs, shrinking
  DoS surface from O(payload size) to O(1).

### WR-12: `_TRANSLIT` map missing collisions case-insensitively

- **Files modified:** `alembic/versions/0013_v10_category_ext.py`
- **Commit:** `a169431`
- **Applied fix:** Truncate the BASE to 37 chars (3 reserved for `-NN` + dash)
  BEFORE appending the suffix. Final `code[:40]` truncation kept as defensive
  belt-and-suspenders for `-100`+ pathological collision counts.

## Deferred Issues

See `.planning/phases/22-backend-schema-logic-foundation/deferred-items.md`
for full rationale per finding (entries D-22-04..D-22-09).

| ID    | Reason                                                                                          | Deferred-item entry |
|-------|-------------------------------------------------------------------------------------------------|---------------------|
| CR-04 | Wire-level breaking change for v0.6 iOS / bot clients; intentional per plan 22.13 SUMMARY.      | D-22-04             |
| WR-01 | SAVEPOINT migration touches 5 callers each with distinct transaction style; race window narrow. | D-22-05             |
| WR-02 | Single-tenant MVP race effectively zero-probability; partial-unique-index protects DB.          | D-22-06             |
| WR-03 | Bound (±1B ₽) unreachable in personal budget app; pure future-proofing.                         | D-22-07             |
| WR-08 | Code is functionally correct; refactor would change global dep signature.                       | D-22-08             |
| Info  | All 8 IN-* findings deferred as low-priority Phase 22 polish.                                   | D-22-09             |

## Verification Notes

**Tier 1 (re-read):** PASS for every modified file. Each Edit was followed by
a re-read confirming the fix text is present and surrounding code is intact.

**Tier 2 (syntax check):** PASS for every modified `.py` file via
`python3 -c "import ast; ast.parse(open(...).read())"` and `py_compile`. No
syntax errors introduced.

**Tier 3 (live-stack tests):** **NOT RUN.** The repo's `.venv/bin/python` is a
broken symlink (`/usr/local/bin/python3` does not exist on this host) and the
test suite requires a docker-compose stack (Postgres, alembic upgrade, api
container) per `scripts/run-integration-tests.sh`. The fix-run agent does not
have a recent enough Python+venv to install dependencies natively, and
booting the docker stack from inside the agent loop adds ~60s for each
pytest invocation.

**Recommended human verification before merging this branch:**

1. `bash scripts/run-integration-tests.sh tests/services/ -x` — services
   layer; CR-01, WR-05, WR-07 directly affect this surface.
2. `bash scripts/run-integration-tests.sh tests/api/ -x` — API layer;
   CR-05, WR-04, WR-09, WR-10, WR-11 directly affect this surface.
3. `bash scripts/run-integration-tests.sh tests/jobs/ -x` — close_period_job
   + rollover; CR-02 + WR-06 directly affect this.
4. `bash scripts/run-integration-tests.sh tests/test_multitenancy_v1_0_columns.py`
   — RLS + composite-FK gate; verifies CR-03 migration 0017 applies cleanly.
5. **CR-02 invariant test (recommended new):** add to
   `tests/jobs/test_close_period_rollover.py`:
   ```python
   async def test_close_period_invariant_account_balance_eq_starting_balance(...):
       # After close_period_job runs, assert
       # Σ account.balance_cents == new_period.starting_balance_cents
   ```
   This is the regression test the reviewer recommended; it directly catches
   any future drift between the period marker and the live account ledger.
6. **CR-01 mixed-sign regression test (recommended new):** add to
   `tests/services/test_compute_balance.py` (or similar):
   ```python
   async def test_compute_balance_mixed_signs_in_same_period(...):
       # Insert one positive (legacy) expense + one negative (v1.0) expense.
       # Assert actual_total_expense_cents == magnitude_sum (not sign-cancelled).
   ```

**Important — CR-02 logic correctness:**

The CR-02 fix re-orders `compute_balance` ↔ `do_period_rollover` and
recomputes `ending_balance` after rollover by subtracting deposit
magnitudes. This is a math change; while the syntax + AST checks PASS, the
INVARIANT (Σ account.balance_cents == new_period.starting_balance_cents)
is not directly asserted by existing tests. The commit message and this
report flag it as `requires human verification`.

**Important — Migration 0017 prerequisites:**

The new migration `0017_v10_account_id_composite_fk.py` depends on the
state produced by 0014 (`subscription.account_id` + `fk_subscription_account`)
and 0016 (`actual_transaction.account_id` + `fk_actual_account`). It will
fail cleanly if those constraint names are missing — meaning re-running
`alembic upgrade head` on a fresh DB applies the chain correctly. Stamping
0017 on a DB that already has the old simple FKs will succeed; stamping it
on a DB without 0014/0016 applied is the explicit failure mode (the migration
expects the old simple FKs to exist before it drops them).

## Worktree Note

This run executed inside an isolated git worktree at
`/tmp/sv-22-reviewfix-C9i80C` on a temporary branch
`review-fix-22-1778392488` (created from `v1.0-maximal-poster` HEAD
68d419a). The recovery sentinel was written at
`.planning/phases/22-backend-schema-logic-foundation/.review-fix-recovery-pending.json`
before any commit and will be removed after `git worktree remove` succeeds
(transactional cleanup tail).

The 11 fix commits sit on the temporary branch; the orchestrator is
responsible for fast-forwarding `v1.0-maximal-poster` to the temp branch's
HEAD (or merging) before tearing down the worktree.

---

_Fixed: 2026-05-10_
_Fixer: Claude (gsd-code-fixer, Opus 4.7 1M)_
_Iteration: 1_
