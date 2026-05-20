"""Integration tests for Subscriptions CRUD + charge-now + Settings SET-02.

Phase 6 Wave 0 RED gate (D-87).

All tests require DATABASE_URL. Self-skip via _require_db() when Postgres
is unavailable (CI без Postgres).

Covered behaviors:
- CRUD: create, list, update, delete subscription
- Archived category guard (400)
- charge-now creates PlannedTransaction, advances next_charge_date
- charge-now idempotency: repeated call same day → 409
- Auth: 403 without X-Telegram-Init-Data
- Settings SET-02: GET /settings includes notify_days_before
- Settings SET-02: PATCH /settings {notify_days_before} persists
- Settings SET-02: validation range 0..30
- Settings SET-02: partial PATCH does not wipe notify_days_before

RED state: routes /api/v1/subscriptions not yet implemented.
Tests will fail with 404/422/KeyError until Plans 06-02/06-03 create them.
"""
import os
from datetime import date, timedelta, datetime, timezone

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
async def db_setup(async_client, bot_token, owner_tg_id):
    """async_client + real DB session. Truncates all tables before yielding."""
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app
    from tests.conftest import make_init_data

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    from tests.helpers.seed import truncate_db
    await truncate_db()

    # Seed AppUser explicitly — /me no longer upserts after Phase 12 (Plan 12-03).
    from app.db.models import AppUser, UserRole
    async with SessionLocal() as session:
        session.add(AppUser(tg_user_id=owner_tg_id, role=UserRole.owner, cycle_start_day=5, onboarded_at=datetime.now(timezone.utc)))
        await session.commit()

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


@pytest_asyncio.fixture
async def db_client(db_setup):
    client, _ = db_setup
    return client


