"""Pydantic v2 schemas for /api/v1/goals (Phase 22, BE-11).

Threat mitigations (plan 22.12 <threat_model>):
- T-22-12-01: ``ConfigDict(strict=True)`` rejects implicit type coercion.
- T-22-12-02: ``extra="forbid"`` rejects unknown fields.
- T-22-12-07: ``@field_validator("due")`` ensures the goal's due date is
  strictly in the future on create. Surfaces as 422 before the service
  layer (DATA-MODEL §6 — ``goal.due > today``).

Note on ``due`` in update: PATCH semantics keep ``due`` optional (caller
may leave it unchanged by omitting the key). When the caller does pass
``due``, we still enforce the future-date rule because moving the
deadline into the past would violate DATA-MODEL §6 just as much as on
create.
"""
from datetime import date as _date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# DATA-MODEL §6: target_cents upper bound = 100M ₽ in копейки.
_TARGET_MAX: int = 100_000_000_00


def _ensure_future_date(v: Optional[_date]) -> Optional[_date]:
    """Reject due-dates that are today or earlier (DATA-MODEL §6, T-22-12-07).

    Shared between :class:`GoalCreate` and :class:`GoalUpdate` so both
    entry points apply the same gate. ``None`` is allowed — meaning
    "no deadline" on create, or "leave unchanged" on update.
    """
    if v is None:
        return v
    today = _date.today()
    if v <= today:
        raise ValueError(
            f"Goal due must be strictly after today ({today.isoformat()}); "
            f"got {v.isoformat()}"
        )
    return v


class GoalCreate(BaseModel):
    """POST /api/v1/goals request body."""

    model_config = ConfigDict(
        strict=True, extra="forbid", str_strip_whitespace=True
    )

    name: str = Field(min_length=1, max_length=80)
    target_cents: int = Field(gt=0, le=_TARGET_MAX)
    due: Optional[_date] = None

    @field_validator("due")
    @classmethod
    def _due_in_future(cls, v: Optional[_date]) -> Optional[_date]:
        return _ensure_future_date(v)


class GoalUpdate(BaseModel):
    """PATCH /api/v1/goals/{id} request body — all fields optional."""

    model_config = ConfigDict(
        strict=True, extra="forbid", str_strip_whitespace=True
    )

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    target_cents: Optional[int] = Field(default=None, gt=0, le=_TARGET_MAX)
    due: Optional[_date] = None

    @field_validator("due")
    @classmethod
    def _due_in_future(cls, v: Optional[_date]) -> Optional[_date]:
        return _ensure_future_date(v)


class GoalRead(BaseModel):
    """GET /api/v1/goals response item (also returned by POST/PATCH).

    Mirrors :class:`app.db.models.Goal` ORM columns. ``current_cents``
    is incremented by ``app.services.savings.deposit_to_goal`` and read
    here verbatim — no derivation.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    target_cents: int
    current_cents: int
    due: Optional[_date]
    created_at: datetime
