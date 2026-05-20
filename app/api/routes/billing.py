"""User-facing billing endpoints (Phase 34-05, REQ-34-04, REQ-34-06).

Public-facing routes для YooKassa payment flow и subscription read/cancel:

- POST /api/v1/billing/create-payment — initiate payment via YooKassa, insert
  pending Payment row, return confirmation_url для редиректа в браузер/TWA.
- GET  /api/v1/billing/payments — paginated-by-limit list собственных платежей.
- GET  /api/v1/me/subscription — текущая active SubscriptionBilling (или None
  для implicit free tier).
- POST /api/v1/me/subscription/cancel — idempotent cancel (status → canceled,
  доступ до period_end; auto-renew не реализован).

Auth: ``get_current_user`` (DEV-mode X-Test-User / Bearer / Telegram initData).
RLS: каждый запрос фильтруется ``user_id == current_user.id``; на DB-level
действуют политики ``tenant_isolation_payment`` / ``tenant_isolation_subscription_billing``
(alembic 0021) — application-level фильтр + DB-level RLS = defence-in-depth.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.api.schemas.billing import (
    PaymentCreateRequest,
    PaymentCreateResponse,
    PaymentRead,
    SubscriptionCancelResponse,
    SubscriptionRead,
    TierResponse,
)
from app.db.models import AppUser, Payment, SubscriptionBilling
from app.db.session import get_db
from app.services.tier import effective_tier
from app.services.yookassa_client import YookassaClient

router = APIRouter(prefix="/api/v1", tags=["billing"])


@router.post(
    "/billing/create-payment",
    response_model=PaymentCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    payload: PaymentCreateRequest,
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentCreateResponse:
    """Create a YooKassa payment + persist pending Payment row.

    Idempotency-Key генерируется на сервере (uuid4) — клиент не может вызвать
    "double charge" повтором запроса (each call → new YooKassa payment).
    Webhook (``/webhooks/yookassa``) переведёт row в succeeded/canceled.
    """
    if payload.amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="amount_cents must be > 0",
        )

    idem_key = str(uuid.uuid4())
    client = YookassaClient()
    yk_result = await client.create_payment(
        amount_cents=payload.amount_cents,
        description=payload.description or "TG Budget Planner — Pro subscription",
        return_url=payload.return_url,
        idempotency_key=idem_key,
    )
    row = Payment(
        user_id=user.id,
        yookassa_payment_id=yk_result.payment_id,
        amount_cents=payload.amount_cents,
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return PaymentCreateResponse(
        payment_id=row.id,
        confirmation_url=yk_result.confirmation_url,
    )


@router.get("/billing/payments", response_model=List[PaymentRead])
async def list_payments(
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PaymentRead]:
    """List up to 50 most-recent payments for the current user."""
    stmt = (
        select(Payment)
        .where(Payment.user_id == user.id)
        .order_by(desc(Payment.created_at))
        .limit(50)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [PaymentRead.model_validate(r) for r in rows]


@router.get("/me/subscription", response_model=Optional[SubscriptionRead])
async def my_subscription(
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Optional[SubscriptionRead]:
    """Return current ``active`` SubscriptionBilling row or ``None`` (free tier).

    Partial unique index ``subscription_billing_one_active`` гарантирует, что
    одновременно может существовать максимум одна active-строка на пользователя,
    но ``ORDER BY period_end DESC`` оставлен как defence-in-depth на случай
    race с webhook insertом до того, как старая строка переведена в expired.
    """
    stmt = (
        select(SubscriptionBilling)
        .where(
            SubscriptionBilling.user_id == user.id,
            SubscriptionBilling.status == "active",
        )
        .order_by(desc(SubscriptionBilling.period_end))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return None  # implicit free tier
    return SubscriptionRead.model_validate(row)


@router.get("/me/tier", response_model=TierResponse)
async def my_tier(
    user: AppUser = Depends(get_current_user),
) -> TierResponse:
    """Return current effective tier + trial/pro window info for paywall UI.

    Phase 35 REQ-35-02. Mirrors the resolution logic in
    :func:`app.services.tier.effective_tier` so frontend never needs to
    duplicate the trial-vs-paid precedence. ``is_trial_active`` is True
    iff the reverse-trial is in-window AND there is no paid subscription
    overriding it (paid window takes precedence in the UI copy).
    """
    now = datetime.now(timezone.utc)
    tier = effective_tier(user, now=now)
    is_trial_active = (
        user.trial_ends_at is not None
        and user.trial_ends_at > now
        and (user.pro_active_until is None or user.pro_active_until <= now)
    )
    return {
        "tier": tier,
        "trial_ends_at": (
            user.trial_ends_at.isoformat() if user.trial_ends_at else None
        ),
        "pro_active_until": (
            user.pro_active_until.isoformat() if user.pro_active_until else None
        ),
        "is_trial_active": is_trial_active,
    }


@router.post(
    "/me/subscription/cancel",
    status_code=status.HTTP_200_OK,
    response_model=SubscriptionCancelResponse,
)
async def cancel_my_subscription(
    user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Cancel: keep access until period_end, no auto-renew (which we don't implement yet anyway).

    Idempotent — repeat call returns same result. Если active-строки нет,
    UPDATE затронет 0 rows и endpoint всё равно вернёт ``{"status": "canceled"}``
    (free-tier пользователь "уже отменён" → no-op).
    """
    stmt = (
        update(SubscriptionBilling)
        .where(
            SubscriptionBilling.user_id == user.id,
            SubscriptionBilling.status == "active",
        )
        .values(status="canceled")
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "canceled"}
