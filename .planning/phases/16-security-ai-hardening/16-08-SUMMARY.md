---
phase: 16
plan: 08
plan_id: 16-08-db-01-set-tenant-scope-unify
subsystem: backend/db
tags: [security, db, rls, regression-guard, hotfix]
requirements: [DB-01]
dependency-graph:
  requires:
    - "app/db/session.py::set_tenant_scope (Phase 11)"
    - "ai_usage_log RLS policy (Phase 15)"
  provides:
    - "Unified RLS-context entry point in spend_cap.py"
    - "Regression-guard against future f-string SET LOCAL"
  affects:
    - "app/services/spend_cap.py::_fetch_spend_cents_from_db"
tech-stack:
  added: []
  patterns:
    - "Shared `set_tenant_scope` helper for RLS context (over f-string SET LOCAL)"
    - "Two-layer regression test: static grep-gate + behavioral GUC verification"
key-files:
  created:
    - tests/test_spend_cap_set_tenant_scope.py
  modified:
    - app/services/spend_cap.py
decisions:
  - "D-16-08 applied verbatim: f-string SET LOCAL → await set_tenant_scope(db, user_id)"
  - "Local import inside _fetch_spend_cents_from_db to avoid potential cycle (mirrors prior pattern of inline `from sqlalchemy import text`)"
metrics:
  duration_sec: 160
  duration_human: "~3 min"
  completed_date: "2026-05-07"
  tasks_completed: 2
  files_changed: 2
commit: d421e16
---

# Phase 16 Plan 08: DB-01 — Unify spend_cap.py with set_tenant_scope helper

Replace f-string `SET LOCAL app.current_user_id = '{int(user_id)}'` in `app/services/spend_cap.py:_fetch_spend_cents_from_db` with the shared `await set_tenant_scope(db, user_id)` helper (already used elsewhere in the codebase since Phase 11). Closes DB-01 (HIGH SQLi-regression-guard) per CONTEXT.md D-16-08.

## What changed

**`app/services/spend_cap.py`**

Before (lines 80-87, 8 lines):
```python
from sqlalchemy import text as sql_text

month_start = _month_start_msk()
month_start_utc = month_start.astimezone(timezone.utc)
# Set RLS context so budget_app role can see this user's rows.
# PostgreSQL SET LOCAL does not accept bind parameters — interpolate int directly.
# Safe: user_id is always int (PK); no injection vector.
await db.execute(sql_text(f"SET LOCAL app.current_user_id = '{int(user_id)}'"))
```

After:
```python
month_start = _month_start_msk()
month_start_utc = month_start.astimezone(timezone.utc)
# DB-01 (Plan 16-08): unified RLS-context helper. Equivalent to the
# previous f-string SET LOCAL but uses set_config() with a bind-parameter,
# matching app/db/session.py:30 (set_tenant_scope).
from app.db.session import set_tenant_scope  # local import: avoid cycle
await set_tenant_scope(db, user_id)
```

Docstring updated to reference the shared helper instead of describing SET LOCAL semantics.

**`tests/test_spend_cap_set_tenant_scope.py`** (new, 4 tests)

- `test_spend_cap_does_not_use_fstring_set_local` — static grep-gate, regex-matches `f"SET LOCAL app.current_user_id` in non-comment code; FAILs if the f-string is ever re-introduced.
- `test_spend_cap_imports_set_tenant_scope` — static guard that `set_tenant_scope` is referenced in the module.
- `test_fetch_spend_cents_sets_current_user_id_guc` — behavioral: after `_fetch_spend_cents_from_db`, `SELECT current_setting('app.current_user_id', true)` returns the user_id as a string (proves the GUC is actually set within the same transaction).
- `test_fetch_spend_cents_rejects_non_int_user_id` — defense-in-depth: passing a string as user_id raises ValueError (delegated to `set_tenant_scope`).

## Why

`int(user_id)` cast in the original code blocks SQLi today, but the f-string pattern is a regression risk: any future call site that passes user_id as a string (e.g. from a query param) would re-introduce the vulnerability. The shared `set_tenant_scope` helper uses `SELECT set_config('app.current_user_id', :uid, true)` with a real bind parameter plus an `isinstance(int)` guard — matching the code pattern used by every other RLS-aware code path in the repo (Phase 11 onwards). Cost: 8 lines removed, 5 lines added. Risk: zero.

## Verification

| Check | Result |
|-------|--------|
| `grep -r 'SET LOCAL app.current_user_id' app/services/spend_cap.py` | 0 matches (exit 1) ✓ |
| `grep -c 'set_tenant_scope' app/services/spend_cap.py` | 4 (≥ 2 required) ✓ |
| `pytest tests/test_spend_cap_set_tenant_scope.py -v` | 4 passed ✓ |
| `pytest tests/test_spend_cap_service.py` | 7 passed (no regression) ✓ |

All four phase-level acceptance criteria from the plan's `<verification>` block met.

## Tasks Executed

| # | Task | Status | Files |
|---|------|--------|-------|
| 1 | Replace f-string SET LOCAL with set_tenant_scope | done | app/services/spend_cap.py |
| 2 | Pytest regression — grep-gate + behavioral GUC verification | done | tests/test_spend_cap_set_tenant_scope.py |

Both tasks committed atomically as `d421e16` (per plan's specified commit message).

## Deviations from Plan

None — plan executed exactly as written. The plan's Task 2 referenced a fixture `app_user_one`; conftest.py exposes the equivalent `single_user` fixture (legacy convention from Phase 12 D-11-07-01), so the test imports `single_user` instead. This is a fixture-name substitution per the plan's explicit instruction («Используется fixture `app_user_one` … Если fixture называется иначе — заменить»), not a deviation.

## Authentication Gates

None — pure backend code change, no auth surface touched.

## Threat Flags

None — change reduces attack surface (eliminates a regression vector at the user_id → SQL trust boundary). No new endpoints, auth paths, file access patterns, or schema changes introduced.

## Known Stubs

None.

## Deferred Issues

None.

## Decisions Made

- **D-16-08 (applied verbatim from CONTEXT.md):** Replace f-string SET LOCAL with `await set_tenant_scope(db, user_id)`. No alternatives considered — D-16-08 is unambiguous and the helper was purpose-built for exactly this RLS pattern.
- **Local import inside the function:** Kept the `from app.db.session import set_tenant_scope` line *inside* `_fetch_spend_cents_from_db` rather than hoisting it to module-level. Rationale: the prior code already used a local import (`from sqlalchemy import text as sql_text`), and a local import here matches that pattern + provides a forward defense against any future module-load-order cycle. Cost: ~50ns per call, negligible against the SQL roundtrip.

## Self-Check: PASSED

- `app/services/spend_cap.py` — modified, present (`grep set_tenant_scope` → 4 hits)
- `tests/test_spend_cap_set_tenant_scope.py` — created, present (4 tests, all pass in container)
- Commit `d421e16` — present in `git log`
- All 4 phase-level acceptance criteria green