@pytest_asyncio.fixture
async def seed_categories(db_setup, owner_tg_id):
    """Seed one active expense category and one archived expense category."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        from tests.helpers.seed import seed_category
        expense_cat = await seed_category(
            session,
            user_id=user_id,
            name="Подписки",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=10,
            code="subs",
            ord="10",
        )
        archived_cat = await seed_category(
            session,
            user_id=user_id,
            name="Архивная",
            kind=CategoryKind.expense,
            is_archived=True,
            sort_order=99,
            code="archived",
            ord="99",
        )
        await session.commit()
        await session.refresh(expense_cat)
        await session.refresh(archived_cat)
        return {"expense_cat": expense_cat, "archived_cat": archived_cat}


def _sub_payload(category_id: int, *, name: str = "Netflix", days_ahead: int = 10) -> dict:
    """Helper: build a valid SubscriptionCreate payload."""
    return {
        "name": name,
        "amount_cents": 69900,
        "cycle": "monthly",
        "next_charge_date": (date.today() + timedelta(days=days_ahead)).isoformat(),
        "category_id": category_id,
        "notify_days_before": 2,
        "is_active": True,
    }


# ---------------------------------------------------------------------------
# Subscription CRUD tests (SUB-01)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_subscription(db_client, auth_headers, seed_categories):
    """POST /subscriptions → 200/201 with id and all fields."""
    payload = _sub_payload(seed_categories["expense_cat"].id)
    response = await db_client.post(
        "/api/v1/subscriptions",
        json=payload,
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert "id" in data
    assert data["name"] == "Netflix"
    assert data["amount_cents"] == 69900
    assert data["cycle"] == "monthly"
    assert data["category_id"] == seed_categories["expense_cat"].id
    assert data["notify_days_before"] == 2
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_create_subscription_default_notify_from_user(
    db_setup, auth_headers, seed_categories
):
    """notify_days_before не передан → берётся из AppUser.notify_days_before (default 2)."""
    db_client, _ = db_setup
    # Ensure user exists
    await db_client.get("/api/v1/me", headers=auth_headers)

    payload = _sub_payload(seed_categories["expense_cat"].id)
    payload.pop("notify_days_before")  # omit — should default from user setting

    response = await db_client.post(
        "/api/v1/subscriptions",
        json=payload,
        headers=auth_headers,
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["notify_days_before"] == 2  # AppUser default


@pytest.mark.asyncio
async def test_list_subscriptions_sorted_by_next_charge_date(
    db_client, auth_headers, seed_categories
):
    """GET /subscriptions → список сортирован по next_charge_date ASC."""
    cat_id = seed_categories["expense_cat"].id
    # Create two subscriptions with different next_charge_dates
    payload_later = _sub_payload(cat_id, name="Later", days_ahead=20)
    payload_earlier = _sub_payload(cat_id, name="Earlier", days_ahead=5)

    await db_client.post("/api/v1/subscriptions", json=payload_later, headers=auth_headers)
    await db_client.post("/api/v1/subscriptions", json=payload_earlier, headers=auth_headers)

    response = await db_client.get("/api/v1/subscriptions", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 2
    # Earlier comes first
    assert items[0]["name"] == "Earlier"
    assert items[1]["name"] == "Later"


@pytest.mark.asyncio
async def test_update_subscription(db_client, auth_headers, seed_categories):
    """PATCH /subscriptions/{id} с partial payload → 200, поля обновлены."""
    cat_id = seed_categories["expense_cat"].id
    create = await db_client.post(
        "/api/v1/subscriptions",
        json=_sub_payload(cat_id),
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    patch = await db_client.patch(
        f"/api/v1/subscriptions/{sub_id}",
        json={"amount_cents": 99900, "name": "Netflix Updated"},
        headers=auth_headers,
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["amount_cents"] == 99900
    assert body["name"] == "Netflix Updated"
    # unchanged fields stay
    assert body["cycle"] == "monthly"


@pytest.mark.asyncio
async def test_delete_subscription(db_client, auth_headers, seed_categories):
    """DELETE /subscriptions/{id} → 204, последующий GET для этого id → 404."""
    cat_id = seed_categories["expense_cat"].id
    create = await db_client.post(
        "/api/v1/subscriptions",
        json=_sub_payload(cat_id),
        headers=auth_headers,
    )
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    delete = await db_client.delete(
        f"/api/v1/subscriptions/{sub_id}",
        headers=auth_headers,
    )
    assert delete.status_code == 204

    # После удаления список не содержит объект
    listing = await db_client.get("/api/v1/subscriptions", headers=auth_headers)
    assert listing.status_code == 200
    ids = [s["id"] for s in listing.json()]
    assert sub_id not in ids


@pytest.mark.asyncio
async def test_create_archived_category_400(db_client, auth_headers, seed_categories):
    """POST /subscriptions с архивной category_id → 400."""
    archived_id = seed_categories["archived_cat"].id
    payload = _sub_payload(archived_id)
    response = await db_client.post(
        "/api/v1/subscriptions",
        json=payload,
        headers=auth_headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_subscriptions_auth_403(db_client):
    """GET /subscriptions без X-Telegram-Init-Data → 403.

    Skipped in DEV_MODE: dev override bypasses initData validation
    (D-05 — see app/core/settings.py validate_production_settings),
    so the endpoint legitimately returns 200 with the mock owner.
    Auth path is covered by tests/test_auth.py against a non-DEV API.
    """
    import os
    if os.environ.get("DEV_MODE", "").lower() == "true":
        pytest.skip("DEV_MODE bypasses initData — auth path tested elsewhere")
    response = await db_client.get("/api/v1/subscriptions")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# P0-1 (BE-F1): SubscriptionReadV10 round-trip — day_of_month/account_id/posted_txn_id
#
# The public /subscriptions GET/POST/PATCH routes must return the v1.0 read
# shape so iOS phase 63 can read back what it wrote. The legacy request bodies
# (SubscriptionCreate/Update) do NOT carry day_of_month/account_id, so this test
# sets those columns directly on the ORM (mirroring the v1.0 PATCH path) and then
# asserts the GET/POST responses echo them. posted_txn_id is exercised via the
# /post endpoint.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def seed_account(db_setup, owner_tg_id):
    """Seed one card account for the owner; returns its id."""
    _, SessionLocal = db_setup
    from sqlalchemy import text
    from app.db.models import Account, AccountKind

    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        account = Account(
            user_id=user_id,
            bank="Тинькофф",
            mask="1234",
            kind=AccountKind.card,
            balance_cents=500000,
            is_primary=True,
        )
        session.add(account)
        await session.commit()
        await session.refresh(account)
        return account.id


@pytest.mark.asyncio
async def test_create_subscription_v10_fields_present_and_null(
    db_client, auth_headers, seed_categories
):
    """POST /subscriptions (no day/account) → V10 keys present, value null (not missing)."""
    payload = _sub_payload(seed_categories["expense_cat"].id)
    response = await db_client.post(
        "/api/v1/subscriptions", json=payload, headers=auth_headers
    )
    assert response.status_code in (200, 201)
    data = response.json()
    # Keys MUST be present (V10 shape), values null for a plain create.
    assert "day_of_month" in data and data["day_of_month"] is None
    assert "account_id" in data and data["account_id"] is None
    assert "posted_txn_id" in data and data["posted_txn_id"] is None


@pytest.mark.asyncio
async def test_get_subscriptions_v10_fields_round_trip(
    db_setup, auth_headers, seed_categories, seed_account
):
    """day_of_month/account_id set on the row → GET echoes them back (not nil)."""
    db_client, SessionLocal = db_setup
    cat_id = seed_categories["expense_cat"].id

    create = await db_client.post(
        "/api/v1/subscriptions", json=_sub_payload(cat_id), headers=auth_headers
    )
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    # Legacy SubscriptionUpdate has no day_of_month/account_id (extra="forbid"),
    # so set the v1.0 columns directly on the ORM — mirrors the v1.0 PATCH path.
    from sqlalchemy import select
    from app.db.models import Subscription

    async with SessionLocal() as session:
        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
        sub.day_of_month = 15
        sub.account_id = seed_account
        await session.commit()

    listing = await db_client.get("/api/v1/subscriptions", headers=auth_headers)
    assert listing.status_code == 200
    item = next(s for s in listing.json() if s["id"] == sub_id)
    assert item["day_of_month"] == 15
    assert item["account_id"] == seed_account
    assert "posted_txn_id" in item  # present (still null until posted)


@pytest.mark.asyncio
async def test_post_subscription_exposes_posted_txn_id(
    db_setup, auth_headers, seed_categories, seed_account
):
    """After POST /{id}/post, GET exposes posted_txn_id as a non-null int."""
    db_client, SessionLocal = db_setup
    cat_id = seed_categories["expense_cat"].id

    create = await db_client.post(
        "/api/v1/subscriptions", json=_sub_payload(cat_id), headers=auth_headers
    )
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    # post() requires account_id on the subscription (T-22-09-06).
    from sqlalchemy import select
    from app.db.models import Subscription

    async with SessionLocal() as session:
        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
        sub.account_id = seed_account
        await session.commit()

    post = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/post", headers=auth_headers
    )
    assert post.status_code == 200, post.text

    listing = await db_client.get("/api/v1/subscriptions", headers=auth_headers)
    assert listing.status_code == 200
    item = next(s for s in listing.json() if s["id"] == sub_id)
    assert isinstance(item["posted_txn_id"], int)
    assert item["posted_txn_id"] > 0


# ---------------------------------------------------------------------------
# P1-2 (BE-F4) double-post idempotency + P2-13 (QA-F10) savepoint rollback
#
# - double-post: second POST /{id}/post sees the committed posted_txn_id (the
#   first request's transaction committed via get_db) → 409, exactly one
#   ActualTransaction exists, posted_txn_id set once.
# - savepoint/partial-failure: a forced error inside post_subscription (after
#   create_actual_v10 created the txn, before commit) must leave no orphan
#   ActualTransaction and posted_txn_id NULL once the transaction rolls back.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_double_post_yields_single_txn_and_409(
    db_setup, auth_headers, seed_categories, seed_account
):
    """Two posts of the same subscription → one txn, second call 409 (P1-2)."""
    db_client, SessionLocal = db_setup
    cat_id = seed_categories["expense_cat"].id

    create = await db_client.post(
        "/api/v1/subscriptions", json=_sub_payload(cat_id), headers=auth_headers
    )
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    from sqlalchemy import func, select
    from app.db.models import ActualTransaction, Subscription

    async with SessionLocal() as session:
        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
        sub.account_id = seed_account
        await session.commit()

    first = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/post", headers=auth_headers
    )
    assert first.status_code == 200, first.text
    first_txn_id = first.json()["txn_id"]

    second = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/post", headers=auth_headers
    )
    assert second.status_code == 409, second.text
    detail = second.json()["detail"]
    assert detail["error"] == "already_posted"
    assert detail["posted_txn_id"] == first_txn_id

    # Exactly one ActualTransaction parent for this subscription's category,
    # and posted_txn_id set once.
    async with SessionLocal() as session:
        txn_count = (
            await session.execute(
                select(func.count())
                .select_from(ActualTransaction)
                .where(ActualTransaction.category_id == cat_id)
            )
        ).scalar_one()
        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
    assert txn_count == 1, f"expected exactly one txn, got {txn_count}"
    assert sub.posted_txn_id == first_txn_id


@pytest.mark.asyncio
async def test_post_partial_failure_savepoint_rollback_no_orphan(
    db_setup, auth_headers, seed_categories, seed_account, monkeypatch
):
    """Forced error mid-post → no orphan ActualTransaction, posted_txn_id NULL (P2-13)."""
    db_client, SessionLocal = db_setup
    cat_id = seed_categories["expense_cat"].id

    create = await db_client.post(
        "/api/v1/subscriptions", json=_sub_payload(cat_id), headers=auth_headers
    )
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    from sqlalchemy import func, select
    from app.db.models import ActualTransaction, Subscription
    from app.services import subscriptions as sub_service

    async with SessionLocal() as session:
        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
        sub.account_id = seed_account
        await session.commit()

    # Monkeypatch create_actual_v10 so it really inserts the ActualTransaction
    # (flushing it into the live transaction) and THEN raises — simulating a
    # partial failure after the money row exists but before the post commits.
    import app.services.actual as actual_mod

    real_create = actual_mod.create_actual_v10

    async def _boom(db, **kwargs):
        parent, child = await real_create(db, **kwargs)
        # Row now exists in this transaction (flushed by create_actual_v10).
        raise RuntimeError("forced partial failure after actual created")

    monkeypatch.setattr(actual_mod, "create_actual_v10", _boom)

    # Drive post_subscription directly against a real session and assert the
    # exception propagates, then roll back (mirrors get_db's except: rollback).
    async with SessionLocal() as session:
        from app.db.session import set_tenant_scope

        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
        user_id = sub.user_id
        await set_tenant_scope(session, user_id)
        with pytest.raises(RuntimeError):
            await sub_service.post_subscription(session, sub_id, user_id=user_id)
        await session.rollback()

    # No orphan txn, posted_txn_id stays NULL.
    async with SessionLocal() as session:
        txn_count = (
            await session.execute(
                select(func.count())
                .select_from(ActualTransaction)
                .where(ActualTransaction.category_id == cat_id)
            )
        ).scalar_one()
        sub = await session.scalar(
            select(Subscription).where(Subscription.id == sub_id)
        )
    assert txn_count == 0, f"expected no orphan txn after rollback, got {txn_count}"
    assert sub.posted_txn_id is None


# ---------------------------------------------------------------------------
# charge-now tests (SUB-04)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_charge_now_creates_planned(db_client, auth_headers, seed_categories):
    """POST /subscriptions/{id}/charge-now → создаёт PlannedTransaction(source=subscription_auto),
    сдвигает next_charge_date на +1 месяц для cycle=monthly."""
    cat_id = seed_categories["expense_cat"].id
    today = date.today()
    payload = _sub_payload(cat_id, days_ahead=0)  # next_charge_date = today
    payload["next_charge_date"] = today.isoformat()

    create = await db_client.post("/api/v1/subscriptions", json=payload, headers=auth_headers)
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    charge = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/charge-now",
        headers=auth_headers,
    )
    assert charge.status_code == 200
    data = charge.json()
    assert "planned_id" in data
    assert "next_charge_date" in data
    # next_charge_date сдвинулся на +1 месяц
    new_charge_date = date.fromisoformat(data["next_charge_date"])
    assert new_charge_date > today


@pytest.mark.asyncio
async def test_charge_now_yearly_advance(db_client, auth_headers, seed_categories):
    """cycle=yearly → next_charge_date сдвигается на +1 год."""
    cat_id = seed_categories["expense_cat"].id
    today = date.today()
    payload = {
        "name": "Annual Plan",
        "amount_cents": 120000,
        "cycle": "yearly",
        "next_charge_date": today.isoformat(),
        "category_id": cat_id,
        "notify_days_before": 3,
        "is_active": True,
    }

    create = await db_client.post("/api/v1/subscriptions", json=payload, headers=auth_headers)
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    charge = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/charge-now",
        headers=auth_headers,
    )
    assert charge.status_code == 200
    data = charge.json()
    new_charge_date = date.fromisoformat(data["next_charge_date"])
    # +1 год от сегодня
    expected_year = today.year + 1
    assert new_charge_date.year == expected_year


@pytest.mark.asyncio
async def test_charge_now_409_on_duplicate(db_client, auth_headers, seed_categories):
    """Повторный вызов charge-now в тот же день → 409 (idempotency via unique constraint)."""
    cat_id = seed_categories["expense_cat"].id
    today = date.today()
    payload = _sub_payload(cat_id, days_ahead=0)
    payload["next_charge_date"] = today.isoformat()

    create = await db_client.post("/api/v1/subscriptions", json=payload, headers=auth_headers)
    assert create.status_code in (200, 201)
    sub_id = create.json()["id"]

    # Первый вызов — успешен
    first = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/charge-now",
        headers=auth_headers,
    )
    assert first.status_code == 200

    # Отматываем next_charge_date обратно к today чтобы имитировать второй вызов в тот же день
    # (в реальности service выставил next_charge_date +1mo, но для теста идемпотентности
    # мы патчим обратно или тестируем через unique constraint на original_charge_date)
    await db_client.patch(
        f"/api/v1/subscriptions/{sub_id}",
        json={"next_charge_date": today.isoformat()},
        headers=auth_headers,
    )

    # Второй вызов с той же original_charge_date → 409
    second = await db_client.post(
        f"/api/v1/subscriptions/{sub_id}/charge-now",
        headers=auth_headers,
    )
    assert second.status_code == 409


# ---------------------------------------------------------------------------
# Settings extension tests (SET-02) — notify_days_before
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_settings_includes_notify_days_before(db_client, auth_headers):
    """GET /settings → response содержит notify_days_before: int (default 2)."""
    # Ensure user exists
    await db_client.get("/api/v1/me", headers=auth_headers)
    response = await db_client.get("/api/v1/settings", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "notify_days_before" in data
    assert isinstance(data["notify_days_before"], int)
    assert data["notify_days_before"] == 2  # default


@pytest.mark.asyncio
async def test_patch_settings_notify_days_before(db_client, auth_headers):
    """PATCH /settings {notify_days_before: 5} → 200, GET снова → 5."""
    await db_client.get("/api/v1/me", headers=auth_headers)

    patch = await db_client.patch(
        "/api/v1/settings",
        json={"notify_days_before": 5},
        headers=auth_headers,
    )
    assert patch.status_code == 200

    get = await db_client.get("/api/v1/settings", headers=auth_headers)
    assert get.status_code == 200
    assert get.json()["notify_days_before"] == 5


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_value", [-1, 31, 100, -100])
async def test_patch_settings_notify_validation(db_client, auth_headers, invalid_value):
    """PATCH с notify_days_before вне диапазона 0..30 → 422."""
    await db_client.get("/api/v1/me", headers=auth_headers)

    response = await db_client.patch(
        "/api/v1/settings",
        json={"notify_days_before": invalid_value},
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_settings_partial_does_not_wipe_notify(db_client, auth_headers):
    """PATCH только cycle_start_day → не затирает notify_days_before."""
    await db_client.get("/api/v1/me", headers=auth_headers)

    # Установить notify_days_before = 7
    await db_client.patch(
        "/api/v1/settings",
        json={"notify_days_before": 7},
        headers=auth_headers,
    )

    # Патчить только cycle_start_day
    await db_client.patch(
        "/api/v1/settings",
        json={"cycle_start_day": 15},
        headers=auth_headers,
    )

    get = await db_client.get("/api/v1/settings", headers=auth_headers)
    assert get.status_code == 200
    data = get.json()
    assert data["notify_days_before"] == 7  # не затёрто
    assert data["cycle_start_day"] == 15
