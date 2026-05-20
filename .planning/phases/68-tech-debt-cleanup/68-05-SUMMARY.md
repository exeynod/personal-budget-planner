---
phase: 68-tech-debt-cleanup
plan: 05
subsystem: api
tags: [pytest, seed-fixtures, onboarding-v10, pdn-consent, rls, templates-deprecated, roundup, tech-debt]

# Dependency graph
requires:
  - phase: 68-tech-debt-cleanup
    plan: 02
    provides: "seed_category authoritative for NOT-NULL code/ord; onboarding 422 root-cause (v1.0 contract); admin_users plan_template_item product fix"
  - phase: 68-tech-debt-cleanup
    plan: 01
    provides: "seed_user(pro_active_until/trial_ends_at) optional-kwarg pattern"
  - phase: 22-backend-schema-foundation
    provides: "v1.0 schema — Category.code/ord/plan_cents/rollover/paused; onboarding_v10 endpoint; plan_template_item DROPPED (alembic 0013); template/snapshot WRITE 410 (CR-05)"
  - phase: 33-pdn-consent
    provides: "pdn_consent_at gate (CMP-33-04) — onboarding 403 without consent"
provides:
  - "Full backend pytest suite GREEN: 774 passed, 34 skipped, 1 xpassed, 0 failed, 0 errors — trusted baseline for Phase 69 codegen"
  - "seed_user(pdn_consent_at=...) optional grant; seed_category(plan_cents/rollover/paused=...) optional v1.0 columns"
  - "tests/helpers/onboarding.py — complete_onboarding_v10 / v10_onboarding_body / grant_pdn_consent shared helpers"
  - "Zero raw Category(...) constructors in tests outside seed.py"
