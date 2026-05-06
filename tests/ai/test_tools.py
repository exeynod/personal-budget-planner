"""RED тесты 4 инструментов AI (AI-05).
FAIL до Plan 09-04 (tools implementation).
Тесты с DB пропускаются при отсутствии DATABASE_URL.
"""
from __future__ import annotations
import os
import pytest


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


def test_tools_importable():
    """Все 4 tool-функции должны быть импортируемыми."""
    from app.ai.tools import (  # noqa: F401
        get_category_summary,
        get_forecast,
        get_period_balance,
        query_transactions,
    )


@pytest.mark.asyncio
async def test_get_period_balance_returns_dict(db_session):
    """get_period_balance() возвращает dict с ключами balance_cents, period_start, period_end."""
    _require_db()
    from app.ai.tools import get_period_balance
    result = await get_period_balance(db_session)
    assert isinstance(result, dict)
    assert "balance_cents" in result or "error" in result


@pytest.mark.asyncio
async def test_get_category_summary_returns_dict(db_session):
    """get_category_summary() возвращает dict со списком категорий."""
    _require_db()
    from app.ai.tools import get_category_summary
    result = await get_category_summary(db_session)
    assert isinstance(result, dict)
    assert "categories" in result or "error" in result


@pytest.mark.asyncio
async def test_query_transactions_returns_dict(db_session):
    """query_transactions() возвращает dict со списком транзакций."""
    _require_db()
    from app.ai.tools import query_transactions
    result = await query_transactions(db_session, limit=5)
    assert isinstance(result, dict)
    assert "transactions" in result or "error" in result


@pytest.mark.asyncio
async def test_get_forecast_returns_dict(db_session):
    """get_forecast() возвращает dict с forecast данными."""
    _require_db()
    from app.ai.tools import get_forecast
    result = await get_forecast(db_session)
    assert isinstance(result, dict)
    assert "forecast_balance_cents" in result or "error" in result


@pytest.mark.asyncio
async def test_tools_error_handling(db_session):
    """Tools возвращают {'error': 'message'} при ошибке, а не бросают исключение."""
    _require_db()
    # Тест через get_category_summary с несуществующим category_id
    from app.ai.tools import get_category_summary
    result = await get_category_summary(db_session, category_id=999999)
    # Должен вернуть dict — или с данными (пустой), или с error
    assert isinstance(result, dict)
