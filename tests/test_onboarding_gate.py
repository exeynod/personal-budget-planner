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
from __future__ import annotations

import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture(autouse=True)
def _disable_dev_mode(monkeypatch):
    from app.core.settings import settings
    monkeypatch.setattr(settings, "DEV_MODE", False)


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
def member_tg_user_id() -> int:
    return 987654321


@pytest.fixture
def member_headers(bot_token, member_tg_user_id):
    from tests.conftest import make_init_data
    return {"X-Telegram-Init-Data": make_init_data(member_tg_user_id, bot_token)}


@pytest.fixture
def embed_mock(monkeypatch):
    from unittest.mock import AsyncMock

    from app.ai.embedding_service import EMBEDDING_DIM, get_embedding_service
    from app.core.settings import settings

    get_embedding_service.cache_clear()
    svc = get_embedding_service()
    monkeypatch.setattr(
        svc,
        "embed_texts",
        AsyncMock(side_effect=lambda texts: [[0.0] * EMBEDDING_DIM for _ in texts]),
    )
    monkeypatch.setattr(settings, "ENABLE_AI_CATEGORIZATION", True)
    return svc


async def _seed_member(SessionLocal, *, tg_user_id: int, tg_chat_id: int | None = None):
    from datetime import datetime, timezone

    from sqlalchemy import text

    from tests.helpers.seed import seed_member_not_onboarded
    async with SessionLocal() as session:
        user = await seed_member_not_onboarded(
            session, tg_user_id=tg_user_id, tg_chat_id=tg_chat_id,
        )
        # 68-05 (class B/C): grant ПДн consent so v1.0 /onboarding/complete
        # passes the Phase 33 CMP-33-04 gate (NULL → 403). Member stays
        # NOT onboarded (onboarded_at remains NULL) so the gate-matrix tests
        # still exercise the require_onboarded 409 path.
        await session.flush()
        await session.execute(
            text("UPDATE app_user SET pdn_consent_at = :ts WHERE id = :uid"),
            {"ts": datetime.now(timezone.utc), "uid": user.id},
        )
        await session.commit()
        return user.id


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


@pytest.mark.asyncio
async def test_member_pre_onboarding_categories_blocked_with_409(
    db_client, member_headers, member_tg_user_id,
):
    """Pre-onboarding GET /categories returns 409 with onboarding_required."""
    async_client, SessionLocal = db_client
    await _seed_member(SessionLocal, tg_user_id=member_tg_user_id)

    resp = await async_client.get("/api/v1/categories", headers=member_headers)
    assert resp.status_code == 409, (
        f"expected 409 (gate), got {resp.status_code}: {resp.text}"
    )
    assert resp.json() == {"detail": {"error": "onboarding_required"}}, (
        f"body shape mismatch: {resp.text}"
    )


@pytest.mark.asyncio
async def test_member_pre_onboarding_can_reach_me_and_onboarding_endpoints(
    db_client, member_headers, member_tg_user_id,
):
    """Pre-onboarding: /me → 200; /onboarding/complete → NOT 409 (gate not applied)."""
    async_client, SessionLocal = db_client
    await _seed_member(SessionLocal, tg_user_id=member_tg_user_id)

    # /me is not gated
    resp = await async_client.get("/api/v1/me", headers=member_headers)
    assert resp.status_code == 200, f"/me expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body["onboarded_at"] is None
    assert body["role"] == "member"

    # /onboarding/complete must NOT return 409 onboarding_required (v1.0 body).
    from tests.helpers.onboarding import v10_onboarding_body

    resp = await async_client.post(
        "/api/v1/onboarding/complete",
        headers=member_headers,
        json=v10_onboarding_body(),
    )
    assert resp.status_code != 409 or (
        resp.json().get("detail", {}).get("error") != "onboarding_required"
    ), (
        f"/onboarding/complete must not be blocked by the onboarding gate, "
        f"got {resp.status_code}: {resp.text}"
    )
    # Expect 200 success
    assert resp.status_code == 200, (
        f"/onboarding/complete expected 200, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_member_gate_matrix_409_on_all_gated_routers(
    db_client, member_headers, member_tg_user_id,
):
    """All 10 gated endpoints return 409 onboarding_required for unboarded member."""
    async_client, SessionLocal = db_client
    await _seed_member(SessionLocal, tg_user_id=member_tg_user_id)

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


