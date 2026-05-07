---
phase: 11-multi-tenancy-db-migration
plan: 04
subsystem: dependencies-rls-glue
tags: [dependencies, fastapi, di, dev-seed, set-local, rls-glue]
requires:
  - alembic-revision: "0006_multitenancy_user_id_rls_role (Plan 11-02)"
  - orm: "AppUser.role + 9 domain user_id Mapped columns (Plan 11-03)"
  - existing: "get_current_user (returns dict with tg_user_id), get_db (AsyncSession factory)"
provides:
  - dependency: "get_current_user_id(current_user, db) -> int — resolves app_user.id (PK) from tg_user_id"
  - dependency: "get_db_with_tenant_scope(user_id) -> AsyncGenerator[AsyncSession, None] — yields session with SET LOCAL app.current_user_id"
  - helper: "set_tenant_scope(session, user_id) — bind-param SET LOCAL for reuse from worker/tests"
  - dev-seed: "OWNER AppUser created/updated with role=UserRole.owner (idempotent)"
affects:
  - downstream Plan 11-05 (services): can now accept user_id: int parameter from get_current_user_id
  - downstream Plan 11-06 (routes): swap get_db → get_db_with_tenant_scope on user-scoped endpoints
  - downstream Plan 11-07 (verification): RLS sees app.current_user_id GUC set per request
  - Phase 12 (auth refactor): get_current_user_id signature stays stable; only get_current_user internals change
tech-stack:
  added: []
  patterns:
    - "FastAPI Depends-chain: get_current_user → get_current_user_id → get_db_with_tenant_scope"
    - "SET LOCAL via session.execute(text('SET LOCAL app.current_user_id = :uid'), {'uid': user_id}) — bind param, not f-string (T-11-04-01 mitigation)"
    - "Transaction-scoped GUC: COMMIT/ROLLBACK auto-resets app.current_user_id (T-11-04-03 mitigation)"
    - "Idempotent dev seed: insert-with-role OR coerce-existing-role"
key-files:
  created: []
  modified:
    - app/db/session.py
    - app/api/dependencies.py
    - app/dev_seed.py
decisions:
  - "set_tenant_scope helper lives in app/db/session.py (not dependencies.py) — reusable by worker/tests/CLI without FastAPI import dependency"
  - "Inline `from sqlalchemy import text` inside set_tenant_scope to avoid adding a new top-level import to a small file (existing top-level imports kept lean)"
  - "get_current_user_id raises HTTPException 403 with generic detail 'AppUser not found for current Telegram user' — no PII / no tg_user_id leak (T-11-04-04 mitigation)"
  - "get_db_with_tenant_scope follows the same try/yield/commit/except/rollback shape as the existing get_db — minimizes review diff"
  - "dev_seed.py converts the prior `elif user.onboarded_at is None` branch to a full `else:` block so onboarding-fixup AND role-fixup both run idempotently for an existing OWNER row"
  - "get_current_user, get_db, verify_internal_token left untouched per execution_rules — Phase 12 will modify get_current_user separately"
metrics:
  tasks_completed: 3
  files_created: 0
  files_modified: 3
  duration_min: ~3
  completed_date: "2026-05-06"
  commits:
    - "b701373: feat(11-04): add set_tenant_scope helper for SET LOCAL app.current_user_id"
    - "988fb99: feat(11-04): add get_current_user_id + get_db_with_tenant_scope deps"
    - "f8b724f: feat(11-04): dev_seed sets role=UserRole.owner for OWNER user"
---

# Phase 11 Plan 04: Dependencies Refactor (get_current_user_id, SET LOCAL middleware, dev_seed role=owner) Summary

Added the dependency-injection bridge between Plan 11-02/03 (DB schema + ORM) and Plans 11-05/06 (services + routes refactor): `set_tenant_scope` helper, `get_current_user_id` FastAPI dep, `get_db_with_tenant_scope` FastAPI dep, and dev_seed updated to set `role=UserRole.owner` on the OWNER user idempotently.

## What was built

### 1. `app/db/session.py` — `set_tenant_scope` helper (+25 lines)

New coroutine appended after the existing `get_db`:

```python
async def set_tenant_scope(session: AsyncSession, user_id: int) -> None:
    """Установить app.current_user_id GUC для текущей transaction (Phase 11 MUL-02)."""
    from sqlalchemy import text

    await session.execute(
        text("SET LOCAL app.current_user_id = :uid"),
        {"uid": user_id},
    )
```

Key properties:

- **Bind parameter**, not f-string — defends against any future caller passing tainted input (T-11-04-01).
- **Transaction-scoped** SET LOCAL — value resets on COMMIT/ROLLBACK (T-11-04-03).
- **Reusable** from API request lifecycle, worker per-tenant iteration, and tests.

### 2. `app/api/dependencies.py` — two new deps (+74 / −3 lines)

**Imports added** (delta only):

```python
from typing import Annotated, AsyncGenerator   # was: AsyncGenerator
from fastapi import Depends, Header, HTTPException, status  # added Depends
from sqlalchemy import select                              # new
from app.db.models import AppUser                          # new
from app.db.session import AsyncSessionLocal, set_tenant_scope  # added set_tenant_scope
```

