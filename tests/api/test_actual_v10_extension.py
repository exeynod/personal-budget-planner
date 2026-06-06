"""Tests for v1.0 ActualCreate / ActualRead schema + route extensions (Plan 25-01).

Two layers:

1. Schema unit tests (no DB) — Pydantic validation of new fields:
   - ActualCreate.kind accepts 4 values (expense/income/roundup/deposit).
   - ActualCreate.account_id optional positive int.
   - ActualRead emits kind/account_id/parent_txn_id keys.

2. Route integration tests (DB-backed via dev_client / db_setup, mirrors
   tests/api/test_accounts_api.py pattern) — POST /api/v1/actual dispatch:
   - account_id supplied → create_actual_v10 + balance delta + roundup hook.
   - account_id absent → legacy create_actual (no balance change, no roundup).
   - cross-tenant account_id → 404.
   - kind='deposit' via v10 path (savings category).
   - ActualRead response shape includes all 3 v10 fields.

Self-skips when DATABASE_URL absent (consistent with the rest of tests/api/).
"""

from __future__ import annotations

import os
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from pydantic import ValidationError


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set — skipping DB-backed test")


# ---------------------------------------------------------------------------
# Layer 1: pure Pydantic schema unit tests (no DB)
# ---------------------------------------------------------------------------


class TestActualCreateSchema:
    """Plan 25-01 Task 1 behavior list — schema-only tests, no DB needed."""

    def test_actual_create_with_account_id_validates(self):
        from app.api.schemas.actual import ActualCreate

        c = ActualCreate(
            kind="expense",
            amount_cents=100,
            category_id=1,
            tx_date=date.today(),
            account_id=42,
        )
        assert c.account_id == 42
        assert c.kind == "expense"

    def test_actual_create_kind_roundup_is_legal(self):
        from app.api.schemas.actual import ActualCreate

        c = ActualCreate(
            kind="roundup",
            amount_cents=10,
            category_id=1,
            tx_date=date.today(),
        )
        assert c.kind == "roundup"

    def test_actual_create_kind_deposit_is_legal(self):
        from app.api.schemas.actual import ActualCreate

        c = ActualCreate(
            kind="deposit",
            amount_cents=10,
            category_id=1,
            tx_date=date.today(),
        )
        assert c.kind == "deposit"

    def test_actual_create_invalid_kind_rejected(self):
        from app.api.schemas.actual import ActualCreate

        with pytest.raises(ValidationError):
            ActualCreate(
                kind="invalid",
                amount_cents=100,
                category_id=1,
                tx_date=date.today(),
            )

    def test_actual_create_account_id_non_positive_rejected(self):
        """account_id must be a positive int — both 0 and negatives rejected."""
        from app.api.schemas.actual import ActualCreate

        for bad in (0, -1):
            with pytest.raises(ValidationError):
                ActualCreate(
                    kind="expense",
                    amount_cents=100,
                    category_id=1,
                    tx_date=date.today(),
                    account_id=bad,
                )

    def test_actual_create_unknown_field_rejected(self):
        """ConfigDict(extra='forbid') protects against typos and tampering (T-25-01-02)."""
        from app.api.schemas.actual import ActualCreate

        with pytest.raises(ValidationError):
            ActualCreate(
                kind="expense",
                amount_cents=100,
                category_id=1,
                tx_date=date.today(),
                bogus_field="evil",
            )

    def test_actual_create_account_id_default_none(self):
        """account_id is OPTIONAL — legacy clients omit it entirely."""
        from app.api.schemas.actual import ActualCreate

        c = ActualCreate(
            kind="expense",
            amount_cents=100,
            category_id=1,
            tx_date=date.today(),
        )
        assert c.account_id is None


class TestActualReadSchema:
    """ActualRead.model_validate(orm_row) extracts v10 fields from ORM."""

    def test_actual_read_with_account_and_parent_txn(self):
        from app.api.schemas.actual import ActualRead

        # Plain object that mimics an ORM row (Pydantic from_attributes works
        # off ANY object with attributes — no need to instantiate the SQLA model).
        class FakeOrm:
            id = 1
            period_id = 10
            kind = "roundup"
            amount_cents = -50
            description = "Округление"
            category_id = 7
            tx_date = date.today()
            source = "mini_app"
            created_at = datetime.now(timezone.utc)
            account_id = 42
            parent_txn_id = 99

        read = ActualRead.model_validate(FakeOrm())
        d = read.model_dump()
        assert d["kind"] == "roundup"
        assert d["account_id"] == 42
        assert d["parent_txn_id"] == 99

    def test_actual_kind_str_alias_includes_4_values(self):
        from app.api.schemas.actual import ActualKindStr
        from typing import get_args

        # Literal[...] args == accepted strings.
        assert set(get_args(ActualKindStr)) == {
            "expense",
            "income",
            "roundup",
            "deposit",
        }


