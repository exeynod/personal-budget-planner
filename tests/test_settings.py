"""Integration tests for Settings (SET-01, PER-01).

Covers D-17 (PATCH does not recompute existing periods),
T-cycle-validation (Pydantic 1..28).

Wave 0 RED state: routes /api/v1/settings (GET/PATCH) will be created
in Plan 02-03..02-04. DB fixture self-skips when DATABASE_URL is unset.
"""
import os

import pytest
import pytest_asyncio


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_client(async_client, bot_token, owner_tg_id):
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

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

    # Bootstrap AppUser via GET /me (D-11) so settings and onboarding can find the user row.
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get("/api/v1/me", headers={"X-Telegram-Init-Data": init_data})
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
async def test_get_settings_default(db_client, auth_headers):
    """До изменений: cycle_start_day=5 (default из app_user)."""
    # Trigger /me to create app_user
    await db_client.get("/api/v1/me", headers=auth_headers)
    response = await db_client.get("/api/v1/settings", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["cycle_start_day"] == 5


@pytest.mark.asyncio
async def test_patch_updates_cycle_day(db_client, auth_headers):
    """PATCH /settings → читается обратно через GET."""
    await db_client.get("/api/v1/me", headers=auth_headers)
    patch = await db_client.patch(
        "/api/v1/settings",
        json={"cycle_start_day": 10},
        headers=auth_headers,
    )
    assert patch.status_code == 200
    get = await db_client.get("/api/v1/settings", headers=auth_headers)
    assert get.json()["cycle_start_day"] == 10


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_day", [0, 29, -1, 100])
async def test_invalid_cycle_day_422(db_client, auth_headers, invalid_day):
    """T-cycle-validation: Field(ge=1, le=28) → 422 для out-of-range."""
    await db_client.get("/api/v1/me", headers=auth_headers)
    response = await db_client.patch(
        "/api/v1/settings",
        json={"cycle_start_day": invalid_day},
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_does_not_recompute_existing_period(db_client, auth_headers, owner_tg_id):
    """SET-01 / D-17: изменение cycle_start_day не пересчитывает текущий период.

    Phase 14 test-infra note: db_client fixture flips onboarded_at=NOW() right
    after the GET /me bootstrap (so legacy domain endpoints stay reachable
    behind require_onboarded). This test specifically wants to exercise the
    real /onboarding/complete flow, so we reset onboarded_at to NULL in DB
    before calling complete_onboarding.
    """
    # Reset onboarded_at — undo db_client's pre-onboarding shortcut so that
    # /onboarding/complete is allowed to run.
    import os
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import text as _text
    _engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    _SessionLocal = async_sessionmaker(_engine, expire_on_commit=False)
    async with _SessionLocal() as _s:
        await _s.execute(
            _text("UPDATE app_user SET onboarded_at = NULL WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        await _s.commit()
    await _engine.dispose()

    # 1. Onboarding с cycle_start_day=5 — создаёт период
    await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": 5,
            "seed_default_categories": False,
        },
        headers=auth_headers,
    )
    period_before = (
        await db_client.get("/api/v1/periods/current", headers=auth_headers)
    ).json()

    # 2. Сменить cycle_start_day на 10
    await db_client.patch(
        "/api/v1/settings",
        json={"cycle_start_day": 10},
        headers=auth_headers,
    )

    # 3. Текущий период остался с теми же датами
    period_after = (
        await db_client.get("/api/v1/periods/current", headers=auth_headers)
    ).json()
    assert period_before["period_start"] == period_after["period_start"]
    assert period_before["period_end"] == period_after["period_end"]
