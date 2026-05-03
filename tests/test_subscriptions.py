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
from datetime import date, timedelta

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
async def db_setup(async_client):
    """async_client + real DB session. Truncates all tables before yielding."""
    _require_db()
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.main_api import app

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE TABLE category, planned_transaction, "
                "actual_transaction, plan_template_item, subscription, "
                "budget_period, app_user RESTART IDENTITY CASCADE"
            )
        )

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
async def seed_categories(db_setup):
    """Seed one active expense category and one archived expense category."""
    _, SessionLocal = db_setup
    from app.db.models import Category, CategoryKind

    async with SessionLocal() as session:
        expense_cat = Category(
            name="Подписки",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=10,
        )
        archived_cat = Category(
            name="Архивная",
            kind=CategoryKind.expense,
            is_archived=True,
            sort_order=99,
        )
        session.add_all([expense_cat, archived_cat])
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
    """GET /subscriptions без X-Telegram-Init-Data → 403."""
    response = await db_client.get("/api/v1/subscriptions")
    assert response.status_code == 403


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
