---
phase: 68-tech-debt-cleanup
reviewed: 2026-05-20T00:00:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - app/services/admin_users.py
  - tests/helpers/seed.py
  - tests/test_ai_cap_integration.py
  - tests/test_spend_cap_concurrent.py
  - tests/test_categories.py
  - tests/test_e2e_multi_user_lifecycle.py
  - frontend/package.json
  - frontend/tsconfig.test.json
  - frontend/src/screensV10/Ai/__tests__/AiView.test.tsx
  - frontend/src/screensV10/Management/__tests__/SettingsView.test.tsx
  - ios/BudgetPlanner/Networking/Endpoints/AISuggestCategoryAPI.swift
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 68: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** deep
**Files Reviewed:** 11 (9 source + 2 config-adjacent verified)
**Status:** clean (2 INFO observations, no blockers)

## Summary

Phase 68 is a tech-debt cleanup that is overwhelmingly test infrastructure plus a
single one-line comment fix in iOS. The only non-test production change is the
removal of `plan_template_item` from `admin_users._PURGE_TABLES_ORDERED`. I traced
that change end-to-end and it is **correct and necessary**, not a regression.

All claims in the prompt were independently verified against the actual code:

- **A1 (Pro gating):** Verified `require_pro` (402) precedes `enforce_spending_cap`
  (429) in `dependencies.py` (`__all__` order + `is_pro` logic in `tier.py`). Seeding
  a future `pro_active_until` correctly routes the request past the 402 gate into the
  429 cap path the tests intend to exercise. Tests are **hardened**, not weakened.
- **A2 (`_PURGE_TABLES_ORDERED`):** Confirmed `plan_template_item` was genuinely
  dropped in `alembic/versions/0013_v10_category_ext.py:251` and the `PlanTemplateItem`
  ORM model no longer exists (only doc comments remain in `templates.py`,
  `planned.py`, `models.py`). The purge uses raw SQL `DELETE FROM {table}` over a
  hardcoded tuple — removing the dead table is correct; no FK-ordering implication
  since the table does not exist; no injection risk (table names are static literals,
  not user input). Remaining DELETE order stays FK-safe (children → parents).
- **A2 (`seed_category` defaults):** Verified `Category.code` is `String(40)` NOT NULL
  under partial-unique `uq_category_user_code (user_id, code) WHERE NOT is_archived`
  (`models.py:355`) and `ord` carries CHECK `ord ~ '^[0-9]{2}$'` (`models.py:371`).
  The monotonic `_CODE_COUNTER` default is collision-resistant (does not derive from
  `sort_order`, which can legitimately repeat); the suffix-then-truncate fits String(40);
  `_default_ord` clamps to 00..99 and `:02d` always satisfies the CHECK regex.
- **e2e contract migration (9 vs 14):** Verified `complete_v10` seeds exactly the 8
  `DEFAULT_CATEGORIES` + 1 system `savings` = 9 (`onboarding_v10.py:93-110`), and does
  NOT create a budget_period or starting balance — so the e2e_1 change to
  `starting_balance_cents == 0` is the **correct** v1.0 contract, not a softened
  assertion. The old `>= 14` / `>= 1` loose checks were artifacts of the dead legacy
  onboarding; the new exact `== 8` / `== 9` / `== 10` assertions are **stronger**.
- **Web tsconfig:** `npx tsc -p tsconfig.test.json --noEmit` runs clean (exit 0).
  `vitest globals: false` means tests import `describe/it/vi` explicitly, so the
  `types: ["node", "@testing-library/jest-dom"]` set is sufficient (no missing vitest
  globals). Prod build path (`tsc -b` via tsconfig.app/node) is untouched — no
  regression. Fixture literals `homeColor: 'coral'` and `theme: 'maximal_poster'`
  are valid members of `HomeColor` and `Theme`.
- **iOS:** Comment-only 0.5 → 0.35; confirmed backend `SUGGEST_THRESHOLD = 0.35`
  (`embedding_service.py:39`). Comment now matches reality.
- **Cross-cutting:** No secrets, no money-as-float, no RLS/tenant-scope regressions.
  `purge_user` still sets `app.current_user_id` GUC before the scoped DELETEs;
  e2e_3 correctly calls `set_tenant_scope` after `RESET ROLE` before category INSERTs.

## Info

### IN-01: `_default_ord` clamp silently collapses distinct out-of-range sort_orders

**File:** `tests/helpers/seed.py:101-103`
**Issue:** `_default_ord` clamps `sort_order` into 00..99, so e.g. `sort_order=100`
and `sort_order=101` both yield `ord="99"`. This is harmless today because `ord`
has no uniqueness constraint and the column is display-only, but a future test that
seeds many categories and asserts on distinct `ord` values would silently get
duplicates rather than a clear failure.
**Fix:** Acceptable as-is for a test helper. If stricter behavior is ever wanted,
raise on out-of-range input instead of clamping:
```python
def _default_ord(sort_order: int) -> str:
    if not 0 <= sort_order <= 99:
        raise ValueError(f"sort_order {sort_order} out of ord range 00..99; pass ord= explicitly")
    return f"{sort_order:02d}"
```

### IN-02: tsconfig.test.json `include` lists `src/test/setup.ts` redundantly

**File:** `frontend/tsconfig.test.json:21-24`
**Issue:** `include` lists both `"src"` and `"src/test/setup.ts"`; the second entry
is already covered by the first glob. Harmless but redundant.
**Fix:** Drop the second entry:
```json
"include": ["src"]
```

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
