"""Internal bot API routes — ACT-03, ACT-04 (bot commands).

Three endpoints for bot↔api communication, mounted under ``internal_router``
(prefix ``/internal``) via ``include_router(internal_bot_router)``:

  POST /internal/bot/actual   — ACT-03: parse & store bot actual transaction
  POST /internal/bot/balance  — ACT-04: format balance summary for /balance command
  POST /internal/bot/today    — ACT-04: format today's transactions for /today command

Security model:
- Parent ``internal_router`` carries ``dependencies=[Depends(verify_internal_token)]``
  which is inherited by all routes here (D-54).  This module does NOT declare its own
  ``dependencies=`` to avoid executing the validator twice per request (same pattern
  used by ``internal_telegram_router`` — see app/api/routes/internal_telegram.py:33).
- Caddy edge blocks ``/api/v1/internal/*`` from external traffic (Phase 1, INF-04)
  providing an additional layer of defence (T-04-22).

POST /bot/actual response:
  Returns ``BotActualResponse`` with a ``status`` discriminator field:
  - ``"created"``   → ``actual`` + ``category`` + ``category_balance_cents`` populated
  - ``"ambiguous"`` → ``candidates`` list populated (multiple category matches)
  - ``"not_found"`` → all optional fields are None / []

Exception → HTTP mapping:
    CategoryNotFoundError   → 404
    FutureDateError         → 400
    InvalidCategoryError    → 400
    KindMismatchError       → 400
    PeriodNotFoundError     → 404  (no active period for /balance)
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.api.schemas.internal_bot import (
    BotActualRequest,
    BotActualResponse,
    BotBalanceRequest,
    BotBalanceResponse,
    BotTodayRequest,
    BotTodayResponse,
)
from app.services import internal_bot as internal_bot_svc
from app.services.actual import FutureDateError
from app.services.categories import CategoryNotFoundError
from app.services.planned import (
    InvalidCategoryError,
    KindMismatchError,
    PeriodNotFoundError,
)


# No router-level dependencies here — they are inherited from the parent
# ``internal_router`` (``Depends(verify_internal_token)``) when included.
internal_bot_router = APIRouter(
    prefix="/bot",
    tags=["internal-bot"],
)


@internal_bot_router.post(
    "/actual",
    response_model=BotActualResponse,
    status_code=status.HTTP_200_OK,
)
async def bot_actual(
    body: BotActualRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BotActualResponse:
    """POST /api/v1/internal/bot/actual — record an actual transaction from bot.

    ACT-03: handles three response branches (discriminated union on ``status``):
    - ``created`` — transaction saved; ``actual`` + ``category`` + balance populated.
    - ``ambiguous`` — ``category_query`` matched >1 active categories; ``candidates``
      returned so bot can ask user to pick one.
    - ``not_found`` — no category matched the query and ``category_id`` was not set.

    ``source`` is forced to ``ActualSource.bot`` inside the service (D-53).

    Status codes:
        200: result (including ambiguous/not_found branches — not errors)
        400: FutureDateError / InvalidCategoryError / KindMismatchError
        404: category_id supplied but category not found
    """
    try:
        result = await internal_bot_svc.process_bot_actual(
            db,
            tg_user_id=body.tg_user_id,
            kind=body.kind,
            amount_cents=body.amount_cents,
            description=body.description,
            tx_date=body.tx_date,
            category_query=body.category_query,
            category_id=body.category_id,
        )
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except InvalidCategoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except KindMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except FutureDateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return BotActualResponse(**result)


@internal_bot_router.post(
    "/balance",
    response_model=BotBalanceResponse,
    status_code=status.HTTP_200_OK,
)
async def bot_balance(
    body: BotBalanceRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BotBalanceResponse:
    """POST /api/v1/internal/bot/balance — balance summary for /balance command.

    ACT-04: returns the full plan/actual breakdown for the active period.
    Returns 404 when no active period exists (onboarding not complete).

    Status codes:
        200: balance data
        404: no active budget period
    """
    try:
        result = await internal_bot_svc.format_balance_for_bot(
            db, tg_user_id=body.tg_user_id
        )
    except PeriodNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active budget period",
        ) from exc
    return BotBalanceResponse(**result)


@internal_bot_router.post(
    "/today",
    response_model=BotTodayResponse,
    status_code=status.HTTP_200_OK,
)
async def bot_today(
    body: BotTodayRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BotTodayResponse:
    """POST /api/v1/internal/bot/today — today's transactions for /today command.

    ACT-04: returns list of actual transactions recorded today (Europe/Moscow TZ)
    along with expense/income totals.  Returns an empty ``actuals`` list if there
    are no transactions today — never raises 404.

    Status codes:
        200: today data (possibly empty actuals list)
    """
    result = await internal_bot_svc.format_today_for_bot(
        db, tg_user_id=body.tg_user_id
    )
    return BotTodayResponse(**result)
