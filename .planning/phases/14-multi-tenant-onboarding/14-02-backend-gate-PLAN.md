---
phase: 14-multi-tenant-onboarding
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - app/api/dependencies.py
  - app/api/routes/categories.py
  - app/api/routes/actual.py
  - app/api/routes/planned.py
  - app/api/routes/templates.py
  - app/api/routes/subscriptions.py
  - app/api/routes/periods.py
  - app/api/routes/analytics.py
  - app/api/routes/ai.py
  - app/api/routes/ai_suggest.py
  - app/api/routes/settings.py
autonomous: true
requirements: [MTONB-04]
must_haves:
  truths:
    - "Member with onboarded_at IS NULL → any GET/POST/PATCH/DELETE on gated routers returns 409 with body `{\"detail\": {\"error\": \"onboarding_required\"}}`."
    - "Owner with onboarded_at set → all gated routers respond as before (no behaviour change)."
    - "Routers /me, /onboarding/*, /internal/*, /admin/*, /health remain reachable for not-onboarded members."
  artifacts:
    - path: "app/api/dependencies.py"
      provides: "require_onboarded dependency"
      contains: "async def require_onboarded"
    - path: "app/api/routes/categories.py"
      provides: "categories_router with require_onboarded gate"
      contains: "Depends(require_onboarded)"
    - path: "app/api/routes/ai_suggest.py"
      provides: "ai_suggest_router with require_onboarded gate"
      contains: "Depends(require_onboarded)"
  key_links:
    - from: "app/api/dependencies.py:require_onboarded"
      to: "AppUser.onboarded_at"
      via: "current_user.onboarded_at is None check"
      pattern: "onboarded_at is None"
    - from: "9 gated routers"
      to: "require_onboarded"
      via: "router-level dependencies=[Depends(...)]"
      pattern: "Depends\\(require_onboarded\\)"
---

<objective>
Implement the backend onboarding gate (MTONB-04 / D-14-01). Adds `require_onboarded` FastAPI dependency that raises HTTPException(409, detail={"error": "onboarding_required"}) when `current_user.onboarded_at IS NULL`. Apply it as a router-level dependency to every gated domain router.

Purpose: Until a member completes onboarding, they have no `user_id`-scoped categories / periods / templates — domain endpoints would either crash or return empty. A semantic 409 lets the frontend redirect to OnboardingScreen deterministically.
Output: 1 new dependency + 9 router-level wirings; Plan 14-01 RED tests turn GREEN.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@.planning/phases/12-role-based-auth-refactor/12-CONTEXT.md
@./CLAUDE.md

<interfaces>
From `app/api/dependencies.py` (existing pattern to mirror):
```python
async def require_owner(
    current_user: Annotated[AppUser, Depends(get_current_user)],
) -> AppUser:
    if current_user.role != UserRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner role required for this endpoint",
        )
    return current_user
```

From `app/db/models.py:AppUser`:
```python
onboarded_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
```

Each gated router is currently shaped like:
```python
some_router = APIRouter(
    prefix="/...",
    tags=["..."],
    dependencies=[Depends(get_current_user)],
)
```
We append `Depends(require_onboarded)` to that list. `require_onboarded` itself depends on `get_current_user` so FastAPI's dep cache prevents double-resolution.

