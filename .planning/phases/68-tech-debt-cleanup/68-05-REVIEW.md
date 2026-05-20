---
phase: 68-tech-debt-cleanup
sub: 68-05
reviewed: 2026-05-20T20:50:58Z
depth: deep
focus: test-integrity (no silent weakening / no-op / wrongful skip)
files_reviewed: 39
commits_reviewed:
  - dc556f7
  - 7b2a9dd
  - fcbc408
  - 085f535
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
verdict: TRUSTWORTHY (one coverage gap to close, not a green-manufacturing weakening)
---

# Phase 68-05: Code Review Report — Test-Only v1.0 Migration

**Reviewed:** 2026-05-20T20:50:58Z
**Depth:** deep (cross-checked against route + service + alembic source)
**Files Reviewed:** 39 test-side files
**Status:** issues_found (1 WARNING, 3 INFO)

## Summary

68-05 is a 39-file, test-only migration (zero `app/` or `alembic/` changes —
**verified empty**: `git diff dc556f7~1..085f535 --stat -- app/ alembic/` returns
nothing). It drove the backend suite green by aligning legacy v0.x test
expectations with the real v1.0 contract.

I traced every judgment-call class against the actual product source. **The green
results are trustworthy.** No assertion was turned into `assert True`, no test was
made a no-op to manufacture green, no `pytest.approx`/tolerance was broadened, no
exception-swallowing was introduced, and the two skips have genuine replacement
coverage. The flipped Class G asserts verify the REAL current contract, confirmed
against route/service code.

One genuine defect surfaced: a security regression test (`test_rls_policy.py`) was
renamed/trimmed but **not extended to the three new RLS-protected v1.0 tables**,
so it now silently under-covers the multi-tenant isolation guarantee.

### Verification ledger (claims checked against source)

| Class | Claim | Verified against | Result |
|-------|-------|------------------|--------|
| G — apply-template no-op | `created=0, planned=[]` | `app/services/planned.py:330-385` | Real no-op; 404-cross-tenant path retained via `_get_period_or_404`. Legit. |
| G — template/snapshot 410 | `410` + `detail.error=="templates_deprecated"` | `app/api/routes/templates.py` (all WRITE handlers raise `HTTPException(410, _GONE_DETAIL)`) | Exact match. Legit. |
| C — embedding skips | covered by `ai_embedding_backfill` tests | `tests/test_embedding_backfill.py:87,210` (`creates_embeddings_for_all`, `swallows_provider_exception_and_returns_zero`) + `onboarding_v10.py` has zero embedding refs | Replacement coverage real; decoupling real. Legit. |
| D — `populate_existing=True` | re-reads fresh DB after raw UPDATE | `app/services/accounts.py:391` (`UPDATE account SET balance_cents ... RETURNING`) | ORM cache genuinely stale; SELECT+populate_existing forces fresh row; numeric asserts intact (`-110`, `+5000000`). NOT tautological. Legit. |
| C — onboarding contract | 9 cats (8 default + savings), no period, structured 409 | `onboarding_v10.py:93-112` (8 DEFAULT + 1 SYSTEM_SAVINGS), no `BudgetPeriod` creation; `routes/onboarding_v10.py:108-116` (`detail={"error":"already_onboarded"...}`) | All three match. Legit. |
| E — RLS table list | nine→eight (drop `plan_template_item`) | alembic 0012/0015 — `account`/`goal`/`savings_config` ALSO carry FORCE RLS | **GAP — see WR-01.** |
| F — migration head | accept 0012..0026 | head allow-list widened, intent "v1.0-or-later" | Reasonable, non-brittle. Legit. |

## Warnings

### WR-01: RLS regression test under-covers v1.0 domain tables (security coverage gap)

**File:** `tests/test_rls_policy.py:97-114`
**Issue:** The test was renamed `test_rls_enabled_on_all_nine_tables` →
`test_rls_enabled_on_all_eight_tables` and only **removed** the dropped
`plan_template_item`. But the v1.0 schema added three new tenant-scoped tables
that all carry `FORCE ROW LEVEL SECURITY`:

- `account` — `alembic/versions/0012_v10_user_account.py:107-108`
- `goal` — `alembic/versions/0015_v10_rls_finalize.py:62-63`
- `savings_config` — `alembic/versions/0015_v10_rls_finalize.py:79-80`