# ---------------------------------------------------------------------------
# Layer 2: route integration tests (DB-backed)
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_headers(bot_token, owner_tg_id):
    from tests.conftest import make_init_data

    return {"X-Telegram-Init-Data": make_init_data(owner_tg_id, bot_token)}


@pytest_asyncio.fixture
async def db_setup(async_client, owner_tg_id):
    """Mirror tests/api/test_accounts_api.py — clean DB + AppUser seeded."""
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


@pytest_asyncio.fixture
async def seeded_with_account_savings_and_categories(db_setup, owner_tg_id):
    """Seeds: AppUser already onboarded + 1 account (50_000 cents) +
    SavingsConfig (roundup_enabled=true, base=10) + 1 expense category 'food' +
    1 'savings' system category.

    Returns dict with all ids needed by the integration tests.
    """
    from sqlalchemy import text
    from app.db.models import (
        Account,
        AccountKind,
        BudgetPeriod,
        CategoryKind,
        PeriodStatus,
    )
    from datetime import timedelta

    _, SessionLocal = db_setup

    async with SessionLocal() as session:
        # Resolve user_id.
        result = await session.execute(
            text("SELECT id FROM app_user WHERE tg_user_id = :tg"),
            {"tg": owner_tg_id},
        )
        user_id = result.scalar_one()

        # Account with non-zero balance.
        acct = Account(
            user_id=user_id,
            bank="Tinkoff",
            kind=AccountKind.card,
            balance_cents=50_000_00,
            mask="·· 4408",
            is_primary=True,
        )
        session.add(acct)

        # Categories — expense food + system savings.
        # NOTE: Category.ord is NOT NULL CHAR(2) per migration 0013 — must
        # supply a 2-char ordinal even in tests (CHECK enforces format).
        from tests.helpers.seed import seed_category

        food_cat = await seed_category(
            session,
            user_id=user_id,
            name="Кафе",
            code="cafe",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=10,
            plan_cents=500_00,
            ord="01",
        )
        savings_cat = await seed_category(
            session,
            user_id=user_id,
            name="Копилка",
            code="savings",
            kind=CategoryKind.expense,
            is_archived=False,
            sort_order=99,
            plan_cents=0,
            ord="99",
        )

        # v1.1: SavingsConfig / roundup removed (AGREED §G1) — no config seed.

        # BudgetPeriod covering today (so legacy create_actual doesn't auto-create).
        today = date.today()
        period = BudgetPeriod(
            user_id=user_id,
            period_start=today - timedelta(days=15),
            period_end=today + timedelta(days=15),
            starting_balance_cents=0,
            status=PeriodStatus.active,
        )
        session.add(period)

        await session.commit()
        await session.refresh(acct)
        await session.refresh(food_cat)
        await session.refresh(savings_cat)
        await session.refresh(period)

        return {
            "user_id": user_id,
            "account_id": acct.id,
            "food_cat_id": food_cat.id,
            "savings_cat_id": savings_cat.id,
            "period_id": period.id,
            "initial_balance_cents": 50_000_00,
        }