Routers using `router = APIRouter(...)` (variable name `router` not `<x>_router`):
- `app/api/routes/ai.py` — line 52
- `app/api/routes/ai_suggest.py` — line 25
- `app/api/routes/analytics.py` — line 30
- `app/api/routes/subscriptions.py` — line 37
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add require_onboarded dependency to app/api/dependencies.py</name>
  <files>app/api/dependencies.py</files>
  <read_first>
    - app/api/dependencies.py (full file — append below `require_owner` for symmetry)
    - tests/test_require_onboarded.py (created in 14-01 — see exact assertions on status code AND body shape)
  </read_first>
  <behavior>
    After this task:
    - `pytest tests/test_require_onboarded.py -x` → 4/4 GREEN (was 4/4 ImportError).
    - `from app.api.dependencies import require_onboarded` succeeds in any module.
    - 409 body MUST be exactly `{"detail": {"error": "onboarding_required"}}` after FastAPI serialisation. FastAPI serialises `HTTPException(detail=dict)` such that the dict appears verbatim under the top-level `detail` key.
  </behavior>
  <action>
    Insert immediately AFTER the `require_owner` definition in `app/api/dependencies.py` (preserve existing imports — `HTTPException`, `status`, `Annotated`, `Depends`, `AppUser` are already imported):

    ```python
    async def require_onboarded(
        current_user: Annotated[AppUser, Depends(get_current_user)],
    ) -> AppUser:
        """Gate domain endpoints behind completed onboarding (Phase 14 MTONB-04, D-14-01).

        Raises HTTPException(409) with detail={"error": "onboarding_required"}
        when current_user.onboarded_at IS NULL. Used as a router-level
        dependency on /categories, /actual, /planned, /templates,
        /subscriptions, /periods, /analytics, /ai, /ai/suggest-category,
        /settings.

        NOT applied to:
        - /me                      (frontend uses it to drive routing)
        - /onboarding/*            (target of redirect)
        - /internal/*              (X-Internal-Token, no user context)
        - /admin/*                 (require_owner; owner is always onboarded)
        - /health                  (infra probe)

        Returns the same AppUser passed in so dependency chains can re-use
        without an additional SELECT (FastAPI dep cache deduplicates
        get_current_user across the request).
        """
        if current_user.onboarded_at is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "onboarding_required"},
            )
        return current_user
    ```

    Update the module docstring (lines 1-12) to mention the new gate:
    ```
    Phase 14 refactor (MTONB-04):
    - require_onboarded gates domain endpoints; returns 409 onboarding_required
      when current_user.onboarded_at IS NULL.
    ```
    Append to the existing Phase 12 docstring block — do NOT replace.

    Verify by running: `pytest tests/test_require_onboarded.py -x` — all 4 must pass.
  </action>
  <verify>
    <automated>
    pytest tests/test_require_onboarded.py -x --no-header 2>&1 | tail -5 | grep -E "(4 passed|passed.*4)" &amp;&amp; \
    grep -c "async def require_onboarded" app/api/dependencies.py | grep -q "^1$" &amp;&amp; \
    grep -c "onboarding_required" app/api/dependencies.py | grep -q "^1$"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "async def require_onboarded" app/api/dependencies.py` returns exactly one match.
    - `grep -c '"error": "onboarding_required"' app/api/dependencies.py` == 1.
    - `grep -n "status.HTTP_409_CONFLICT" app/api/dependencies.py` returns at least one match (the new dependency).
    - `pytest tests/test_require_onboarded.py -x` — exit code 0, 4 passed.
    - `pytest tests/test_require_owner.py -x` — exit code 0 (no regression on Phase 12 dep).
  </acceptance_criteria>
  <done>require_onboarded exported, RED tests from 14-01 turn GREEN.</done>
</task>

<task type="auto">
  <name>Task 2: Apply require_onboarded as router-level dependency on all 10 gated routers</name>
  <files>
    app/api/routes/categories.py,
    app/api/routes/actual.py,
    app/api/routes/planned.py,
    app/api/routes/templates.py,
    app/api/routes/subscriptions.py,
    app/api/routes/periods.py,
    app/api/routes/analytics.py,
    app/api/routes/ai.py,
    app/api/routes/ai_suggest.py,
    app/api/routes/settings.py
  </files>
  <read_first>
    - app/api/routes/categories.py (lines 1-40 — current router definition + imports)
    - app/api/routes/actual.py (lines 1-50)
    - app/api/routes/planned.py (lines 1-50)
    - app/api/routes/templates.py (lines 1-40)
    - app/api/routes/subscriptions.py (lines 1-50)
    - app/api/routes/periods.py (lines 1-40)
    - app/api/routes/analytics.py (lines 1-40)
    - app/api/routes/ai.py (lines 1-60)
    - app/api/routes/ai_suggest.py (lines 1-30)
    - app/api/routes/settings.py (lines 1-30)
    - app/api/router.py (full — confirms NO include_router-level overrides exist for these; gate is router-internal)
  </read_first>
  <action>
    For each of the 10 files, two surgical edits:

    **Edit A — Add `require_onboarded` to the existing import line.** Each file already imports from `app.api.dependencies`; append `require_onboarded` to that import. Examples:

    Before (categories.py lines ~21-25):
    ```python
    from app.api.dependencies import (
        get_current_user,
        get_current_user_id,
        get_db_with_tenant_scope,
    )
    ```
    After:
    ```python
    from app.api.dependencies import (
        get_current_user,
        get_current_user_id,
        get_db_with_tenant_scope,
        require_onboarded,
    )
    ```

    For files with single-line imports (likely `settings.py`):
    ```python
    from app.api.dependencies import get_current_user, get_db, require_onboarded
    ```

    **Edit B — Append `Depends(require_onboarded)` to the router's `dependencies=[...]` list.** Examples:

    Before:
    ```python
    categories_router = APIRouter(
        prefix="/categories",
        tags=["categories"],
        dependencies=[Depends(get_current_user)],
    )
    ```
    After:
    ```python
    categories_router = APIRouter(
        prefix="/categories",
        tags=["categories"],
        dependencies=[Depends(get_current_user), Depends(require_onboarded)],
    )
    ```

    **File-by-file router variable map** (verify via grep before editing):
    | File | Router var | Prefix |
    |------|-----------|--------|
    | categories.py | `categories_router` | `/categories` |
    | actual.py | `actual_router` | (none — multi-prefix; check file) |
    | planned.py | `planned_router` | (none) |
    | templates.py | `templates_router` | `/template` (likely) |
    | subscriptions.py | `router` | `/subscriptions` |
    | periods.py | `periods_router` | `/periods` |
    | analytics.py | `router` | `/analytics` |
    | ai.py | `router` | `/ai` |
    | ai_suggest.py | `router` | (mounted with prefix `/ai` in router.py — see line 129) |
    | settings.py | `settings_router` | `/settings` |

    **Surgical rule** — make MINIMAL changes. Do not move other code, do not reorder imports beyond adding `require_onboarded` to the existing dep import block.

    **DO NOT** add `require_onboarded` to:
    - `app/api/router.py` `public_router` (would gate /me)
    - `app/api/routes/onboarding.py` (target of redirect)
    - `app/api/routes/admin.py` (already gated by `require_owner`; owner has `onboarded_at` set)
    - any `/internal/*` router

    **Verification step (run inside this task):** Sanity-check via grep:
    ```bash
    grep -l "Depends(require_onboarded)" app/api/routes/*.py | wc -l
    ```
    Expected: 10. If less, find the missing file and add.

    Add a consolidated comment near the top of `app/api/router.py` (after Phase 12 ROLE-05 docstring block, before the imports section) — single block, do NOT modify imports themselves:
    ```python
    # Phase 14 (MTONB-04, D-14-01): each gated domain router carries its own
    # Depends(require_onboarded) (added in Plan 14-02). /me, /onboarding/*,
    # /internal/*, /admin/*, /health remain reachable for not-yet-onboarded
    # members so the frontend can drive the bot-bind → balance → cycle_day flow.
    ```
  </action>
  <verify>
    <automated>
    grep -l "Depends(require_onboarded)" app/api/routes/categories.py app/api/routes/actual.py app/api/routes/planned.py app/api/routes/templates.py app/api/routes/subscriptions.py app/api/routes/periods.py app/api/routes/analytics.py app/api/routes/ai.py app/api/routes/ai_suggest.py app/api/routes/settings.py | wc -l | grep -q "^10$" &amp;&amp; \
    ! grep -l "Depends(require_onboarded)" app/api/routes/onboarding.py app/api/routes/admin.py app/api/routes/internal_bot.py app/api/routes/internal_telegram.py 2>/dev/null &amp;&amp; \
    pytest tests/test_require_onboarded.py tests/test_onboarding.py tests/test_categories.py -x --no-header 2>&1 | tail -5
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -l "Depends(require_onboarded)" app/api/routes/*.py | wc -l` outputs `10` exactly.
    - `grep -L "Depends(require_onboarded)" app/api/routes/onboarding.py` outputs the file path (i.e. NOT gated — onboarding remains reachable).
    - `grep -c "Depends(require_onboarded)" app/api/routes/admin.py` outputs `0` (admin already gated by `require_owner`).
    - `grep -c "Depends(require_onboarded)" app/api/routes/internal_bot.py app/api/routes/internal_telegram.py` outputs `0` for each (internal endpoints exempt).
    - `pytest tests/test_categories.py tests/test_actual_crud.py tests/test_planned.py tests/test_templates.py tests/test_subscriptions.py tests/test_periods_api.py tests/test_analytics.py tests/test_settings.py -x` — all pass (no regression because existing tests seed `onboarded_at != NULL`). If any test fails, audit the seed call and add `onboarded_at=datetime.now(timezone.utc)`.
    - `pytest tests/test_require_onboarded.py tests/test_onboarding.py -x` — all pass.
  </acceptance_criteria>
  <done>10 routers gated by require_onboarded; existing onboarded-user test suite remains GREEN; not-onboarded users get 409 from any of those routers.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Mini App → /api/v1/* (gated routers) | Untrusted initData crosses; new gate adds onboarded-state check after role check. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-02-01 | Information disclosure | 409 detail body distinguishes "not authorised" from "not onboarded" — could leak that an account exists | accept | Frontend needs the specific error to drive UX; the leak is identical to the existing `chat_id_known` field already returned by /me. |
| T-14-02-02 | Tampering / bypass | Forgetting to gate a new domain router | mitigate | Acceptance criterion #1 enforces grep count == 10; new routers added in future phases must include the gate explicitly (documented in `app/api/router.py` block comment). |
| T-14-02-03 | Spoofing | Member crafting initData for a different tg_user_id | mitigate (existing) | Phase 12 HMAC validation already prevents this; this plan inherits without weakening. |
| T-14-02-04 | Denial of service | Member spam-hits gated endpoint pre-onboarding | accept | 409 returns immediately after dep chain (single SELECT for `get_current_user`); cost equivalent to authenticated request, no DB write. |
</threat_model>

<verification>
- `pytest tests/test_require_onboarded.py -x` → 4/4 GREEN.
- Existing `pytest tests/test_categories.py tests/test_actual_crud.py tests/test_periods_api.py tests/test_subscriptions.py tests/test_settings.py tests/test_analytics.py tests/test_planned.py tests/test_templates.py -x` → all GREEN (existing tests seed `onboarded_at` correctly).
- `pytest tests/test_onboarding.py -x` → GREEN (onboarding path explicitly NOT gated).
- `grep -l "Depends(require_onboarded)" app/api/routes/*.py | wc -l` == 10.
</verification>

<success_criteria>
- New `require_onboarded` exported from `app/api/dependencies.py`.
- 10 domain routers carry `Depends(require_onboarded)` at router level.
- `/me`, `/onboarding/*`, `/internal/*`, `/admin/*`, `/health` remain ungated.
- All Phase 14 RED tests from 14-01 (`test_require_onboarded.py`) turn GREEN.
- Zero regressions in existing GREEN test suite.
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-02-SUMMARY.md`.
</output>
