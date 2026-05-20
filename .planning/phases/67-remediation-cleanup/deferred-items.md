# Deferred Items — Phase 67 remediation-cleanup

Out-of-scope discoveries logged during plan execution. NOT fixed (SCOPE BOUNDARY).

| Discovered During | Item | Detail | Status |
|---|---|---|---|
| 67-04 Task 1 (baseline) | `tests/test_categories.py::test_seed_creates_14_categories` fails | `POST /onboarding/complete` returns 422 (schema validation) — pre-existing, unrelated to embedding refresh (P1-1) or double-post (P1-2). Baseline failure present before 67-04 changes. | deferred — needs onboarding payload/schema investigation |