# Test: account_id supplied → v10 path → balance delta + roundup child.
@pytest.mark.asyncio
async def test_post_actual_with_account_id_triggers_v10_path(
    db_setup, auth_headers, seeded_with_account_savings_and_categories
):
    client, SessionLocal = db_setup
    seed = seeded_with_account_savings_and_categories

    amount = 100_53

    r = await client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": amount,
            "category_id": seed["food_cat_id"],
            "tx_date": str(date.today()),
            "account_id": seed["account_id"],
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "expense"
    assert body["account_id"] == seed["account_id"]
    assert body["parent_txn_id"] is None  # parent has no parent

    # v1.1: roundup removed — balance delta is just the parent amount.
    expected_balance = seed["initial_balance_cents"] + amount

    accounts = (await client.get("/api/v1/accounts", headers=auth_headers)).json()
    acct = next(a for a in accounts if a["id"] == seed["account_id"])
    assert acct["balance_cents"] == expected_balance, (
        f"expected {expected_balance}, got {acct['balance_cents']}"
    )

    # v1.1: single row in period — no roundup child.
    rows = (
        await client.get(
            f"/api/v1/periods/{seed['period_id']}/actual", headers=auth_headers
        )
    ).json()
    assert len(rows) == 1, rows
    assert rows[0]["kind"] == "expense"
    assert rows[0]["account_id"] == seed["account_id"]


# Test: no account_id → legacy create_actual → no balance change, no roundup.
@pytest.mark.asyncio
async def test_post_actual_without_account_id_uses_legacy_path(
    db_setup, auth_headers, seeded_with_account_savings_and_categories
):
    client, _ = db_setup
    seed = seeded_with_account_savings_and_categories

    r = await client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100_53,
            "category_id": seed["food_cat_id"],
            "tx_date": str(date.today()),
            # no account_id — legacy path
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["account_id"] is None
    assert body["parent_txn_id"] is None
    assert body["kind"] == "expense"

    # Account balance UNCHANGED — legacy create_actual does not touch it.
    accounts = (await client.get("/api/v1/accounts", headers=auth_headers)).json()
    acct = next(a for a in accounts if a["id"] == seed["account_id"])
    assert acct["balance_cents"] == seed["initial_balance_cents"]

    # Single row in period — no roundup child.
    rows = (
        await client.get(
            f"/api/v1/periods/{seed['period_id']}/actual", headers=auth_headers
        )
    ).json()
    assert len(rows) == 1
    assert rows[0]["account_id"] is None


# Test: cross-tenant account_id → 404.
@pytest.mark.asyncio
async def test_post_actual_cross_tenant_account_id_returns_404(
    db_setup, auth_headers, seeded_with_account_savings_and_categories
):
    """If body.account_id refers to another user's account → 404 (T-25-01-01)."""
    client, SessionLocal = db_setup
    seed = seeded_with_account_savings_and_categories

    # Insert a SECOND user with their own account that the calling user
    # has no access to. Calling user (owner_tg_id) MUST get 404, not 200.
    from app.db.models import (
        Account,
        AccountKind,
        AppUser,
        UserRole,
    )

    other_account_id: int
    async with SessionLocal() as session:
        other = AppUser(
            tg_user_id=999_999_001,
            role=UserRole.member,
            cycle_start_day=5,
            onboarded_at=datetime.now(timezone.utc),
        )
        session.add(other)
        await session.flush()

        other_acct = Account(
            user_id=other.id,
            bank="Other",
            kind=AccountKind.card,
            balance_cents=0,
            is_primary=True,
        )
        session.add(other_acct)
        await session.commit()
        await session.refresh(other_acct)
        other_account_id = other_acct.id

    # Calling user attempts to POST with foreign account_id.
    r = await client.post(
        "/api/v1/actual",
        json={
            "kind": "expense",
            "amount_cents": 100,
            "category_id": seed["food_cat_id"],
            "tx_date": str(date.today()),
            "account_id": other_account_id,
        },
        headers=auth_headers,
    )
    assert r.status_code == 404, r.text


# Test: kind='deposit' via v10 path with savings category.
@pytest.mark.asyncio
async def test_post_actual_kind_deposit_via_v10_path(
    db_setup, auth_headers, seeded_with_account_savings_and_categories
):
    client, _ = db_setup
    seed = seeded_with_account_savings_and_categories

    r = await client.post(
        "/api/v1/actual",
        json={
            "kind": "deposit",
            "amount_cents": 1_000_00,
            "category_id": seed["savings_cat_id"],
            "tx_date": str(date.today()),
            "account_id": seed["account_id"],
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "deposit"
    assert r.json()["account_id"] == seed["account_id"]


# NOTE (prune): test_actual_read_response_shape_includes_v10_fields removed —
# test_post_actual_with_account_id_triggers_v10_path already asserts the
# kind/account_id/parent_txn_id keys on both the POST response and the period
# GET listing, and the ActualRead schema unit test covers the read shape.
