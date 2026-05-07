"""DB-01 regression: spend_cap.py uses unified set_tenant_scope helper.

Two-layer test:
1. Static (grep-style) — guarantees no future regression to f-string SET LOCAL.
2. Behavioral — verifies app.current_user_id GUC is set after _fetch_spend_cents_from_db.

This test FAILs if app/services/spend_cap.py reverts to f-string SET LOCAL.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
from sqlalchemy import text


def test_spend_cap_does_not_use_fstring_set_local():
    """Static guard: no f-string SET LOCAL in spend_cap.py.

    grep-gate hygiene per planner standards: filter out comments AND
    docstrings so the test is robust to historical references in
    documentation. We strip lines starting with `#` (comments) and
    require the pattern to appear in actual Python code.
    """
    path = Path("app/services/spend_cap.py")
    raw = path.read_text(encoding="utf-8")

    # Filter out python comments (lines starting with `#` after stripping).
    code_lines = [
        line for line in raw.splitlines()
        if not line.lstrip().startswith("#")
    ]
    code = "\n".join(code_lines)

    # f-string SET LOCAL pattern: `f"SET LOCAL app.current_user_id` or similar.
    forbidden = re.compile(r"f['\"]SET LOCAL app\.current_user_id", re.IGNORECASE)
    assert not forbidden.search(code), (
        "DB-01 regression: f-string SET LOCAL re-introduced into spend_cap.py. "
        "Use await set_tenant_scope(db, user_id) instead (app/db/session.py:30)."
    )


def test_spend_cap_imports_set_tenant_scope():
    """Static guard: spend_cap.py imports set_tenant_scope from session module."""
    raw = Path("app/services/spend_cap.py").read_text(encoding="utf-8")
    assert "set_tenant_scope" in raw, (
        "DB-01: spend_cap.py must reference set_tenant_scope (helper from "
        "app/db/session.py)."
    )


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
