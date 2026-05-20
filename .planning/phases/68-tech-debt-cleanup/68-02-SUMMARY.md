---
phase: 68-tech-debt-cleanup
plan: 02
subsystem: api
tags: [pytest, seed-fixtures, category-code-ord, onboarding-v10, rls, multi-tenant, tech-debt]

# Dependency graph
requires:
  - phase: 68-tech-debt-cleanup
    plan: 01
    provides: "seed_user(pro_active_until/trial_ends_at) — serialized before this plan to avoid a merge conflict on tests/helpers/seed.py"
  - phase: 22-backend-schema-foundation
    provides: "Category.code (String(40) slug) + Category.ord (String(2), CHECK ^[0-9]{2}$); onboarding_v10 endpoint (income_cents/accounts/category_plans); 8 default + 1 savings categories"
  - phase: 33-pdn-consent
    provides: "pdn_consent_at gate (CMP-33-04) — onboarding 403 without consent"
provides:
  - "seed_category(... code=, ord=) — populates NOT-NULL code (collision-resistant) + ord (valid 2-digit) systemically; no inline seed hack needed by any future test"
  - "Green baseline for tests/test_categories.py (10) + tests/test_e2e_multi_user_lifecycle.py (6)"
  - "admin user-revoke purge no longer crashes on the dropped plan_template_item table"
