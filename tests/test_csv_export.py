"""Phase 36-03 (REQ-36-03): CSV export endpoint /tax/export.csv.

Покрывает:
- Headers соответствуют контракту (10 столбцов).
- Запись + читабельная RFC 4180 структура (header + ≥1 data row).
- Empty period → только header row (Excel-friendly empty export).
- UTF-8 BOM присутствует в первом байте.

Fixture pattern зеркалит ``test_tax_reserve.py`` — dedicated engine + RLS
bypass через ``SET LOCAL row_security = off``, fully isolated cleanup.
"""

from __future__ import annotations

import csv
import io
import os
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


@pytest_asyncio.fixture
async def db_check_session():
    """Lightweight async session для integration tests."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        pytest.skip("DATABASE_URL not set — integration test requires DB")
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


@pytest.mark.asyncio
async def test_csv_export_with_transactions(db_check_session):
    """Headers correct + data row содержит ожидаемые поля."""
    from app.services.csv_export import CSV_HEADERS, export_user_transactions_csv

    await db_check_session.execute(text("SET LOCAL row_security = off"))
    r = await db_check_session.execute(
        text(
            "INSERT INTO app_user (tg_user_id, role, onboarded_at) "
            "VALUES (9001200001, 'owner', NOW()) RETURNING id"
        )
    )
    user_id = r.scalar_one()
    rp = await db_check_session.execute(
        text(
            "INSERT INTO budget_period "
            "(user_id, period_start, period_end, status) "
            "VALUES (:u, :s, :e, 'active') RETURNING id"
        ),
        {"u": user_id, "s": date(2026, 5, 1), "e": date(2026, 5, 31)},
    )
    period_id = rp.scalar_one()
    rc = await db_check_session.execute(
        text(
            "INSERT INTO category "
            "(user_id, name, kind, sort_order, plan_cents, code, ord, tag) "
            "VALUES (:u, 'Еда', 'expense', 1, 10000, 'food_p36_03', '01', "
            " 'personal') "
            "RETURNING id"
        ),
        {"u": user_id},
    )
    cat_id = rc.scalar_one()
    await db_check_session.execute(
        text(
            "INSERT INTO actual_transaction "
            "(user_id, category_id, period_id, tx_date, amount_cents, "
            " kind, tag, source, description) "
            "VALUES (:u, :c, :p, :d, 50000, 'expense', 'business', "
            " 'mini_app', 'lunch')"
        ),
        {
            "u": user_id,
            "c": cat_id,
            "p": period_id,
            "d": date(2026, 5, 15),
        },
    )
    await db_check_session.commit()
    try:
        csv_str = await export_user_transactions_csv(
            db_check_session,
            user_id=user_id,
            period_start=date(2026, 5, 1),
            period_end=date(2026, 5, 31),
        )
        # BOM присутствует first.
        assert csv_str.startswith("﻿"), "UTF-8 BOM expected as first char"
        csv_str = csv_str[1:]
        reader = csv.reader(io.StringIO(csv_str))
        rows = list(reader)
        assert rows[0] == CSV_HEADERS
        assert len(rows) >= 2  # header + ≥1 data row
        data_row = rows[1]
        assert data_row[0] == "2026-05-15"  # date
        assert data_row[1] == "food_p36_03"  # category_code
        assert data_row[2] == "Еда"  # category_name
        assert data_row[3] == "personal"  # category_tag
        assert data_row[4] == "50000"  # amount_cents
        assert data_row[5] == "500.00"  # amount_rub
        assert data_row[6] == "expense"  # kind
        assert data_row[7] == "business"  # txn tag override
        assert data_row[8] == "lunch"  # note (from description)
        assert data_row[9] == "mini_app"  # source
    finally:
        await db_check_session.execute(text("SET LOCAL row_security = off"))
        await db_check_session.execute(
            text("DELETE FROM actual_transaction WHERE user_id = :u"),
            {"u": user_id},
        )
        await db_check_session.execute(
            text("DELETE FROM category WHERE user_id = :u"), {"u": user_id}
        )
        await db_check_session.execute(
            text("DELETE FROM budget_period WHERE user_id = :u"),
            {"u": user_id},
        )
        await db_check_session.execute(
            text("DELETE FROM app_user WHERE id = :u"), {"u": user_id}
        )
        await db_check_session.commit()


@pytest.mark.asyncio
async def test_csv_export_empty_period_has_headers_only(db_check_session):
    """No transactions → CSV содержит только header row."""
    from app.services.csv_export import CSV_HEADERS, export_user_transactions_csv

    await db_check_session.execute(text("SET LOCAL row_security = off"))
    r = await db_check_session.execute(
        text(
            "INSERT INTO app_user (tg_user_id, role, onboarded_at) "
            "VALUES (9001200002, 'owner', NOW()) RETURNING id"
        )
    )
    user_id = r.scalar_one()
    await db_check_session.commit()
    try:
        csv_str = await export_user_transactions_csv(
            db_check_session,
            user_id=user_id,
            period_start=date(2026, 5, 1),
            period_end=date(2026, 5, 31),
        )
        assert csv_str.startswith("﻿")
        csv_str = csv_str[1:]
        rows = list(csv.reader(io.StringIO(csv_str)))
        assert rows == [CSV_HEADERS]
    finally:
        await db_check_session.execute(text("SET LOCAL row_security = off"))
        await db_check_session.execute(
            text("DELETE FROM app_user WHERE id = :u"), {"u": user_id}
        )
        await db_check_session.commit()
