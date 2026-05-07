"""RED tests for Phase 13 ADM-03/04/05/06 — admin users CRUD + RBAC.

Endpoints under test (will be created in Plan 13-04):
  GET    /api/v1/admin/users        list whitelist
  POST   /api/v1/admin/users        invite by tg_user_id (creates AppUser role=member)
  DELETE /api/v1/admin/users/{id}   revoke + cascade purge

All endpoints protected by Depends(require_owner) → 403 for member/revoked.

All tests are integration (real DB). Skip when DATABASE_URL is unset.

These tests are RED until Plans 13-02 (alembic 0008), 13-03 (ai_usage_log
persistence), and 13-04 (admin routes wiring) land. The cascade test also
depends on Plan 13-04 service-layer purge logic (no DB ON DELETE CASCADE
on domain tables — see Plan 11-02 D-NOTE).
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — integration test requires DB")


@pytest_asyncio.fixture
async def db_client(async_client):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.helpers.seed import _PHASE13_TRUNCATE_TABLES

    admin_url = os.environ.get("ADMIN_DATABASE_URL") or os.environ["DATABASE_URL"]
    admin_engine = create_async_engine(admin_url, echo=False)
    async with admin_engine.begin() as conn:
        # ai_usage_log might not exist yet (RED phase before Plan 13-02).
        # Truncate fallback: try with ai_usage_log first, on failure retry without.
        try:
            await conn.execute(
                text(f"TRUNCATE TABLE {_PHASE13_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
        except Exception:
            from tests.helpers.seed import _DEFAULT_TRUNCATE_TABLES
            await conn.execute(
                text(f"TRUNCATE TABLE {_DEFAULT_TRUNCATE_TABLES} RESTART IDENTITY CASCADE")
            )
    await admin_engine.dispose()

    runtime_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(runtime_url, echo=False)
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


# ---------- GROUP A: GET /api/v1/admin/users (ADM-06 list) ----------

@pytest.mark.asyncio
async def test_admin_list_users_returns_owner_and_member(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_two_role_tenants, seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        ids = await seed_two_role_tenants(
            s, owner_tg_user_id=owner_tg_id, member_tg_user_id=9_555_555_001
        )
        await seed_user(s, tg_user_id=9_555_555_002, role=UserRole.member)
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/admin/users", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 3, f"expected 3 users (owner + 2 members), got {len(body)}"
    # Owner first — ADM-03 sort contract.
    assert body[0]["role"] == "owner", f"owner must be first row, got {body[0]}"
    assert body[0]["tg_user_id"] == owner_tg_id


@pytest.mark.asyncio
async def test_admin_list_users_includes_required_fields(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_two_role_tenants

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_two_role_tenants(
            s, owner_tg_user_id=owner_tg_id, member_tg_user_id=9_555_555_010
        )

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.get(
        "/api/v1/admin/users", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for row in body:
        for fld in ("id", "tg_user_id", "role", "last_seen_at",
                    "onboarded_at", "created_at", "tg_chat_id"):
            assert fld in row, f"missing field {fld!r} in {row}"


@pytest.mark.asyncio
async def test_admin_list_users_403_for_member(db_client, bot_token):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=9_555_555_020, role=UserRole.member)
        await s.commit()

    init_data = make_init_data(9_555_555_020, bot_token)
    resp = await client.get(
        "/api/v1/admin/users", headers={"X-Telegram-Init-Data": init_data}
    )
    assert resp.status_code == 403, (
        f"member must be blocked by require_owner, got {resp.status_code}"
    )


# ---------- GROUP B: POST /api/v1/admin/users (ADM-04 invite) ----------

@pytest.mark.asyncio
async def test_admin_create_user_returns_201_with_member_role(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.post(
        "/api/v1/admin/users",
        json={"tg_user_id": 9_555_555_100},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tg_user_id"] == 9_555_555_100
    assert body["role"] == "member", f"new user must be member, got {body['role']}"


@pytest.mark.asyncio
async def test_admin_create_user_409_on_duplicate(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    # First invite ok.
    r1 = await client.post(
        "/api/v1/admin/users",
        json={"tg_user_id": 9_555_555_110},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert r1.status_code == 201, r1.text
    # Second invite same id → 409.
    r2 = await client.post(
        "/api/v1/admin/users",
        json={"tg_user_id": 9_555_555_110},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert r2.status_code == 409, (
        f"duplicate tg_user_id must return 409, got {r2.status_code}"
    )


@pytest.mark.asyncio
async def test_admin_create_user_422_on_short_id(
    db_client, bot_token, owner_tg_id
):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.post(
        "/api/v1/admin/users",
        json={"tg_user_id": 999},  # 3 digits, below min
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 422, (
        f"short tg_user_id must fail validation (422), got {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_admin_create_user_403_for_member(db_client, bot_token):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=9_555_555_200, role=UserRole.member)
        await s.commit()

    init_data = make_init_data(9_555_555_200, bot_token)
    resp = await client.post(
        "/api/v1/admin/users",
        json={"tg_user_id": 9_555_555_201},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 403


# ---------- GROUP C: DELETE /api/v1/admin/users/{user_id} (ADM-05 revoke) ----------

@pytest.mark.asyncio
async def test_admin_delete_user_204(db_client, bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_two_role_tenants

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        ids = await seed_two_role_tenants(
            s, owner_tg_user_id=owner_tg_id, member_tg_user_id=9_555_555_300
        )
    member_id = ids["member_id"]

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.delete(
        f"/api/v1/admin/users/{member_id}",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 204, resp.text
    # Verify list now returns only owner.
    list_resp = await client.get(
        "/api/v1/admin/users", headers={"X-Telegram-Init-Data": init_data}
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


@pytest.mark.asyncio
async def test_admin_delete_user_self_403(db_client, bot_token, owner_tg_id):
    """ADM-05 + CONTEXT: self-revoke owner запрещён → 403."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()
        owner_id = owner.id

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.delete(
        f"/api/v1/admin/users/{owner_id}",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 403, (
        f"owner self-revoke must be blocked, got {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_admin_delete_user_404_unknown(db_client, bot_token, owner_tg_id):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.delete(
        "/api/v1/admin/users/999999",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_admin_delete_user_403_for_member(db_client, bot_token):
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        m1 = await seed_user(s, tg_user_id=9_555_555_400, role=UserRole.member)
        m2 = await seed_user(s, tg_user_id=9_555_555_401, role=UserRole.member)
        await s.commit()
        m2_id = m2.id

    init_data = make_init_data(9_555_555_400, bot_token)
    resp = await client.delete(
        f"/api/v1/admin/users/{m2_id}",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_delete_user_cascade_purges_data(
    db_client, bot_token, owner_tg_id
):
    """ADM-05: revoke удаляет все связанные данные юзера, owner-данные нетронуты."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import (
        seed_two_role_tenants, seed_category, seed_budget_period,
        seed_actual_transaction,
    )
    from app.db.models import CategoryKind, ActualSource

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        ids = await seed_two_role_tenants(
            s, owner_tg_user_id=owner_tg_id, member_tg_user_id=9_555_555_500
        )
        owner_id, member_id = ids["owner_id"], ids["member_id"]
        owner_cat = await seed_category(s, user_id=owner_id, name="OwnerCat")
        member_cat = await seed_category(s, user_id=member_id, name="MemberCat")
        owner_period = await seed_budget_period(
            s, user_id=owner_id,
            period_start=date(2026, 5, 5), period_end=date(2026, 6, 4),
        )
        member_period = await seed_budget_period(
            s, user_id=member_id,
            period_start=date(2026, 5, 5), period_end=date(2026, 6, 4),
        )
        await seed_actual_transaction(
            s, user_id=member_id, period_id=member_period.id,
            kind=CategoryKind.expense, amount_cents=10000,
            category_id=member_cat.id, tx_date=date(2026, 5, 7),
            source=ActualSource.mini_app,
        )
        await seed_actual_transaction(
            s, user_id=owner_id, period_id=owner_period.id,
            kind=CategoryKind.expense, amount_cents=20000,
            category_id=owner_cat.id, tx_date=date(2026, 5, 7),
            source=ActualSource.mini_app,
        )
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.delete(
        f"/api/v1/admin/users/{member_id}",
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 204, resp.text

    # Verify cascade: every domain table has 0 rows for member, owner intact.
    async with SessionLocal() as s:
        for table in (
            "category", "budget_period", "actual_transaction",
            "planned_transaction", "subscription", "plan_template_item",
            "category_embedding", "ai_conversation", "ai_message",
        ):
            result = await s.execute(
                text(f"SELECT count(*) FROM {table} WHERE user_id = :uid"),
                {"uid": member_id},
            )
            assert result.scalar_one() == 0, (
                f"member rows in {table!r} must be purged after revoke"
            )
        # Owner data intact.
        result = await s.execute(
            text("SELECT count(*) FROM category WHERE user_id = :uid"),
            {"uid": owner_id},
        )
        assert result.scalar_one() == 1, "owner data must remain intact"

        # AppUser row itself deleted.
        result = await s.execute(
            text("SELECT count(*) FROM app_user WHERE id = :uid"),
            {"uid": member_id},
        )
        assert result.scalar_one() == 0, "AppUser row must be deleted"
