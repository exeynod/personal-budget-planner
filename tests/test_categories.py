"""Integration tests for Categories CRUD + seed (CAT-01, CAT-02, CAT-03).

DB-backed: requires DATABASE_URL pointing to a test Postgres database
with `alembic upgrade head` applied. Skipped via `pytest.skip` otherwise
(self-skip pattern from test_migrations.py).

Wave 0 RED state: imports of `app.api.dependencies.get_db` and
`app.main_api.app` succeed (Phase 1), but the routes themselves
(`/api/v1/categories`, `/api/v1/onboarding/complete`) do not exist yet —
all HTTP calls return 404 / fail assertions until Plans 02-03..02-04
implement them.
"""

import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    """Helper: returns headers dict with X-Telegram-Init-Data for owner."""
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_client(async_client, bot_token, owner_tg_id):
    """async_client + a real DB session injected via dependency_overrides.

    Truncates relevant tables before yielding to ensure clean state.
    Self-skips if DATABASE_URL is not configured.
    Calls GET /me to bootstrap AppUser (D-11) so onboarding tests can proceed.
    """
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    # Clean state — TRUNCATE all domain tables.
    from tests.helpers.seed import truncate_db

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

    # Bootstrap AppUser via GET /me so onboarding/complete can find the user (D-11).
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )
    # Phase 14 require_onboarded gate: legacy bootstrap-via-/me path leaves
    # onboarded_at NULL (DEV_MODE upsert doesn't set it); flip it now so
    # domain endpoints stay reachable.
    async with SessionLocal() as _onb_session:
        await _onb_session.execute(
            text("UPDATE app_user SET onboarded_at = NOW() WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        await _onb_session.commit()

    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_empty(db_client, auth_headers):
    response = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_category(db_client, auth_headers):
    response = await db_client.post(
        "/api/v1/categories",
        json={"name": "Спорт", "kind": "expense", "sort_order": 50},
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["name"] == "Спорт"
    assert data["kind"] == "expense"
    assert data["is_archived"] is False
    assert "id" in data


@pytest.mark.asyncio
async def test_create_then_list(db_client, auth_headers):
    await db_client.post(
        "/api/v1/categories",
        json={"name": "Хобби", "kind": "expense"},
        headers=auth_headers,
    )
    response = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["name"] == "Хобби"


@pytest.mark.asyncio
async def test_update_renames(db_client, auth_headers):
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Старое", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    update = await db_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Новое"},
        headers=auth_headers,
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Новое"


@pytest.mark.asyncio
async def test_archive_hides_from_default_list(db_client, auth_headers):
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Удалить", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    delete = await db_client.delete(
        f"/api/v1/categories/{cat_id}", headers=auth_headers
    )
    assert delete.status_code == 200

    listing = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 0


@pytest.mark.asyncio
async def test_include_archived_and_unarchive(db_client, auth_headers):
    """include_archived=true surfaces a soft-deleted category; PATCH restores it.

    Consolidates the former include-archived + can-be-unarchived tests — both
    exercise the same soft-delete/restore round-trip on one row.
    """
    create = await db_client.post(
        "/api/v1/categories",
        json={"name": "Архивная", "kind": "expense"},
        headers=auth_headers,
    )
    cat_id = create.json()["id"]
    await db_client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)

    listing = await db_client.get(
        "/api/v1/categories?include_archived=true",
        headers=auth_headers,
    )
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1 and items[0]["is_archived"] is True

    restore = await db_client.patch(
        f"/api/v1/categories/{cat_id}",
        json={"is_archived": False},
        headers=auth_headers,
    )
    assert restore.status_code == 200
    assert restore.json()["is_archived"] is False


# v1.0 onboarding contract (Phase 22 BE-15): the live endpoint is
# ``onboarding_v10_router`` — the legacy ``starting_balance_cents /
# cycle_start_day / seed_default_categories`` body is unmounted and now 422s
# (extra_forbidden + missing income_cents/accounts/category_plans). The v1.0
# seed creates the 8 DEFAULT_CATEGORIES + 1 system 'savings' category = 9 rows.
_V10_ONBOARDING_BODY = {
    "income_cents": 10_000_000,
    "accounts": [{"bank": "Tinkoff", "kind": "card", "primary": True}],
    "category_plans": {"food": 100_000, "cafe": 50_000},
}


