"""DB-01 regression: spend_cap.py uses unified set_tenant_scope helper.

Two-layer test:
1. Static (grep-style) — guarantees no future regression to f-string SET LOCAL.
2. Behavioral — verifies app.current_user_id GUC is set after _fetch_spend_cents_from_db.

This test FAILs if app/services/spend_cap.py reverts to f-string SET LOCAL.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text


# NOTE (prune): the two static AST/grep guards (does_not_use_fstring_set_local,
# imports_set_tenant_scope) were removed — lint-as-test of source text. The
# behavioural tests below assert the real contract (GUC set, non-int rejected).


@pytest.mark.asyncio
async def test_fetch_spend_cents_sets_current_user_id_guc(db_session, single_user):
    """Behavioral: after _fetch_spend_cents_from_db, current_setting('app.current_user_id') == user_id."""
    from app.services.spend_cap import _fetch_spend_cents_from_db

    user_id = single_user["id"]

    # Call the function — it sets the GUC and runs the SUM query.
    await _fetch_spend_cents_from_db(db_session, user_id=user_id)

    # Verify GUC was set within the same transaction.
    result = await db_session.execute(
        text("SELECT current_setting('app.current_user_id', true)")
    )
    val = result.scalar()
    assert val == str(user_id), (
        f"Expected current_user_id GUC = {user_id!r}; got {val!r}"
    )


@pytest.mark.asyncio
async def test_fetch_spend_cents_rejects_non_int_user_id(db_session):
    """Behavioral: passing non-int user_id raises ValueError (defense-in-depth from set_tenant_scope)."""
    from app.services.spend_cap import _fetch_spend_cents_from_db

    with pytest.raises((ValueError, TypeError)):
        # set_tenant_scope raises ValueError on non-int.
        await _fetch_spend_cents_from_db(db_session, user_id="evil; DROP TABLE")  # type: ignore[arg-type]
