---
phase: 14-multi-tenant-onboarding
plan: 06
type: execute
wave: 3
depends_on: [02, 03, 04]
files_modified:
  - tests/test_onboarding_gate.py
  - tests/test_onboarding_existing_user_safety.py
autonomous: true
requirements: [MTONB-01, MTONB-02, MTONB-03, MTONB-04]
must_haves:
  truths:
    - "End-to-end pytest fixture: invite member → call /api/v1/categories with member initData → 409 onboarding_required."
    - "After member runs /onboarding/complete (with seed_default_categories=True): /api/v1/categories returns 14 rows; CategoryEmbedding count for that user_id is 14 (when AI mocked)."
    - "Existing onboarded owner (onboarded_at set in fixture) traverses /api/v1/categories without 409 — defines `Existing user safety` invariant from MTONB success criterion #5."
    - "Cross-tenant safety integration test: member-1's onboarding does not affect member-2 (separate categories, embeddings)."
  artifacts:
    - path: "tests/test_onboarding_gate.py"
      provides: "End-to-end happy path + 409 gate matrix for all 10 gated routers"
      min_lines: 120
      contains: "onboarding_required"
    - path: "tests/test_onboarding_existing_user_safety.py"
      provides: "Existing-onboarded-owner regression coverage"
      contains: "test_existing_onboarded_owner_passes_gate"
  key_links:
    - from: "tests/test_onboarding_gate.py"
      to: "app/api/dependencies.py:require_onboarded"
      via: "HTTP-level pytest_asyncio fixture exercises router-level gate"
      pattern: "status_code == 409"
    - from: "tests/test_onboarding_gate.py"
      to: "app/services/ai_embedding_backfill.py"
      via: "asserts CategoryEmbedding count after onboarding completes"
      pattern: "CategoryEmbedding"
---

<objective>
End-to-end integration verification of Phase 14 (MTONB-01..04). Two pytest files prove the full invite → gate → onboarding → seed-categories → embeddings → access lifecycle works through the real ASGI stack with real DB, no mocks except the OpenAI provider.

Purpose: Goal-backward — the per-component plans (14-02, 14-03, 14-04, 14-05) test their slices in isolation. This plan stitches them together so a regression in any one slice that breaks the integrated flow is caught loudly. Mirrors `tests/test_role_based_auth.py` (Phase 12) and `tests/test_admin_users_api.py` (Phase 13) integration patterns.
Output: 2 new pytest files exercising the full multi-tenant onboarding lifecycle.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@./CLAUDE.md

<interfaces>
From `tests/conftest.py`:
- `make_init_data(tg_user_id, bot_token, age_seconds=0) -> str`.
- Fixtures: `async_client` (httpx ASGITransport), `bot_token` (str), `owner_tg_id` (int).

From `tests/helpers/seed.py`:
- `seed_user(session, *, tg_user_id, role, onboarded_at=None, ...)` — base factory.
- `seed_member_not_onboarded(session, *, tg_user_id, tg_chat_id=None)` — created in 14-01.
- `truncate_db()` — admin-role TRUNCATE for isolation.
- Existing test `tests/test_admin_users_api.py` for admin-API E2E patterns.

