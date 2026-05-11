"""Phase 36-02 (REQ-36-02): tax reserve calculator для Persona E (самозанятые).

Покрывает:
- ``round_to_cent`` half-up округление (basic + edge при .995).
- ``RATE_BY_REGIME`` константы (0.04 / 0.06 строго Decimal).
- ``calculate_tax_reserve`` пустой результат — 0 income/tax/reserve.
- ``calculate_tax_reserve`` смешанные txn — корректно фильтрует business + считает
  4% налог + 5% safety margin.

Schema адаптация vs draft-плана:
- ``ActualTransaction`` использует ``tx_date`` (НЕ ``date_op``).
- Поля required при INSERT: ``period_id``, ``source`` ('mini_app' | 'bot').
- ``Category`` требует ``kind``, ``sort_order``, ``code``, ``ord``, ``rollover``,
  ``paused``, ``tag``.

Fixture pattern зеркалит ``test_business_personal_tag.py`` — dedicated engine
+ RLS bypass через ``SET LOCAL row_security = off``.
"""
from __future__ import annotations

import os
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.services.tax_reserve import (
    RATE_BY_REGIME,
    calculate_tax_reserve,
    round_to_cent,
)

# NOTE: НЕ ставим module-level ``pytestmark = pytest.mark.asyncio`` — это
# приклеивает asyncio-маркер на sync-тесты (round_to_cent, rate_constants)
# и spam'ит warnings. Async-тесты ниже помечены индивидуально.


# ---------------------------------------------------------------------------
# Pure-function tests (no DB).
# ---------------------------------------------------------------------------


def test_round_to_cent_basic() -> None:
    """Basic Decimal RUB → integer cents conversions."""
    assert round_to_cent(Decimal("100.0")) == 10000
    # HALF_UP: .995 округляется ВВЕРХ (не HALF_EVEN).
    assert round_to_cent(Decimal("99.995")) == 10000
    assert round_to_cent(Decimal("0.01")) == 1
    assert round_to_cent(Decimal("0")) == 0


def test_rate_constants() -> None:
    """НПД rates: 4% и 6% — точные Decimal значения (не float)."""
    assert RATE_BY_REGIME["nalog_4"] == Decimal("0.04")
    assert RATE_BY_REGIME["nalog_6"] == Decimal("0.06")


# ---------------------------------------------------------------------------
# DB-backed tests.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_check_session():
    """Lightweight async session для verify-only assertions в integration test."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set — integration test requires DB")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with Session() as s:
        yield s
    await engine.dispose()


async def _seed_user(session: AsyncSession, tg_user_id: int) -> int:
    await session.execute(text("SET LOCAL row_security = off"))
    r = await session.execute(
        text(
            "INSERT INTO app_user (tg_user_id, role, onboarded_at) "
            "VALUES (:tg, 'owner', NOW()) RETURNING id"
        ),
        {"tg": tg_user_id},
    )
    return r.scalar_one()


async def _seed_period(
    session: AsyncSession,
    user_id: int,
    period_start: date,
    period_end: date,
) -> int:
    await session.execute(text("SET LOCAL row_security = off"))
    r = await session.execute(
        text(
            "INSERT INTO budget_period "
            "(user_id, period_start, period_end, status) "
            "VALUES (:u, :s, :e, 'active') RETURNING id"
        ),
        {"u": user_id, "s": period_start, "e": period_end},
    )
    return r.scalar_one()


async def _seed_category(
    session: AsyncSession,
    user_id: int,
    code: str,
    tag: str,
) -> int:
    await session.execute(text("SET LOCAL row_security = off"))
    r = await session.execute(
        text(
            "INSERT INTO category "
            "(user_id, name, kind, sort_order, plan_cents, code, ord, "
            " rollover, paused, tag) "
            "VALUES (:u, :n, 'income', 10, 0, :c, '01', 'misc', false, :t) "
            "RETURNING id"
        ),
        {"u": user_id, "n": code, "c": code, "t": tag},
    )
    return r.scalar_one()


async def _cleanup_user(session: AsyncSession, user_id: int) -> None:
    await session.execute(text("SET LOCAL row_security = off"))
    await session.execute(
        text("DELETE FROM actual_transaction WHERE user_id = :u"),
        {"u": user_id},
    )
    await session.execute(
        text("DELETE FROM budget_period WHERE user_id = :u"), {"u": user_id}
    )
    await session.execute(
        text("DELETE FROM category WHERE user_id = :u"), {"u": user_id}
    )
    await session.execute(
        text("DELETE FROM app_user WHERE id = :u"), {"u": user_id}
    )


@pytest.mark.asyncio
async def test_tax_reserve_zero_business_income(db_check_session) -> None:
    """Нет business-tagged txn → tax_owed = 0, reserve = 0."""
    user_id = await _seed_user(db_check_session, 9_001_100_001)
    await db_check_session.commit()
    try:
        result = await calculate_tax_reserve(
            db_check_session,
            user_id=user_id,
            period_start=date(2026, 5, 1),
            period_end=date(2026, 5, 31),
            regime="nalog_4",
        )
        assert result.income_cents == 0
        assert result.business_income_cents == 0
        assert result.tax_owed_cents == 0
        assert result.reserve_recommended_cents == 0
        assert result.regime == "nalog_4"
        assert result.period_start == date(2026, 5, 1)
        assert result.period_end == date(2026, 5, 31)
    finally:
        await _cleanup_user(db_check_session, user_id)
        await db_check_session.commit()


@pytest.mark.asyncio
async def test_tax_reserve_with_business_income(db_check_session) -> None:
    """50K₽ business + 30K₽ personal income → 4% от 50K = 2000₽ налог,
    reserve = 2100₽ (5% margin)."""
    user_id = await _seed_user(db_check_session, 9_001_100_002)
    period_id = await _seed_period(
        db_check_session, user_id, date(2026, 5, 1), date(2026, 5, 31)
    )
    cat_id = await _seed_category(
        db_check_session, user_id, "work_p36_02", "business"
    )

    # Seed income txns: 50_000.00₽ business + 30_000.00₽ personal
    # 50_000₽ = 5_000_000 копеек.
    for amount_cents, tag in [(5_000_000, "business"), (3_000_000, "personal")]:
        await db_check_session.execute(
            text(
                "INSERT INTO actual_transaction "
                "(user_id, category_id, period_id, kind, amount_cents, "
                " tx_date, source, tag) "
                "VALUES (:u, :c, :p, 'income', :a, :d, 'mini_app', :t)"
            ),
            {
                "u": user_id,
                "c": cat_id,
                "p": period_id,
                "a": amount_cents,
                "d": date(2026, 5, 15),
                "t": tag,
            },
        )
    await db_check_session.commit()

    try:
        result = await calculate_tax_reserve(
            db_check_session,
            user_id=user_id,
            period_start=date(2026, 5, 1),
            period_end=date(2026, 5, 31),
            regime="nalog_4",
        )
        # Business: 50_000.00 ₽ = 5_000_000 копеек.
        assert result.business_income_cents == 5_000_000
        # Total income: 80_000.00 ₽ = 8_000_000 копеек.
        assert result.income_cents == 8_000_000
        # 50_000 * 0.04 = 2_000 ₽ = 200_000 копеек.
        assert result.tax_owed_cents == 200_000
        # Reserve с 5% margin: 2_000 * 1.05 = 2_100 ₽ = 210_000 копеек.
        assert result.reserve_recommended_cents == 210_000
    finally:
        await _cleanup_user(db_check_session, user_id)
        await db_check_session.commit()
