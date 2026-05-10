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
