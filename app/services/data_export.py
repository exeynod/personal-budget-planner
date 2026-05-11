"""Phase 33 CMP-33-06: data-export builder (right of access, 152-ФЗ §14).

Constructs a JSON-serialisable dict containing all PII data for one user.
Caller MUST have called ``set_tenant_scope(db, user_id)`` first so RLS
policies allow SELECT on tenant-scoped tables (account / goal /
savings_config / category / actual_transaction / planned_transaction /
budget_period / subscription / ai_conversation / ai_message).

Output shape (CMP-33-06)::

    {
      "user":                  {...app_user fields...},
      "accounts":              [...],
      "categories":            [...],
      "budget_periods":        [...],
      "planned_transactions":  [...],
      "actual_transactions":   [...],
      "subscriptions":         [...],
      "ai_conversations":      [...],
      "ai_messages":           [...],
      "goals":                 [...],
      "savings_config":        null | {...},
      "audit_log":             [...],
      "_meta": {"exported_at": <iso8601>, "format_version": "1.0"}
    }
"""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Account,
    ActualTransaction,
    AiConversation,
    AiMessage,
    AppUser,
    BudgetPeriod,
    Category,
    Goal,
    PdnAuditLog,
    PlannedTransaction,
    SavingsConfig,
    Subscription,
)


def _serialize_row(row: Any) -> dict:
    """Convert ORM row to a JSON-friendly dict.

    Rules:
        - ``datetime`` → ISO-8601 string with tz.
        - ``date`` → ISO-8601 string (no time).
        - Enums (have ``.value``) → ``.value``.
        - Bytes → ignored (replaced with sha256-prefix marker).
        - Vectors / pgvector etc. → repr() so the export stays JSON-safe.
        - Otherwise — value passed through (int / str / bool / None / dict / list).
    """
    if row is None:
        return {}
    out: dict[str, Any] = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            out[col.name] = val.isoformat()
        elif isinstance(val, date):
            out[col.name] = val.isoformat()
        elif hasattr(val, "value") and not isinstance(val, (dict, list, str, int, bool)):
            # Enums (.value attribute) — but skip strings/dicts that happen to
            # have a `value` member.
            out[col.name] = val.value
        elif isinstance(val, (bytes, bytearray)):
            out[col.name] = f"<bytes:{len(val)}>"
        elif isinstance(val, (int, str, bool, dict, list)) or val is None:
            out[col.name] = val
        else:
            # Last resort — never let a non-JSON value leak.
            try:
                out[col.name] = str(val)
            except Exception:
                out[col.name] = None
    return out


async def build_export(db: AsyncSession, *, user_id: int) -> dict:
    """Return a dict containing all PII for ``user_id``.

    Caller is responsible for setting the tenant GUC
    (``set_tenant_scope(db, user_id)``) BEFORE invoking this builder so
    RLS-scoped SELECTs filter correctly.

    Returns:
        Fully JSON-serialisable dict (caller may ``json.dumps`` directly).
        Empty dict if the user row doesn't exist (caller decides 404 vs 200).
    """
    user_row = await db.scalar(select(AppUser).where(AppUser.id == user_id))
    if user_row is None:
        return {}

    async def _list(model: Any) -> list[dict]:
        result = await db.execute(select(model))
        return [_serialize_row(r) for r in result.scalars().all()]

    # Audit log filtered by hash(user_id) — raw user_id never appears in
    # pdn_audit_log per CMP-33-01.
    user_id_hash = hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()
    audit_result = await db.execute(
        select(PdnAuditLog).where(PdnAuditLog.user_id_hash == user_id_hash)
    )
    audit_rows = [_serialize_row(r) for r in audit_result.scalars().all()]

    # SavingsConfig: PK = user_id (1:1) — fetch with a single .get().
    sav = await db.scalar(
        select(SavingsConfig).where(SavingsConfig.user_id == user_id)
    )

    return {
        "user": _serialize_row(user_row),
        "accounts": await _list(Account),
        "categories": await _list(Category),
        "budget_periods": await _list(BudgetPeriod),
        "planned_transactions": await _list(PlannedTransaction),
        "actual_transactions": await _list(ActualTransaction),
        "subscriptions": await _list(Subscription),
        "ai_conversations": await _list(AiConversation),
        "ai_messages": await _list(AiMessage),
        "goals": await _list(Goal),
        "savings_config": _serialize_row(sav) if sav is not None else None,
        "audit_log": audit_rows,
        "_meta": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "format_version": "1.0",
        },
    }


__all__ = ["build_export"]