None of these appear in the test's `domain_tables` tuple. The test name asserts
completeness ("all eight tables") while the suite actually protects **eleven**
domain tables — so the RLS guard now covers 8/11. If a future migration
accidentally drops `ENABLE/FORCE ROW LEVEL SECURITY` on `account`, `goal`, or
`savings_config` (the exact tables that hold money balances and savings config),
this regression test would stay green. The same three tables were correctly added
to the truncate sets in `tests/helpers/seed.py:433-445` and to
`test_onboarding_concurrent.py` cleanup — so their tenant-domain status is
acknowledged elsewhere in this very changeset, making the omission here an
inconsistency, not a deliberate scoping decision.

This is not a *weakening of an existing assertion* (the removed table genuinely no
longer exists, so green is honest), but it is a real, introduced coverage gap that
the rename actively masks. Classifying as WARNING because it degrades a
security-regression guard, not because it manufactures a false green for this PR.

**Fix:**
```python
async def test_rls_enabled_on_all_eleven_tables(db_session):
    """MUL-02: relrowsecurity + relforcerowsecurity on all tenant-domain tables.

    68-05: plan_template_item dropped (0013); account/goal/savings_config added
    with FORCE RLS (alembic 0012/0015). Cover them so a future migration that
    forgets RLS on a money-bearing table fails this guard.
    """
    domain_tables = (
        "category",
        "budget_period",
        "planned_transaction",
        "actual_transaction",
        "subscription",
        "category_embedding",
        "ai_conversation",
        "ai_message",
        "account",         # NEW (0012) — money balances
        "goal",            # NEW (0015)
        "savings_config",  # NEW (0015)
    )
    # ... rest unchanged: the set-equality + relrowsecurity/relforcerowsecurity
    # loop already proves enablement for every listed table.
```

## Info

### IN-01: Docstring contradicts assertion in `test_seeds_eight_plus_savings_categories`

**File:** `tests/test_onboarding.py` (commit `fcbc408`, the
`test_no_seed_when_flag_false` → `test_seeds_eight_plus_savings_categories` rename)
**Issue:** The docstring says intent is preserved by "asserting the deterministic
v1.0 category count **and that a period is created**," but the body correctly
asserts `period.status_code == 404` (period is *not* created at onboarding — it's
lazy per `_resolve_period_for_date`). The assertion matches the verified v1.0
contract; only the docstring prose is stale/contradictory. No behavioral impact.
**Fix:** Reword the docstring to "...and that NO period is created at onboarding
(created lazily on first transaction)."

### IN-02: `seed_plan_template_item` stub raises rather than no-ops — good, but module docstring is misleading

**File:** `tests/helpers/seed.py:37-42` vs `232-256`
**Issue:** The top-of-file NOTE (lines 37-42) says the helper "stubs the seed
helper as a deprecated no-op," but the implementation (lines 252-256) correctly
raises `NotImplementedError` (which is the *right* call — a silent no-op here would
be exactly the kind of green-manufacturing weakening this review hunts for). The
comment understates the actual, better behavior.
**Fix:** Update the NOTE to say "raises `NotImplementedError`" so a future reader
doesn't 'fix' it back into a silent no-op.

### IN-03: Repeated inline ПДн-consent UPDATE duplicated across fixtures instead of using the shared helper

**File:** `tests/test_onboarding.py`, `tests/test_periods.py`,
`tests/test_security_probes.py` (sp11/sp12 fixtures)
**Issue:** 68-05 added a `grant_pdn_consent(session_factory, tg_user_id=...)` helper
in `tests/helpers/onboarding.py:71-87`, but several fixtures still hand-roll the
identical `UPDATE app_user SET pdn_consent_at = :ts ...` raw SQL inline. This is
harmless duplication (the values match), but it defeats the purpose of the shared
helper and risks drift if the consent column ever changes.
**Fix:** Replace the inline UPDATE blocks with
`await grant_pdn_consent(SessionLocal, tg_user_id=owner_tg_id)`.

---

## Verdict

**The green results are trustworthy.** Every flipped/migrated assertion was
cross-checked against the actual route, service, and alembic source and reflects
the genuine v1.0 contract — not `assert True`, not a no-op, not a tolerance grab.
The two embedding skips have real, verified replacement coverage in
`test_embedding_backfill.py`. The `populate_existing=True` change re-reads fresh DB
state and keeps exact numeric assertions, so it is not tautological. The 410 and
409-structured-dict expectations match the routers byte-for-byte.

The one substantive issue (**WR-01**) is a security-test *coverage gap* introduced
by trimming the RLS table list without adding the three new RLS-bearing v1.0
tables. It does not make this PR's green dishonest, but it should be fixed before
relying on `test_rls_enabled_*` as the regression guard for tenant isolation on
money-bearing tables.

---

_Reviewed: 2026-05-20T20:50:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
