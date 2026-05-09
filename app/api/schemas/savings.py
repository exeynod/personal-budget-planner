"""Pydantic v2 schemas for /api/v1/savings (Phase 22, BE-08, BE-09, BE-10).

Endpoints:
- GET    /api/v1/savings              → :class:`SavingsSnapshotResponse` (BE-09)
- PATCH  /api/v1/savings/config       → :class:`SavingsConfigPatch` (BE-08)
- POST   /api/v1/savings/deposit      → :class:`DepositCreate` (BE-10)

Threat mitigations (plan 22.12 <threat_model>):
- T-22-12-01 / T-22-12-02: ``ConfigDict(strict=True, extra="forbid")``
  on every request schema rejects implicit coercion + unknown keys.
- T-22-12-03 / DATA-MODEL §6: ``DepositCreate.amount_cents`` bounded
  to (0, 100M ₽].
- ``roundup_base`` is a ``Literal[10, 50, 100]`` — DB CHECK
  ``ck_savings_config_base_enum`` enforces the same set on the data
  layer; Pydantic surfaces an early 422 instead of a CHECK violation.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.schemas.goals import GoalRead


# DATA-MODEL §6: amount_cents upper bound on deposit = 100M ₽.
_AMOUNT_MAX: int = 100_000_000_00


class SavingsConfigPatch(BaseModel):
    """PATCH /api/v1/savings/config request body — partial update.

    Both fields optional: caller may toggle ``roundup_enabled`` without
    touching ``roundup_base`` or vice versa. Empty body is a no-op.
    """

    model_config = ConfigDict(strict=True, extra="forbid")

    roundup_enabled: Optional[bool] = None
    roundup_base: Optional[Literal[10, 50, 100]] = None


class SavingsConfigRead(BaseModel):
    """Per-user roundup configuration (mirrors ORM ``SavingsConfig``)."""

    model_config = ConfigDict(from_attributes=True)

    roundup_enabled: bool
    roundup_base: int


class DepositCreate(BaseModel):
    """POST /api/v1/savings/deposit request body (BE-10).

    The wire contract carries ``amount_cents`` as a positive integer —
    the service layer (``app.services.savings.deposit``) inserts an
    ``ActualTransaction`` with a negated amount internally so deposits
    show as outflow on the source account and inflow on the savings
    side. Callers never deal with signed values.

    ``goal_id`` is optional: a deposit without a linked goal still
    increments the savings total but does not bump any
    ``goal.current_cents``.
    """

    model_config = ConfigDict(strict=True, extra="forbid")

    amount_cents: int = Field(
        gt=0,
        le=_AMOUNT_MAX,
        description="Positive amount in копейки (service negates internally)",
    )
    account_id: int = Field(gt=0)
    goal_id: Optional[int] = Field(default=None, gt=0)


class SavingsSnapshotResponse(BaseModel):
    """GET /api/v1/savings response (BE-09).

    Aggregates the savings dashboard payload:
    - ``total_cents``: balance of all accounts marked ``kind='savings'``
      plus deposit-class transactions (computed by service).
    - ``month_in_cents``: sum of inflows during the current period (the
      "into the piggy bank this month" UI label).
    - ``config``: current roundup settings.
    - ``goals``: every goal owned by the user.

    All four fields are filled by the service from the same DB
    transaction so the snapshot is internally consistent.
    """

    model_config = ConfigDict(from_attributes=True)

    total_cents: int
    month_in_cents: int
    config: SavingsConfigRead
    goals: list[GoalRead]