**`get_current_user_id`** — async dep, signature `(current_user, db) -> int`:

- Resolves `AppUser.id` (PK) from validated `current_user["id"]` (which is `tg_user_id`).
- Returns `int` so service layer can do `select(Model).where(Model.user_id == user_id)`.
- Raises `HTTPException(403, "AppUser not found for current Telegram user")` if no row exists. This intentionally matches the existing OWNER_TG_ID whitelist semantics — Phase 12 will replace the body of `get_current_user` (role-check) without touching this dep.
- Cached per-request automatically by FastAPI's Depends graph — only one SELECT per request.

**`get_db_with_tenant_scope`** — async generator dep, signature `(user_id) -> AsyncSession`:

- Opens an `AsyncSessionLocal()`, calls `set_tenant_scope(session, user_id)` BEFORE `yield`, ensures RLS policy `user_id = coalesce(current_setting('app.current_user_id', true)::bigint, -1)` sees the correct user before any application query runs (T-11-04-02 mitigation: SET LOCAL in same transaction as queries).
- Standard `try / yield / commit / except / rollback` shape mirroring `get_db`.

**Untouched** (per execution_rules):

- `get_db`, `get_current_user`, `verify_internal_token` bodies all unchanged. Existing routes that use `get_db` continue to work.

### 3. `app/dev_seed.py` — role=UserRole.owner (+11 / −2 lines)

**Import added:** `UserRole` from `app.db.models`.

**Behavior change for OWNER upsert:**

