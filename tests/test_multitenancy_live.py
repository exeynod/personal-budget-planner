"""Live multi-tenant production scenario — Phase 32 REQ-32-01.

Конкретный production-style сценарий:
  1. Two users created inline (independent от `two_tenants` fixture — see
     note 1 below).
  2. userA вставляет actual_transaction под superuser bypass.
  3. Switch to non-superuser app role + set userB scope.
  4. Direct SELECT * FROM actual_transaction WHERE id=<userA_tx> → 0 rows.
  5. Direct UPDATE/DELETE row userA от имени userB → 0 affected rows.

Note 1: tests/conftest.py::two_tenants fixture currently не выставляет
v1.0 NOT NULL columns на `category` (code, ord) → seed fails on v1.0+
schema. Этот файл seed-ит users независимо чтобы не блокироваться
pre-existing breakage. Tracked для будущего conftest fix (out of scope
для Phase 32).

Это complement к Phase 11 test_multitenancy_isolation — там через service
layer; здесь — raw SQL под non-superuser ролью.
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import text

from app.db.session import set_tenant_scope

pytestmark = pytest.mark.asyncio


async def _seed_user(db_session, tg_user_id: int) -> int:
    """Create AppUser + 1 category + 1 period; return user.id."""
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    # Insert app_user.
    result = await db_session.execute(
        text(
            "INSERT INTO app_user (tg_user_id, role, cycle_start_day, onboarded_at) "
            "VALUES (:tg, 'member', 5, now()) RETURNING id"
        ),
        {"tg": tg_user_id},
    )
    user_id = result.scalar_one()
    return user_id


async def _seed_category(db_session, user_id: int, code: str, name: str) -> int:
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    result = await db_session.execute(
        text(
            "INSERT INTO category "
            "(user_id, name, kind, sort_order, plan_cents, code, ord, rollover, paused) "
            "VALUES (:uid, :name, 'expense', 10, 0, :code, '01', 'misc', false) "
            "RETURNING id"
        ),
        {"uid": user_id, "name": name, "code": code},
    )
    return result.scalar_one()


async def _seed_period(db_session, user_id: int, start: date, end: date) -> int:
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    result = await db_session.execute(
        text(
            "INSERT INTO budget_period (user_id, period_start, period_end, status) "
            "VALUES (:uid, :s, :e, 'active') RETURNING id"
        ),
        {"uid": user_id, "s": start, "e": end},
    )
    return result.scalar_one()


async def _cleanup_user(db_session, user_id: int) -> None:
    """Delete all tenant rows + user. Superuser bypass."""
    await db_session.execute(text("RESET ROLE"))
    await db_session.execute(text("SET LOCAL row_security = off"))
    for tbl in (
        "ai_message",
        "ai_conversation",
        "category_embedding",
        "actual_transaction",
        "planned_transaction",
        "savings_config",
        "goal",
        "subscription",
        "account",
        "budget_period",
        "category",
    ):
        await db_session.execute(
            text(f"DELETE FROM {tbl} WHERE user_id = :uid"),
            {"uid": user_id},
        )
    await db_session.execute(
        text("DELETE FROM app_user WHERE id = :uid"),
        {"uid": user_id},
    )


async def test_userB_cannot_see_userA_actual_via_raw_sql(
    db_session, _rls_test_role
):
    """REQ-32-01: cross-tenant raw-SQL isolation — userB не видит row userA."""
    # Unique tg_user_ids (collision-resistant).
    tg_a = 9_100_000_000 + (uuid.uuid4().int & 0xFFFF)
    tg_b = 9_100_000_000 + (uuid.uuid4().int & 0xFFFF) + 1

    user_a_id = await _seed_user(db_session, tg_a)
    user_b_id = await _seed_user(db_session, tg_b)
    cat_a_id = await _seed_category(db_session, user_a_id, "food", "Продукты")
    period_a_id = await _seed_period(
        db_session, user_a_id, date(2026, 5, 1), date(2026, 5, 31)
    )

    # Insert actual_transaction as userA (superuser bypass для setup is OK).
    result = await db_session.execute(
        text(
            "INSERT INTO actual_transaction "
            "(user_id, category_id, period_id, kind, amount_cents, tx_date, source, description) "
            "VALUES (:uid, :cid, :pid, 'expense', 100, CURRENT_DATE, 'mini_app', 'phase32-test') "
            "RETURNING id"
        ),
        {"uid": user_a_id, "cid": cat_a_id, "pid": period_a_id},
    )
    tx_id = result.scalar_one()
    await db_session.commit()

    try:
        # Switch to non-superuser app role + set userB scope.
        await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
        await set_tenant_scope(db_session, user_b_id)

        # Direct SELECT для userA's tx_id — должно вернуть 0 rows.
        result = await db_session.execute(
            text("SELECT id FROM actual_transaction WHERE id = :id"),
            {"id": tx_id},
        )
        rows = result.fetchall()
        assert rows == [], (
            f"userB sees userA's transaction id={tx_id}: {rows}"
        )

        # Direct UPDATE attempt — должно вернуть 0 affected rows.
        result = await db_session.execute(
            text("UPDATE actual_transaction SET amount_cents = 999 WHERE id = :id"),
            {"id": tx_id},
        )
        assert result.rowcount == 0, (
            f"userB UPDATE on userA's tx affected {result.rowcount} rows"
        )

        # Direct DELETE attempt — должно вернуть 0 affected rows.
        result = await db_session.execute(
            text("DELETE FROM actual_transaction WHERE id = :id"),
            {"id": tx_id},
        )
        assert result.rowcount == 0, (
            f"userB DELETE on userA's tx affected {result.rowcount} rows"
        )
    finally:
        # Cleanup
        await _cleanup_user(db_session, user_a_id)
        await _cleanup_user(db_session, user_b_id)
        await db_session.commit()


async def test_userB_cannot_insert_actual_for_userA(
    db_session, _rls_test_role
):
    """REQ-32-01: cross-tenant write — userB session не может INSERT с user_id=userA."""
    tg_a = 9_200_000_000 + (uuid.uuid4().int & 0xFFFF)
    tg_b = 9_200_000_000 + (uuid.uuid4().int & 0xFFFF) + 1

    user_a_id = await _seed_user(db_session, tg_a)
    user_b_id = await _seed_user(db_session, tg_b)
    cat_a_id = await _seed_category(db_session, user_a_id, "food", "Продукты")
    period_a_id = await _seed_period(
        db_session, user_a_id, date(2026, 5, 1), date(2026, 5, 31)
    )
    await db_session.commit()

    try:
        # Switch to non-superuser role + userB scope.
        await db_session.execute(text(f"SET LOCAL ROLE {_rls_test_role}"))
        await set_tenant_scope(db_session, user_b_id)

        # Attempt INSERT с user_id=userA — RLS WITH CHECK должно reject.
        # Если RLS правильно работает — это поднимет DBAPIError из-за
        # violation на check constraint.
        from sqlalchemy.exc import DBAPIError, ProgrammingError

        insert_blocked = False
        try:
            await db_session.execute(
                text(
                    "INSERT INTO actual_transaction "
                    "(user_id, category_id, period_id, kind, amount_cents, tx_date, source) "
                    "VALUES (:uid, :cid, :pid, 'expense', 50, CURRENT_DATE, 'mini_app')"
                ),
                {"uid": user_a_id, "cid": cat_a_id, "pid": period_a_id},
            )
            await db_session.commit()
        except (DBAPIError, ProgrammingError):
            insert_blocked = True
            await db_session.rollback()

        assert insert_blocked, (
            "userB session НЕ заблокирована при INSERT с user_id=userA — RLS BREACH"
        )
    finally:
        await _cleanup_user(db_session, user_a_id)
        await _cleanup_user(db_session, user_b_id)
        await db_session.commit()
