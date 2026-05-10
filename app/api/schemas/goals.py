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

WR-04 fix (Phase 22 review): the future-date check uses Europe/Moscow
"today" (matching the service-layer ``_today_in_app_tz`` helper) rather
than ``date.today()`` (server local TZ). On a UTC-deployed container at
23:30 UTC = 02:30 MSK, server-local "today" lags MSK by one calendar day —
a goal due on the next MSK day would pass schema validation but fail the
service validator, surfacing as 422 at a different layer for the same
input. Aligning both layers eliminates the discrepancy.
"""
from datetime import date as _date
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator


# DATA-MODEL §6: target_cents upper bound = 100M ₽ in копейки.
_TARGET_MAX: int = 100_000_000_00


def _coerce_iso_date(v):
    """Parse ISO-8601 strings into ``date`` for wire compatibility.

    Pydantic v2 ``strict=True`` rejects ISO date strings on ``date`` fields
    by default; clients MUST send dates as JSON strings, so we parse them
    in a ``mode="before"`` step and let the standard validators run on the
    resulting ``date`` instance. ``None`` and ``date`` instances pass through.
    """
    if v is None or isinstance(v, _date):
        return v
    if isinstance(v, str):
        try:
            return _date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError(
                f"Goal due must be ISO-8601 date (YYYY-MM-DD); got {v!r}"
            ) from exc
    return v  # let the strict validator reject other types


def _today_msk() -> _date:
    """Return today's date in Europe/Moscow.

    Mirrors :func:`app.services.periods._today_in_app_tz` but lives in the
    schema module to avoid a DB-dependent import (the service module pulls
    in SQLAlchemy through its sibling imports). Schema-layer validators
    must agree with the service-layer's notion of "today" or 422s surface
    at different layers for the same input (WR-04 fix).
    """
    return datetime.now(ZoneInfo("Europe/Moscow")).date()


def _ensure_future_date(v: Optional[_date]) -> Optional[_date]:
    """Reject due-dates that are today or earlier (DATA-MODEL §6, T-22-12-07).

    Shared between :class:`GoalCreate` and :class:`GoalUpdate` so both
    entry points apply the same gate. ``None`` is allowed — meaning
    "no deadline" on create, or "leave unchanged" on update.

    WR-04: uses Europe/Moscow "today" so the schema agrees with the
    service-layer validator (CLAUDE.md: расчёты периодов и шедулер
    Europe/Moscow, БД UTC).
    """
    if v is None:
        return v
    today = _today_msk()
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

    @field_validator("due", mode="before")
    @classmethod
    def _coerce_due(cls, v):
        return _coerce_iso_date(v)

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

    @field_validator("due", mode="before")
    @classmethod
    def _coerce_due(cls, v):
        return _coerce_iso_date(v)

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
