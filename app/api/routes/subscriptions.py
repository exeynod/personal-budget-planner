"""Subscriptions REST routes — SUB-01, SUB-04, SUB-05 (D-71).

Five endpoints under router-level Depends(get_current_user):
  GET    /subscriptions              → list[SubscriptionRead]
  POST   /subscriptions              → SubscriptionRead (200/201)
  PATCH  /subscriptions/{id}         → SubscriptionRead, 404 if not found
  DELETE /subscriptions/{id}         → 204, 404 if not found
  POST   /subscriptions/{id}/charge-now → ChargeNowResponse, 409 on duplicate

Threat mitigations (threat_model 06-03):
  T-06-04: router-level Depends(get_current_user) — only OWNER_TG_ID passes
  T-06-05: unique constraint + IntegrityError → AlreadyChargedError → HTTP 409

Phase 11 (Plan 11-06): handlers used ``get_db_with_tenant_scope`` +
``get_current_user_id``; service вызовы передают ``user_id=user_id``.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.subscriptions import (
    CashflowProjectionResponse,
    ChargeNowResponse,
    RecurringDueRow,
    RecurringPayRequest,
    RecurringPayResponse,
    RecurringPostponeRequest,
    SubscriptionCreate,
    SubscriptionPostResponse,
    SubscriptionReadV10,
    SubscriptionUpdate,
)
from app.db.models import AppUser, BudgetPeriod, PeriodStatus
from app.services import accounts as account_service
from app.services import subscriptions as sub_service
from app.services.accounts import AccountNotFoundError
from app.services.periods import _today_in_app_tz

router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
    dependencies=[Depends(get_current_user), Depends(require_onboarded)],
)


@router.get("", response_model=list[SubscriptionReadV10])
async def list_subs(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[SubscriptionReadV10]:
    """GET /api/v1/subscriptions — list user's subscriptions sorted by next_charge_date ASC.

    P0-1: returns the v1.0 read shape (``SubscriptionReadV10``) so day_of_month /
    account_id / posted_txn_id round-trip to the iOS client (phase 63).
    """
    subs = await sub_service.list_subscriptions(db, user_id=user_id)
    return [SubscriptionReadV10.model_validate(s) for s in subs]


@router.post("", response_model=SubscriptionReadV10)
async def create_sub(
    payload: SubscriptionCreate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SubscriptionReadV10:
    """POST /api/v1/subscriptions — create a new subscription.

    BUG-2 (phase 71): accepts optional ``day_of_month`` (1..28) and
    ``account_id`` so create-with-account works in one call. A cross-tenant or
    missing ``account_id`` → 404 (mirrors actuals create_actual_v10 dispatch).

    Status codes:
        200: created
        400: category_id refers to archived or missing category
        404: account_id refers to cross-tenant / missing account
        422: Pydantic validation error
    """
    try:
        # BUG-2: validate account_id against the tenant before persisting
        # (composite FK is defense-in-depth; explicit check returns 404 cleanly).
        if payload.account_id is not None:
            await account_service.get_or_404(
                db, user_id=user_id, account_id=payload.account_id
            )
        sub = await sub_service.create_subscription(
            db,
            user_id=user_id,
            name=payload.name,
            amount_cents=payload.amount_cents,
            interval_months=payload.interval_months,
            cycle=payload.cycle,
            next_charge_date=payload.next_charge_date,
            category_id=payload.category_id,
            notify_days_before=payload.notify_days_before,
            is_active=payload.is_active,
            day_of_month=payload.day_of_month,
            account_id=payload.account_id,
        )
        # If next_charge_date falls in the current active period, add planned row.
        active_period = await db.scalar(
            select(BudgetPeriod).where(
                BudgetPeriod.user_id == user_id,
                BudgetPeriod.status == PeriodStatus.active,
            )
        )
        if (
            active_period is not None
            and active_period.period_start
            <= sub.next_charge_date
            <= active_period.period_end
        ):
            await sub_service.add_subscription_to_period(
                db, sub, active_period.id, user_id=user_id
            )
        await db.commit()
        return SubscriptionReadV10.model_validate(sub)
    except AccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except sub_service.CategoryNotFoundOrArchived as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="category not found or archived",
        ) from exc


@router.patch("/{sub_id}", response_model=SubscriptionReadV10)
async def patch_sub(
    sub_id: int,
    payload: SubscriptionUpdate,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SubscriptionReadV10:
    """PATCH /api/v1/subscriptions/{id} — partial update.

    BUG-2 (phase 71): now accepts the v1.0 fields ``day_of_month`` (1..28) and
    ``account_id`` on the write path. A cross-tenant / missing ``account_id``
    (when explicitly supplied non-null) → 404, mirroring actuals.

    Status codes:
        200: updated
        404: subscription not found OR account_id cross-tenant / missing
        422: Pydantic validation error
    """
    patch = payload.model_dump(exclude_unset=True)
    try:
        # BUG-2: validate a non-null account_id against the tenant before
        # persisting. (account_id=None is a legitimate clear and skips lookup.)
        if patch.get("account_id") is not None:
            await account_service.get_or_404(
                db, user_id=user_id, account_id=patch["account_id"]
            )
        sub = await sub_service.update_subscription(db, sub_id, patch, user_id=user_id)
        await db.commit()
        return SubscriptionReadV10.model_validate(sub)
    except AccountNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="subscription not found",
        ) from exc


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sub(
    sub_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DELETE /api/v1/subscriptions/{id} — hard delete (204).

    CLAUDE.md convention: subscriptions are hard-deleted (no soft delete).

    Status codes:
        204: deleted
        404: subscription not found
    """
    try:
        await sub_service.delete_subscription(db, sub_id, user_id=user_id)
        await db.commit()
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="subscription not found",
        ) from exc