affects: [69-backend-baseline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every Category seed flows through seed_category() — raw Category(...) in tests is now zero (verified via rg -U --pcre2 '(?<!seed_)Category\\(')"
    - "Tests hitting /onboarding/complete use complete_onboarding_v10 (v1.0 body) + grant pdn_consent; legacy starting_balance/seed_default_categories body is unmounted (422)"
    - "Async balance re-read after raw UPDATE...RETURNING uses select(...).execution_options(populate_existing=True) — NOT expire_all() (which lazy-loads outside the greenlet -> MissingGreenlet)"
    - "Deprecated template/snapshot WRITE endpoints assert 410 Gone (Phase 22 CR-05); apply-template asserts the documented v1.0 no-op (created=0)"

key-files:
  created:
    - tests/helpers/onboarding.py
    - .planning/phases/68-tech-debt-cleanup/68-05-SUMMARY.md
  modified:
    - tests/helpers/seed.py
    - tests/conftest.py
    - tests/test_actual_crud.py
    - tests/test_actual_period.py
    - tests/test_balance.py
    - tests/test_internal_bot.py
    - tests/test_close_period_job.py
    - tests/test_planned.py
    - tests/test_snapshot.py
    - tests/test_templates.py
    - tests/test_apply_template.py
    - tests/test_subscriptions.py
    - tests/test_security_probes.py
    - tests/test_periods.py
    - tests/test_periods_api.py
    - tests/test_settings.py
    - tests/test_onboarding.py
    - tests/test_onboarding_gate.py
    - tests/test_onboarding_existing_user_safety.py
    - tests/test_onboarding_concurrent.py
    - tests/test_multitenancy_v1_0_columns.py
    - tests/test_worker_charge.py
    - tests/test_admin_users_api.py
    - tests/test_rls_policy.py
    - tests/test_migrations_v1_0.py
    - tests/services/test_roundup.py
    - tests/services/test_savings.py
    - tests/services/test_accounts.py
    - tests/services/test_subscriptions_post.py
    - tests/services/test_onboarding_v10.py
    - tests/api/test_onboarding_v10_api.py
    - tests/api/test_internal_onboarding_reset.py
    - tests/api/test_actual_v10_extension.py
    - tests/api/test_savings_api.py
    - tests/api/test_ai_observation.py
    - tests/api/test_subscriptions_post_api.py
    - tests/api/test_plan_month_route.py
    - tests/api/test_categories_v10_patch.py
    - tests/jobs/test_close_period_rollover.py

key-decisions:
  - "TEST-ONLY: zero app/route/migration/model changes (the lone prior product fix, admin_users.py, was committed in 68-02). Verified `git status --short -- app/ alembic/` empty."
  - "Highest-leverage fix first: conftest two_tenants raw Category() seeds → seed_category cleared 10 errors in one edit; then suite-wide raw Category() migration cleared the ~70-error class A bulk."
  - "seed_category extended with optional plan_cents/rollover/paused (model-default fallbacks) so it stays the single authoritative seed even for system 'savings' categories (rollover=savings, paused=true) — preserving the original assertions, not weakening them."
  - "Class D (roundup): expire_all() raised MissingGreenlet (lazy IO outside greenlet under asyncio). Switched to select(...).execution_options(populate_existing=True) which overwrites the cached ORM attributes from the fresh DB row synchronously — async-safe."
  - "Class C period semantics: v1.0 onboarding does NOT eagerly create a budget_period (no starting_balance/seed flag); the period is created lazily on first transaction (D-52). test_periods/test_settings migrated to onboard → POST /actual → assert period, preserving the original 'period exists / unchanged after settings PATCH' intent."
  - "Class C already_onboarded 409: v1.0 triggers on EXISTING accounts (not onboarded_at) and returns a STRUCTURED dict detail {error: already_onboarded}. test_onboarding_existing_user_safety rewritten to seed an account + assert detail.error == already_onboarded != onboarding_required — preserving the frontend-collision-avoidance intent (Plan 14-05) under the new contract."
  - "Class G: template/snapshot WRITE (POST/PATCH/DELETE + snapshot-from-period) return 410 Gone immediately by design (Phase 22 CR-05); ~17 such tests flipped to assert 410. apply-template asserts the documented v1.0 no-op (created=0, planned=[]) since plan_template_item materialisation was removed (CONTEXT D-02) — a real product contract, not a no-op weakening."
  - "Embedding-during-onboarding decoupled in v1.0 (BE-15): 2 test_onboarding embedding tests skipped with explicit reason (covered by ai_embedding_backfill tests); test_onboarding_gate / isolation assert 0 embeddings post-onboarding."
  - "Class F migration head: allow-list extended through 0026_ai_usage_cost_cents (the real head) — reframed as 'DB at a v1.0-or-later head', not a brittle exact-pin."

patterns-established:
  - "tests/helpers/onboarding.py is the single sanctioned v1.0 onboarding-body path; inline legacy onboarding bodies are an anti-pattern (422 against the unmounted v0.x route)."

requirements-completed: [A2-suite]

# Metrics
duration: ~31min
completed: 2026-05-20
tasks: 3
files: 39
commits: 4
---

# Phase 68 Plan 05: Full Backend Suite Green Summary

Drove the entire backend pytest suite to a trusted green baseline by finishing the systemic test-seed/contract migration started in 68-02 — 126 pre-existing TEST-DEBT failures (62 failed + 64 errors) reduced to 0 across seven root-cause classes, with zero product/route/migration changes.

## Green Gate (acceptance) — final pytest summary

```
774 passed, 34 skipped, 1 xpassed, 5 warnings in 89.80s (0:01:29)
```

0 failed, 0 errors. Run inside the docker test stack:
`docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml exec -T api /app/.venv/bin/python -m pytest tests/ -q`

- Zero raw `Category(` outside `tests/helpers/seed.py`: `rg -U --pcre2 '(?<!seed_)Category\('` returns no matches.
- `git status --short -- app/ alembic/` empty — all changes are test-side.
- Stack restored to base+dev (`docker compose up -d`).

## Classes fixed (with counts)

| Class | Description | Count cleared |
|-------|-------------|---------------|
| A | raw `Category(...)` seeds → `seed_category()` (NOT-NULL code/ord) | ~70 errors |
| B | onboarding-v10 fixtures grant `pdn_consent_at` | ~24 |
| C | legacy onboarding body → v1.0 contract (`income_cents/accounts/category_plans` + consent) | ~13 |
| D | roundup balance re-read after raw UPDATE (`populate_existing`) | 4 |
| E | drop `plan_template_item` from admin-purge + RLS table lists (nine→eight) | 3 |
| F | migration head allow-list extended to `0026` | 1 |
| G | template/snapshot WRITE 410 Gone + apply-template no-op | ~17 |

(Class A was the highest-leverage: the shared `conftest.py::two_tenants` fixture fix alone cleared 10 errors; the suite-wide raw-`Category()` migration cleared the rest.)

## Deviations from Plan

None of substance — plan executed as written across all three tasks. Notable in-scope decisions:

- **Class D fix method changed mid-execution (Rule 1/3, blocking issue):** the plan suggested `db_session.refresh()` / `expire_all()`. `expire_all()` raised `sqlalchemy.exc.MissingGreenlet` (it defers a lazy IO load to attribute access, which happens outside the asyncpg greenlet). Switched to `select(...).execution_options(populate_existing=True)` — overwrites the cached ORM row synchronously from the fresh DB read. Same intent, async-safe. (test_roundup.py, commit 085f535)
- **Class C scope was larger than the 5-test apply-template note:** the whole `/template/snapshot-from-period` + `/template/items` write surface (~17 tests) returned 410, and `apply_template_to_period` is a permanent v1.0 no-op (`created=0`). Flipped writes to assert 410 (CR-05 decision) and apply-template to assert the no-op contract — preserving each test's intent against the real v1.0 behaviour, not weakening to a tautology.
- **2 embedding tests skipped (not migrated):** v1.0 onboarding (BE-15) decoupled embedding backfill from onboarding entirely; the response shape no longer carries `seeded_categories`/`embeddings_created`. Those two `test_onboarding` tests asserted the removed coupling, so they are `@pytest.mark.skip`'d with an explicit reason pointing at the dedicated `ai_embedding_backfill` tests — the honest representation of removed functionality (the plan permits skips).

## Authentication Gates

None.

## Known Stubs

None — no stub/placeholder patterns introduced; all changes are test fixtures/assertions wired to live endpoints and the real v1.0 contract.

## Self-Check: PASSED

- `tests/helpers/onboarding.py` — FOUND (created).
- `tests/helpers/seed.py` contains `pdn_consent_at` — FOUND.
- Commits dc556f7, 7b2a9dd, fcbc408, 085f535 — all present in `git log`.
- Full suite re-run: 774 passed / 0 failed / 0 errors.
- Zero raw `Category(` outside seed.py — confirmed.
