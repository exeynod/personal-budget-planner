"""v1.1 planning-rework API tests (HTTP status + shape).

Covers the new endpoints:
  - GET/PUT /api/v1/template/items
  - GET/POST/PATCH/DELETE /api/v1/template/lines
  - GET/PATCH /api/v1/periods/{id}/plan
  - POST /api/v1/periods/{id}/planned/{pid}/post + /unpost + /post-batch
  - POST /api/v1/balance/reconcile

DB-backed: skips when DATABASE_URL is unset.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

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
async def setup(async_client, owner_tg_id):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.db.models import (
        Account,
        AccountKind,
        AppUser,
        BudgetPeriod,
        CategoryKind,
        PeriodStatus,
        UserRole,
    )
    from app.main_api import app
    from tests.helpers.seed import seed_category, truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    await truncate_db()
    async with SessionLocal() as session:
        user = AppUser(
            tg_user_id=owner_tg_id,
            role=UserRole.owner,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
            income_cents=200_000_00,
        )
        session.add(user)
        await session.flush()

        session.add(
            Account(
                user_id=user.id,
                bank="Т-Банк",
                kind=AccountKind.card,
                balance_cents=0,
                is_primary=True,
            )
        )
        today = date.today()
        period = BudgetPeriod(
            user_id=user.id,
            period_start=today.replace(day=1),
            period_end=today.replace(day=1) + timedelta(days=27),
            starting_balance_cents=0,
            status=PeriodStatus.active,
        )
        session.add(period)
        cat = await seed_category(
            session,
            user_id=user.id,
            name="Продукты",
            kind=CategoryKind.expense,
            code="food",
            ord="01",
            plan_cents=0,
            sort_order=1,
        )
        # System adjustment category (needed by balance reconcile).
        await seed_category(
            session,
            user_id=user.id,
            name="Корректировка",
            kind=CategoryKind.expense,
            code="adjustment",
            ord="98",
            plan_cents=0,
            sort_order=98,
        )
        await session.flush()
        await session.commit()
        await session.refresh(cat)
        await session.refresh(period)
        ids = {"user_id": user.id, "cat_id": cat.id, "period_id": period.id}

    async def real_get_db():
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = real_get_db
    yield {"client": async_client, **ids}
    await engine.dispose()


# ---------------------------------------------------------------------------
# template items
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_template_item_put_then_get(setup, auth_headers):
    client = setup["client"]
    r = await client.put(
        f"/api/v1/template/items/{setup['cat_id']}",
        json={"limit_cents": 40_000_00},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["limit_cents"] == 40_000_00

    lst = await client.get("/api/v1/template/items", headers=auth_headers)
    assert lst.status_code == 200
    items = lst.json()
    assert len(items) == 1
    assert items[0]["category_id"] == setup["cat_id"]


# ---------------------------------------------------------------------------
# template lines
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_template_line_crud(setup, auth_headers):
    client = setup["client"]
    r = await client.post(
        "/api/v1/template/lines",
        json={
            "category_id": setup["cat_id"],
            "title": "Аренда",
            "amount_cents": 20_000_00,
            "day_of_period": 5,
            "kind": "expense",
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    line_id = r.json()["id"]
    assert r.json()["title"] == "Аренда"

    patch = await client.patch(
        f"/api/v1/template/lines/{line_id}",
        json={"amount_cents": 25_000_00},
        headers=auth_headers,
    )
    assert patch.status_code == 200
    assert patch.json()["amount_cents"] == 25_000_00

    delete = await client.delete(
        f"/api/v1/template/lines/{line_id}", headers=auth_headers
    )
    assert delete.status_code == 204

    lst = await client.get("/api/v1/template/lines", headers=auth_headers)
    assert lst.json() == []


@pytest.mark.asyncio
async def test_template_line_kind_mismatch_400(setup, auth_headers):
    client = setup["client"]
    # food is an expense category; income line → 400 KindMismatch.
    r = await client.post(
        "/api/v1/template/lines",
        json={
            "category_id": setup["cat_id"],
            "title": "x",
            "amount_cents": 100,
            "kind": "income",
        },
        headers=auth_headers,
    )
    assert r.status_code == 400, r.text


# ---------------------------------------------------------------------------
# period plan
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_period_plan_get_patch(setup, auth_headers):
    client = setup["client"]
    patch = await client.patch(
        f"/api/v1/periods/{setup['period_id']}/plan",
        json={"plans": [{"category_id": setup["cat_id"], "limit_cents": 12345}]},
        headers=auth_headers,
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["plans"][0]["limit_cents"] == 12345

    get = await client.get(
        f"/api/v1/periods/{setup['period_id']}/plan", headers=auth_headers
    )
    assert get.status_code == 200
    row = next(p for p in get.json()["plans"] if p["category_id"] == setup["cat_id"])
    assert row["limit_cents"] == 12345


# ---------------------------------------------------------------------------
# planned post / unpost / batch
# ---------------------------------------------------------------------------


async def _create_planned(client, setup, auth_headers, amount=5000):
    r = await client.post(
        f"/api/v1/periods/{setup['period_id']}/planned",
        json={
            "kind": "expense",
            "amount_cents": amount,
            "category_id": setup["cat_id"],
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_planned_post_unpost(setup, auth_headers):
    client = setup["client"]
    pid = await _create_planned(client, setup, auth_headers)

    post = await client.post(
        f"/api/v1/periods/{setup['period_id']}/planned/{pid}/post",
        json={"tx_date": date.today().isoformat()},
        headers=auth_headers,
    )
    assert post.status_code == 200, post.text
    assert post.json()["planned_id"] == pid
    assert isinstance(post.json()["txn_id"], int)

    # Double post → 409.
    again = await client.post(
        f"/api/v1/periods/{setup['period_id']}/planned/{pid}/post",
        json={"tx_date": date.today().isoformat()},
        headers=auth_headers,
    )
    assert again.status_code == 409

    unpost = await client.post(
        f"/api/v1/periods/{setup['period_id']}/planned/{pid}/unpost",
        headers=auth_headers,
    )
    assert unpost.status_code == 204


@pytest.mark.asyncio
async def test_planned_post_batch(setup, auth_headers):
    client = setup["client"]
    p1 = await _create_planned(client, setup, auth_headers, amount=100)
    p2 = await _create_planned(client, setup, auth_headers, amount=200)

    r = await client.post(
        f"/api/v1/periods/{setup['period_id']}/planned/post-batch",
        json={"planned_ids": [p1, p2], "tx_date": date.today().isoformat()},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["posted"]) == 2
    assert r.json()["skipped"] == []


# ---------------------------------------------------------------------------
# balance reconcile
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_balance_reconcile(setup, auth_headers):
    client = setup["client"]
    r = await client.post(
        "/api/v1/balance/reconcile",
        json={"target_balance_cents": 88_888},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["balance_now_cents"] == 88_888
    assert isinstance(body["adjustment_txn_id"], int)
