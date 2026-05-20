"""Phase 67 Plan 08 (R8, P2-7) — ai_usage_log cost_cents (no Float) + embedding spend.

R8: ai_usage_log stores cost as BIGINT cost_cents (the Float est_cost_usd column
is gone). The AiUsageLog model exposes cost_cents and not est_cost_usd.

P2-7: a suggest-category embedding call must record cost_cents to ai_usage_log so
the spend-cap sees the embedding spend.
"""
from __future__ import annotations

import math

import pytest


def test_aiusagelog_model_has_cost_cents_not_float():
    """The ORM model must expose cost_cents and NOT est_cost_usd."""
    from app.db.models import AiUsageLog

    cols = set(AiUsageLog.__table__.columns.keys())
    assert "cost_cents" in cols, f"AiUsageLog must have cost_cents, got {cols}"
    assert "est_cost_usd" not in cols, "est_cost_usd Float column must be gone"

    # cost_cents must be an integer BIGINT type (no float).
    coltype = AiUsageLog.__table__.columns["cost_cents"].type
    assert "FLOAT" not in str(coltype).upper()
    assert "INT" in str(coltype).upper() or "BIGINT" in str(coltype).upper()


def test_estimate_embedding_cost_nonzero_for_nonempty():
    """A non-empty description must yield a non-zero (after ceil→cents) cost."""
    from app.ai.embedding_service import estimate_embedding_cost_usd

    usd = estimate_embedding_cost_usd("кофе в старбаксе на парковке у дома")
    assert usd > 0.0
    # ceil to cents must be >= 1 cent only if usd*100 >= a tiny epsilon — for
    # embeddings it is sub-cent, so ceil gives exactly 1 cent (>0), visible to cap.
    assert math.ceil(usd * 100.0) >= 1


def test_spend_cap_sums_cost_cents_directly(monkeypatch):
    """spend_cap aggregation must SUM cost_cents (int) — no float conversion."""
    import inspect

    from app.services import spend_cap

    src = inspect.getsource(spend_cap._fetch_spend_cents_from_db)
    # The actual aggregation must reference AiUsageLog.cost_cents and must NOT
    # SUM the (now-removed) Float column. Ignore docstring mentions of the
    # legacy name by checking the code lines (those with func.sum / AiUsageLog).
    code_lines = [
        ln for ln in src.splitlines()
        if "AiUsageLog." in ln or "func.sum" in ln
    ]
    code = "\n".join(code_lines)
    assert "AiUsageLog.cost_cents" in code, (
        f"spend_cap must aggregate AiUsageLog.cost_cents; got: {code!r}"
    )
    assert "est_cost_usd" not in code, (
        "spend_cap aggregation must not reference est_cost_usd"
    )
