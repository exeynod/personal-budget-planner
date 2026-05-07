"""RED integration tests for AICAP-01/02/04 — end-to-end spending cap cycle.

Test matrix: cap exceeded → 429 → admin PATCH cap higher → 200.

All tests RED until:
  - Plan 15-02: app/services/spend_cap.py
  - Plan 15-03: enforce_spending_cap dependency wired to /ai/* routers
  - Plan 15-04: PATCH /admin/users/{id}/cap endpoint

Tests use monkeypatched LLM client to avoid real OpenAI calls.
Pattern: mock app.api.routes.ai._get_llm_client (or similar stub entry point).

Tests are integration (real DB, real FastAPI ASGI via async_client).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


@pytest_asyncio.fixture
async def db_client(async_client):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy import text
    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.helpers.seed import _PHASE13_TRUNCATE_TABLES, _DEFAULT_TRUNCATE_TABLES

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    admin_engine = create_async_engine(admin_url, echo=False)
    async with admin_engine.begin() as conn:
        try:
            await conn.execute(
                text(f"TRUNCATE TABLE {_PHASE13_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
        except Exception:
            await conn.execute(
                text(f"TRUNCATE TABLE {_DEFAULT_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
    await admin_engine.dispose()

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

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


async def _stub_llm_stream(messages, tools=None):
    """Minimal async generator stub: one token + done event."""
    yield {"type": "token", "data": "ok"}
    yield {"type": "done", "data": ""}


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_blocked_when_at_cap_returns_429(
    db_client, bot_token, owner_tg_id, monkeypatch
):
    """Owner with cap=100 cents, spend=100 cents → POST /ai/chat returns 429."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 100 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()
        user_id = user.id

    async with SessionLocal() as s:
        # est_cost_usd=1.0 → 100 cents = at cap
        await seed_ai_usage_log(s, user_id=user_id, est_cost_usd=1.0)

    # Mock LLM so POST /ai/chat doesn't need real OpenAI key
    try:
        import app.api.routes.ai as ai_module
        monkeypatch.setattr(ai_module, "_stream_llm", _stub_llm_stream, raising=False)
    except (ImportError, AttributeError):
        pass  # Fine — enforce_spending_cap gate fires before LLM is reached

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "hello"}]},
        headers={"X-Telegram-Init-Data": init_data},
    )
    # RED: currently 200 or 422 because enforce_spending_cap dep not yet wired
    # After Plan 15-03 this must be 429
    assert resp.status_code == 429, (
        f"spend=cap=100 cents must block /ai/chat (429), got {resp.status_code}: {resp.text}"
    )
    retry_after = resp.headers.get("Retry-After", "")
    assert retry_after.isdigit() and int(retry_after) > 0, (
        f"Retry-After must be positive int string, got {retry_after!r}"
    )


@pytest.mark.asyncio
async def test_chat_unblocked_after_admin_patches_cap_higher(
    db_client, bot_token, owner_tg_id, monkeypatch
):
    """cap=100, spend=100 → 429; PATCH cap=1_000_000; invalidate cache → 200."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 100 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()
        user_id = user.id
        owner_pk = user.id

    async with SessionLocal() as s:
        await seed_ai_usage_log(s, user_id=user_id, est_cost_usd=1.0)

    try:
        import app.api.routes.ai as ai_module
        monkeypatch.setattr(ai_module, "_stream_llm", _stub_llm_stream, raising=False)
    except (ImportError, AttributeError):
        pass

    init_data = make_init_data(owner_tg_id, bot_token)

    # Step 1: expect 429
    resp1 = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "hello"}]},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp1.status_code == 429, (
        f"initial blocked state expected 429, got {resp1.status_code}"
    )

    # Step 2: admin PATCH cap higher (RED: 404/405 until Plan 15-04)
    patch_resp = await client.patch(
        f"/api/v1/admin/users/{owner_pk}/cap",
        json={"spending_cap_cents": 1_000_000},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert patch_resp.status_code == 200, (
        f"PATCH cap must return 200, got {patch_resp.status_code}: {patch_resp.text}"
    )

    # Step 3: invalidate cache explicitly (in case Plan 15-04 doesn't auto-invalidate)
    try:
        from app.services.spend_cap import invalidate_user_spend_cache  # RED until 15-02
        await invalidate_user_spend_cache(owner_pk)
    except ImportError:
        pass  # Module not yet created; that's expected in RED phase

    # Step 4: retry /ai/chat → must now pass
    resp2 = await client.post(
        "/api/v1/ai/chat",
        json={"message": "hello again"},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp2.status_code == 200, (
        f"after cap raised and cache invalidated, /ai/chat must succeed (200), "
        f"got {resp2.status_code}: {resp2.text}"
    )


@pytest.mark.asyncio
async def test_suggest_category_blocked_when_at_cap(
    db_client, bot_token, owner_tg_id, monkeypatch
):
    """cap=10, spend=50 → GET /ai/suggest-category returns 429."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user, seed_ai_usage_log
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 10 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()
        user_id = user.id

    async with SessionLocal() as s:
        # 0.50 USD → 50 cents >> cap of 10
        await seed_ai_usage_log(s, user_id=user_id, est_cost_usd=0.50)

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/ai/suggest-category",
        params={"q": "кофе"},
        headers={"X-Telegram-Init-Data": init_data},
    )
    # RED: 404/200 until Plan 15-03 wires enforce_spending_cap to ai_suggest router
    assert resp.status_code == 429, (
        f"spend=50 cents > cap=10 must block /ai/suggest-category (429), "
        f"got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_cap_zero_blocks_chat_and_suggest(
    db_client, bot_token, owner_tg_id, monkeypatch
):
    """cap=0 → both /ai/chat and /ai/suggest-category return 429."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole
    from sqlalchemy import text

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        user = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.execute(
            text("UPDATE app_user SET spending_cap_cents = 0 WHERE id = :uid"),
            {"uid": user.id},
        )
        await s.commit()

    try:
        import app.api.routes.ai as ai_module
        monkeypatch.setattr(ai_module, "_stream_llm", _stub_llm_stream, raising=False)
    except (ImportError, AttributeError):
        pass

    init_data = make_init_data(owner_tg_id, bot_token)

    # /ai/chat must return 429
    chat_resp = await client.post(
        "/api/v1/ai/chat",
        json={"messages": [{"role": "user", "content": "hello"}]},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert chat_resp.status_code == 429, (
        f"cap=0 must block /ai/chat (429), got {chat_resp.status_code}: {chat_resp.text}"
    )

    # /ai/suggest-category must return 429
    suggest_resp = await client.get(
        "/api/v1/ai/suggest-category",
        params={"q": "кофе"},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert suggest_resp.status_code == 429, (
        f"cap=0 must block /ai/suggest-category (429), "
        f"got {suggest_resp.status_code}: {suggest_resp.text}"
    )