@router.post("/{sub_id}/charge-now", response_model=ChargeNowResponse)
async def charge_now(
    sub_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> ChargeNowResponse:
    """POST /api/v1/subscriptions/{id}/charge-now — manual charge (SUB-04).

    Creates a PlannedTransaction(source=subscription_auto) for next_charge_date
    and advances next_charge_date by +1 month (monthly) or +1 year (yearly).

    Idempotency (T-06-05, SUB-05): repeated call for the same charge date
    returns HTTP 409 (unique constraint uq_planned_sub_charge_date fires).

    Status codes:
        200: charged, returns planned_id + new next_charge_date
        404: subscription not found
        409: already charged for this next_charge_date
    """
    # Phase 11: AppUser.cycle_start_day читаем напрямую через user_id (PK).
    # Plan 11-05 оставил settings.py с tg_user_id-сигнатурой; bypass через
    # прямой read проще, чем дополнительный resolve tg_user_id.
    cycle_start = await db.scalar(
        select(AppUser.cycle_start_day).where(AppUser.id == user_id)
    )
    if cycle_start is None:
        cycle_start = 5  # AppUser.cycle_start_day default

    try:
        planned, new_date = await sub_service.charge_subscription(
            db, sub_id, user_id=user_id, cycle_start_day=cycle_start
        )
        await db.commit()
        return ChargeNowResponse(planned_id=planned.id, next_charge_date=new_date)
    except sub_service.AlreadyChargedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="already charged for this date",
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="subscription not found",
        ) from exc


# ---------- Phase 22 (v1.0) — POST/UNPOST endpoints (BE-13) ----------
#
# These v1.0 routes wrap the post/unpost service-layer functions added in
# plan 22.09. They live alongside the legacy CRUD + charge-now endpoints
# (which remain unchanged for v0.x compatibility — only their schemas were
# extended in plan 22.12). Threat model: see plan 22.13 PLAN.md
# <threat_model> entries T-22-13-07 (post race) and T-22-13-08 (info-disc).


@router.post(
    "/{sub_id}/post",
    response_model=SubscriptionPostResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"description": "Subscription not found / cross-tenant"},
        409: {"description": "Already posted (T-22-09-01) or inactive"},
        422: {"description": "Subscription has no account_id"},
    },
)
async def post_subscription(
    sub_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> SubscriptionPostResponse:
    # NOTE (recurring-payments fix, ADR-0007): the docstring below is embedded
    # verbatim in contract/openapi.json (FastAPI operation description) and is
    # intentionally left byte-identical to avoid contract drift. The CURRENT
    # behaviour is unified with /recurring/{planned_id}/pay: a materialised
    # unposted occurrence of the active period is posted first; the direct
    # post is only a fallback. See app.services.subscriptions.post_subscription.
    """POST /api/v1/subscriptions/{id}/post — manual «провести в факт» (BE-13).

    Service contract: see ``app.services.subscriptions.post_subscription``.

    Status codes:
        200: posted; returns ``{txn_id, subscription_id, posted_at}``.
        404: subscription not found / cross-tenant.
        409: ``SubscriptionAlreadyPostedError`` (idempotency, T-22-09-01) OR
             ``SubscriptionInactiveError`` (T-22-09-05).
        422: subscription has no ``account_id`` (cannot apply balance delta).
    """
    try:
        txn = await sub_service.post_subscription(db, sub_id, user_id=user_id)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except sub_service.SubscriptionAlreadyPostedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "already_posted",
                "subscription_id": exc.sub_id,
                "posted_txn_id": exc.posted_txn_id,
            },
        ) from exc
    except sub_service.SubscriptionInactiveError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "subscription_inactive",
                "subscription_id": exc.sub_id,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return SubscriptionPostResponse(
        txn_id=txn.id,
        subscription_id=sub_id,
        posted_at=(
            txn.created_at.isoformat()
            if getattr(txn, "created_at", None) is not None
            else ""
        ),
    )


