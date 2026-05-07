"""RED tests for AICAP-04 — PATCH /api/v1/admin/users/{user_id}/cap endpoint.

All tests RED until Plan 15-04 creates the PATCH endpoint in app/api/routes/admin.py.

Contract (CONTEXT D-15-03):
  PATCH /api/v1/admin/users/{user_id}/cap
  Body:    {"spending_cap_cents": int}   ge=0
  Returns: AdminUserResponse             updated snapshot
  Auth:    Depends(require_owner) → 403 for member; 404 if user not found

Pattern mirrors tests/test_admin_users_api.py: db_client fixture + make_init_data.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

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


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_patches_member_cap_returns_updated_snapshot(
    db_client, bot_token, owner_tg_id
):
    """Owner PATCHes member's cap → 200 with AdminUserResponse; DB updated."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        member = await seed_user(
            s, tg_user_id=9_860_000_001, role=UserRole.member,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.commit()
        member_id = member.id

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.patch(
        f"/api/v1/admin/users/{member_id}/cap",
        json={"spending_cap_cents": 100_000},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 200, (
        f"owner PATCH member cap must return 200, got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    # Response must be AdminUserResponse shape with spending_cap_cents
    assert "spending_cap_cents" in body, f"response must include spending_cap_cents, got keys={list(body.keys())}"
    assert body["spending_cap_cents"] == 100_000, (
        f"returned spending_cap_cents must be 100000, got {body['spending_cap_cents']}"
    )

    # Verify in DB
    async with SessionLocal() as s:
        row = await s.execute(
            text("SELECT spending_cap_cents FROM app_user WHERE id = :uid"),
            {"uid": member_id},
        )
        db_cap = row.scalar_one()
    assert db_cap == 100_000, f"DB spending_cap_cents must be 100000, got {db_cap}"


@pytest.mark.asyncio
async def test_owner_patches_self_cap(db_client, bot_token, owner_tg_id):
    """Owner PATCHes their own cap (id=self.id) → 200."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(
            s, tg_user_id=owner_tg_id, role=UserRole.owner,
            onboarded_at=datetime.now(timezone.utc)
        )
        await s.commit()
        owner_id = owner.id

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.patch(
        f"/api/v1/admin/users/{owner_id}/cap",
        json={"spending_cap_cents": 200_000},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 200, (
        f"owner self-cap PATCH must return 200, got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    assert body["spending_cap_cents"] == 200_000


@pytest.mark.asyncio
async def test_member_forbidden_403(db_client, bot_token):
    """Member calling PATCH /admin/users/{id}/cap → 403 (require_owner)."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    member_tg = 9_860_000_010
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=9_860_000_011, role=UserRole.owner)
        member = await seed_user(s, tg_user_id=member_tg, role=UserRole.member)
        await s.commit()
        owner_id = owner.id

    init_data = make_init_data(member_tg, bot_token)
    resp = await client.patch(
        f"/api/v1/admin/users/{owner_id}/cap",
        json={"spending_cap_cents": 999},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 403, (
        f"member must be blocked by require_owner (403), got {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_unknown_user_returns_404(db_client, bot_token, owner_tg_id):
    """Owner PATCHes non-existent user_id → 404."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.patch(
        "/api/v1/admin/users/999999/cap",
        json={"spending_cap_cents": 1000},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 404, (
        f"unknown user_id must return 404, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_negative_cap_validation_422(db_client, bot_token, owner_tg_id):
    """Body with spending_cap_cents=-1 → 422 (Pydantic Field(ge=0))."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        await s.commit()
        owner_id = owner.id

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.patch(
        f"/api/v1/admin/users/{owner_id}/cap",
        json={"spending_cap_cents": -1},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 422, (
        f"negative spending_cap_cents must fail validation (422), got {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_cap_zero_accepted(db_client, bot_token, owner_tg_id):
    """Body with spending_cap_cents=0 → 200 (D-15-03: ge=0, not gt=0)."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        member = await seed_user(s, tg_user_id=9_860_000_020, role=UserRole.member)
        await s.commit()
        member_id = member.id

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.patch(
        f"/api/v1/admin/users/{member_id}/cap",
        json={"spending_cap_cents": 0},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 200, (
        f"spending_cap_cents=0 must be accepted (ge=0), got {resp.status_code}: {resp.text}"
    )
    assert resp.json()["spending_cap_cents"] == 0


@pytest.mark.asyncio
@pytest.mark.xfail(
    reason="Plan 15-04 may or may not use extra='forbid' in CapUpdate schema; "
           "xfail if extra fields are silently ignored"
)
async def test_extra_fields_rejected_422(db_client, bot_token, owner_tg_id):
    """Body with extra field 'role' → 422 if schema uses extra='forbid'."""
    from tests.conftest import make_init_data
    from tests.helpers.seed import seed_user
    from app.db.models import UserRole

    client, SessionLocal = db_client
    async with SessionLocal() as s:
        owner = await seed_user(s, tg_user_id=owner_tg_id, role=UserRole.owner)
        member = await seed_user(s, tg_user_id=9_860_000_030, role=UserRole.member)
        await s.commit()
        member_id = member.id

    init_data = make_init_data(owner_tg_id, bot_token)
    resp = await client.patch(
        f"/api/v1/admin/users/{member_id}/cap",
        json={"spending_cap_cents": 1000, "role": "owner"},
        headers={"X-Telegram-Init-Data": init_data},
    )
    assert resp.status_code == 422, (
        f"extra fields in body must be rejected (422) when extra='forbid', "
        f"got {resp.status_code}"
    )
