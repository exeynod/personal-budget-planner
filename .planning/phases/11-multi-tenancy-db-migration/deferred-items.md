# Phase 11 — Deferred Items

Out-of-scope discoveries during plan execution; tracked here for later resolution.

---

## D-11-04-01 — Test DB schema is stale (missing Phase 10 columns)

**Discovered during:** Plan 11-04 (post-implementation pytest run)

**Symptom:** `tests/test_auth.py::test_owner_whitelist_valid` fails with:
```
asyncpg.exceptions.UndefinedColumnError: column "enable_ai_categorization" of relation "app_user" does not exist
```

**Root cause:** The local test database at `DATABASE_URL` was last migrated before
Phase 10 (which added `app_user.enable_ai_categorization`) and has not been
re-migrated since. ORM models include the column; raw INSERTs fail.

**Why deferred:** Plan 11-04 execution rules explicitly forbid running
`alembic upgrade head` — that is Plan 11-07's responsibility (full upgrade
including the new 0006 multitenancy revision). Running `alembic upgrade head`
now would also apply 0006 prematurely, conflating test results.

**Resolution:** Plan 11-07 will run `alembic upgrade head` end-to-end and
re-validate the test suite. The pre-existing stale test DB will be remediated
as part of that workflow (drop test DB, recreate, run migrations).

**Verified pre-existing:** Same failure reproduces on `git stash` (no local
changes) — confirmed unrelated to Plan 11-04 code modifications.
