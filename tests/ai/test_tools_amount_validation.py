"""AI-01 regression: propose_*_transaction must reject amount_rub <= 0.

This test FAILs against pre-fix code (no sign check, returns _proposal: True
with negative amount_cents).
PASSes after Plan 16-03 (positive-check raises {"error": ...}).

Edge cases covered:
- Negative integers / floats (-1, -100, -100.5)
- Zero (int and float forms)
- Round-down-to-zero positive amounts (0.001, 0.004 → 0 cents → reject)
- Smallest positive amount accepted (0.01 rub = 1 kopek)
- Typical positive amount (500 rub = 50000 cents)
- Existing unparseable-input branch preserved (kept on its own error message)
"""
from __future__ import annotations

import os

import pytest


def _require_db():
    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")


async def _seed_user(db_session) -> int:
    """Reuse the same helper pattern as tests/ai/test_tools.py."""
    from tests.helpers.seed import seed_user, truncate_db

    await truncate_db()
    user = await seed_user(db_session, tg_user_id=111222333)
    await db_session.commit()
    await db_session.refresh(user)
    return user.id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "amount_rub",
    [-1, -100, -100.5, 0, 0.0, 0.001, 0.004],  # 0.001 → round to 0 cents → reject
)
async def test_propose_actual_transaction_rejects_non_positive(db_session, amount_rub):
    """Negative, zero, and round-down-to-zero amounts return {"error": ...}."""
    _require_db()
    from app.ai.tools import propose_actual_transaction

    user_id = await _seed_user(db_session)
    result = await propose_actual_transaction(
        db_session,
        user_id=user_id,
        amount_rub=amount_rub,
        kind="expense",
        description="adversarial",
    )
    assert "error" in result, (
        f"Expected error for amount_rub={amount_rub!r}, got {result!r}"
    )
    assert "_proposal" not in result, (
        f"Negative amount must NOT yield _proposal: True; got {result!r}"
    )
    assert result["error"] == "Сумма должна быть > 0", (
        f"Expected canonical error msg; got {result['error']!r}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("amount_rub", [-1, -100, -100.5, 0, 0.0, 0.001, 0.004])
async def test_propose_planned_transaction_rejects_non_positive(db_session, amount_rub):
    """Mirror check on planned-proposal tool."""
    _require_db()
    from app.ai.tools import propose_planned_transaction

    user_id = await _seed_user(db_session)
    result = await propose_planned_transaction(
        db_session,
        user_id=user_id,
        amount_rub=amount_rub,
        kind="expense",
        description="adversarial",
    )
    assert "error" in result, (
        f"Expected error for amount_rub={amount_rub!r}, got {result!r}"
    )
    assert "_proposal" not in result
    assert result["error"] == "Сумма должна быть > 0"


@pytest.mark.asyncio
async def test_propose_actual_transaction_accepts_one_kopek(db_session):
    """Smallest positive amount (1 kopek = 0.01 rub) MUST pass."""
    _require_db()
    from app.ai.tools import propose_actual_transaction

    user_id = await _seed_user(db_session)
    result = await propose_actual_transaction(
        db_session,
        user_id=user_id,
        amount_rub=0.01,
        kind="expense",
        description="coffee",
    )
    assert result.get("_proposal") is True, f"Expected _proposal: True; got {result!r}"
    assert result["txn"]["amount_cents"] == 1


@pytest.mark.asyncio
async def test_propose_planned_transaction_accepts_typical_amount(db_session):
    """Typical 500 rub → 50000 cents."""
    _require_db()
    from app.ai.tools import propose_planned_transaction

    user_id = await _seed_user(db_session)
    result = await propose_planned_transaction(
        db_session,
        user_id=user_id,
        amount_rub=500,
        kind="expense",
        description="абонемент",
    )
    assert result.get("_proposal") is True, f"Expected _proposal: True; got {result!r}"
    assert result["txn"]["amount_cents"] == 50000


@pytest.mark.asyncio
async def test_propose_actual_transaction_unparseable_returns_error(db_session):
    """Non-numeric input keeps the existing 'не распознать' error path."""
    _require_db()
    from app.ai.tools import propose_actual_transaction

    user_id = await _seed_user(db_session)
    result = await propose_actual_transaction(
        db_session,
        user_id=user_id,
        amount_rub="not-a-number",  # type: ignore[arg-type]
        kind="expense",
        description="garbage",
    )
    assert "error" in result
    assert "_proposal" not in result
    # Existing code path; we don't change this message.
    assert result["error"] == "Не удалось распознать сумму"
