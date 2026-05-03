"""Schemas for internal bot API endpoints (Phase 4 — bot commands)."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.api.schemas.actual import ActualRead, BalanceCategoryRow, KindStr


class BotActualRequest(BaseModel):
    tg_user_id: int
    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    tx_date: Optional[date] = None
    category_query: Optional[str] = Field(default=None, max_length=200)
    category_id: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _check_either_query_or_id(self) -> "BotActualRequest":
        if not self.category_query and not self.category_id:
            raise ValueError("Either category_query or category_id required")
        return self


class CategoryCandidate(BaseModel):
    id: int
    name: str
    kind: KindStr


class BotActualResponse(BaseModel):
    status: Literal["created", "ambiguous", "not_found"]
    actual: Optional[ActualRead] = None
    category: Optional[CategoryCandidate] = None
    category_balance_cents: Optional[int] = None
    candidates: Optional[list[CategoryCandidate]] = None


class BotBalanceRequest(BaseModel):
    tg_user_id: int


class BotBalanceResponse(BaseModel):
    period_id: int
    period_start: date
    period_end: date
    balance_now_cents: int
    delta_total_cents: int
    planned_total_expense_cents: int
    actual_total_expense_cents: int
    planned_total_income_cents: int
    actual_total_income_cents: int
    by_category: list[BalanceCategoryRow]


class BotTodayActualRow(BaseModel):
    id: int
    kind: KindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    category_name: str


class BotTodayRequest(BaseModel):
    tg_user_id: int


class BotTodayResponse(BaseModel):
    actuals: list[BotTodayActualRow]
    total_expense_cents: int
    total_income_cents: int
