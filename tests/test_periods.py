"""Integration tests for Periods endpoints (PER-01, PER-02).

Wave 0 RED state: routes /api/v1/periods/current and
/api/v1/onboarding/complete will be created in Plans 02-03..02-04.
DB fixture self-skips when DATABASE_URL is unset.
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

    # Bootstrap AppUser via GET /me (D-11) so onboarding can find the user row.
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get("/api/v1/me", headers={"X-Telegram-Init-Data": init_data})

    # 68-05 (class B/C): grant ПДн consent so v1.0 onboarding passes the gate.
    from tests.helpers.onboarding import grant_pdn_consent

    await grant_pdn_consent(SessionLocal, tg_user_id=owner_tg_id)

    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_periods_current_before_onboarding_is_409(db_client, auth_headers):
    """До onboarding require_onboarded gate срабатывает раньше period lookup.

    Phase 14 (MTONB-04): был 404 до Phase 14, теперь 409 onboarding_required —
    /periods/current под Depends(require_onboarded), gate firs первым.
    """
    # First trigger /me to create app_user row (Phase 1 D-11 upsert pattern)
    await db_client.get("/api/v1/me", headers=auth_headers)
    response = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert response.status_code == 409
    body = response.json()
    assert body.get("detail", {}).get("error") == "onboarding_required"


@pytest.mark.asyncio
async def test_periods_current_returns_active_period_after_first_actual(
    db_client, auth_headers
):
    """v1.1: onboarding eagerly creates the first active period (PER-02).

    Intent preserved: /periods/current returns the active period with a valid
    window. The period now exists immediately after onboarding (not lazily on
    first transaction) and stays the same active period after a POST /actual.
    """
    from datetime import date

    from tests.helpers.onboarding import complete_onboarding_v10

    onboard = await complete_onboarding_v10(db_client, auth_headers)
    assert onboard.status_code == 200, onboard.text
    cat_id = onboard.json()["category_ids_by_code"]["food"]

    # v1.1: the first active period is created at onboarding time.
    pre = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert pre.status_code == 200, pre.text
    assert pre.json()["status"] == "active"

    actual = await db_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 50_00,
            "category_id": cat_id,
            "tx_date": date.today().isoformat(),
        },
        headers=auth_headers,
    )
    assert actual.status_code == 200, actual.text

    response = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert response.status_code == 200
    period = response.json()
    assert period["status"] == "active"
    assert "period_start" in period
    assert "period_end" in period
