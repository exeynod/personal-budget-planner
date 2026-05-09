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

---
