"""Tax reserve API (Phase 36-02, REQ-36-02).

GET /api/v1/tax/reserve — Pro-gated endpoint для Persona E (самозанятые НПД).
Возвращает рекомендуемый резерв под налог за указанный период.

Auth: ``require_pro`` — reverse-trial (14 days) или paid Pro tier.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db, require_pro
from app.db.models import AppUser
from app.services.tax_reserve import calculate_tax_reserve

router = APIRouter(prefix="/api/v1", tags=["tax"])


class TaxReserveResponse(BaseModel):
    """API response shape — mirrors :class:`TaxReserveResult` dataclass."""

    period_start: date
    period_end: date
    income_cents: int
    business_income_cents: int
    regime: str
    tax_owed_cents: int
    reserve_recommended_cents: int


@router.get("/tax/reserve", response_model=TaxReserveResponse)
async def get_tax_reserve(
    period_start: date = Query(..., description="Period start date (inclusive)"),
    period_end: date = Query(..., description="Period end date (inclusive)"),
    regime: Literal["nalog_4", "nalog_6"] = Query(
        "nalog_4",
        description="НПД tax regime: 4% (физлица) или 6% (юр.лица).",
    ),
    user: AppUser = Depends(require_pro),
    db: AsyncSession = Depends(get_db),
) -> TaxReserveResponse:
    """Calculate tax reserve for self-employed (НПД) пользователя."""
    result = await calculate_tax_reserve(
        db, user.id, period_start, period_end, regime
    )
    return TaxReserveResponse(
        period_start=result.period_start,
        period_end=result.period_end,
        income_cents=result.income_cents,
        business_income_cents=result.business_income_cents,
        regime=result.regime,
        tax_owed_cents=result.tax_owed_cents,
        reserve_recommended_cents=result.reserve_recommended_cents,
    )
