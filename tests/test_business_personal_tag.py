"""Phase 36 REQ-36-01: business/personal tag on category + actual_transaction.

Covers:
- Default Category.tag = 'personal' (DB DEFAULT + ORM default).
- Explicit 'business' tag persists round-trip via raw INSERT.

Persona E (самозанятые) needs to flag tax-deductible spending. The schema/index
work lands here; UI surface arrives in Phase 36-02+.

Fixture pattern mirrors `test_pdn_consent_flow.py` — dedicated engine + RLS
bypass via `SET LOCAL row_security = off`, fully isolated cleanup so the test
никак не зависит от глобального `db_session` rollback timing.
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

pytestmark = pytest.mark.asyncio

# tg_user_id chosen вне range two_tenants / consent_test_user / reverse_trial
# fixtures, чтобы не клэшить с параллельными тестами.
TG_ID = 9_001_000_001


@pytest_asyncio.fixture
async def seeded_user_with_categories():
    """Seed one user + two categories ('food'=personal, 'software'=business).

    Yields (user_id, [cat_id_food, cat_id_software]).
    Cleanup deletes actual_transaction → category → app_user in correct order.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set — integration test requires DB")

    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)

    cat_ids: list[int] = []
    user_id: int = 0
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL row_security = off"))
        u = await conn.execute(
            text(
                "INSERT INTO app_user (tg_user_id, role, onboarded_at) "
                "VALUES (:tg, 'owner', NOW()) RETURNING id"
            ),
            {"tg": TG_ID},
        )
        user_id = u.scalar_one()
        for code, ord_, tag in [
            ("food_p36", "01", "personal"),
            ("software_p36", "02", "business"),
        ]:
            r = await conn.execute(
                text(
                    "INSERT INTO category "
                    "(user_id, name, kind, sort_order, plan_cents, code, ord, tag) "
                    "VALUES (:u, :n, 'expense', 10, 10000, :c, :o, :t) "
                    "RETURNING id"
                ),
                {"u": user_id, "n": code, "c": code, "o": ord_, "t": tag},
            )
            cat_ids.append(r.scalar_one())

    yield user_id, cat_ids

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL row_security = off"))
        await conn.execute(
            text("DELETE FROM actual_transaction WHERE user_id = :u"),
            {"u": user_id},
        )
        await conn.execute(
            text("DELETE FROM category WHERE user_id = :u"), {"u": user_id}
        )
        await conn.execute(text("DELETE FROM app_user WHERE id = :u"), {"u": user_id})
    await engine.dispose()


@pytest_asyncio.fixture
async def db_check_session():
    """Lightweight read-only session for verifying rows in tests."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_category_default_tag_personal(
    seeded_user_with_categories, db_check_session
):
    """Categories persist the explicit tag passed at INSERT time.

    'food_p36' → personal, 'software_p36' → business. Validates the column
    exists, accepts the enum values, и round-trips через SELECT.
    """
    user_id, _cat_ids = seeded_user_with_categories
    await db_check_session.execute(text("SET LOCAL row_security = off"))
    rows = (
        await db_check_session.execute(
            text("SELECT code, tag FROM category WHERE user_id = :u ORDER BY ord"),
            {"u": user_id},
        )
    ).all()
    tag_by_code = {r[0]: r[1] for r in rows}
    assert tag_by_code == {
        "food_p36": "personal",
        "software_p36": "business",
    }


async def test_category_tag_db_default_is_personal(db_check_session):
    """Inserting category без tag column → DB DEFAULT 'personal' kicks in.

    Validates the migration's `DEFAULT 'personal'` clause — без явного tag
    legacy INSERT (например, из старого backfill script'а) получает personal.
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    tg_id = 9_001_000_002
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            u = await conn.execute(
                text(
                    "INSERT INTO app_user (tg_user_id, role, onboarded_at) "
                    "VALUES (:tg, 'owner', NOW()) RETURNING id"
                ),
                {"tg": tg_id},
            )
            user_id = u.scalar_one()
            c = await conn.execute(
                text(
                    "INSERT INTO category "
                    "(user_id, name, kind, sort_order, plan_cents, code, ord) "
                    "VALUES (:u, 'noTag', 'expense', 10, 0, 'no_tag_p36', '03') "
                    "RETURNING id, tag"
                ),
                {"u": user_id},
            )
            row = c.one()
            assert row.tag == "personal", (
                f"Expected DB DEFAULT 'personal', got {row.tag!r}"
            )
        # cleanup
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL row_security = off"))
            await conn.execute(
                text("DELETE FROM category WHERE user_id = :u"), {"u": user_id}
            )
            await conn.execute(
                text("DELETE FROM app_user WHERE id = :u"), {"u": user_id}
            )
    finally:
        await engine.dispose()
