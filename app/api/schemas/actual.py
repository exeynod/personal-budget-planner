"""Schemas for actual transactions and balance (ACT-01..ACT-04, D-02).

Phase 25 (ADD-V10/TXN-V10, plan 25-01): kind enum extended to 4 values
(expense | income | roundup | deposit) via ``ActualKindStr``;
``ActualCreate.account_id`` and ``ActualRead.{account_id, parent_txn_id}``
added (additive, optional) so the v1.0 wire contract supports balance-delta
accounting + roundup spec-tags. The legacy 2-valued ``KindStr`` symbol stays
exported as an alias for ``ActualKindStr`` (``KindStr = ActualKindStr``) so
existing callers (``app.api.routes.actual``, ``app.api.routes.planned``,
``app.api.schemas.internal_bot``, ``app.api.schemas.planned``) keep working
without churn — rename of the alias is deferred as cleanup.

``BalanceCategoryRow.kind`` deliberately keeps the 2-valued surface
(``Literal['expense','income']``) because per-category balance aggregation
operates on category kinds (``CategoryKind``), which never include
``roundup`` / ``deposit`` — those are transaction-side enums applied to the
system 'savings' category whose ``CategoryKind`` is still ``expense``.
"""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# Plan 25-01: 4-valued enum on the wire to mirror DB ``ActualKind`` Postgres
# enum + DATA-MODEL §1.4. Legacy ``KindStr`` retained as alias for
# backward-compat with consumer modules that grep for the symbol.
ActualKindStr = Literal["expense", "income", "roundup", "deposit"]
KindStr = ActualKindStr  # backward-compat alias
ActualSourceStr = Literal["mini_app", "bot"]

# Per-category balance aggregation only ever sees expense/income kinds —
# preserved as a separate alias to keep BalanceCategoryRow strict.
_CategoryKindStr = Literal["expense", "income"]


class ActualCreate(BaseModel):
    # extra='forbid' guards against client-side typos and tampering attempts
    # (T-25-01-02 — unknown fields like ``bogus_field`` raise 422 instead of
    # being silently ignored).
    model_config = ConfigDict(extra="forbid")

    kind: ActualKindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: int = Field(gt=0)
    tx_date: date
    # Plan 25-01: optional wire-level account_id; route delegates to
    # ``create_actual_v10`` when present (delta-balance + roundup hook).
    # Service-level checks tenant ownership (T-25-01-01) — cross-tenant
    # account_id raises ``AccountNotFoundError`` → 404.
    account_id: Optional[int] = Field(default=None, gt=0)


class ActualUpdate(BaseModel):
    # PATCH stays scoped to v0.x surface (no account_id) — Phase 25 scope
    # (TXN-V10-05) only requires create-flow extension. Edit endpoint can
    # remain legacy until Phase 26 if needed.
    #
    # CR-25-04 (review fix): mirror ``ActualCreate``'s strict ``extra='forbid'``
    # config so PATCH is symmetric with POST. Without it, clients could send
    # unknown fields (``account_id``, ``source``, ``user_id``, ``id``) and
    # get 200 — making the wire contract asymmetric, masking tampering
    # attempts in logs, and silently ignoring keys the user expected to
    # update (least-surprise violation).
    model_config = ConfigDict(extra="forbid")

    kind: Optional[ActualKindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = Field(default=None, gt=0)
    tx_date: Optional[date] = None


class ActualRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    kind: ActualKindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    tx_date: date
    source: ActualSourceStr
    created_at: datetime
    # Plan 25-01: emit v10 fields so UI can render roundup / deposit
    # spec-tags (TXN-V10-04, HOME-V10-04) without a second query.
    # Optional + default None so legacy v0.x rows (account_id NULL,
    # parent_txn_id NULL) serialize cleanly.
    account_id: Optional[int] = None
    parent_txn_id: Optional[int] = None


class BalanceCategoryRow(BaseModel):
    category_id: int
    name: str
    # CategoryKind is 2-valued (expense/income) — see module docstring.
    kind: _CategoryKindStr
    planned_cents: int
    actual_cents: int
    delta_cents: int


class BalanceResponse(BaseModel):
    period_id: int
    period_start: date
    period_end: date
    starting_balance_cents: int
    planned_total_expense_cents: int
    actual_total_expense_cents: int
    planned_total_income_cents: int
    actual_total_income_cents: int
    balance_now_cents: int
    delta_total_cents: int
    by_category: list[BalanceCategoryRow]