affects: [69-backend-baseline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All test Category seeds flow through seed_category — the helper supplies NOT-NULL code/ord; no test constructs Category(...) directly with inline code/ord"
    - "Tests exercising /onboarding/complete must use the v1.0 contract (income_cents/accounts/category_plans) + grant pdn_consent; legacy starting_balance_cents body is unmounted and 422s"

key-files:
  created:
    - .planning/phases/68-tech-debt-cleanup/68-02-SUMMARY.md
  modified:
    - tests/helpers/seed.py
    - tests/test_categories.py
    - tests/test_e2e_multi_user_lifecycle.py
    - app/services/admin_users.py

key-decisions:
  - "code default = slugified-name + process-wide monotonic suffix (itertools.count), NOT f'c{sort_order}' — two active categories for one user can share a sort_order and would collide on the partial-unique (user_id, code) WHERE NOT is_archived index (LOW-1)."
  - "ord default = sort_order clamped 00..99 as a 2-digit string (satisfies DB CHECK ck_category_ord_format ^[0-9]{2}$). The 2-digit regex is on ord, NOT code (verified against models.py:372)."
  - "422 root cause was a stale request CONTRACT, not a fixture/auth/schema-reject: /onboarding/complete is now the v1.0 endpoint (onboarding_v10, Phase 22 BE-15) requiring income_cents/accounts/category_plans and forbidding the legacy body via extra=forbid. Fix is test-side (post the v1.0 body), production validation left intact (T-68-02-02 mitigate)."
  - "e2e_3 switched off the dead legacy onboarding service (which inserted code=NULL/ord=NULL → NotNullViolation on the v1.0 schema) to onboarding_v10.complete_v10 + explicit backfill_user_embeddings, preserving the 'seeds + embeddings' intent."

patterns-established:
  - "Pattern: seed_category is the single sanctioned Category seed path; raw Category(...) in tests is an anti-pattern (NOT-NULL code/ord drift)."

requirements-completed: [A2]

# Metrics
duration: ~25min
completed: 2026-05-20
---

# Phase 68 Plan 02: Systemic seed_category (code+ord) + onboarding 422 (A2) Summary

**`seed_category` now systemically supplies the NOT-NULL `code` (collision-resistant slug) + `ord` (valid 2-digit) columns so no test needs an inline seed hack; the onboarding 422 was a stale request *contract* (the live endpoint is the v1.0 `onboarding_v10`, not the legacy Phase-2 body) — fixed test-side, turning both target files fully green.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 4 (3 test, 1 production)

## The 422 Root Cause (captured empirically)

Per the plan, I captured the actual `response.text` before deciding the fix. The 422 body was:

```
{"detail":[
  {"type":"missing","loc":["body","income_cents"],"msg":"Field required"},
  {"type":"missing","loc":["body","accounts"],"msg":"Field required"},
  {"type":"missing","loc":["body","category_plans"],"msg":"Field required"},
  {"type":"extra_forbidden","loc":["body","starting_balance_cents"]},
  {"type":"extra_forbidden","loc":["body","cycle_start_day"]},
  {"type":"extra_forbidden","loc":["body","seed_default_categories"]}
]}
```

This is NOT the planned hypotheses (db_client onboarded_at reset / auth mismatch / schema reject). The genuine cause: **`POST /api/v1/onboarding/complete` was replaced by the v1.0 endpoint** (`onboarding_v10_router`, Phase 22 BE-15 — `app/api/router.py:124-125` unmounts `onboarding_router` and mounts `onboarding_v10_router`). The v1.0 body (`OnboardingV10Body`, `ConfigDict(extra="forbid")`) requires `income_cents` / `accounts` / `category_plans` and **forbids** the legacy `starting_balance_cents` / `cycle_start_day` / `seed_default_categories` fields. The tests still posted the stale Phase-2 body → Pydantic 422.

Fix is test-side (post the v1.0 body + grant `pdn_consent_at`); production validation is left fully intact (threat T-68-02-02 mitigate — the route's input contract is preserved).

The v1.0 seed creates **8 default categories + 1 system 'savings' = 9** (not the legacy 14). Test assertions updated to the real count; the `test_seed_creates_14_categories` function name is kept for traceability with an explicit note that "14" was the legacy count.

## Accomplishments

- **Task 1 — systemic `seed_category` + 422 fix:**
  - `seed_category` gains `code: Optional[str]=None` (→ `_default_code`: slugified `name` + process-wide `itertools.count` suffix, truncated to String(40), collision-resistant across repeated calls for one user) and `ord: Optional[str]=None` (→ `_default_ord`: `sort_order` clamped 00..99 as 2-digit, satisfies `^[0-9]{2}$`). Verified the 2-digit regex is on **`ord`** (models.py:372), `code` is a free slug.
  - Removed the inline `code="coffee", ord="00"` hack in `tests/test_categories.py` (now routes through `seed_category`); dropped the now-unused `Category` import.
  - Updated both onboarding tests to the v1.0 contract + `pdn_consent` grant; `test_seed_creates_14_categories` asserts 9, `test_seed_idempotent_*` asserts the v1.0 reality (9 seeded; manual category coexists → 10; re-onboarding 409s, no duplicate seed).
- **Task 2 — e2e through `seed_category`:**
  - Replaced both raw `Category(...)` constructions — the single-line `cat_a`/`cat_b` (~351-352) and the multi-line `cat = Category(` (~510) — with `seed_category()`. Multiline-aware check (`rg -U --pcre2 '(?<!seed_)Category\('`) confirms **zero** raw constructions remain.
  - e2e_1 rewritten to the v1.0 onboarding contract (income/accounts/category_plans, consent granted, 9 categories, balance from the auto-created period = 0).
  - e2e_3 switched from the dead legacy onboarding service to `onboarding_v10.complete_v10` + explicit `backfill_user_embeddings` (the legacy service inserted `code=NULL`/`ord=NULL` and crashed on the v1.0 schema).

## Verification

```
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml \
  exec -T api /app/.venv/bin/python -m pytest \
  tests/test_categories.py tests/test_e2e_multi_user_lifecycle.py -q
→ 16 passed (10 categories + 6 e2e)
```

- `seed_category` signature exposes `code` + `ord` (inspect check passed).
- Zero raw `Category(...)` constructions remain in the e2e module (multiline-aware grep → 0).
- No alembic migration; no float introduced (money stays BIGINT cents).
- Stack restored to base+dev (`docker compose up -d`) after testing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed dropped `plan_template_item` from the admin purge order**
- **Found during:** Task 2 (e2e_6 revoke-cascade-purge)
- **Issue:** `app/services/admin_users.py::_PURGE_TABLES_ORDERED` still listed `plan_template_item` (dropped in alembic 0013, CONTEXT D-02). The FK-safe DELETE loop reached it and crashed every admin user-revoke with `UndefinedTableError: relation "plan_template_item" does not exist` — a real production bug blocking the target test e2e_6.
- **Fix:** Removed the dead table from the purge tuple (+ comment). No migration needed; the table genuinely no longer exists.
- **Files modified:** app/services/admin_users.py
- **Commit:** 81309e3

**2. [Scope expansion within the same root] e2e_1 / e2e_3 onboarding contract**
- **Found during:** Task 2
- **Issue:** The plan assumed e2e_1 already passed (posting the legacy onboarding body and asserting 200). In reality e2e_1 hit the same 422 as `test_seed_creates_14_categories`, and e2e_3 called the dead legacy onboarding service (NotNullViolation). Both are named must-go-green targets and live in a file I own.
- **Fix:** Rewrote e2e_1 to the v1.0 HTTP contract and e2e_3 to `complete_v10` + explicit embedding backfill — same root cause as Task 1 (legacy→v1.0 onboarding migration), no new architectural decision.
- **Files modified:** tests/test_e2e_multi_user_lifecycle.py
- **Commit:** 81309e3

## Environment note

Local `.venv` is broken; tests run inside the docker `api` container against the test stack
(`docker-compose.test.yml`, `/app/.venv/bin/python -m pytest`). After each `up -d --build api`
the runtime image is `--no-dev` (no pytest); running `uv sync --locked` inside the container
installs the dev group (pytest 8.4.2) into `/app/.venv` — this matches what the entrypoint's
`uv run` does on a fresh boot. Mirrored 68-01's invocation otherwise.

## Self-Check: PASSED
- FOUND: tests/helpers/seed.py (seed_category code+ord defaults)
- FOUND: tests/test_categories.py (inline hack removed, v1.0 onboarding)
- FOUND: tests/test_e2e_multi_user_lifecycle.py (seed_category, no raw Category()
- FOUND: app/services/admin_users.py (plan_template_item removed)
- FOUND commit: 84b0656 (Task 1)
- FOUND commit: 81309e3 (Task 2)