@pytest.mark.asyncio
async def test_full_member_onboarding_flow_creates_categories_periods_embeddings(
    db_client, member_headers, embed_mock, member_tg_user_id,
):
    """Full lifecycle: seed → /onboarding/complete → categories gated unlocked → embeddings."""
    async_client, SessionLocal = db_client
    # 1. Seed member (no onboarded_at).
    await _seed_member(SessionLocal, tg_user_id=member_tg_user_id, tg_chat_id=99999)

    # 2. Pre-onboarding /me — confirm shape.
    resp = await async_client.get("/api/v1/me", headers=member_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["onboarded_at"] is None
    assert body["role"] == "member"

    # 3. Run onboarding (v1.0 contract, 68-05).
    from tests.helpers.onboarding import v10_onboarding_body

    resp = await async_client.post(
        "/api/v1/onboarding/complete",
        headers=member_headers,
        json=v10_onboarding_body(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # v1.0 response shape: 8 default expense codes + savings_category_id.
    assert set(body["category_ids_by_code"].keys()) == {
        "food", "cafe", "home", "transit", "fun", "gifts", "health", "subs"
    }
    assert isinstance(body["savings_category_id"], int)

    # 4. Post-onboarding /categories returns the gate-unlocked rows (9 total:
    #    8 default expense + 1 system savings).
    resp = await async_client.get("/api/v1/categories", headers=member_headers)
    assert resp.status_code == 200, (
        f"categories expected 200 post-onboarding, got {resp.status_code}: {resp.text}"
    )
    cats = resp.json()
    assert len(cats) == 9, f"expected 9 categories, got {len(cats)}"

    # 5. v1.0 (BE-15) decouples embedding backfill from onboarding — no
    #    CategoryEmbedding rows are created here (covered by backfill tests).
    from sqlalchemy import func, select

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
        assert count == 0, f"v1.0 onboarding creates no embeddings, got {count}"

    # 6. /me reflects onboarded_at set.
    resp = await async_client.get("/api/v1/me", headers=member_headers)
    assert resp.status_code == 200
    assert resp.json()["onboarded_at"] is not None


@pytest.mark.asyncio
async def test_two_members_onboarding_isolation(
    db_client, bot_token, embed_mock,
):
    """Member A onboarding does not affect member B (cross-tenant isolation)."""
    async_client, SessionLocal = db_client

    member_a_tg_id = 111222333
    member_b_tg_id = 444555666

    await _seed_member(SessionLocal, tg_user_id=member_a_tg_id, tg_chat_id=11111)
    await _seed_member(SessionLocal, tg_user_id=member_b_tg_id, tg_chat_id=22222)

    from tests.conftest import make_init_data

    headers_a = {"X-Telegram-Init-Data": make_init_data(member_a_tg_id, bot_token)}
    headers_b = {"X-Telegram-Init-Data": make_init_data(member_b_tg_id, bot_token)}

    # Member A completes onboarding (v1.0 contract, 68-05).
    from tests.helpers.onboarding import v10_onboarding_body

    resp = await async_client.post(
        "/api/v1/onboarding/complete",
        headers=headers_a,
        json=v10_onboarding_body(),
    )
    assert resp.status_code == 200, f"member A onboarding failed: {resp.text}"

    # Member B is still blocked — onboarding pending.
    resp = await async_client.get("/api/v1/categories", headers=headers_b)
    assert resp.status_code == 409, (
        f"member B should still be gated (409), got {resp.status_code}: {resp.text}"
    )

    # DB confirms isolation.
    from sqlalchemy import func, select

    from app.db.models import AppUser, Category, CategoryEmbedding

    async with SessionLocal() as session:
        user_a = (await session.execute(
            select(AppUser).where(AppUser.tg_user_id == member_a_tg_id)
        )).scalar_one()
        user_b = (await session.execute(
            select(AppUser).where(AppUser.tg_user_id == member_b_tg_id)
        )).scalar_one()

        count_cats_a = await session.scalar(
            select(func.count()).select_from(Category).where(Category.user_id == user_a.id)
        )
        count_cats_b = await session.scalar(
            select(func.count()).select_from(Category).where(Category.user_id == user_b.id)
        )
        count_emb_a = await session.scalar(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user_a.id)
        )
        count_emb_b = await session.scalar(
            select(func.count())
            .select_from(CategoryEmbedding)
            .where(CategoryEmbedding.user_id == user_b.id)
        )

        # v1.0 (68-05): onboarding seeds 8 default expense + 1 savings = 9 for
        # member A; member B (un-onboarded) has none. Embedding backfill is
        # decoupled from onboarding in v1.0, so neither has embeddings here.
        assert count_cats_a == 9, f"member A: expected 9 categories, got {count_cats_a}"
        assert count_cats_b == 0, f"member B: expected 0 categories, got {count_cats_b}"
        assert count_emb_a == 0, f"member A: v1.0 onboarding creates no embeddings, got {count_emb_a}"
        assert count_emb_b == 0, f"member B: expected 0 embeddings, got {count_emb_b}"
