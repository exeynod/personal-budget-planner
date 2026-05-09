"""Pydantic v2 schemas for /api/v1/accounts (Phase 22, BE-02).

Threat mitigations (plan 22.12 <threat_model>):
- T-22-12-01: ``ConfigDict(strict=True)`` rejects implicit type coercion
  (e.g. ``"100"`` str → int). Pydantic v2 surfaces 422 before the service
  layer.
- T-22-12-02: ``extra="forbid"`` rejects unknown fields, blocking state
  injection through unexpected keys.
- T-22-12-03 / DATA-MODEL §6: ``balance_cents`` is bounded to ±100M ₽
  (BIGINT-safe range that matches the DB CHECK constraint
  ``ck_account_balance_range`` from migration 0012).

Note on ``primary`` vs ``is_primary``: the SQLAlchemy ORM attribute is
``Account.is_primary`` (the DB column is ``"primary"`` — a reserved
word). The wire contract (DATA-MODEL §1.4) uses ``primary``, so the
``AccountRead`` schema serialises the ORM ``is_primary`` attribute as
``primary`` via :class:`pydantic.AliasChoices` / ``serialization_alias``.
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# Wire-level enum for account.kind. Kept as a Literal (not the
# ``AccountKind`` ORM enum) so JSON serialisation stays plain strings
# without depending on the ORM module from the schema layer.
AccountKindStr = Literal["card", "cash", "savings"]

# DATA-MODEL §6: balance_cents range bound. Matches DB CHECK
# ``ck_account_balance_range`` (alembic 0012).
_BALANCE_MIN: int = -100_000_000_00
_BALANCE_MAX: int = 100_000_000_00


class AccountCreate(BaseModel):
    """POST /api/v1/accounts request body."""

    model_config = ConfigDict(
        strict=True, extra="forbid", str_strip_whitespace=True
    )

    bank: str = Field(min_length=1, max_length=40)
    mask: Optional[str] = Field(default=None, max_length=16)
    kind: AccountKindStr
    balance_cents: int = Field(
        default=0, ge=_BALANCE_MIN, le=_BALANCE_MAX
    )
    primary: bool = False


class AccountUpdate(BaseModel):
    """PATCH /api/v1/accounts/{id} request body — all fields optional."""

    model_config = ConfigDict(
        strict=True, extra="forbid", str_strip_whitespace=True
    )

    bank: Optional[str] = Field(default=None, min_length=1, max_length=40)
    mask: Optional[str] = Field(default=None, max_length=16)
    kind: Optional[AccountKindStr] = None
    balance_cents: Optional[int] = Field(
        default=None, ge=_BALANCE_MIN, le=_BALANCE_MAX
    )
    primary: Optional[bool] = None


class AccountRead(BaseModel):
    """GET /api/v1/accounts response item (also returned by POST/PATCH).

    The ORM attribute ``is_primary`` is exposed on the wire as ``primary``
    via ``serialization_alias`` so JSON output matches DATA-MODEL §1.4
    (``{..., "primary": true}``). ``populate_by_name=True`` keeps the
    Python-side instantiation flexible — both ``AccountRead(is_primary=True)``
    and ``AccountRead.model_validate(account_orm)`` work.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: int
    bank: str
    mask: Optional[str]
    kind: AccountKindStr
    balance_cents: int
    is_primary: bool = Field(serialization_alias="primary")
    created_at: datetime
