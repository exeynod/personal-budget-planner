"""Schemas for actual transactions and balance (ACT-01..ACT-04, D-02)."""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

KindStr = Literal["expense", "income"]
ActualSourceStr = Literal["mini_app", "bot"]


class ActualCreate(BaseModel):
    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: int = Field(gt=0)
    tx_date: date


class ActualUpdate(BaseModel):
    kind: Optional[KindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = Field(default=None, gt=0)
    tx_date: Optional[date] = None


class ActualRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    kind: KindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    tx_date: date
    source: ActualSourceStr
    created_at: datetime


class BalanceCategoryRow(BaseModel):
    category_id: int
    name: str
    kind: KindStr
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
