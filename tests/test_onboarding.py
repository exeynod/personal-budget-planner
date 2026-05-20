"""Integration tests for Onboarding (ONB-01, PER-02, PER-03, CAT-03, atomicity).

Covers D-09 (negative balance allowed), D-10 (409 on repeat),
T-double-onboard (idempotency), T-cycle-validation (Pydantic 1..28).

Wave 0 RED state: route /api/v1/onboarding/complete will be created
in Plan 02-03 (service) + 02-04 (route). DB fixture self-skips
when DATABASE_URL is unset.
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

    # Bootstrap AppUser via GET /me so onboarding can find it (D-11).
    init_data = make_init_data(owner_tg_id, bot_token)
    await async_client.get(
        "/api/v1/me",
        headers={"X-Telegram-Init-Data": init_data},
    )

    # 68-05 (class B/C): grant ПДн consent so v1.0 POST /onboarding/complete
    # passes the Phase 33 CMP-33-04 gate (NULL consent → 403). The legacy body
    # (starting_balance/seed_default_categories) was replaced by the v1.0 body
    # (income_cents/accounts/category_plans) — tests below use the v1.0 contract.
    from tests.helpers.onboarding import grant_pdn_consent
    await grant_pdn_consent(SessionLocal, tg_user_id=owner_tg_id)

    yield async_client
    await engine.dispose()


@pytest.mark.asyncio
async def test_complete_creates_period_and_seeds_categories(db_client, auth_headers):
    """ONB-01 / PER-02 / CAT-03: v1.0 complete creates period + categories + onboarded_at.

    68-05: migrated to the v1.0 contract. v1.0 seeds 8 default expense categories
    plus the system 'savings' category = 9 total (not the legacy 14). The income
    becomes income/accounts; starting balance lives on the account.
    """
    from tests.helpers.onboarding import complete_onboarding_v10

    response = await complete_onboarding_v10(
        db_client, auth_headers, income_cents=200_000_00,
    )
    assert response.status_code == 200, response.text

    me = await db_client.get("/api/v1/me", headers=auth_headers)
    assert me.json()["onboarded_at"] is not None

    # v1.0 (68-05): onboarding does NOT eagerly create a budget_period — it is
    # created lazily on the first transaction (_resolve_period_for_date). So
    # /periods/current is legitimately 404 immediately after onboarding.
    period = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert period.status_code == 404

    cats = await db_client.get("/api/v1/categories", headers=auth_headers)
    # 8 default expense categories + 1 system savings category.
    assert len(cats.json()) == 9


@pytest.mark.asyncio
async def test_repeat_complete_returns_409(db_client, auth_headers):
    """D-10 / T-double-onboard: повторный POST → 409 Conflict (v1.0)."""
    from tests.helpers.onboarding import complete_onboarding_v10

    first = await complete_onboarding_v10(db_client, auth_headers)
    assert first.status_code == 200, first.text
    second = await complete_onboarding_v10(db_client, auth_headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_seeds_eight_plus_savings_categories(db_client, auth_headers):
    """v1.0 (68-05): onboarding always seeds the 8 defaults + savings (no seed flag).

    The legacy ``seed_default_categories=False`` opt-out path was removed in the
    v1.0 contract — categories are always seeded. Intent preserved by asserting
    the deterministic v1.0 category count and that NO period is created at
    onboarding (the period is created lazily on the first transaction).
    """
    from tests.helpers.onboarding import complete_onboarding_v10

    response = await complete_onboarding_v10(db_client, auth_headers)
    assert response.status_code == 200, response.text
    cats = await db_client.get("/api/v1/categories", headers=auth_headers)
    assert len(cats.json()) == 9
    # v1.0 (68-05): period is created lazily on first transaction, not at
    # onboarding — /periods/current is 404 here.
    period = await db_client.get("/api/v1/periods/current", headers=auth_headers)
    assert period.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_day", [0, 29, 30, 31, -1])
async def test_invalid_cycle_start_day_422(db_client, auth_headers, invalid_day):
    """T-cycle-validation: Pydantic Field(ge=1, le=28) → 422 на out-of-range."""
    response = await db_client.post(
        "/api/v1/onboarding/complete",
        json={
            "starting_balance_cents": 0,
            "cycle_start_day": invalid_day,
            "seed_default_categories": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_negative_account_balance_allowed(db_client, auth_headers):
    """D-09: отрицательный баланс счёта = долг, разрешён (BIGINT signed) — v1.0.

    68-05: starting_balance moved onto the account in v1.0. A negative account
    balance (debt) must still be accepted.
    """
    from tests.helpers.onboarding import complete_onboarding_v10

    response = await complete_onboarding_v10(
        db_client, auth_headers,
        accounts=[{"bank": "Долг", "kind": "card", "balance_cents": -50_000, "primary": True}],
    )
    assert response.status_code == 200, response.text


# ---------------------------------------------------------------
# Phase 14 MTONB-03: embedding backfill during onboarding
# ---------------------------------------------------------------


# ---------------------------------------------------------------
# 68-05 (CONTEXT D-02 / Phase 22 BE-15): the v1.0 onboarding contract
# (onboarding_v10) DECOUPLED embedding backfill from onboarding. The v1.0
# service no longer creates CategoryEmbedding rows during /onboarding/complete,
# and the response shape (OnboardingV10Response) has no ``seeded_categories`` /
# ``embeddings_created`` fields (embedding backfill now lives in
# app/services/ai_embedding_backfill.py and is exercised by its own tests).
# These two legacy tests asserted the removed onboarding↔embedding coupling, so
# they are skipped here rather than weakened into a no-op; the embedding-backfill
# intent is covered by the dedicated backfill tests.
# ---------------------------------------------------------------


@pytest.mark.skip(
    reason="v1.0 (BE-15) decouples embedding backfill from onboarding; "
    "covered by ai_embedding_backfill tests"
)
@pytest.mark.asyncio
async def test_complete_onboarding_creates_seed_embeddings():
    ...


@pytest.mark.skip(
    reason="v1.0 (BE-15) decouples embedding backfill from onboarding; "
    "covered by ai_embedding_backfill tests"
)
@pytest.mark.asyncio
async def test_complete_onboarding_swallows_embedding_failure():
    ...