@router.post(
    "/{sub_id}/unpost",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        404: {
            "description": (
                "Subscription not found / cross-tenant OR not currently posted"
            )
        },
    },
)
async def unpost_subscription(
    sub_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """POST /api/v1/subscriptions/{id}/unpost — отменить ручную проводку (BE-13).

    Service contract: see ``app.services.subscriptions.unpost_subscription``.

    Status codes:
        204: unposted (linked actual_transaction deleted; balance restored).
        404: subscription not found / cross-tenant OR ``posted_txn_id IS NULL``
             (per T-22-09-03 — there is nothing to unpost).
    """
    try:
        await sub_service.unpost_subscription(db, sub_id, user_id=user_id)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except sub_service.SubscriptionNotPostedError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "not_posted",
                "subscription_id": exc.sub_id,
            },
        ) from exc


# ---------- ADR-0007 — recurring-payment home prompt + cashflow ----------
#
# These operate on the materialised recurring occurrences (planned rows) of the
# current active period, plus a read-only cashflow projection. They are mounted
# under the existing /subscriptions prefix (the table is unchanged; "recurring
# payment" is the external rebrand).


@router.get("/recurring/cashflow", response_model=CashflowProjectionResponse)
async def recurring_cashflow(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    horizon_days: int = 90,
) -> CashflowProjectionResponse:
    """GET /api/v1/subscriptions/recurring/cashflow — cashflow projection (ADR-0007).

    Projects active recurring payments forward over ``horizon_days`` (default
    90, 1..365) and returns a timeline with a running balance + monthly burden.
    """
    horizon_days = max(1, min(horizon_days, 365))
    result = await sub_service.cashflow_projection(
        db, user_id=user_id, horizon_days=horizon_days
    )
    return CashflowProjectionResponse(**result)


@router.get("/recurring/due", response_model=list[RecurringDueRow])
async def recurring_due(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> list[RecurringDueRow]:
    """GET /api/v1/subscriptions/recurring/due — due-today/overdue occurrences.

    ADR-0007 home prompt: unposted ``subscription_auto`` rows of the current
    active period with ``planned_date <= today``. Empty list if no active period.
    """
    rows = await sub_service.list_due_recurring(
        db, user_id=user_id, today=_today_in_app_tz()
    )
    return [RecurringDueRow.model_validate(r) for r in rows]


@router.post(
    "/recurring/{planned_id}/pay",
    response_model=RecurringPayResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"description": "Occurrence not found / cross-tenant"},
        409: {"description": "Occurrence already paid"},
    },
)
async def recurring_pay(
    planned_id: int,
    body: RecurringPayRequest,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> RecurringPayResponse:
    """POST /api/v1/subscriptions/recurring/{planned_id}/pay — «Оплачено» (ADR-0007).

    Posts the occurrence into a real actual (optional ``amount_cents`` override).
    """
    tx_date = body.tx_date or _today_in_app_tz()
    try:
        txn = await sub_service.pay_recurring_occurrence(
            db,
            planned_id,
            user_id=user_id,
            tx_date=tx_date,
            amount_cents=body.amount_cents,
        )
        await db.commit()
    except sub_service.RecurringOccurrenceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except sub_service.RecurringOccurrenceAlreadyPaidError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    return RecurringPayResponse(txn_id=txn.id, planned_id=planned_id)


@router.post(
    "/recurring/{planned_id}/skip",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        404: {"description": "Occurrence not found / cross-tenant"},
        409: {"description": "Occurrence already paid — unpay first"},
    },
)
async def recurring_skip(
    planned_id: int,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """POST /api/v1/subscriptions/recurring/{planned_id}/skip — «Пропустить» (ADR-0007).

    Deletes the unposted occurrence without posting it to actual.
    """
    try:
        await sub_service.skip_recurring_occurrence(db, planned_id, user_id=user_id)
        await db.commit()
    except sub_service.RecurringOccurrenceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except sub_service.RecurringOccurrenceAlreadyPaidError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc


@router.post(
    "/recurring/{planned_id}/postpone",
    response_model=RecurringDueRow,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"description": "new_date outside the occurrence's period"},
        404: {"description": "Occurrence not found / cross-tenant"},
        409: {"description": "Occurrence already paid"},
    },
)
async def recurring_postpone(
    planned_id: int,
    body: RecurringPostponeRequest,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> RecurringDueRow:
    """POST /api/v1/subscriptions/recurring/{planned_id}/postpone — «Перенести» (ADR-0007).

    Shifts ``planned_date`` within the occurrence's own period bounds.
    """
    try:
        row = await sub_service.postpone_recurring_occurrence(
            db, planned_id, user_id=user_id, new_date=body.new_date
        )
        await db.commit()
    except sub_service.RecurringOccurrenceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except sub_service.RecurringOccurrenceAlreadyPaidError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except sub_service.RecurringPostponeOutOfPeriodError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return RecurringDueRow.model_validate(row)
