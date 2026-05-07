---
phase: 14-multi-tenant-onboarding
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - tests/test_require_onboarded.py
  - tests/test_embedding_backfill.py
  - tests/test_bot_handlers.py
  - tests/helpers/seed.py
autonomous: true
requirements: [MTONB-01, MTONB-02, MTONB-03, MTONB-04]
must_haves:
  truths:
    - "RED test file `tests/test_require_onboarded.py` exists and FAILS with ImportError on `require_onboarded`."
    - "RED test file `tests/test_embedding_backfill.py` exists and FAILS with ImportError on `app.services.ai_embedding_backfill.backfill_user_embeddings`."
    - "Bot handler RED test `test_cmd_start_member_not_onboarded_uses_invite_copy` exists in `tests/test_bot_handlers.py` and FAILS (handler does not yet branch on onboarded status)."
    - "Helper fixture `seed_member_not_onboarded(session, *, tg_user_id, tg_chat_id=None)` exists in `tests/helpers/seed.py`."
  artifacts:
    - path: "tests/test_require_onboarded.py"
      provides: "RED tests for require_onboarded dependency (D-14-01)"
      min_lines: 80
      contains: "require_onboarded"
    - path: "tests/test_embedding_backfill.py"
      provides: "RED tests for backfill_user_embeddings helper (D-14-03)"
      min_lines: 60
      contains: "backfill_user_embeddings"
    - path: "tests/test_bot_handlers.py"
      provides: "RED test for member-not-onboarded /start branch (D-14-02)"
      contains: "test_cmd_start_member_not_onboarded"
    - path: "tests/helpers/seed.py"
      provides: "seed_member_not_onboarded factory"
      contains: "def seed_member_not_onboarded"
  key_links:
    - from: "tests/test_require_onboarded.py"
      to: "app.api.dependencies.require_onboarded"
      via: "import (will ImportError until 14-02 lands)"
      pattern: "from app.api.dependencies import require_onboarded"
    - from: "tests/test_embedding_backfill.py"
      to: "app.services.ai_embedding_backfill.backfill_user_embeddings"
      via: "import (will ImportError until 14-03 lands)"
      pattern: "from app.services.ai_embedding_backfill import backfill_user_embeddings"
---

<objective>
Phase 14 RED gate. Write failing tests + a `seed_member_not_onboarded` factory so 14-02/14-03/14-04 have automated GREEN targets. Tests MUST fail with `ImportError` / `AttributeError` / assertion error before implementation lands.

Purpose: Goal-backward — if these tests can't be RED first, the implementations can't be verified GREEN. Phase 11/12/13 followed the same RED-first pattern (`tests/test_role_based_auth.py`, `tests/test_require_owner.py`).
Output: Three test files in `RED` state + extended `seed.py` factory.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@./CLAUDE.md

<interfaces>
Existing fixtures + helpers the tests reuse:

From `tests/conftest.py`:
- `make_init_data(tg_user_id: int, bot_token: str, age_seconds: int = 0) -> str` — synthesises valid Telegram initData.
- pytest fixtures: `async_client` (httpx.AsyncClient bound to FastAPI app), `bot_token`, `owner_tg_id`.

From `tests/helpers/seed.py`:
- `seed_user(session, *, tg_user_id, tg_chat_id=None, role=UserRole.owner, cycle_start_day=5, onboarded_at=None) -> AppUser`
- `seed_two_role_tenants(session, *, owner_tg_user_id, member_tg_user_id) -> dict[str, int]` — both seeded with `onboarded_at=None`.
- `truncate_db(*, tables=...)` — admin-role TRUNCATE for test isolation.

From `app/api/dependencies.py` (current):
- `get_current_user` → returns `AppUser` ORM. After Phase 12, rejects role=revoked + unknown.
- `require_owner` — pattern to mirror for `require_onboarded`.

From `app/db/models.py`:
- `AppUser.onboarded_at: Optional[datetime]` (TIMESTAMP TZ, nullable).
- `AppUser.role: UserRole` (owner|member|revoked).
- `Category` has unique `(user_id, name, kind)` constraint and `is_archived` flag.
- `CategoryEmbedding(category_id PK, user_id FK, embedding Vector(1536), updated_at)`.

From `app/bot/auth.py`:
- `bot_resolve_user_role(tg_user_id) -> UserRole | None` — opens own `AsyncSessionLocal()` and returns `AppUser.role`. Phase 14 will add a sibling `bot_resolve_user_status(tg_user_id) -> tuple[UserRole | None, datetime | None]` returning `(role, onboarded_at)`.