- Insert path (`if user is None`): `role=UserRole.owner` set on `AppUser(...)` ctor → satisfies `app_user.role NOT NULL DEFAULT 'member'` with a real `'owner'` value for the seed.
- Update path: replaced `elif user.onboarded_at is None: user.onboarded_at = ...` with a full `else:` block that fixes onboarded_at AND coerces `user.role = UserRole.owner` if it isn't already. Idempotent across:
  - Fresh DEV deploys (insert path runs, role set on creation).
  - Restarts after migration backfill set `role='owner'` (else-block is a no-op for role since it's already owner).
  - Restarts where the OWNER row exists with stale `role='member'` (else-block coerces to owner).

`_DEFAULT_CATEGORIES`, `_SAMPLE_TXNS`, period creation, category insert, transaction insert — all untouched.

## Pattern for downstream plans

Plans 11-05 and 11-06 will swap user-scoped routes from:

```python
@router.get("/categories")
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ...
```

to:

```python
@router.get("/categories")
async def list_categories(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    return await cat_svc.list_categories(db, user_id=user_id)
```

Public/internal-token endpoints (e.g. `/api/v1/internal/*`) continue using `get_db`.

## Phase 12 forward-compat note

Phase 12 will switch `get_current_user` body from OWNER_TG_ID-eq to a `role IN (owner, member)` check. The signature of `get_current_user` and `get_current_user_id` stays the same — `get_current_user_id` continues returning `app_user.id` regardless of role-check mechanism.

## Threat model coverage

| Threat ID | Mitigated? | Where |
|-----------|-----------|-------|
| T-11-04-01 (GUC SQL injection via SET LOCAL) | Yes | `session.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})` — bind param, not string concat |
| T-11-04-02 (SET LOCAL race / wrong transaction) | Yes | `get_db_with_tenant_scope` calls `set_tenant_scope` BEFORE first yield; same `AsyncSessionLocal()` context owns both the SET and the queries |
| T-11-04-03 (Connection-pool GUC leak between requests) | Yes (by design) | `SET LOCAL` is transaction-scoped — resets on COMMIT/ROLLBACK; both paths covered by try/except in dep |
| T-11-04-04 (403 leaks user info) | Yes | Generic `"AppUser not found for current Telegram user"` — no tg_user_id, no app_user.id, no email in detail |
| T-11-04-05 (dev_seed runs in production) | Accepted | `app.main_api` lifespan checks `settings.DEV_MODE` before calling `seed_dev_data` (existing gate, unchanged) |
| T-11-04-06 (Extra SELECT per request) | Accepted | Single SELECT id WHERE on indexed UNIQUE column; FastAPI Depends-cache means one call per request |

## Deviations from Plan

### None requiring action

The plan executed exactly as written. No automatic Rule-1/Rule-2/Rule-3 fixes triggered. No checkpoints. No auth gates. No architectural decisions.

### Documentation note (no code impact)

The plan's `<context>` block referenced `app/core/db.py` as the location of "async session factory — needs SET LOCAL hook", but the actual file is `app/db/session.py`. The plan's `<tasks>` body, `<verification>` snippets, and frontmatter `files_modified` list all correctly point to `app/db/session.py`. Implementation followed the task body — no ambiguity in execution.

### Verbatim block adaptation (no semantic change)

Task 3's `<action>` provided a verbatim "find" block whose comment noted "около строки 95-108" with the existing `elif user.onboarded_at is None:` branch. The implementation matched the prescribed `else:` replacement exactly. No re-ordering, no extra logic.

## Deferred Issues

| ID | File | Description |
|----|------|-------------|
| D-11-04-01 | `tests/test_auth.py` (and likely others touching `app_user`) | Pre-existing failure: local test DB schema is stale (missing Phase 10 column `enable_ai_categorization`). Fails on `git stash` baseline — unrelated to Plan 11-04. Tracked in `.planning/phases/11-multi-tenancy-db-migration/deferred-items.md`. Resolution: Plan 11-07 (full `alembic upgrade head` + test DB rebuild). |

## Verification status

All checks pass:

1. **Compile:** `python3 -m py_compile app/api/dependencies.py app/db/session.py app/dev_seed.py` — exit 0.
2. **Imports (5 deps):** `from app.api.dependencies import get_db, get_current_user, get_current_user_id, get_db_with_tenant_scope, verify_internal_token` — exit 0.
3. **Imports (session helpers):** `from app.db.session import set_tenant_scope, AsyncSessionLocal, get_db, async_engine` — exit 0.
4. **Imports (dev_seed + UserRole):** `from app.dev_seed import seed_dev_data; from app.db.models import UserRole; print(UserRole.owner.value)` → `owner`.
5. **`set_tenant_scope` count:** `grep -c "set_tenant_scope" app/db/session.py app/api/dependencies.py` → `1` + `2` (helper defined + 1 import + 1 use) ≥ 2.
6. **`SET LOCAL` count:** `grep -c "SET LOCAL app.current_user_id" app/db/session.py` → `1`.

Function shapes:

- `get_current_user_id` — coroutine (`inspect.iscoroutinefunction == True`), params `[current_user, db]`, return annotation `'int'`.
- `get_db_with_tenant_scope` — async generator (`inspect.isasyncgenfunction == True`), param `[user_id]`.
- `set_tenant_scope` — coroutine.

### Frontmatter `must_haves.truths` audit (all 7 verified)

1. ✓ `get_current_user_id(db, current_user) → int` returns `app_user.id` (PK) — verified via `select(AppUser.id).where(AppUser.tg_user_id == tg_user_id)` in source.
2. ✓ `get_db_with_tenant_scope(user_id, db)` runs `SET LOCAL app.current_user_id = :uid` at start — verified `set_tenant_scope(session, user_id)` precedes `yield session`.
3. ✓ `get_db` (existing) untouched — `git diff` shows no changes to its body; remains available for public/internal endpoints.
4. ✓ `get_current_user` auth logic NOT modified — `OWNER_TG_ID whitelist` comment + `user.get("id") != settings.OWNER_TG_ID` check both still present verbatim.
5. ✓ dev_seed sets `role=UserRole.owner` on new OWNER row — `grep` finds 1 occurrence in insert path.
6. ✓ dev_seed sets `role` for existing OWNER if `member` — `user.role = UserRole.owner` in else-block.
7. ✓ Migration backwards compat: existing routes still see `get_db`; new routes will use `get_db_with_tenant_scope` — both are exported and importable.

### Frontmatter `must_haves.artifacts` audit

| Path | Provides | Contains check |
|------|----------|----------------|
| `app/api/dependencies.py` | get_current_user_id + get_db_with_tenant_scope | `get_current_user_id` (3 occurrences) ✓ + `SET LOCAL app.current_user_id` (1) ✓ |
| `app/db/session.py` | set_tenant_scope helper for reuse | `app.current_user_id` (3 occurrences) ✓ |
| `app/dev_seed.py` | Upsert OWNER with role=UserRole.owner | `UserRole.owner` (3 occurrences) ✓ |

### Frontmatter `must_haves.key_links` audit

- ✓ `app/api/dependencies.py (get_db_with_tenant_scope) → PostgreSQL session GUC` via `session.execute(text("SET LOCAL app.current_user_id = :uid"), ...)` — pattern present in `set_tenant_scope` helper called from the dep.
- ✓ `app/api/dependencies.py (get_current_user_id) → app/db/models.AppUser` via `select(AppUser.id).where(AppUser.tg_user_id == tg_user_id)` — pattern present verbatim.

## Self-Check: PASSED

- [x] `app/db/session.py` modified (FOUND, set_tenant_scope present).
- [x] `app/api/dependencies.py` modified (FOUND, both new deps present, legacy preserved).
- [x] `app/dev_seed.py` modified (FOUND, UserRole imported + applied to insert and existing-user paths).
- [x] Commit `b701373` (Task 1) exists in `git log`.
- [x] Commit `988fb99` (Task 2) exists in `git log`.
- [x] Commit `f8b724f` (Task 3) exists in `git log`.
- [x] All 6 verification checks from `<verification>` pass.
- [x] All 7 frontmatter `must_haves.truths` programmatically verified.
- [x] All 3 `must_haves.artifacts` content checks pass.
- [x] Both `must_haves.key_links` patterns present in source.
- [x] Threat model T-11-04-01..04 mitigations in place; T-11-04-05/06 explicitly accepted.