The 10 gated routers (Plan 14-02): /categories, /actual, /periods, /planned, /template/items, /subscriptions, /analytics/*, /ai/*, /ai/suggest-category, /settings.

`/me` and `/onboarding/complete` are NOT gated.

For the embedding assertion, mock `EmbeddingService.embed_texts` so we don't make real OpenAI calls. Pattern (used in `tests/test_categories.py`): `monkeypatch.setattr(svc, "embed_texts", AsyncMock(side_effect=lambda texts: [[0.0]*1536 for _ in texts]))`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: tests/test_onboarding_gate.py — full invite → onboard → access E2E</name>
  <files>tests/test_onboarding_gate.py</files>
  <read_first>
    - tests/test_admin_users_api.py (full file — pattern for two-tenant E2E with admin invite + member follow-up)
    - tests/conftest.py (lines 1-200 — fixtures + make_init_data)
    - tests/helpers/seed.py (full — seed_member_not_onboarded, seed_user, truncate_db)
    - tests/test_onboarding.py (full — fixture pattern for `db_client` returning `(async_client, SessionLocal)`)
    - app/api/router.py (full — confirm endpoint URLs for the gate matrix)
  </read_first>
  <behavior>
    Five `@pytest.mark.asyncio` tests, all in one file:

    1. `test_member_pre_onboarding_categories_blocked_with_409`:
       - Seed member with `onboarded_at=None` (use `seed_member_not_onboarded`).
       - GET `/api/v1/categories` with member's initData.
       - Assert status 409, body `== {"detail": {"error": "onboarding_required"}}`.

    2. `test_member_pre_onboarding_can_reach_me_and_onboarding_endpoints`:
       - Same seed.
       - GET `/api/v1/me` → 200; body `onboarded_at == null`, `role == "member"`.
       - POST `/api/v1/onboarding/complete` should return 200 (NOT 409) — meaning the gate is NOT applied to onboarding endpoints.

    3. `test_member_gate_matrix_409_on_all_gated_routers`:
       - Seed member with onboarded_at=None.
       - For each of these endpoints (use HTTP method as listed), assert status 409:
         - GET `/api/v1/categories`
         - GET `/api/v1/periods/current`
         - GET `/api/v1/template/items`
         - GET `/api/v1/subscriptions`
         - GET `/api/v1/analytics/forecast?range=1M`
         - GET `/api/v1/ai/history`
         - GET `/api/v1/ai/suggest-category?q=кофе`
         - GET `/api/v1/settings`
         - POST `/api/v1/actual` with body `{"kind":"expense","amount_cents":100,"category_id":1,"tx_date":"2026-05-07"}`
         - POST `/api/v1/periods/1/planned` with body `{"kind":"expense","amount_cents":100,"category_id":1}`
       - Each response body MUST be `{"detail": {"error": "onboarding_required"}}`. Use a parametrise loop or a helper function — every assertion must surface the failing endpoint name when it breaks (use `assert resp.status_code == 409, f"{method} {path} returned {resp.status_code}: {resp.text}"`).

    4. `test_full_member_onboarding_flow_creates_categories_periods_embeddings`:
       - Seed member with `onboarded_at=None`, `tg_chat_id=99999` (chat already bound).
       - Mock `EmbeddingService.embed_texts` to return deterministic 1536-d vectors.
       - POST `/api/v1/onboarding/complete` with `{"starting_balance_cents": 50000, "cycle_start_day": 5, "seed_default_categories": True}` and member's initData.
       - Assert 200; body has `seeded_categories == 14`, `embeddings_created == 14`.
       - Then GET `/api/v1/categories` with same initData → 200, body length 14.
       - Then SELECT `count(*) FROM category_embedding WHERE user_id = <member.id>` → 14.
       - GET `/api/v1/me` → `onboarded_at` is non-null ISO datetime.

    5. `test_two_members_onboarding_isolation`:
       - Seed member A and member B, both `onboarded_at=None`, both with chat_id bound.
       - Member A completes onboarding (with embedding mock).
       - Member B's GET `/api/v1/categories` → still 409 (B's onboarding pending).
       - DB SELECT confirms 14 categories for A, 0 for B; 14 CategoryEmbedding for A, 0 for B.

    All tests skip cleanly if `DATABASE_URL` is unset (`_require_db()` helper).
  </behavior>
  <action>
    Create `tests/test_onboarding_gate.py`:

    File header docstring:
    ```python
    """Phase 14 integration — full invite → onboard → access lifecycle.

    Verifies MTONB-01, MTONB-02, MTONB-03, MTONB-04 against the live ASGI
    stack and a real test DB. Relies on:
      - Plan 14-02 (require_onboarded gate).
      - Plan 14-03 (embedding backfill in complete_onboarding).
      - Plan 14-04 (bot helper extension — not exercised here; unit tests
        in tests/test_bot_handlers.py cover MTONB-01).

    Pattern mirrors tests/test_admin_users_api.py: pytest_asyncio fixture
    creates an httpx async_client, overrides get_db with a fresh
    SessionLocal pointing at DATABASE_URL, truncates before yield.
    """
    ```

    Imports + fixtures: copy the `_require_db`, `db_client`, and `auth_headers` patterns from `tests/test_onboarding.py` lines 16-65. Add an `embed_mock` fixture that monkeypatches `get_embedding_service`:

    ```python
    @pytest.fixture
    def embed_mock(monkeypatch):
        from unittest.mock import AsyncMock
        from app.ai.embedding_service import EMBEDDING_DIM, get_embedding_service
        get_embedding_service.cache_clear()
        svc = get_embedding_service()
        monkeypatch.setattr(
            svc, "embed_texts",
            AsyncMock(side_effect=lambda texts: [[0.0] * EMBEDDING_DIM for _ in texts]),
        )
        from app.core.settings import settings
        monkeypatch.setattr(settings, "ENABLE_AI_CATEGORIZATION", True)
        return svc
    ```

    For tests requiring two members or member+owner, expose a helper:
    ```python
    async def _seed_member(SessionLocal, *, tg_user_id: int, tg_chat_id: int | None = None):
        from tests.helpers.seed import seed_member_not_onboarded
        async with SessionLocal() as session:
            user = await seed_member_not_onboarded(
                session, tg_user_id=tg_user_id, tg_chat_id=tg_chat_id,
            )
            await session.commit()
            return user.id
    ```

    Implement each of the 5 tests as described. For test 3 (gate matrix), use a list of `(method, path, body)` tuples and a helper:
    ```python
    GATED_ENDPOINTS = [
        ("GET", "/api/v1/categories", None),
        ("GET", "/api/v1/periods/current", None),
        ("GET", "/api/v1/template/items", None),
        ("GET", "/api/v1/subscriptions", None),
        ("GET", "/api/v1/analytics/forecast?range=1M", None),
        ("GET", "/api/v1/ai/history", None),
        ("GET", "/api/v1/ai/suggest-category?q=кофе", None),
        ("GET", "/api/v1/settings", None),
        ("POST", "/api/v1/actual",
         {"kind": "expense", "amount_cents": 100, "category_id": 1, "tx_date": "2026-05-07"}),
        ("POST", "/api/v1/periods/1/planned",
         {"kind": "expense", "amount_cents": 100, "category_id": 1}),
    ]

    async def test_member_gate_matrix_409_on_all_gated_routers(db_client, member_headers):
        async_client, _ = db_client
        for method, path, body in GATED_ENDPOINTS:
            kwargs = {"headers": member_headers}
            if body is not None:
                kwargs["json"] = body
            resp = await async_client.request(method, path, **kwargs)
            assert resp.status_code == 409, (
                f"{method} {path} expected 409 (gate), got {resp.status_code}: {resp.text}"
            )
            assert resp.json() == {"detail": {"error": "onboarding_required"}}, (
                f"{method} {path} body shape mismatch: {resp.text}"
            )
    ```

    For `member_headers`: a fixture that yields headers built via `make_init_data(member_tg_user_id, bot_token)`. `member_tg_user_id` should be a constant distinct from `owner_tg_id` (e.g. `987654321`).

    Each test that requires a seeded member must seed BEFORE the API call. Order: `truncate_db()` (already done in `db_client` fixture) → seed member → run requests.

    For test 4 (`test_full_member_onboarding_flow_creates_categories_periods_embeddings`):
    ```python
    async def test_full_member_onboarding_flow_creates_categories_periods_embeddings(
        db_client, member_headers, embed_mock, member_tg_user_id,
    ):
        async_client, SessionLocal = db_client
        # 1. Seed member (no onboarded_at).
        await _seed_member(SessionLocal, tg_user_id=member_tg_user_id, tg_chat_id=99999)

        # 2. Pre-onboarding /me — confirm shape.
        resp = await async_client.get("/api/v1/me", headers=member_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["onboarded_at"] is None
        assert body["role"] == "member"

        # 3. Run onboarding.
        resp = await async_client.post(
            "/api/v1/onboarding/complete",
            headers=member_headers,
            json={
                "starting_balance_cents": 50000,
                "cycle_start_day": 5,
                "seed_default_categories": True,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["seeded_categories"] == 14
        assert body["embeddings_created"] == 14

        # 4. Post-onboarding /categories returns 14 rows.
        resp = await async_client.get("/api/v1/categories", headers=member_headers)
        assert resp.status_code == 200
        cats = resp.json()
        assert len(cats) == 14

        # 5. CategoryEmbedding row count.
        from sqlalchemy import select, func
        from app.db.models import AppUser, CategoryEmbedding
        async with SessionLocal() as session:
            user = (await session.execute(
                select(AppUser).where(AppUser.tg_user_id == member_tg_user_id)
            )).scalar_one()
            count = await session.scalar(
                select(func.count())
                .select_from(CategoryEmbedding)
                .where(CategoryEmbedding.user_id == user.id)
            )
            assert count == 14, f"expected 14 embeddings, got {count}"

        # 6. /me reflects onboarded_at set.
        resp = await async_client.get("/api/v1/me", headers=member_headers)
        assert resp.status_code == 200
        assert resp.json()["onboarded_at"] is not None
    ```

    Add per-fixture: `member_tg_user_id = 987654321` (constant), `member_headers` derived from `make_init_data(member_tg_user_id, bot_token)`.

    Verify by running: `pytest tests/test_onboarding_gate.py -x -v`. All 5 tests must pass.
  </action>
  <verify>
    <automated>
    pytest tests/test_onboarding_gate.py -x --no-header 2>&amp;1 | tail -10 | grep -E "(5 passed|passed.*5)"
    </automated>
  </verify>
  <acceptance_criteria>
    - File `tests/test_onboarding_gate.py` exists with 5 `async def test_` functions.
    - `grep -c '"detail": {"error": "onboarding_required"}' tests/test_onboarding_gate.py` ≥ 2.
    - `grep -c "GATED_ENDPOINTS" tests/test_onboarding_gate.py` ≥ 1 (parametrise table for matrix test).
    - `pytest tests/test_onboarding_gate.py -x` exit code 0; 5 passed.
    - `pytest tests/test_onboarding.py tests/test_categories.py -x` — no regression.
  </acceptance_criteria>
  <done>End-to-end Phase 14 lifecycle proven via 5 integration tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: tests/test_onboarding_existing_user_safety.py — owner-already-onboarded regression</name>
  <files>tests/test_onboarding_existing_user_safety.py</files>
  <read_first>
    - tests/test_onboarding_gate.py (just created — reuse fixture patterns)
    - tests/helpers/seed.py (full — `seed_user(role=UserRole.owner, onboarded_at=...)`)
    - app/db/models.py (AppUser.onboarded_at)
  </read_first>
  <behavior>
    Three `@pytest.mark.asyncio` tests:

    1. `test_existing_onboarded_owner_passes_gate`:
       - Seed owner with `onboarded_at = datetime.now(timezone.utc)`.
       - GET `/api/v1/categories` (and a couple of other gated endpoints) with owner initData → 200 (no 409).

    2. `test_owner_with_null_onboarded_at_also_blocked`:
       - Defensive symmetry. Seed owner with `onboarded_at=None`.
       - GET `/api/v1/categories` → 409. Confirms gate is role-agnostic; owner is not "magically" onboarded.

    3. `test_already_onboarded_member_repeating_onboarding_complete_returns_409`:
       - Seed member with `onboarded_at = datetime.now(timezone.utc)`.
       - POST `/api/v1/onboarding/complete` → 409 with body shape from `AlreadyOnboardedError` (NOT `onboarding_required`). Body string contains "already onboarded" or matches the existing `AlreadyOnboardedError.__str__`.
       - This proves OnboardingScreen.handleSubmit's `e.status === 409` short-circuit still works for the AlreadyOnboarded D-10 case AND the new `OnboardingRequiredError` (different body shape) does not collide.
  </behavior>
  <action>
    Create `tests/test_onboarding_existing_user_safety.py`:

    ```python
    """Phase 14 — existing-user-safety regression (MTONB success criterion #5).

    The migration adds no new columns; existing owner already has
    onboarded_at != null from v0.2. We must prove the gate does not
    accidentally lock them out.

    Also covers an interaction edge: an already-onboarded user calling
    /onboarding/complete must still get the legacy AlreadyOnboardedError
    409 (different body shape from the new MTONB-04 onboarding_required).
    """
    from __future__ import annotations
    import os
    from datetime import datetime, timezone
    import pytest
    import pytest_asyncio


    def _require_db():
        if not os.environ.get("DATABASE_URL"):
            pytest.skip("DATABASE_URL not set — skipping DB-backed test")


    @pytest.fixture(autouse=True)
    def _disable_dev_mode(monkeypatch):
        from app.core.settings import settings
        monkeypatch.setattr(settings, "DEV_MODE", False)


    # Reuse the db_client pattern from test_onboarding_gate.py — keep this file
    # self-contained: no cross-file fixture dependency.
    @pytest_asyncio.fixture
    async def db_client(async_client):
        _require_db()
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from app.api.dependencies import get_db
        from app.main_api import app
        from tests.helpers.seed import truncate_db

        engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
        SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
        await truncate_db()

        async def real_get_db():
            async with SessionLocal() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

        app.dependency_overrides[get_db] = real_get_db
        yield async_client, SessionLocal
        await engine.dispose()
        app.dependency_overrides.pop(get_db, None)


    @pytest.fixture
    def owner_headers(bot_token, owner_tg_id):
        from tests.conftest import make_init_data
        return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


    @pytest.fixture
    def member_tg_user_id() -> int:
        return 555111222


    @pytest.fixture
    def member_headers(bot_token, member_tg_user_id):
        from tests.conftest import make_init_data
        return {"X-Telegram-Init-Data": make_init_data(member_tg_user_id, bot_token)}


    async def _seed_owner(SessionLocal, *, tg_user_id: int, onboarded_at):
        from tests.helpers.seed import seed_user
        from app.db.models import UserRole
        async with SessionLocal() as session:
            user = await seed_user(
                session, tg_user_id=tg_user_id,
                role=UserRole.owner, onboarded_at=onboarded_at,
            )
            await session.commit()
            return user.id


    async def _seed_member(SessionLocal, *, tg_user_id: int, onboarded_at):
        from tests.helpers.seed import seed_user
        from app.db.models import UserRole
        async with SessionLocal() as session:
            user = await seed_user(
                session, tg_user_id=tg_user_id,
                role=UserRole.member, onboarded_at=onboarded_at,
            )
            await session.commit()
            return user.id


    @pytest.mark.asyncio
    async def test_existing_onboarded_owner_passes_gate(
        db_client, owner_headers, owner_tg_id,
    ):
        async_client, SessionLocal = db_client
        await _seed_owner(
            SessionLocal,
            tg_user_id=owner_tg_id,
            onboarded_at=datetime.now(timezone.utc),
        )
        # /me reachable
        resp = await async_client.get("/api/v1/me", headers=owner_headers)
        assert resp.status_code == 200
        # /categories reachable (gate passes)
        resp = await async_client.get("/api/v1/categories", headers=owner_headers)
        assert resp.status_code == 200, f"owner expected 200 but got {resp.status_code}: {resp.text}"
        # /settings reachable
        resp = await async_client.get("/api/v1/settings", headers=owner_headers)
        assert resp.status_code == 200, f"owner /settings expected 200 but got {resp.status_code}"


    @pytest.mark.asyncio
    async def test_owner_with_null_onboarded_at_also_blocked(
        db_client, owner_headers, owner_tg_id,
    ):
        """Symmetric defence: gate is role-agnostic; even owner gets 409 if onboarded_at is NULL."""
        async_client, SessionLocal = db_client
        await _seed_owner(SessionLocal, tg_user_id=owner_tg_id, onboarded_at=None)
        resp = await async_client.get("/api/v1/categories", headers=owner_headers)
        assert resp.status_code == 409
        assert resp.json() == {"detail": {"error": "onboarding_required"}}


    @pytest.mark.asyncio
    async def test_already_onboarded_member_repeating_onboarding_complete_returns_409(
        db_client, member_headers, member_tg_user_id,
    ):
        """Repeating /onboarding/complete returns AlreadyOnboardedError 409 (NOT onboarding_required)."""
        async_client, SessionLocal = db_client
        await _seed_member(
            SessionLocal,
            tg_user_id=member_tg_user_id,
            onboarded_at=datetime.now(timezone.utc),
        )
        resp = await async_client.post(
            "/api/v1/onboarding/complete",
            headers=member_headers,
            json={
                "starting_balance_cents": 0,
                "cycle_start_day": 5,
                "seed_default_categories": False,
            },
        )
        assert resp.status_code == 409
        body = resp.json()
        # Crucial: body shape is "detail": "<string>", NOT "detail": {"error": "..."}.
        # Frontend's OnboardingRequiredError detection (Plan 14-05) parses
        # body.detail.error — for a string detail, that path returns undefined,
        # so this 409 stays a plain ApiError per OnboardingScreen.handleSubmit's
        # existing happy-path treatment.
        assert isinstance(body.get("detail"), str), (
            f"AlreadyOnboarded must use string detail to avoid frontend collision: {body}"
        )
        assert "already onboarded" in body["detail"].lower()
    ```

    The third test is the most subtle — it pins down the body-shape contract that makes Plan 14-05 Task 1 Test 2 (`'throws plain ApiError on 409 with different body shape'`) accurate at runtime.

    Verify: `pytest tests/test_onboarding_existing_user_safety.py -x -v` → 3 passed.
  </action>
  <verify>
    <automated>
    pytest tests/test_onboarding_existing_user_safety.py -x --no-header 2>&amp;1 | tail -8 | grep -E "(3 passed|passed.*3)" &amp;&amp; \
    grep -c "isinstance.*detail.*str" tests/test_onboarding_existing_user_safety.py | grep -q "^1$"
    </automated>
  </verify>
  <acceptance_criteria>
    - File `tests/test_onboarding_existing_user_safety.py` exists with 3 `async def test_` functions.
    - `grep -c "AlreadyOnboarded\\|already onboarded" tests/test_onboarding_existing_user_safety.py` ≥ 1 (proves the legacy 409 contract).
    - `grep -c '"detail": {"error": "onboarding_required"}' tests/test_onboarding_existing_user_safety.py` ≥ 1.
    - `pytest tests/test_onboarding_existing_user_safety.py -x` exit code 0; 3 passed.
  </acceptance_criteria>
  <done>3 regression tests pin existing-user safety + AlreadyOnboarded body-shape contract.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| pytest fixtures → DATABASE_URL | Tests run with admin role for TRUNCATE; runtime queries use whatever role the engine binds. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-06-01 | Tampering | Test isolation broken between two-tenant tests | mitigate | Each test calls `truncate_db()` via the `db_client` fixture before yield; `engine.dispose()` after. |
| T-14-06-02 | Information disclosure | OPENAI_API_KEY leaked in test logs | mitigate | Tests mock `embed_texts` so no live OpenAI call; `OPENAI_API_KEY=sk-test-fake-key-for-pytest-only` from conftest. |
| T-14-06-03 | Repudiation | Flaky test masks regression | mitigate | All assertions include diagnostic context (`f"{method} {path} returned ..."`); zero `assert True` no-ops. |
</threat_model>

<verification>
- `pytest tests/test_onboarding_gate.py -x` → 5/5 passed.
- `pytest tests/test_onboarding_existing_user_safety.py -x` → 3/3 passed.
- `pytest tests/ -x --ignore=tests/api -q` (full unit + integration sweep) — no regressions in pre-existing test suite.
</verification>

<success_criteria>
- 5 happy-path / matrix tests in `test_onboarding_gate.py`.
- 3 regression tests in `test_onboarding_existing_user_safety.py`.
- All 8 new tests GREEN against the implementations from 14-02 / 14-03 / 14-04.
- Pre-existing test suite remains GREEN (no flaky cross-test interference).
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-06-SUMMARY.md`.
</output>