From `app/bot/handlers.py:cmd_start`:
- Currently branches on `bot_resolve_user_role` for whitelist; greeting copy chosen by `payload == "onboard"` and `chat_bound`. After 14-04 a new branch will fire when `onboarded_at is None` for owner/member.

The pattern for RED tests is `tests/test_require_owner.py` (Phase 12) — register a stub endpoint inside the test that uses `Depends(require_onboarded)`, then assert behaviour by calling it through `async_client`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add seed_member_not_onboarded factory + RED test for require_onboarded</name>
  <files>tests/helpers/seed.py, tests/test_require_onboarded.py</files>
  <read_first>
    - tests/helpers/seed.py (full file — extend, do not rewrite)
    - tests/test_require_owner.py (full file — pattern to mirror exactly: stub endpoint, async_client, app.dependency_overrides[get_db])
    - tests/conftest.py (lines 1-150 — fixtures `async_client`, `bot_token`, `owner_tg_id`, `make_init_data`)
    - app/api/dependencies.py (full file — note `require_owner` shape; `require_onboarded` mirrors that pattern)
    - app/db/models.py (lines 86-130 — AppUser fields, especially `onboarded_at` nullable)
  </read_first>
  <behavior>
    Test cases for `tests/test_require_onboarded.py` (all four MUST fail before 14-02 lands):
    1. `test_require_onboarded_passes_owner_with_onboarded_at_set` — seed owner, `onboarded_at=datetime.now(tz=UTC)`, GET `/api/v1/_test/require_onboarded` with valid initData → 200.
    2. `test_require_onboarded_passes_member_with_onboarded_at_set` — seed member, `onboarded_at` set → 200.
    3. `test_require_onboarded_blocks_member_with_onboarded_at_null` — seed member with `onboarded_at=None` → 409 with JSON body `{"detail": {"error": "onboarding_required"}}`.
    4. `test_require_onboarded_blocks_owner_with_onboarded_at_null` — defensive: even owner gets 409 if `onboarded_at IS NULL` (symmetry per D-14-01).
    All four MUST FAIL with `ImportError: cannot import name 'require_onboarded' from 'app.api.dependencies'` initially.
  </behavior>
  <action>
    **Part 1 — Extend `tests/helpers/seed.py`:**

    Append a new factory below `seed_two_role_tenants`:

    ```python
    async def seed_member_not_onboarded(
        session: AsyncSession,
        *,
        tg_user_id: int,
        tg_chat_id: Optional[int] = None,
    ) -> AppUser:
        """Seed a member with onboarded_at=None (Phase 14 invite-flow target).

        Used by Phase 14 RED tests (test_require_onboarded.py,
        test_embedding_backfill.py) to construct the precise pre-onboarding
        state: role=member, tg_chat_id may or may not be bound, onboarded_at
        is NULL → require_onboarded gate fires.
        """
        user = AppUser(
            tg_user_id=tg_user_id,
            tg_chat_id=tg_chat_id,
            role=UserRole.member,
            cycle_start_day=5,
            onboarded_at=None,
        )
        session.add(user)
        await session.flush()
        return user
    ```

    **Part 2 — Create `tests/test_require_onboarded.py`:**

    Mirror `tests/test_require_owner.py` structure exactly. Use:
    - `_disable_dev_mode` autouse monkeypatch fixture (so HMAC path runs).
    - `db_client` pytest_asyncio fixture: `async_engine = create_async_engine(os.environ["DATABASE_URL"])`, `app.dependency_overrides[get_db] = real_get_db`, `truncate_db()` before, `engine.dispose()` after.
    - Helper `_register_stub_route()` that registers `/api/v1/_test/require_onboarded` GET endpoint with `Depends(require_onboarded)` returning `{"ok": True, "user_id": user.id}`.
    - Per-test seeders: `_seed_user(SessionLocal, tg_user_id, role, onboarded_at)`.

    Write four `@pytest.mark.asyncio` tests as listed in `<behavior>`. Each test:
    - calls `_register_stub_route()` once (after import; safe to call repeatedly because aiogram-style register is idempotent — if not, guard with `app.routes` membership check).
    - seeds the user with the right `(role, onboarded_at)` combo via `_seed_user`.
    - sends GET with `make_init_data(tg_user_id, bot_token)` header.
    - asserts status code AND body. For 409 case assert `body == {"detail": {"error": "onboarding_required"}}` exactly (per D-14-01).

    Use timezone-aware `datetime.now(timezone.utc)` for `onboarded_at` values.

    **Part 3 — Verify RED:**

    Run only the new file. Expect all 4 to fail with `ImportError`:
    `ImportError: cannot import name 'require_onboarded' from 'app.api.dependencies'`
  </action>
  <verify>
    <automated>
    pytest tests/test_require_onboarded.py -x --no-header 2>&1 | tail -20 | grep -E "(ImportError.*require_onboarded|cannot import name 'require_onboarded'|FAILED|ERROR)" &amp;&amp; \
    grep -n "def seed_member_not_onboarded" tests/helpers/seed.py
    </automated>
  </verify>
  <acceptance_criteria>
    - `tests/test_require_onboarded.py` exists with exactly 4 `async def test_` functions matching the names in `<behavior>`.
    - `grep -c "from app.api.dependencies import require_onboarded" tests/test_require_onboarded.py` ≥ 1.
    - `grep -c "def seed_member_not_onboarded" tests/helpers/seed.py` == 1.
    - Running `pytest tests/test_require_onboarded.py -x` produces ImportError mentioning `require_onboarded` (RED state, expected).
  </acceptance_criteria>
  <done>4 RED tests for require_onboarded committed; seed_member_not_onboarded factory available.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED test file for backfill_user_embeddings helper</name>
  <files>tests/test_embedding_backfill.py</files>
  <read_first>
    - app/ai/embedding_service.py (full file — note `embed_text` signature, in-process LRU cache, `upsert_category_embedding(db, category_id, vector, *, user_id)`, `EMBEDDING_DIM = 1536`)
    - app/services/categories.py (lines 22-39 SEED_CATEGORIES + lines 160-193 seed_default_categories)
    - app/db/models.py (search for `class CategoryEmbedding` — note PK is category_id, has user_id FK)
    - tests/helpers/seed.py (full — use `seed_user` + `seed_category` + `truncate_db`)
    - tests/test_categories.py if exists (mock pattern for embedding service)
  </read_first>
  <behavior>
    All tests target the not-yet-existing module `app.services.ai_embedding_backfill` with helper `backfill_user_embeddings(db, *, user_id) -> int`.
    1. `test_backfill_creates_embeddings_for_all_user_categories` — seed user + 3 categories (no embeddings), call `backfill_user_embeddings(db, user_id=user.id)`. Assert returns 3 (count). Assert `category_embedding` table has exactly 3 rows for `user_id=user.id`. Mock `EmbeddingService.embed_texts` (or `embed_text`) so no real OpenAI call happens; mock returns deterministic vectors of len 1536.
    2. `test_backfill_skips_categories_with_existing_embedding` — seed user + 2 categories. Pre-insert one CategoryEmbedding for the first category. Call helper. Assert returns 1 (only the second got an embedding). Assert table now has 2 rows total.
    3. `test_backfill_skips_archived_categories` — seed user + 2 categories with second one `is_archived=True`. Helper returns 1; only the active category gets an embedding.
    4. `test_backfill_returns_zero_when_no_categories` — seed user, no categories, helper returns 0, no embedding rows.
    5. `test_backfill_swallows_provider_exception_and_returns_zero` — patch `EmbeddingService.embed_texts` to `raise RuntimeError("OpenAI down")`. Helper MUST NOT propagate; returns 0; no embedding rows. Onboarding callers depend on this graceful failure (D-14-03 fallback to on-demand suggest).
    6. `test_backfill_scopes_to_caller_user_id` — seed two users (A, B), each with 1 category. Call helper for user A only. Assert 1 row created scoped to A; user B has no embedding.

    All MUST FAIL initially with `ModuleNotFoundError: No module named 'app.services.ai_embedding_backfill'`.
  </behavior>
  <action>
    Create `tests/test_embedding_backfill.py` mirroring `tests/test_categories.py` style (DB-backed pytest_asyncio fixture).

    Header:
    ```python
    """RED tests for Phase 14 MTONB-03 — backfill_user_embeddings helper.

    Tests fail with ModuleNotFoundError until Plan 14-03 creates
    app/services/ai_embedding_backfill.py:backfill_user_embeddings.
    """
    from __future__ import annotations
    import os
    from unittest.mock import AsyncMock, patch
    import pytest
    import pytest_asyncio
    ```

    Provide a `db_session` pytest_asyncio fixture creating a fresh `AsyncSessionLocal`-style session via `create_async_engine(os.environ["DATABASE_URL"])` + `async_sessionmaker`. Call `truncate_db()` before yield; dispose engine after.

    For each test: seed AppUser + Category rows via `seed_user` + `seed_category` from `tests/helpers/seed.py`. For embedding mocks, patch `app.services.ai_embedding_backfill.get_embedding_service` to return a `MagicMock(spec=EmbeddingService)` whose `embed_texts` AsyncMock returns `[[0.0]*1536, [0.1]*1536, ...]` (matching list length to input). Where the test patches a thrown error, set `embed_texts.side_effect = RuntimeError("OpenAI down")`.

    Critical assertions:
    - Use `from sqlalchemy import select; from app.db.models import CategoryEmbedding` to count rows: `(await db.execute(select(func.count()).select_from(CategoryEmbedding).where(CategoryEmbedding.user_id == user_id))).scalar_one()`.
    - 1536 = `EMBEDDING_DIM` from `app.ai.embedding_service`.
    - Use `pytest.skip("DATABASE_URL not set — skipping DB-backed test")` guard at fixture top.

    Run final RED check: `pytest tests/test_embedding_backfill.py -x` must produce ModuleNotFoundError citing `app.services.ai_embedding_backfill`.
  </action>
  <verify>
    <automated>
    pytest tests/test_embedding_backfill.py -x --no-header 2>&1 | tail -10 | grep -E "(ModuleNotFoundError.*ai_embedding_backfill|No module named 'app.services.ai_embedding_backfill')"
    </automated>
  </verify>
  <acceptance_criteria>
    - File `tests/test_embedding_backfill.py` exists with exactly 6 `async def test_` functions named per `<behavior>`.
    - `grep -c "from app.services.ai_embedding_backfill import backfill_user_embeddings" tests/test_embedding_backfill.py` ≥ 1.
    - `grep -c "embed_texts" tests/test_embedding_backfill.py` ≥ 2 (proves batch API is exercised).
    - Running `pytest tests/test_embedding_backfill.py -x` produces ModuleNotFoundError mentioning `ai_embedding_backfill`.
  </acceptance_criteria>
  <done>6 RED tests covering happy path, skip-existing, skip-archived, empty, exception-swallow, tenant-scope.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: RED test for cmd_start member-not-onboarded greeting branch</name>
  <files>tests/test_bot_handlers.py</files>
  <read_first>
    - tests/test_bot_handlers.py (full file — pattern for `cmd_start` test using `_make_message`, `_make_command`, `patch("app.bot.handlers.bot_resolve_user_role")`, `patch("app.bot.handlers.bind_chat_id")`)
    - app/bot/handlers.py (full file — current cmd_start branching logic on `payload`, `chat_bound`)
    - app/bot/auth.py (full file — current `bot_resolve_user_role` returns `UserRole | None`; Phase 14 will add `bot_resolve_user_status` returning `(role, onboarded_at)`)
  </read_first>
  <behavior>
    Add ONE new test to existing `tests/test_bot_handlers.py`:

    `test_cmd_start_member_not_onboarded_uses_invite_copy`:
    - Construct stub message with `from_user.id = 555`, `chat.id = 777`.
    - Patch `app.bot.handlers.bot_resolve_user_status` to AsyncMock returning `(UserRole.member, None)` — i.e. member, not onboarded yet. (This helper does not yet exist; import will fail → test fails RED.)
    - Patch `app.bot.handlers.bind_chat_id` to AsyncMock (success).
    - Call `cmd_start(message, _make_command(args=None))`.
    - Assert `message.answer` was called with first positional arg containing the substring `"Откройте приложение и пройдите настройку"` (per D-14-02). Assert reply_markup kwarg is an `InlineKeyboardMarkup` (WebApp button still present).
    - Verify the greeting differs from existing onboarded-member copy: assert `"Бот запущен и готов к работе"` is NOT a substring.

    Test fails currently because `bot_resolve_user_status` import in test patch path doesn't exist.
  </behavior>
  <action>
    Append the new test to `tests/test_bot_handlers.py` after the last existing test, preserving file imports + helper structures.

    ```python
    # ---------------------------------------------------------------
    # Phase 14 MTONB-01: cmd_start branch for member with onboarded_at=None
    # ---------------------------------------------------------------

    async def test_cmd_start_member_not_onboarded_uses_invite_copy() -> None:
        """Member with onboarded_at=None → "Откройте приложение и пройдите настройку".

        Phase 14 D-14-02: bot extracts (role, onboarded_at) via
        bot_resolve_user_status. Existing bot_resolve_user_role helper
        cannot distinguish onboarded vs not-onboarded — Plan 14-04 adds the
        sibling. Test fails with AttributeError until then.
        """
        from app.bot import handlers
        from app.db.models import UserRole

        msg = _make_message(user_id=555, chat_id=777)
        cmd = _make_command(args=None)

        with patch.object(
            handlers,
            "bot_resolve_user_status",
            new=AsyncMock(return_value=(UserRole.member, None)),
            create=True,  # attribute does not exist yet — RED phase
        ), patch.object(
            handlers,
            "bind_chat_id",
            new=AsyncMock(return_value=None),
        ):
            await handlers.cmd_start(msg, cmd)

        msg.answer.assert_called_once()
        call_args, call_kwargs = msg.answer.call_args
        greeting = call_args[0]
        assert "Откройте приложение и пройдите настройку" in greeting, greeting
        assert "Бот запущен и готов к работе" not in greeting, greeting
        assert "reply_markup" in call_kwargs, "WebApp button must remain"
    ```

    Mark with `@pytest.mark.asyncio` only if other tests in the file use that marker (check existing decorators). If asyncio_mode="auto" is enabled in pytest.ini (look it up — `pytest -h` not needed, just grep `asyncio_mode` in pyproject/pytest.ini), no marker is needed.

    The `create=True` parameter on `patch.object` allows mocking an attribute that does not exist yet — without it, RED would fail with AttributeError BEFORE entering the test body, which is fine but noisier. With `create=True`, the test will fail at the assertion line because the existing `cmd_start` calls `bot_resolve_user_role` not `bot_resolve_user_status`.
  </action>
  <verify>
    <automated>
    pytest tests/test_bot_handlers.py::test_cmd_start_member_not_onboarded_uses_invite_copy -x --no-header 2>&1 | tail -10 | grep -E "(FAILED|AssertionError|AttributeError)"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "test_cmd_start_member_not_onboarded_uses_invite_copy" tests/test_bot_handlers.py` == 1.
    - `grep -c "Откройте приложение и пройдите настройку" tests/test_bot_handlers.py` ≥ 1.
    - `grep -c "bot_resolve_user_status" tests/test_bot_handlers.py` ≥ 1.
    - Running the single test fails (assertion or attribute error) — RED state expected.
  </acceptance_criteria>
  <done>RED test asserting D-14-02 invite-flow greeting copy committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
This plan only writes test code; no production code paths are added. Tests run inside `pytest` against a local DB and patched bot modules.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-01-01 | Information disclosure | Test fixtures may leak real OpenAI key into logs | mitigate | Tests patch `EmbeddingService.embed_texts`/`get_embedding_service` — no live HTTP. Use `OPENAI_API_KEY=sk-test-fake-key-for-pytest-only` from conftest. |
| T-14-01-02 | Tampering | Future test runs depend on DB seed isolation | mitigate | Each fixture calls `truncate_db()` (admin role) before seeding; dispose engine in teardown. |
</threat_model>

<verification>
- `pytest tests/test_require_onboarded.py -x` → all 4 fail with ImportError on `require_onboarded` (RED).
- `pytest tests/test_embedding_backfill.py -x` → all 6 fail with ModuleNotFoundError on `app.services.ai_embedding_backfill` (RED).
- `pytest tests/test_bot_handlers.py::test_cmd_start_member_not_onboarded_uses_invite_copy -x` → fails with assertion / AttributeError (RED).
- `grep -c "def seed_member_not_onboarded" tests/helpers/seed.py` == 1.
- `pytest tests/helpers -x` (if present) — no collection errors from helper additions.
</verification>

<success_criteria>
- 4 RED tests for require_onboarded committed.
- 6 RED tests for backfill_user_embeddings committed.
- 1 RED test for bot cmd_start member-not-onboarded committed.
- `seed_member_not_onboarded` factory available in `tests/helpers/seed.py` for downstream plans.
- Existing test suite still passes (no accidental break to test_categories / test_bot_handlers earlier tests).
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-01-SUMMARY.md`.
</output>
