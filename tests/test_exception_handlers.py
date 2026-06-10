"""Global exception-handler tests (Этап 3 WI-A).

Covers the three handlers registered in ``main_api.py``:

1. ``RequestValidationError`` → 422 with the framework-default body shape
   ``{"detail": [<errors>]}`` (regression: frontend + suite read
   ``resp.json()["detail"]``).
2. Domain ``ValueError`` escaping a service path → clean 422 JSON, never a
   bare traceback / 500.
3. Any other unhandled ``Exception`` → 500 with a fixed, non-revealing body
   ``{"detail": "Internal server error"}`` (no traceback leaked).

Plus the handoff bug: ``PATCH /actual`` with ``kind=roundup``/``deposit`` must
NOT 500 (it surfaces as a meaningful 4xx).

DB-backed cases self-skip without ``DATABASE_URL``. The two monkeypatch cases
run against the ASGI app directly (no DB rows needed) — they patch a service
function reachable from a real route to raise the target exception, proving the
GLOBAL handler (not a route-local ``try/except``) caught it.
"""

import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@asynccontextmanager
async def _client_propagating_off():
    """AsyncClient against the app with ``raise_app_exceptions=False``.

    The shared ``async_client`` fixture uses ``ASGITransport`` with the default
    ``raise_app_exceptions=True``: Starlette's ``ServerErrorMiddleware`` still
    invokes our registered ``Exception`` handler (producing the JSON response),
    but ASGITransport then RE-RAISES the original exception into the test. That
    is correct production behaviour to observe — to assert on the actual HTTP
    response the global handler emits, we need a transport that does NOT
    re-raise. This mirrors how a real ASGI server (uvicorn) returns the
    handler's response to the wire.
    """
    from app.main_api import app

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


# ---------------------------------------------------------------------------
# 1. RequestValidationError → 422 (regression: default body shape preserved)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_request_validation_error_returns_422_default_shape(
    db_setup, auth_headers
):
    """Body that violates Pydantic constraints → 422 with ``detail`` list.

    ``amount_cents`` is ``Field(gt=0)``; sending ``0`` trips Pydantic after
    auth resolves. Exercises the global RequestValidationError handler; the
    body must remain the FastAPI default shape (``detail`` is a list of error
    dicts) so the frontend / suite contract on ``resp.json()["detail"]`` holds.
    """
    async_client, _ = db_setup
    resp = await async_client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 0,  # violates Field(gt=0)
            "category_id": 1,
            "tx_date": str(date.today()),
        },
        headers=auth_headers,
    )

    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert "detail" in body
    assert isinstance(body["detail"], list), body
    # default FastAPI error dicts carry loc/msg/type
    assert {"loc", "msg", "type"} <= set(body["detail"][0].keys()), body["detail"][0]


# ---------------------------------------------------------------------------
# 2. Domain ValueError escaping a service → clean 422 (not bare traceback)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unhandled_value_error_from_service_returns_clean_422(
    db_setup, auth_headers, monkeypatch
):
    """A bare ``ValueError`` raised deep in a service path → global handler.

    We patch ``app.api.routes.actual.actual_svc.list_actual_for_period``
    (called by ``GET /periods/{id}/actual``, a route with NO local ValueError
    handling) to raise a plain ``ValueError``. The client must receive a clean
    422 JSON body carrying the message — never a raw traceback.
    """

    async def _boom(*args, **kwargs):
        raise ValueError("simulated domain failure")

    monkeypatch.setattr(
        "app.api.routes.actual.actual_svc.list_actual_for_period", _boom
    )

    async with _client_propagating_off() as client:
        resp = await client.get("/api/v1/periods/1/actual", headers=auth_headers)

    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert body == {"detail": "simulated domain failure"}, body
    # no traceback leakage
    assert "Traceback" not in resp.text
    assert "simulated domain failure" == body["detail"]


# ---------------------------------------------------------------------------
# 3. Any other unhandled Exception → 500 with fixed body (no leak)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unhandled_exception_returns_clean_500(
    db_setup, auth_headers, monkeypatch
):
    """A non-ValueError unhandled error → fixed 500 body, no traceback leak.

    Patch the same service path to raise ``RuntimeError``. The global
    catch-all must convert it to ``{"detail": "Internal server error"}`` with
    HTTP 500 and no internal details / traceback in the body.
    """

    async def _boom(*args, **kwargs):
        raise RuntimeError("secret internal detail SHOULD NOT LEAK")

    monkeypatch.setattr(
        "app.api.routes.actual.actual_svc.list_actual_for_period", _boom
    )

    async with _client_propagating_off() as client:
        resp = await client.get("/api/v1/periods/1/actual", headers=auth_headers)

    assert resp.status_code == 500, resp.text
    body = resp.json()
    assert body == {"detail": "Internal server error"}, body
    assert "secret internal detail" not in resp.text
    assert "Traceback" not in resp.text


# ---------------------------------------------------------------------------
# 4. Handoff bug: PATCH /actual kind=roundup/deposit must NOT 500
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_setup(async_client, owner_tg_id):
    _require_db()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.api.dependencies import get_db
    from app.db.models import AppUser, UserRole
    from app.main_api import app
    from tests.helpers.seed import truncate_db

    db_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    await truncate_db()

    async with SessionLocal() as session:
        session.add(
            AppUser(
                tg_user_id=owner_tg_id,
                role=UserRole.owner,
                cycle_start_day=5,
                onboarded_at=datetime.now(timezone.utc),
            )
        )
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


@pytest.mark.parametrize("bad_kind", ["roundup", "deposit"])
@pytest.mark.asyncio
async def test_patch_actual_roundup_deposit_not_500(
    db_setup, auth_headers, owner_tg_id, bad_kind
):
    """PATCH an expense row to ``kind=roundup``/``deposit`` → 4xx, never 500.

    Pre-fix the legacy ``CategoryKind(value)`` constructor in
    ``update_actual`` could raise an unhandled ``ValueError`` → 500. Today the
    ``KindMismatchError`` validation fires first (→ 400) AND the global
    ValueError net would otherwise convert any escapee to 422. Either way the
    response must be a meaningful 4xx with a clean JSON body — assert the
    absence of 500 explicitly (defends the handoff bug).
    """
    client, SessionLocal = db_setup
    from sqlalchemy import text

    from app.db.models import BudgetPeriod, CategoryKind, PeriodStatus
    from tests.helpers.seed import seed_category

    async with SessionLocal() as session:
        uid = (
            await session.execute(
                text("SELECT id FROM app_user WHERE tg_user_id=:t"),
                {"t": owner_tg_id},
            )
        ).scalar_one()
        cat = await seed_category(
            session,
            user_id=uid,
            name="Продукты",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=1,
        )
        today = date.today()
        session.add(
            BudgetPeriod(
                user_id=uid,
                period_start=today - timedelta(days=5),
                period_end=today + timedelta(days=5),
                starting_balance_cents=0,
                status=PeriodStatus.active,
            )
        )
        await session.commit()
        await session.refresh(cat)
        cat_id = cat.id

    create = await client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 1000,
            "category_id": cat_id,
            "tx_date": str(today),
        },
        headers=auth_headers,
    )
    assert create.status_code in (200, 201), create.text
    actual_id = create.json()["id"]

    patch = await client.patch(
        f"/api/v1/actual/{actual_id}",
        json={"kind": bad_kind},
        headers=auth_headers,
    )

    assert patch.status_code != 500, patch.text
    assert 400 <= patch.status_code < 500, patch.text
    assert "Traceback" not in patch.text
    # body is clean JSON with a detail
    assert "detail" in patch.json(), patch.text