async def _prep_for_onboarding(owner_tg_id: int) -> None:
    """Reset onboarded_at=NULL + grant ПДн consent so v1.0 onboarding can run.

    The ``db_client`` fixture flips ``onboarded_at=NOW()`` right after the
    GET /me bootstrap; v1.0 ``/onboarding/complete`` requires it NULL (else 409
    already-onboarded) AND a non-null ``pdn_consent_at`` (Phase 33 CMP-33-04,
    else 403 pdn_consent_required). Set both directly in the DB.
    """
    import os
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import text as _text

    _engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    _SessionLocal = async_sessionmaker(_engine, expire_on_commit=False)
    async with _SessionLocal() as _s:
        await _s.execute(
            _text(
                "UPDATE app_user SET onboarded_at = NULL, pdn_consent_at = NOW() "
                "WHERE tg_user_id = :tg"
            ),
            {"tg": owner_tg_id},
        )
        await _s.commit()
    await _engine.dispose()


@pytest.mark.asyncio
async def test_seed_creates_14_categories(db_client, auth_headers, owner_tg_id):
    """CAT-03: seed via v1.0 /onboarding/complete.

    NOTE (Phase 68 A2): the historical name says "14" — that was the legacy
    Phase-2 seed count. The v1.0 contract (onboarding_v10) seeds the 8 default
    categories + 1 system 'savings' category = **9**. Name kept for traceability;
    the assertion follows the real v1.0 contract.
    """
    await _prep_for_onboarding(owner_tg_id)

    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json=_V10_ONBOARDING_BODY,
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    listing = await db_client.get("/api/v1/categories", headers=auth_headers)
    # v1.0: 8 default categories + 1 system 'savings' = 9.
    assert len(listing.json()) == 9


# NOTE (prune): test_seed_idempotent_skips_when_categories_exist was removed —
# the seed-count happy-path above covers the 9-category seed, and the
# already-onboarded 409 / re-onboard guard is covered by
# tests/services/test_onboarding_v10.py::test_complete_v10_returns_409_when_account_exists
# and tests/api/test_onboarding_v10_api.py::test_complete_v10_retry_409.


# ---------------------------------------------------------------------------
# P1-1 (BE-F2): _refresh_embedding must thread user_id + set tenant scope.
#
# Regression: the background task called upsert_category_embedding WITHOUT the
# kw-only user_id (→ TypeError, swallowed) and its fresh session never called
# set_tenant_scope → user-category embeddings silently never persisted. This
# test seeds a user + category in the real DB, runs _refresh_embedding with a
# mocked embed_text (no OpenAI call), and asserts a category_embedding row was
# written for that user/category.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_refresh_embedding_persists_row_for_user_category():
    """_refresh_embedding(user_id) → category_embedding row persisted (P1-1)."""
    _require_db()
    from unittest.mock import AsyncMock

    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.ai.embedding_service import (
        EMBEDDING_DIM,
        get_embedding_service,
    )
    from app.api.routes import categories as cat_routes
    from app.db.models import CategoryEmbedding, CategoryKind
    from tests.helpers.seed import seed_user

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    from tests.helpers.seed import truncate_db

    await truncate_db()

    from tests.helpers.seed import seed_category

    async with SessionLocal() as session:
        user = await seed_user(session, tg_user_id=9_670_400_001)
        cat = await seed_category(
            session,
            user_id=user.id,
            name="Кофейни",
            kind=CategoryKind.expense,
            sort_order=0,
        )
        await session.commit()
        await session.refresh(cat)
        user_id, category_id = user.id, cat.id

    # Mock embed_text on the singleton service so no OpenAI call is made; the
    # real upsert_category_embedding still runs against the DB.
    svc = get_embedding_service()
    fixed_vector = [0.123] * EMBEDDING_DIM
    svc.embed_text = AsyncMock(return_value=fixed_vector)

    try:
        # Must accept user_id (kw or positional) and persist the embedding.
        await cat_routes._refresh_embedding(category_id, "Кофейни", user_id)

        async with SessionLocal() as session:
            row_count = (
                await session.execute(
                    select(func.count())
                    .select_from(CategoryEmbedding)
                    .where(CategoryEmbedding.category_id == category_id)
                    .where(CategoryEmbedding.user_id == user_id)
                )
            ).scalar_one()
        assert row_count == 1, (
            "embedding row must be persisted for the user category "
            "(P1-1: user_id threaded + tenant scope set)"
        )
    finally:
        get_embedding_service.cache_clear()
        await engine.dispose()
